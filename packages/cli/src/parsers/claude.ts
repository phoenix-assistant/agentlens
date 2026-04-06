/**
 * Parser for Claude CLI output
 * Extracts metrics from --output-format json
 */

export interface ClaudeMetrics {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export function parseClaudeOutput(output: string): Partial<{ inputTokens: number; outputTokens: number; model: string }> {
  const result: Partial<{ inputTokens: number; outputTokens: number; model: string }> = {};

  try {
    // Claude CLI with --output-format json outputs JSON lines
    const lines = output.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Extract usage info
        if (parsed.usage) {
          result.inputTokens = parsed.usage.input_tokens;
          result.outputTokens = parsed.usage.output_tokens;
        }

        // Extract model
        if (parsed.model) {
          result.model = parsed.model;
        }

        // Handle streaming chunks
        if (parsed.type === 'message_delta' && parsed.usage) {
          result.outputTokens = parsed.usage.output_tokens;
        }
      } catch {
        // Not JSON, try to parse text
        continue;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Fallback: try to estimate from text
  if (!result.outputTokens) {
    const words = output.split(/\s+/).length;
    result.outputTokens = Math.ceil(words * 1.3);
  }

  return result;
}
