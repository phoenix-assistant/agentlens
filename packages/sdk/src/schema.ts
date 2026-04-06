/**
 * AgentLens Event Schema
 * OpenTelemetry-inspired schema for multi-agent tracing
 */

// ============================================================================
// Core Types
// ============================================================================

export type EventType = 
  | 'agent_start'
  | 'agent_end'
  | 'handoff'
  | 'error'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'streaming_chunk';

export type AgentType = 'llm' | 'tool' | 'orchestrator' | 'human';

export type EventStatus = 'success' | 'error' | 'timeout' | 'cancelled';

export type Provider = 
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'azure'
  | 'aws-bedrock'
  | 'together'
  | 'groq'
  | 'local'
  | 'custom';

export type Environment = 'development' | 'staging' | 'production' | 'test';

// ============================================================================
// Event Interfaces
// ============================================================================

/**
 * Core agent event - the fundamental unit of tracing
 */
export interface AgentEvent {
  /** Unique event ID */
  id: string;
  
  /** Links entire multi-agent run (propagates through all agents) */
  trace_id: string;
  
  /** This specific agent action */
  span_id: string;
  
  /** Who called this agent (parent span) */
  parent_span_id?: string;
  
  /** ISO8601 timestamp */
  timestamp: string;
  
  /** Type of event */
  event_type: EventType;
  
  /** Agent information */
  agent: AgentInfo;
  
  /** Input metrics (for agent_start) */
  input?: InputMetrics;
  
  /** Output metrics (for agent_end) */
  output?: OutputMetrics;
  
  /** Performance metrics */
  metrics: PerformanceMetrics;
  
  /** Contextual information */
  context: EventContext;
  
  /** Error details (if event_type === 'error') */
  error?: ErrorInfo;
  
  /** Tool call details (if event_type === 'tool_call' or 'tool_result') */
  tool?: ToolInfo;
  
  /** Handoff details (if event_type === 'handoff') */
  handoff?: HandoffInfo;
}

/**
 * Agent identification and metadata
 */
export interface AgentInfo {
  /** Unique agent identifier (e.g., "claude-3-opus", "gpt-4-turbo") */
  id: string;
  
  /** Human-readable name */
  name?: string;
  
  /** Agent type */
  type: AgentType;
  
  /** Provider/platform */
  provider: Provider;
  
  /** Model version (e.g., "claude-3-opus-20240229") */
  model_version?: string;
  
  /** Agent configuration */
  config?: Record<string, unknown>;
}

/**
 * Input metrics - captured at agent_start
 */
export interface InputMetrics {
  /** Number of prompt tokens */
  prompt_tokens?: number;
  
  /** Number of messages in context */
  message_count?: number;
  
  /** SHA256 hash of input for deduplication (privacy-preserving) */
  input_hash?: string;
  
  /** System prompt hash */
  system_hash?: string;
  
  /** Whether input contained images */
  has_images?: boolean;
  
  /** Whether input contained files */
  has_files?: boolean;
}

/**
 * Output metrics - captured at agent_end
 */
export interface OutputMetrics {
  /** Number of completion tokens */
  completion_tokens?: number;
  
  /** Total tokens (prompt + completion) */
  total_tokens?: number;
  
  /** Event status */
  status: EventStatus;
  
  /** SHA256 hash of output */
  output_hash?: string;
  
  /** Whether output was streamed */
  streamed?: boolean;
  
  /** Number of tool calls made */
  tool_calls_count?: number;
  
  /** Stop reason */
  stop_reason?: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Total latency in milliseconds */
  latency_ms: number;
  
  /** Time to first token (for streaming) */
  ttft_ms?: number;
  
  /** Time spent in queue */
  queue_time_ms?: number;
  
  /** Estimated cost in USD */
  cost_usd?: number;
  
  /** Tokens per second (for streaming) */
  tokens_per_second?: number;
}

/**
 * Event context
 */
export interface EventContext {
  /** Session identifier (groups related runs) */
  session_id?: string;
  
  /** User identifier (for multi-tenant) */
  user_id?: string;
  
  /** Organization identifier */
  org_id?: string;
  
  /** Environment */
  environment: Environment;
  
  /** SDK/client that generated this event */
  sdk: {
    name: string;
    version: string;
    language?: string;
  };
  
  /** Custom tags */
  tags?: Record<string, string>;
  
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error information
 */
export interface ErrorInfo {
  /** Error type/code */
  code: string;
  
  /** Error message */
  message: string;
  
  /** Stack trace (if available and opted in) */
  stack?: string;
  
  /** Whether this error is retryable */
  retryable?: boolean;
  
  /** Retry attempt number */
  retry_count?: number;
}

/**
 * Tool call information
 */
export interface ToolInfo {
  /** Tool name */
  name: string;
  
  /** Tool input hash (privacy-preserving) */
  input_hash?: string;
  
  /** Tool output hash */
  output_hash?: string;
  
  /** Tool execution duration */
  duration_ms?: number;
  
  /** Tool status */
  status?: EventStatus;
}

/**
 * Handoff information - when one agent delegates to another
 */
export interface HandoffInfo {
  /** Agent receiving the handoff */
  to_agent_id: string;
  
  /** Reason for handoff */
  reason?: string;
  
  /** Type of handoff */
  type: 'delegation' | 'fallback' | 'escalation' | 'parallel';
}

// ============================================================================
// Trace Types
// ============================================================================

/**
 * A complete trace - represents a full multi-agent execution
 */
export interface Trace {
  /** Trace ID */
  id: string;
  
  /** When the trace started */
  start_time: string;
  
  /** When the trace ended */
  end_time?: string;
  
  /** Root span ID */
  root_span_id: string;
  
  /** All events in this trace */
  events: AgentEvent[];
  
  /** Aggregated metrics */
  summary?: TraceSummary;
}

/**
 * Aggregated trace summary
 */
export interface TraceSummary {
  /** Total duration */
  total_duration_ms: number;
  
  /** Total tokens used */
  total_tokens: number;
  
  /** Total cost */
  total_cost_usd: number;
  
  /** Number of agents involved */
  agent_count: number;
  
  /** Number of tool calls */
  tool_call_count: number;
  
  /** Number of errors */
  error_count: number;
  
  /** Final status */
  status: EventStatus;
  
  /** Agents used */
  agents: string[];
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Batch of events to send to collector
 */
export interface EventBatch {
  /** Events in this batch */
  events: AgentEvent[];
  
  /** Client timestamp */
  client_timestamp: string;
  
  /** Batch sequence number (for ordering) */
  sequence?: number;
}

/**
 * Query parameters for listing traces
 */
export interface TraceQuery {
  /** Filter by session */
  session_id?: string;
  
  /** Filter by user */
  user_id?: string;
  
  /** Filter by agent */
  agent_id?: string;
  
  /** Filter by status */
  status?: EventStatus;
  
  /** Filter by environment */
  environment?: Environment;
  
  /** Start time (ISO8601) */
  start_time?: string;
  
  /** End time (ISO8601) */
  end_time?: string;
  
  /** Filter by tags */
  tags?: Record<string, string>;
  
  /** Pagination limit */
  limit?: number;
  
  /** Pagination offset */
  offset?: number;
  
  /** Sort order */
  sort?: 'asc' | 'desc';
}

// ============================================================================
// Cost Configuration
// ============================================================================

/**
 * Model pricing configuration
 */
export interface ModelPricing {
  /** Model ID pattern (supports wildcards) */
  model_pattern: string;
  
  /** Cost per 1K input tokens in USD */
  input_cost_per_1k: number;
  
  /** Cost per 1K output tokens in USD */
  output_cost_per_1k: number;
  
  /** Provider */
  provider: Provider;
}

/**
 * Default pricing for common models (as of 2024)
 */
export const DEFAULT_PRICING: ModelPricing[] = [
  // Anthropic
  { model_pattern: 'claude-3-opus*', provider: 'anthropic', input_cost_per_1k: 0.015, output_cost_per_1k: 0.075 },
  { model_pattern: 'claude-3-sonnet*', provider: 'anthropic', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  { model_pattern: 'claude-3-haiku*', provider: 'anthropic', input_cost_per_1k: 0.00025, output_cost_per_1k: 0.00125 },
  { model_pattern: 'claude-3.5-sonnet*', provider: 'anthropic', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  
  // OpenAI
  { model_pattern: 'gpt-4-turbo*', provider: 'openai', input_cost_per_1k: 0.01, output_cost_per_1k: 0.03 },
  { model_pattern: 'gpt-4o*', provider: 'openai', input_cost_per_1k: 0.005, output_cost_per_1k: 0.015 },
  { model_pattern: 'gpt-4o-mini*', provider: 'openai', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
  { model_pattern: 'gpt-3.5-turbo*', provider: 'openai', input_cost_per_1k: 0.0005, output_cost_per_1k: 0.0015 },
  
  // Google
  { model_pattern: 'gemini-1.5-pro*', provider: 'google', input_cost_per_1k: 0.00125, output_cost_per_1k: 0.005 },
  { model_pattern: 'gemini-1.5-flash*', provider: 'google', input_cost_per_1k: 0.000075, output_cost_per_1k: 0.0003 },
  
  // Local (free)
  { model_pattern: '*', provider: 'ollama', input_cost_per_1k: 0, output_cost_per_1k: 0 },
  { model_pattern: '*', provider: 'local', input_cost_per_1k: 0, output_cost_per_1k: 0 },
];

/**
 * Calculate cost for a given model and token usage
 */
export function calculateCost(
  model: string,
  provider: Provider,
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing[] = DEFAULT_PRICING
): number {
  const priceConfig = pricing.find(p => {
    if (p.provider !== provider) return false;
    const pattern = p.model_pattern.replace('*', '.*');
    return new RegExp(`^${pattern}$`).test(model);
  });
  
  if (!priceConfig) return 0;
  
  const inputCost = (inputTokens / 1000) * priceConfig.input_cost_per_1k;
  const outputCost = (outputTokens / 1000) * priceConfig.output_cost_per_1k;
  
  return Math.round((inputCost + outputCost) * 1000000) / 1000000; // 6 decimal places
}
