/**
 * Model pricing for cost calculation
 */

interface Pricing {
  input: number;   // per 1M tokens
  output: number;  // per 1M tokens
}

const MODEL_PRICING: Record<string, Pricing> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3.5-sonnet': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3.5-haiku': { input: 0.25, output: 1.25 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-2.0-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
};

export function proxyCostCalc(model: string | undefined, inputTokens: number, outputTokens: number): number {
  if (!model) return 0;
  // Find best match — check if model string starts with any known key
  const key = Object.keys(MODEL_PRICING).find(k => model.startsWith(k));
  if (!key) return 0;
  const p = MODEL_PRICING[key];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
