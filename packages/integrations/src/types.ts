/**
 * Common types for integrations
 */

import { AgentLensClient } from '@agentlens/sdk';

export interface IntegrationOptions {
  /** AgentLens client instance */
  client: AgentLensClient;
  /** Agent ID override */
  agentId?: string;
  /** Agent name override */
  agentName?: string;
  /** Capture prompts in events */
  capturePrompts?: boolean;
  /** Capture completions in events */
  captureCompletions?: boolean;
  /** Additional metadata to include */
  metadata?: Record<string, unknown>;
}

export interface WrappedClient<T> {
  /** Original client */
  original: T;
  /** Wrapped client with instrumentation */
  client: T;
  /** Unwrap and get original client */
  unwrap: () => T;
}

export interface StreamEvent {
  type: 'start' | 'token' | 'end' | 'error';
  token?: string;
  tokens?: number;
  error?: Error;
  timestamp: number;
}

export interface ModelPricing {
  inputCostPer1k: number;
  outputCostPer1k: number;
}

// Known model pricing (USD per 1k tokens)
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputCostPer1k: 0.005, outputCostPer1k: 0.015 },
  'gpt-4o-mini': { inputCostPer1k: 0.00015, outputCostPer1k: 0.0006 },
  'gpt-4-turbo': { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
  'gpt-4': { inputCostPer1k: 0.03, outputCostPer1k: 0.06 },
  'gpt-3.5-turbo': { inputCostPer1k: 0.0005, outputCostPer1k: 0.0015 },
  // Anthropic
  'claude-opus-4-20250514': { inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
  'claude-sonnet-4-20250514': { inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
  'claude-3-opus-20240229': { inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
  'claude-3-sonnet-20240229': { inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
  'claude-3-haiku-20240307': { inputCostPer1k: 0.00025, outputCostPer1k: 0.00125 },
  // Google
  'gemini-1.5-pro': { inputCostPer1k: 0.0035, outputCostPer1k: 0.0105 },
  'gemini-1.5-flash': { inputCostPer1k: 0.000075, outputCostPer1k: 0.0003 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  
  return (
    (inputTokens / 1000) * pricing.inputCostPer1k +
    (outputTokens / 1000) * pricing.outputCostPer1k
  );
}
