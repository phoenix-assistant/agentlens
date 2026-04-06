import { spawn } from 'child_process';
import { AgentLens, Provider } from '@agentlens/sdk';
import { parseClaudeOutput, ClaudeMetrics } from '../parsers/claude';
import { parseOllamaOutput, OllamaMetrics } from '../parsers/ollama';

export interface TraceOptions {
  name: string;
  provider: string;
  session?: string;
  endpoint?: string;
  apiKey?: string;
  captureOutput?: boolean;
  json?: boolean;
  debug?: boolean;
}

export async function traceCommand(
  command: string[],
  options: TraceOptions
): Promise<void> {
  const client = new AgentLens({
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    debug: options.debug,
    batching: false, // Send immediately for CLI
  });

  const trace = client.startTrace(options.session);
  const span = trace.startSpan({
    id: options.name,
    type: 'llm',
    provider: options.provider as Provider,
    model_version: detectModelFromCommand(command),
  });

  const [cmd, ...args] = command;
  let stdout = '';
  let stderr = '';

  const startTime = Date.now();

  const child = spawn(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  child.stdout?.on('data', (data) => {
    const chunk = data.toString();
    stdout += chunk;
    process.stdout.write(chunk);
  });

  child.stderr?.on('data', (data) => {
    const chunk = data.toString();
    stderr += chunk;
    process.stderr.write(chunk);
  });

  return new Promise((resolve) => {
    child.on('close', async (code) => {
      const latencyMs = Date.now() - startTime;

      // Try to extract metrics from output
      let metrics: ClaudeMetrics | OllamaMetrics | null = null;

      if (options.json || detectIsClaude(command)) {
        metrics = parseClaudeOutput(stdout);
      } else if (detectIsOllama(command)) {
        metrics = parseOllamaOutput(stdout);
      }

      if (metrics) {
        if ('input_tokens' in metrics && metrics.input_tokens) {
          span.setInputTokens(metrics.input_tokens);
        }
        if ('output_tokens' in metrics && metrics.output_tokens) {
          span.setOutputTokens(metrics.output_tokens);
        }
      }

      // Record tool calls if detected
      const toolCalls = detectToolCalls(stdout);
      for (const tool of toolCalls) {
        span.recordToolCall(tool, 0, 'success');
      }

      // End the span
      if (code === 0) {
        span.end('success');
      } else {
        span.recordError('EXIT_CODE', `Process exited with code ${code}`);
        span.end('error');
      }

      await client.shutdown();
      resolve();
    });

    child.on('error', async (error) => {
      span.recordError('SPAWN_ERROR', error.message);
      span.end('error');
      await client.shutdown();
      resolve();
    });
  });
}

function detectModelFromCommand(command: string[]): string | undefined {
  const cmdStr = command.join(' ');

  // Claude CLI patterns
  const claudeMatch = cmdStr.match(/--model\s+(\S+)/);
  if (claudeMatch) return claudeMatch[1];

  // Ollama patterns
  const ollamaMatch = cmdStr.match(/ollama\s+run\s+(\S+)/);
  if (ollamaMatch) return ollamaMatch[1];

  // Default model detection
  if (cmdStr.includes('claude')) return 'claude-3-sonnet';
  if (cmdStr.includes('ollama')) return 'llama3';

  return undefined;
}

function detectIsClaude(command: string[]): boolean {
  return command.some((c) => c.includes('claude'));
}

function detectIsOllama(command: string[]): boolean {
  return command.some((c) => c.includes('ollama'));
}

function detectToolCalls(output: string): string[] {
  const tools: string[] = [];

  // Claude tool use patterns
  const claudeTools = output.match(/Using tool: (\w+)/g);
  if (claudeTools) {
    tools.push(...claudeTools.map((t) => t.replace('Using tool: ', '')));
  }

  // MCP tool patterns
  const mcpTools = output.match(/"tool":\s*"([^"]+)"/g);
  if (mcpTools) {
    tools.push(...mcpTools.map((t) => t.match(/"([^"]+)"$/)?.[1] || ''));
  }

  return [...new Set(tools.filter(Boolean))];
}
