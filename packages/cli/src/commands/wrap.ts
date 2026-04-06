/**
 * agentlens wrap - Wrap CLI commands with tracing
 * 
 * Usage:
 *   agentlens wrap "claude 'explain this code'"
 *   agentlens wrap "gh copilot suggest 'write a test'"
 *   agentlens wrap "ollama run llama3 'hello'"
 *   agentlens wrap --name my-agent "python agent.py"
 */

import { spawn } from 'child_process';
import chalk from 'chalk';
import { nanoid } from 'nanoid';
import { getConfig } from '../config';
import { parseClaudeOutput } from '../parsers/claude';
import { parseOllamaOutput } from '../parsers/ollama';
import { parseCopilotOutput } from '../parsers/copilot';

interface WrapOptions {
  name?: string;
  provider?: string;
}

interface TraceData {
  traceId: string;
  agentId: string;
  agentName: string;
  provider: string;
  model?: string;
  startTime: Date;
  endTime?: Date;
  inputTokens?: number;
  outputTokens?: number;
  status: 'running' | 'success' | 'error';
  errorMessage?: string;
  rawOutput: string;
}

function detectProvider(command: string): { provider: string; agentName: string } {
  const cmd = command.toLowerCase();
  
  if (cmd.startsWith('claude ') || cmd.includes('/claude')) {
    return { provider: 'anthropic', agentName: 'claude-cli' };
  }
  if (cmd.includes('gh copilot') || cmd.includes('github copilot')) {
    return { provider: 'openai', agentName: 'github-copilot' };
  }
  if (cmd.startsWith('ollama ') || cmd.includes('/ollama')) {
    return { provider: 'ollama', agentName: 'ollama-cli' };
  }
  if (cmd.includes('openai') || cmd.includes('chatgpt')) {
    return { provider: 'openai', agentName: 'openai-cli' };
  }
  if (cmd.includes('gemini') || cmd.includes('bard')) {
    return { provider: 'google', agentName: 'gemini-cli' };
  }
  
  return { provider: 'custom', agentName: 'cli-agent' };
}

function parseOutput(output: string, provider: string): Partial<TraceData> {
  switch (provider) {
    case 'anthropic':
      return parseClaudeOutput(output);
    case 'ollama':
      return parseOllamaOutput(output);
    case 'openai':
      return parseCopilotOutput(output);
    default:
      return {};
  }
}

async function sendTrace(trace: TraceData): Promise<void> {
  const config = getConfig();
  
  try {
    const response = await fetch(`${config.collectorUrl}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: nanoid(),
            trace_id: trace.traceId,
            span_id: nanoid(),
            timestamp: trace.startTime.toISOString(),
            event_type: 'agent_start',
            agent: {
              id: trace.agentId,
              name: trace.agentName,
            },
            context: {
              provider: trace.provider,
              model: trace.model,
              environment: 'cli',
            },
          },
          {
            id: nanoid(),
            trace_id: trace.traceId,
            span_id: nanoid(),
            timestamp: (trace.endTime || new Date()).toISOString(),
            event_type: 'agent_end',
            agent: {
              id: trace.agentId,
              name: trace.agentName,
            },
            context: {
              provider: trace.provider,
              model: trace.model,
            },
            output: {
              status: trace.status,
              completion_tokens: trace.outputTokens,
              total_tokens: (trace.inputTokens || 0) + (trace.outputTokens || 0),
            },
            metrics: {
              latency_ms: trace.endTime ? trace.endTime.getTime() - trace.startTime.getTime() : 0,
              input_tokens: trace.inputTokens,
              output_tokens: trace.outputTokens,
            },
            error: trace.errorMessage ? { message: trace.errorMessage } : undefined,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(chalk.dim(`Warning: Failed to send trace (HTTP ${response.status})`));
    }
  } catch (err: any) {
    console.error(chalk.dim(`Warning: Could not send trace: ${err.message}`));
  }
}

export async function wrap(command: string, options: WrapOptions): Promise<void> {
  const { provider, agentName } = detectProvider(command);
  
  const trace: TraceData = {
    traceId: nanoid(),
    agentId: options.name || agentName,
    agentName: options.name || agentName,
    provider: options.provider || provider,
    startTime: new Date(),
    status: 'running',
    rawOutput: '',
  };

  console.error(chalk.dim(`[agentlens] Tracing ${trace.provider}/${trace.agentName} (${trace.traceId.slice(0, 8)})`));

  const child = spawn(command, {
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr?.on('data', (data) => {
    const text = data.toString();
    stderr += text;
    process.stderr.write(text);
  });

  child.on('close', async (code) => {
    trace.endTime = new Date();
    trace.rawOutput = stdout + stderr;
    trace.status = code === 0 ? 'success' : 'error';
    
    if (code !== 0) {
      trace.errorMessage = `Process exited with code ${code}`;
    }

    // Parse output for token counts, model info, etc.
    const parsed = parseOutput(trace.rawOutput, trace.provider);
    Object.assign(trace, parsed);

    // Send trace to collector
    await sendTrace(trace);

    const duration = trace.endTime.getTime() - trace.startTime.getTime();
    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;

    console.error(chalk.dim(`[agentlens] Completed in ${durationStr}`));
    console.error(chalk.dim(`[agentlens] View: agentlens view ${trace.traceId}`));

    process.exit(code || 0);
  });

  child.on('error', async (err) => {
    trace.endTime = new Date();
    trace.status = 'error';
    trace.errorMessage = err.message;

    await sendTrace(trace);

    console.error(chalk.red(`[agentlens] Error: ${err.message}`));
    process.exit(1);
  });
}
