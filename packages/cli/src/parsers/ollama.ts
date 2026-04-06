/**
 * Parser for Ollama CLI output
 */

export function parseOllamaOutput(output: string): Partial<{ inputTokens: number; outputTokens: number; model: string }> {
  const result: Partial<{ inputTokens: number; outputTokens: number; model: string }> = {};

  try {
    // Ollama can output JSON with --format json
    const lines = output.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Extract model
        if (parsed.model) {
          result.model = parsed.model;
        }

        // Extract token counts
        if (parsed.prompt_eval_count) {
          result.inputTokens = parsed.prompt_eval_count;
        }
        if (parsed.eval_count) {
          result.outputTokens = parsed.eval_count;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Fallback: estimate from text
  if (!result.outputTokens) {
    const words = output.split(/\s+/).length;
    result.outputTokens = Math.ceil(words * 1.3);
  }

  return result;
}
