/**
 * Parser for Ollama CLI output
 */

export interface OllamaMetrics {
  model?: string;
  total_duration_ns?: number;
  load_duration_ns?: number;
  prompt_eval_count?: number;
  prompt_eval_duration_ns?: number;
  eval_count?: number;
  eval_duration_ns?: number;
  tokens_per_second?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export function parseOllamaOutput(output: string): OllamaMetrics | null {
  try {
    // Ollama can output JSON with --format json
    const lines = output.split('\n').filter((l) => l.trim());

    let metrics: OllamaMetrics = {};

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Extract model
        if (parsed.model) {
          metrics.model = parsed.model;
        }

        // Extract timing info (final response has these)
        if (parsed.total_duration) {
          metrics.total_duration_ns = parsed.total_duration;
        }
        if (parsed.load_duration) {
          metrics.load_duration_ns = parsed.load_duration;
        }
        if (parsed.prompt_eval_count) {
          metrics.prompt_eval_count = parsed.prompt_eval_count;
          metrics.input_tokens = parsed.prompt_eval_count;
        }
        if (parsed.prompt_eval_duration) {
          metrics.prompt_eval_duration_ns = parsed.prompt_eval_duration;
        }
        if (parsed.eval_count) {
          metrics.eval_count = parsed.eval_count;
          metrics.output_tokens = parsed.eval_count;
        }
        if (parsed.eval_duration) {
          metrics.eval_duration_ns = parsed.eval_duration;
          // Calculate tokens/sec
          if (parsed.eval_count && parsed.eval_duration > 0) {
            metrics.tokens_per_second =
              parsed.eval_count / (parsed.eval_duration / 1e9);
          }
        }
      } catch {
        continue;
      }
    }

    return Object.keys(metrics).length > 0 ? metrics : null;
  } catch {
    return null;
  }
}

/**
 * Parse Ollama verbose output
 * Extracts info from the stats line at the end
 */
export function parseOllamaVerbose(output: string): OllamaMetrics | null {
  const metrics: OllamaMetrics = {};

  // Ollama shows stats like:
  // "eval rate: 54.32 tokens/s"
  const evalRateMatch = output.match(/eval rate:\s*([\d.]+)\s*tokens\/s/i);
  if (evalRateMatch) {
    metrics.tokens_per_second = parseFloat(evalRateMatch[1]);
  }

  // "total duration: 1.234s"
  const durationMatch = output.match(/total duration:\s*([\d.]+)s/i);
  if (durationMatch) {
    metrics.total_duration_ns = parseFloat(durationMatch[1]) * 1e9;
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}
