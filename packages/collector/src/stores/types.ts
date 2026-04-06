/**
 * Event Store Types
 */

export interface AgentEvent {
  id: string;
  trace_id: string;
  span_id?: string;
  parent_span_id?: string;
  timestamp: string;
  event_type: string;
  agent?: {
    id: string;
    name?: string;
    type?: string;
    provider?: string;
    model?: string;
  };
  session?: {
    id: string;
    user_id?: string;
  };
  input?: {
    prompt_tokens?: number;
    messages?: any[];
    [key: string]: any;
  };
  output?: {
    completion_tokens?: number;
    total_tokens?: number;
    status?: string;
    stop_reason?: string;
    [key: string]: any;
  };
  metrics?: {
    latency_ms?: number;
    cost_usd?: number;
    [key: string]: any;
  };
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  tool?: {
    name?: string;
    input?: any;
    output?: any;
    error?: any;
  };
  metadata?: Record<string, any>;
  environment?: string;
}

export interface TraceSummary {
  trace_id: string;
  session_id?: string;
  user_id?: string;
  agent_id?: string;
  agent_name?: string;
  provider?: string;
  model?: string;
  status: string;
  timestamp: string;
  latency_ms?: number;
  total_tokens?: number;
  total_cost?: number;
  span_count?: number;
  error_message?: string;
}

export interface AgentStats {
  agent_id: string;
  hour: string;
  trace_count: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
  error_count: number;
  success_count: number;
}

export interface EventQuery {
  traceId?: string;
  spanId?: string;
  agentId?: string;
  sessionId?: string;
  userId?: string;
  eventTypes?: string[];
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface TraceQuery {
  sessionId?: string;
  userId?: string;
  agentId?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface StatsQuery {
  agentId?: string;
  startTime?: string;
  endTime?: string;
  granularity?: 'minute' | 'hour' | 'day';
}

export interface EventStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Events
  insertEvent(event: AgentEvent): Promise<void>;
  insertEvents(events: AgentEvent[]): Promise<void>;
  getEvents(query: EventQuery): Promise<AgentEvent[]>;
  
  // Traces
  getTrace(traceId: string): Promise<{ trace: TraceSummary; events: AgentEvent[] } | null>;
  listTraces(query: TraceQuery): Promise<TraceSummary[]>;
  
  // Stats
  getStats(query: StatsQuery): Promise<AgentStats[]>;
  
  // Real-time
  subscribe?(traceId: string, callback: (event: AgentEvent) => void): () => void;
}

export interface EventStoreConfig {
  type: 'memory' | 'clickhouse';
  memory?: {
    maxEvents?: number;
    maxTraces?: number;
  };
  clickhouse?: {
    url: string;
    database: string;
    username?: string;
    password?: string;
  };
}
