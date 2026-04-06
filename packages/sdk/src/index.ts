/**
 * AgentLens SDK
 * Client library for instrumenting AI agents
 */

import { nanoid } from 'nanoid';
import {
  AgentEvent,
  AgentInfo,
  EventType,
  EventContext,
  EventBatch,
  Provider,
  Environment,
  EventStatus,
  calculateCost,
} from './schema';

export * from './schema';

// ============================================================================
// Configuration
// ============================================================================

export interface AgentLensConfig {
  /** Collector endpoint URL */
  endpoint?: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Environment */
  environment?: Environment;
  
  /** Default tags to add to all events */
  defaultTags?: Record<string, string>;
  
  /** Whether to batch events */
  batching?: boolean;
  
  /** Batch size before flush */
  batchSize?: number;
  
  /** Batch flush interval in ms */
  flushIntervalMs?: number;
  
  /** Whether to capture input/output hashes */
  captureHashes?: boolean;
  
  /** Whether to send events (false for dry run) */
  enabled?: boolean;
  
  /** Debug mode - logs events to console */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<AgentLensConfig> = {
  endpoint: 'http://localhost:3100/v1/events',
  apiKey: '',
  environment: 'development',
  defaultTags: {},
  batching: true,
  batchSize: 100,
  flushIntervalMs: 5000,
  captureHashes: true,
  enabled: true,
  debug: false,
};

// ============================================================================
// Client
// ============================================================================

export class AgentLens {
  private config: Required<AgentLensConfig>;
  private eventQueue: AgentEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sequence = 0;
  
  constructor(config: AgentLensConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.batching && this.config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    }
  }
  
  /**
   * Create a new trace context
   */
  startTrace(sessionId?: string): TraceContext {
    return new TraceContext(this, {
      traceId: nanoid(),
      sessionId,
      environment: this.config.environment,
      tags: { ...this.config.defaultTags },
    });
  }
  
  /**
   * Record an event
   */
  record(event: AgentEvent): void {
    if (!this.config.enabled) return;
    
    if (this.config.debug) {
      console.log('[AgentLens]', JSON.stringify(event, null, 2));
    }
    
    if (this.config.batching) {
      this.eventQueue.push(event);
      if (this.eventQueue.length >= this.config.batchSize) {
        this.flush();
      }
    } else {
      this.sendEvents([event]);
    }
  }
  
  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    
    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    await this.sendEvents(events);
  }
  
  /**
   * Send events to collector
   */
  private async sendEvents(events: AgentEvent[]): Promise<void> {
    if (!this.config.enabled || events.length === 0) return;
    
    const batch: EventBatch = {
      events,
      client_timestamp: new Date().toISOString(),
      sequence: this.sequence++,
    };
    
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(batch),
      });
      
      if (!response.ok) {
        console.error('[AgentLens] Failed to send events:', response.status, await response.text());
      }
    } catch (error) {
      console.error('[AgentLens] Failed to send events:', error);
    }
  }
  
  /**
   * Shutdown - flush remaining events and stop timers
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// ============================================================================
// Trace Context
// ============================================================================

interface TraceContextOptions {
  traceId: string;
  sessionId?: string;
  environment: Environment;
  tags: Record<string, string>;
}

export class TraceContext {
  private client: AgentLens;
  private options: TraceContextOptions;
  
  constructor(client: AgentLens, options: TraceContextOptions) {
    this.client = client;
    this.options = options;
  }
  
  get traceId(): string {
    return this.options.traceId;
  }
  
  /**
   * Start a new span for an agent
   */
  startSpan(agent: AgentInfo, parentSpanId?: string): SpanContext {
    return new SpanContext(this.client, this, agent, parentSpanId);
  }
  
  /**
   * Add a tag to this trace
   */
  addTag(key: string, value: string): void {
    this.options.tags[key] = value;
  }
  
  /**
   * Get the base context for events
   */
  getContext(): EventContext {
    return {
      session_id: this.options.sessionId,
      environment: this.options.environment,
      sdk: {
        name: '@agentlens/sdk',
        version: '0.1.0',
        language: 'typescript',
      },
      tags: this.options.tags,
    };
  }
}

// ============================================================================
// Span Context
// ============================================================================

export class SpanContext {
  private client: AgentLens;
  private trace: TraceContext;
  private agent: AgentInfo;
  private spanId: string;
  private parentSpanId?: string;
  private startTime: number;
  private inputTokens?: number;
  private outputTokens?: number;
  
  constructor(
    client: AgentLens,
    trace: TraceContext,
    agent: AgentInfo,
    parentSpanId?: string
  ) {
    this.client = client;
    this.trace = trace;
    this.agent = agent;
    this.spanId = nanoid();
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    
    // Record start event
    this.client.record(this.createEvent('agent_start'));
  }
  
  get id(): string {
    return this.spanId;
  }
  
  /**
   * Create a child span
   */
  createChild(agent: AgentInfo): SpanContext {
    return new SpanContext(this.client, this.trace, agent, this.spanId);
  }
  
  /**
   * Record input tokens
   */
  setInputTokens(tokens: number): void {
    this.inputTokens = tokens;
  }
  
  /**
   * Record output tokens
   */
  setOutputTokens(tokens: number): void {
    this.outputTokens = tokens;
  }
  
  /**
   * Record a tool call
   */
  recordToolCall(
    toolName: string,
    durationMs: number,
    status: EventStatus = 'success'
  ): void {
    this.client.record({
      ...this.createEvent('tool_call'),
      tool: {
        name: toolName,
        duration_ms: durationMs,
        status,
      },
    });
  }
  
  /**
   * Record an error
   */
  recordError(code: string, message: string, retryable = false): void {
    this.client.record({
      ...this.createEvent('error'),
      error: {
        code,
        message,
        retryable,
      },
    });
  }
  
  /**
   * Record a handoff to another agent
   */
  recordHandoff(
    toAgentId: string,
    type: 'delegation' | 'fallback' | 'escalation' | 'parallel' = 'delegation',
    reason?: string
  ): void {
    this.client.record({
      ...this.createEvent('handoff'),
      handoff: {
        to_agent_id: toAgentId,
        type,
        reason,
      },
    });
  }
  
  /**
   * End the span
   */
  end(status: EventStatus = 'success', stopReason?: string): void {
    const latencyMs = Date.now() - this.startTime;
    
    // Calculate cost if we have token counts
    let costUsd: number | undefined;
    if (this.inputTokens !== undefined && this.outputTokens !== undefined) {
      costUsd = calculateCost(
        this.agent.model_version || this.agent.id,
        this.agent.provider,
        this.inputTokens,
        this.outputTokens
      );
    }
    
    this.client.record({
      ...this.createEvent('agent_end'),
      output: {
        completion_tokens: this.outputTokens,
        total_tokens: (this.inputTokens || 0) + (this.outputTokens || 0),
        status,
        stop_reason: stopReason,
      },
      metrics: {
        latency_ms: latencyMs,
        cost_usd: costUsd,
      },
    });
  }
  
  /**
   * Create a base event
   */
  private createEvent(eventType: EventType): AgentEvent {
    return {
      id: nanoid(),
      trace_id: this.trace.traceId,
      span_id: this.spanId,
      parent_span_id: this.parentSpanId,
      timestamp: new Date().toISOString(),
      event_type: eventType,
      agent: this.agent,
      metrics: {
        latency_ms: Date.now() - this.startTime,
      },
      context: this.trace.getContext(),
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let defaultClient: AgentLens | null = null;

/**
 * Initialize the default client
 */
export function init(config: AgentLensConfig = {}): AgentLens {
  defaultClient = new AgentLens(config);
  return defaultClient;
}

/**
 * Get the default client
 */
export function getClient(): AgentLens {
  if (!defaultClient) {
    defaultClient = new AgentLens();
  }
  return defaultClient;
}

/**
 * Create a traced function wrapper
 */
export function traced<T extends (...args: unknown[]) => Promise<unknown>>(
  agentInfo: AgentInfo,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const client = getClient();
    const trace = client.startTrace();
    const span = trace.startSpan(agentInfo);
    
    try {
      const result = await fn(...args);
      span.end('success');
      return result;
    } catch (error) {
      span.recordError(
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : String(error)
      );
      span.end('error');
      throw error;
    }
  }) as T;
}

// ============================================================================
// Framework Integrations
// ============================================================================

/**
 * LangChain callback handler (to be implemented in separate package)
 */
export interface LangChainCallbackHandler {
  handleLLMStart: (llm: unknown, prompts: string[]) => void;
  handleLLMEnd: (output: unknown) => void;
  handleLLMError: (error: Error) => void;
}

/**
 * Create a LangChain callback handler
 */
export function createLangChainHandler(trace: TraceContext): LangChainCallbackHandler {
  let currentSpan: SpanContext | null = null;
  
  return {
    handleLLMStart(llm: unknown, prompts: string[]) {
      // Extract model info from llm object
      const modelName = (llm as { modelName?: string })?.modelName || 'unknown';
      currentSpan = trace.startSpan({
        id: modelName,
        type: 'llm',
        provider: detectProvider(modelName),
        model_version: modelName,
      });
    },
    
    handleLLMEnd(output: unknown) {
      if (currentSpan) {
        // Extract token counts if available
        const usage = (output as { llmOutput?: { tokenUsage?: { totalTokens?: number } } })
          ?.llmOutput?.tokenUsage;
        if (usage?.totalTokens) {
          currentSpan.setOutputTokens(usage.totalTokens);
        }
        currentSpan.end('success');
        currentSpan = null;
      }
    },
    
    handleLLMError(error: Error) {
      if (currentSpan) {
        currentSpan.recordError('LLM_ERROR', error.message);
        currentSpan.end('error');
        currentSpan = null;
      }
    },
  };
}

/**
 * Detect provider from model name
 */
function detectProvider(modelName: string): Provider {
  const lower = modelName.toLowerCase();
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('gpt')) return 'openai';
  if (lower.includes('gemini')) return 'google';
  if (lower.includes('llama') || lower.includes('mistral')) return 'ollama';
  return 'custom';
}