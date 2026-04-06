/**
 * Parser for Claude CLI output
 * Extracts metrics from --output-format json
 */

export interface ClaudeMetrics {
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
  stop_reason?: string;
  conversation_id?: string;
  tool_calls?: string[];
}

export function parseClaudeOutput(output: string): ClaudeMetrics | null {
  try {
    // Claude CLI with --output-format json outputs JSON lines
    const lines = output.split('\n').filter((l) => l.trim());

    let metrics: ClaudeMetrics = {};
    const toolCalls: string[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Extract usage info
        if (parsed.usage) {
          metrics.input_tokens = parsed.usage.input_tokens;
          metrics.output_tokens = parsed.usage.output_tokens;
        }

        // Extract model
        if (parsed.model) {
          metrics.model = parsed.model;
        }

        // Extract stop reason
        if (parsed.stop_reason) {
          metrics.stop_reason = parsed.stop_reason;
        }

        // Extract conversation ID
        if (parsed.conversation_id || parsed.id) {
          metrics.conversation_id = parsed.conversation_id || parsed.id;
        }

        // Extract tool use
        if (parsed.type === 'tool_use' && parsed.name) {
          toolCalls.push(parsed.name);
        }

        // Handle streaming chunks
        if (parsed.type === 'message_delta' && parsed.usage) {
          metrics.output_tokens = parsed.usage.output_tokens;
        }
      } catch {
        // Not JSON, might be regular output
        continue;
      }
    }

    if (toolCalls.length > 0) {
      metrics.tool_calls = toolCalls;
    }

    return Object.keys(metrics).length > 0 ? metrics : null;
  } catch {
    return null;
  }
}

/**
 * Parse Claude interactive output (non-JSON)
 * Fallback for when --output-format json isn't used
 */
export function parseClaudeInteractive(output: string): ClaudeMetrics | null {
  const metrics: ClaudeMetrics = {};

  // Look for token counts in output
  // Claude sometimes shows "Tokens: X input, Y output"
  const tokenMatch = output.match(/(\d+)\s*input.*?(\d+)\s*output/i);
  if (tokenMatch) {
    metrics.input_tokens = parseInt(tokenMatch[1], 10);
    metrics.output_tokens = parseInt(tokenMatch[2], 10);
  }

  // Look for tool use indicators
  const toolMatch = output.match(/Using tool:\s*(\w+)/g);
  if (toolMatch) {
    metrics.tool_calls = toolMatch.map((t) =>
      t.replace('Using tool:', '').trim()
    );
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}
