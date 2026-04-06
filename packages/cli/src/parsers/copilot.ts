/**
 * Parse GitHub Copilot CLI output
 */

interface ParsedOutput {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export function parseCopilotOutput(output: string): ParsedOutput {
  const result: ParsedOutput = {};

  // GitHub Copilot uses GPT-4 by default
  result.model = 'gpt-4';

  // Try to estimate tokens from output length
  // Rough estimate: ~4 chars per token
  const words = output.split(/\s+/).length;
  result.outputTokens = Math.ceil(words * 1.3);

  return result;
}
