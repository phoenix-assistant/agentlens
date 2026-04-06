/**
 * In-Memory Event Store
 * For development and testing
 */

import {
  EventStore,
  AgentEvent,
  TraceSummary,
  AgentStats,
  EventQuery,
  TraceQuery,
  StatsQuery,
} from './types';

interface MemoryConfig {
  maxEvents?: number;
  maxTraces?: number;
}

export class InMemoryStore implements EventStore {
  private events: AgentEvent[] = [];
  private traces: Map<string, TraceSummary> = new Map();
  private config: MemoryConfig;
  private subscribers: Map<string, Set<(event: AgentEvent) => void>> = new Map();

  constructor(config?: MemoryConfig) {
    this.config = {
      maxEvents: config?.maxEvents ?? 100000,
      maxTraces: config?.maxTraces ?? 10000,
    };
  }

  async initialize(): Promise<void> {
    // Nothing to initialize for in-memory store
  }

  async close(): Promise<void> {
    this.events = [];
    this.traces.clear();
    this.subscribers.clear();
  }

  async insertEvent(event: AgentEvent): Promise<void> {
    this.events.push(event);
    this.updateTraceSummary(event);
    this.notifySubscribers(event);

    // Trim if over limit
    if (this.events.length > this.config.maxEvents!) {
      this.events = this.events.slice(-this.config.maxEvents!);
    }
  }

  async insertEvents(events: AgentEvent[]): Promise<void> {
    for (const event of events) {
      await this.insertEvent(event);
    }
  }

  async getEvents(query: EventQuery): Promise<AgentEvent[]> {
    let filtered = [...this.events];

    if (query.traceId) {
      filtered = filtered.filter((e) => e.trace_id === query.traceId);
    }
    if (query.spanId) {
      filtered = filtered.filter((e) => e.span_id === query.spanId);
    }
    if (query.agentId) {
      filtered = filtered.filter((e) => e.agent?.id === query.agentId);
    }
    if (query.sessionId) {
      filtered = filtered.filter((e) => e.session?.id === query.sessionId);
    }
    if (query.userId) {
      filtered = filtered.filter((e) => e.session?.user_id === query.userId);
    }
    if (query.eventTypes?.length) {
      filtered = filtered.filter((e) => query.eventTypes!.includes(e.event_type));
    }
    if (query.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= query.endTime!);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return filtered.slice(offset, offset + limit);
  }

  async getTrace(traceId: string): Promise<{ trace: TraceSummary; events: AgentEvent[] } | null> {
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    const events = await this.getEvents({ traceId, limit: 10000 });
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { trace, events };
  }

  async listTraces(query: TraceQuery): Promise<TraceSummary[]> {
    let filtered = Array.from(this.traces.values());

    if (query.sessionId) {
      filtered = filtered.filter((t) => t.session_id === query.sessionId);
    }
    if (query.userId) {
      filtered = filtered.filter((t) => t.user_id === query.userId);
    }
    if (query.agentId) {
      filtered = filtered.filter((t) => t.agent_id === query.agentId);
    }
    if (query.status) {
      filtered = filtered.filter((t) => t.status === query.status);
    }
    if (query.startTime) {
      filtered = filtered.filter((t) => t.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      filtered = filtered.filter((t) => t.timestamp <= query.endTime!);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return filtered.slice(offset, offset + limit);
  }

  async getStats(query: StatsQuery): Promise<AgentStats[]> {
    const events = await this.getEvents({
      agentId: query.agentId,
      startTime: query.startTime,
      endTime: query.endTime,
      limit: 100000,
    });

    // Group by agent and hour
    const statsMap = new Map<string, AgentStats>();
    const granularity = query.granularity ?? 'hour';

    for (const event of events) {
      if (event.event_type !== 'agent_end') continue;

      const agentId = event.agent?.id || 'unknown';
      const timestamp = new Date(event.timestamp);
      let hourKey: string;

      if (granularity === 'minute') {
        hourKey = timestamp.toISOString().slice(0, 16) + ':00.000Z';
      } else if (granularity === 'day') {
        hourKey = timestamp.toISOString().slice(0, 10) + 'T00:00:00.000Z';
      } else {
        hourKey = timestamp.toISOString().slice(0, 13) + ':00:00.000Z';
      }

      const key = `${agentId}:${hourKey}`;
      const existing = statsMap.get(key) || {
        agent_id: agentId,
        hour: hourKey,
        trace_count: 0,
        total_tokens: 0,
        total_cost: 0,
        avg_latency_ms: 0,
        error_count: 0,
        success_count: 0,
      };

      existing.trace_count++;
      existing.total_tokens += event.output?.total_tokens || 0;
      existing.total_cost += event.metrics?.cost_usd || 0;
      
      const latency = event.metrics?.latency_ms || 0;
      existing.avg_latency_ms =
        (existing.avg_latency_ms * (existing.trace_count - 1) + latency) / existing.trace_count;

      if (event.output?.status === 'error' || event.error) {
        existing.error_count++;
      } else {
        existing.success_count++;
      }

      statsMap.set(key, existing);
    }

    return Array.from(statsMap.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }

  subscribe(traceId: string, callback: (event: AgentEvent) => void): () => void {
    if (!this.subscribers.has(traceId)) {
      this.subscribers.set(traceId, new Set());
    }
    this.subscribers.get(traceId)!.add(callback);

    return () => {
      this.subscribers.get(traceId)?.delete(callback);
    };
  }

  private updateTraceSummary(event: AgentEvent): void {
    const existing = this.traces.get(event.trace_id);

    if (!existing) {
      // Create new trace summary
      this.traces.set(event.trace_id, {
        trace_id: event.trace_id,
        session_id: event.session?.id,
        user_id: event.session?.user_id,
        agent_id: event.agent?.id,
        agent_name: event.agent?.name,
        provider: event.agent?.provider,
        model: event.agent?.model,
        status: 'running',
        timestamp: event.timestamp,
        span_count: 1,
      });

      // Trim traces if over limit
      if (this.traces.size > this.config.maxTraces!) {
        const oldestKey = this.traces.keys().next().value;
        if (oldestKey) this.traces.delete(oldestKey);
      }
    } else {
      // Update existing trace
      existing.span_count = (existing.span_count || 0) + 1;

      if (event.event_type === 'agent_end' || event.event_type === 'trace_end') {
        existing.status = event.output?.status || event.error ? 'error' : 'success';
        existing.latency_ms = event.metrics?.latency_ms;
        existing.total_tokens = (existing.total_tokens || 0) + (event.output?.total_tokens || 0);
        existing.total_cost = (existing.total_cost || 0) + (event.metrics?.cost_usd || 0);
        
        if (event.error) {
          existing.error_message = event.error.message;
        }
      }
    }
  }

  private notifySubscribers(event: AgentEvent): void {
    // Notify trace-specific subscribers
    const traceSubscribers = this.subscribers.get(event.trace_id);
    if (traceSubscribers) {
      for (const callback of traceSubscribers) {
        try {
          callback(event);
        } catch (err) {
          console.error('Subscriber callback error:', err);
        }
      }
    }

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      for (const callback of wildcardSubscribers) {
        try {
          callback(event);
        } catch (err) {
          console.error('Subscriber callback error:', err);
        }
      }
    }
  }
}
