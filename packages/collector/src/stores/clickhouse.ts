import { ClickHouse } from 'clickhouse';
import { AgentEvent, Trace, TraceSummary, TraceQuery } from '@agentlens/sdk';
import { EventStore, Stats, StatsQuery } from './event-store';

interface ClickHouseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * ClickHouse store for production use
 */
export class ClickHouseStore implements EventStore {
  private client: ClickHouse;
  private config: ClickHouseConfig;
  private subscribers: Set<(event: AgentEvent) => void> = new Set();

  constructor(config: ClickHouseConfig) {
    this.config = config;
    this.client = new ClickHouse({
      url: `http://${config.host}`,
      port: config.port,
      basicAuth: config.username ? {
        username: config.username,
        password: config.password,
      } : undefined,
    });
  }

  async initialize(): Promise<void> {
    // Create database
    await this.client.query(`CREATE DATABASE IF NOT EXISTS ${this.config.database}`).toPromise();

    // Create events table with optimized schema
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.config.database}.events (
        id String,
        trace_id String,
        span_id String,
        parent_span_id Nullable(String),
        timestamp DateTime64(3),
        event_type LowCardinality(String),
        
        -- Agent info
        agent_id String,
        agent_name Nullable(String),
        agent_type LowCardinality(String),
        agent_provider LowCardinality(String),
        agent_model_version Nullable(String),
        
        -- Input metrics
        input_prompt_tokens Nullable(UInt32),
        input_message_count Nullable(UInt16),
        input_hash Nullable(String),
        input_has_images Nullable(UInt8),
        input_has_files Nullable(UInt8),
        
        -- Output metrics
        output_completion_tokens Nullable(UInt32),
        output_total_tokens Nullable(UInt32),
        output_status Nullable(LowCardinality(String)),
        output_stop_reason Nullable(String),
        output_tool_calls_count Nullable(UInt16),
        
        -- Performance metrics
        latency_ms UInt32,
        ttft_ms Nullable(UInt32),
        queue_time_ms Nullable(UInt32),
        cost_usd Nullable(Float64),
        tokens_per_second Nullable(Float32),
        
        -- Context
        session_id Nullable(String),
        user_id Nullable(String),
        org_id Nullable(String),
        environment LowCardinality(String),
        sdk_name LowCardinality(String),
        sdk_version String,
        tags Map(String, String),
        metadata String,
        
        -- Error info
        error_code Nullable(String),
        error_message Nullable(String),
        error_retryable Nullable(UInt8),
        error_retry_count Nullable(UInt8),
        
        -- Tool info
        tool_name Nullable(String),
        tool_duration_ms Nullable(UInt32),
        tool_status Nullable(LowCardinality(String)),
        
        -- Handoff info
        handoff_to_agent_id Nullable(String),
        handoff_type Nullable(LowCardinality(String)),
        handoff_reason Nullable(String),
        
        -- Raw event for debugging
        raw_event String,
        
        -- Ingestion metadata
        ingested_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (trace_id, timestamp, span_id)
      TTL timestamp + INTERVAL 90 DAY
      SETTINGS index_granularity = 8192
    `).toPromise();

    // Create trace summaries materialized view
    await this.client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.trace_summaries_mv
      TO ${this.config.database}.trace_summaries
      AS SELECT
        trace_id,
        min(timestamp) as start_time,
        max(timestamp) as end_time,
        dateDiff('millisecond', min(timestamp), max(timestamp)) as total_duration_ms,
        sum(output_total_tokens) as total_tokens,
        sum(cost_usd) as total_cost_usd,
        uniqExact(agent_id) as agent_count,
        count() as event_count,
        countIf(event_type = 'tool_call') as tool_call_count,
        countIf(event_type = 'error' OR output_status = 'error') as error_count,
        if(countIf(output_status = 'error') > 0, 'error', 'success') as status,
        groupUniqArray(agent_id) as agents,
        any(session_id) as session_id,
        any(user_id) as user_id,
        any(environment) as environment
      FROM ${this.config.database}.events
      GROUP BY trace_id
    `).toPromise();

    // Create trace summaries target table
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.config.database}.trace_summaries (
        trace_id String,
        start_time DateTime64(3),
        end_time DateTime64(3),
        total_duration_ms UInt32,
        total_tokens UInt64,
        total_cost_usd Float64,
        agent_count UInt16,
        event_count UInt32,
        tool_call_count UInt16,
        error_count UInt16,
        status LowCardinality(String),
        agents Array(String),
        session_id Nullable(String),
        user_id Nullable(String),
        environment LowCardinality(String)
      ) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(start_time)
      ORDER BY (trace_id)
      TTL start_time + INTERVAL 90 DAY
    `).toPromise();

    // Create agent stats aggregation
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.config.database}.agent_stats_hourly (
        hour DateTime,
        agent_id String,
        agent_provider LowCardinality(String),
        environment LowCardinality(String),
        
        event_count UInt64,
        trace_count UInt64,
        total_tokens UInt64,
        total_cost_usd Float64,
        total_latency_ms UInt64,
        error_count UInt64,
        tool_call_count UInt64,
        
        p50_latency_ms Float32,
        p95_latency_ms Float32,
        p99_latency_ms Float32
      ) ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (hour, agent_id, environment)
      TTL hour + INTERVAL 365 DAY
    `).toPromise();

    // Create real-time aggregation MV
    await this.client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${this.config.database}.agent_stats_hourly_mv
      TO ${this.config.database}.agent_stats_hourly
      AS SELECT
        toStartOfHour(timestamp) as hour,
        agent_id,
        agent_provider,
        environment,
        count() as event_count,
        uniqExact(trace_id) as trace_count,
        sum(output_total_tokens) as total_tokens,
        sum(cost_usd) as total_cost_usd,
        sum(latency_ms) as total_latency_ms,
        countIf(event_type = 'error' OR output_status = 'error') as error_count,
        countIf(event_type = 'tool_call') as tool_call_count,
        quantile(0.5)(latency_ms) as p50_latency_ms,
        quantile(0.95)(latency_ms) as p95_latency_ms,
        quantile(0.99)(latency_ms) as p99_latency_ms
      FROM ${this.config.database}.events
      GROUP BY hour, agent_id, agent_provider, environment
    `).toPromise();

    console.log('✓ ClickHouse schema initialized');
  }

  async insertEvents(events: AgentEvent[]): Promise<void> {
    if (events.length === 0) return;

    const rows = events.map(event => ({
      id: event.id,
      trace_id: event.trace_id,
      span_id: event.span_id,
      parent_span_id: event.parent_span_id || null,
      timestamp: event.timestamp,
      event_type: event.event_type,
      agent_id: event.agent.id,
      agent_name: event.agent.name || null,
      agent_type: event.agent.type,
      agent_provider: event.agent.provider,
      agent_model_version: event.agent.model_version || null,
      input_prompt_tokens: event.input?.prompt_tokens || null,
      input_message_count: event.input?.message_count || null,
      input_hash: event.input?.input_hash || null,
      input_has_images: event.input?.has_images ? 1 : 0,
      input_has_files: event.input?.has_files ? 1 : 0,
      output_completion_tokens: event.output?.completion_tokens || null,
      output_total_tokens: event.output?.total_tokens || null,
      output_status: event.output?.status || null,
      output_stop_reason: event.output?.stop_reason || null,
      output_tool_calls_count: event.output?.tool_calls_count || null,
      latency_ms: event.metrics.latency_ms,
      ttft_ms: event.metrics.ttft_ms || null,
      queue_time_ms: event.metrics.queue_time_ms || null,
      cost_usd: event.metrics.cost_usd || null,
      tokens_per_second: event.metrics.tokens_per_second || null,
      session_id: event.context.session_id || null,
      user_id: event.context.user_id || null,
      org_id: event.context.org_id || null,
      environment: event.context.environment,
      sdk_name: event.context.sdk.name,
      sdk_version: event.context.sdk.version,
      tags: event.context.tags || {},
      metadata: JSON.stringify(event.context.metadata || {}),
      error_code: event.error?.code || null,
      error_message: event.error?.message || null,
      error_retryable: event.error?.retryable ? 1 : 0,
      error_retry_count: event.error?.retry_count || null,
      tool_name: event.tool?.name || null,
      tool_duration_ms: event.tool?.duration_ms || null,
      tool_status: event.tool?.status || null,
      handoff_to_agent_id: event.handoff?.to_agent_id || null,
      handoff_type: event.handoff?.type || null,
      handoff_reason: event.handoff?.reason || null,
      raw_event: JSON.stringify(event),
    }));

    await this.client.insert(`INSERT INTO ${this.config.database}.events`, rows).toPromise();

    // Notify subscribers for real-time updates
    for (const event of events) {
      for (const callback of this.subscribers) {
        callback(event);
      }
    }
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    const events = await this.getEvents(traceId);
    if (events.length === 0) return null;

    return this.buildTrace(traceId, events);
  }

  async getEvents(traceId: string): Promise<AgentEvent[]> {
    const result = await this.client.query(`
      SELECT raw_event
      FROM ${this.config.database}.events
      WHERE trace_id = {traceId:String}
      ORDER BY timestamp ASC
    `, { params: { traceId } }).toPromise();

    return (result as any[]).map(row => JSON.parse(row.raw_event));
  }

  async listTraces(query: TraceQuery): Promise<Trace[]> {
    const conditions: string[] = ['1=1'];
    const params: Record<string, any> = {};

    if (query.session_id) {
      conditions.push(`session_id = {session_id:String}`);
      params.session_id = query.session_id;
    }
    if (query.user_id) {
      conditions.push(`user_id = {user_id:String}`);
      params.user_id = query.user_id;
    }
    if (query.agent_id) {
      conditions.push(`has(agents, {agent_id:String})`);
      params.agent_id = query.agent_id;
    }
    if (query.environment) {
      conditions.push(`environment = {environment:String}`);
      params.environment = query.environment;
    }
    if (query.status) {
      conditions.push(`status = {status:String}`);
      params.status = query.status;
    }
    if (query.start_time) {
      conditions.push(`start_time >= {start_time:DateTime64(3)}`);
      params.start_time = query.start_time;
    }
    if (query.end_time) {
      conditions.push(`end_time <= {end_time:DateTime64(3)}`);
      params.end_time = query.end_time;
    }

    const limit = query.limit || 50;
    const offset = query.offset || 0;
    const sortOrder = query.sort === 'asc' ? 'ASC' : 'DESC';

    // Query from trace_summaries for efficiency
    const summariesResult = await this.client.query(`
      SELECT *
      FROM ${this.config.database}.trace_summaries
      WHERE ${conditions.join(' AND ')}
      ORDER BY start_time ${sortOrder}
      LIMIT ${limit}
      OFFSET ${offset}
    `, { params }).toPromise();

    const traces: Trace[] = [];
    for (const row of summariesResult as any[]) {
      const events = await this.getEvents(row.trace_id);
      traces.push({
        id: row.trace_id,
        start_time: row.start_time,
        end_time: row.end_time,
        root_span_id: events.find(e => !e.parent_span_id)?.span_id || events[0]?.span_id,
        events,
        summary: {
          total_duration_ms: row.total_duration_ms,
          total_tokens: row.total_tokens,
          total_cost_usd: row.total_cost_usd,
          agent_count: row.agent_count,
          tool_call_count: row.tool_call_count,
          error_count: row.error_count,
          status: row.status,
          agents: row.agents,
        },
      });
    }

    return traces;
  }

  async getStats(query: StatsQuery): Promise<Stats> {
    const conditions: string[] = ['1=1'];
    const params: Record<string, any> = {};

    if (query.start_time) {
      conditions.push(`hour >= toStartOfHour({start_time:DateTime64(3)})`);
      params.start_time = query.start_time;
    }
    if (query.end_time) {
      conditions.push(`hour <= toStartOfHour({end_time:DateTime64(3)})`);
      params.end_time = query.end_time;
    }

    // Overall stats from hourly aggregates
    const overallResult = await this.client.query(`
      SELECT
        sum(trace_count) as total_traces,
        sum(event_count) as total_events,
        sum(total_tokens) as total_tokens,
        sum(total_cost_usd) as total_cost_usd,
        sum(total_latency_ms) / sum(event_count) as avg_latency_ms,
        sum(error_count) / sum(event_count) as error_rate
      FROM ${this.config.database}.agent_stats_hourly
      WHERE ${conditions.join(' AND ')}
    `, { params }).toPromise();

    const overall = (overallResult as any[])[0] || {};

    // By agent
    const byAgentResult = await this.client.query(`
      SELECT
        agent_id,
        sum(event_count) as count,
        sum(total_tokens) as tokens,
        sum(total_cost_usd) as cost_usd,
        sum(total_latency_ms) / sum(event_count) as avg_latency_ms,
        sum(error_count) as error_count,
        avg(p50_latency_ms) as p50_latency_ms,
        avg(p95_latency_ms) as p95_latency_ms,
        avg(p99_latency_ms) as p99_latency_ms
      FROM ${this.config.database}.agent_stats_hourly
      WHERE ${conditions.join(' AND ')}
      GROUP BY agent_id
      ORDER BY count DESC
    `, { params }).toPromise();

    const byAgent: Record<string, any> = {};
    for (const row of byAgentResult as any[]) {
      byAgent[row.agent_id] = {
        count: row.count,
        tokens: row.tokens || 0,
        cost_usd: row.cost_usd || 0,
        avg_latency_ms: Math.round(row.avg_latency_ms || 0),
        error_count: row.error_count || 0,
        p50_latency_ms: Math.round(row.p50_latency_ms || 0),
        p95_latency_ms: Math.round(row.p95_latency_ms || 0),
        p99_latency_ms: Math.round(row.p99_latency_ms || 0),
      };
    }

    // Time series data
    let byTime: Array<{ timestamp: string; count: number; tokens: number; cost_usd: number }> | undefined;
    
    if (query.group_by === 'hour' || query.group_by === 'day') {
      const groupFn = query.group_by === 'hour' ? 'toStartOfHour' : 'toStartOfDay';
      const timeResult = await this.client.query(`
        SELECT
          ${groupFn}(hour) as timestamp,
          sum(event_count) as count,
          sum(total_tokens) as tokens,
          sum(total_cost_usd) as cost_usd
        FROM ${this.config.database}.agent_stats_hourly
        WHERE ${conditions.join(' AND ')}
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `, { params }).toPromise();

      byTime = (timeResult as any[]).map(row => ({
        timestamp: row.timestamp,
        count: row.count,
        tokens: row.tokens || 0,
        cost_usd: row.cost_usd || 0,
      }));
    }

    return {
      total_traces: overall.total_traces || 0,
      total_events: overall.total_events || 0,
      total_tokens: overall.total_tokens || 0,
      total_cost_usd: overall.total_cost_usd || 0,
      avg_latency_ms: Math.round(overall.avg_latency_ms || 0),
      error_rate: overall.error_rate || 0,
      by_agent: byAgent,
      by_time: byTime,
    };
  }

  subscribe(callback: (event: AgentEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async close(): Promise<void> {
    this.subscribers.clear();
  }

  private buildTrace(traceId: string, events: AgentEvent[]): Trace {
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const startEvent = sortedEvents[0];
    const endEvent = sortedEvents[sortedEvents.length - 1];
    const rootSpan = events.find(e => !e.parent_span_id) || events[0];

    let totalTokens = 0;
    let totalCost = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    const agents = new Set<string>();
    let finalStatus: 'success' | 'error' | 'timeout' | 'cancelled' = 'success';

    for (const event of events) {
      agents.add(event.agent.id);
      if (event.output?.total_tokens) totalTokens += event.output.total_tokens;
      if (event.metrics.cost_usd) totalCost += event.metrics.cost_usd;
      if (event.event_type === 'tool_call') toolCallCount++;
      if (event.event_type === 'error' || event.output?.status === 'error') {
        errorCount++;
        finalStatus = 'error';
      }
    }

    return {
      id: traceId,
      start_time: startEvent.timestamp,
      end_time: endEvent.timestamp,
      root_span_id: rootSpan.span_id,
      events: sortedEvents,
      summary: {
        total_duration_ms: new Date(endEvent.timestamp).getTime() - new Date(startEvent.timestamp).getTime(),
        total_tokens: totalTokens,
        total_cost_usd: Math.round(totalCost * 1000000) / 1000000,
        agent_count: agents.size,
        tool_call_count: toolCallCount,
        error_count: errorCount,
        status: finalStatus,
        agents: [...agents],
      },
    };
  }
}
