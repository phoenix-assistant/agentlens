import { AgentEvent, Trace, TraceSummary, TraceQuery } from '@agentlens/sdk';
import { CollectorConfig } from '../config';
import { MemoryStore } from './memory';
import { ClickHouseStore } from './clickhouse';

export interface StatsQuery {
  start_time?: string;
  end_time?: string;
  group_by?: 'agent' | 'day' | 'hour';
}

export interface Stats {
  total_traces: number;
  total_events: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  error_rate: number;
  by_agent?: Record<string, {
    count: number;
    tokens: number;
    cost_usd: number;
    avg_latency_ms: number;
    error_count: number;
  }>;
  by_time?: Array<{
    timestamp: string;
    count: number;
    tokens: number;
    cost_usd: number;
  }>;
}

export interface EventStore {
  insertEvents(events: AgentEvent[]): Promise<void>;
  getTrace(traceId: string): Promise<Trace | null>;
  getEvents(traceId: string): Promise<AgentEvent[]>;
  listTraces(query: TraceQuery): Promise<Trace[]>;
  getStats(query: StatsQuery): Promise<Stats>;
  subscribe(callback: (event: AgentEvent) => void): () => void;
  close(): Promise<void>;
}

export async function createStore(config: CollectorConfig): Promise<EventStore> {
  if (config.storage === 'clickhouse') {
    const store = new ClickHouseStore(config.clickhouse);
    await store.initialize();
    return store;
  }
  
  return new MemoryStore();
}
