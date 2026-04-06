/**
 * AgentLens Collector Server
 * High-performance event collection and real-time streaming
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { EventStore, EventStoreConfig } from './stores/types';
import { InMemoryStore } from './stores/memory';
import { ClickHouseStore } from './stores/clickhouse';
import { logger } from './logger';

export interface CollectorConfig {
  port: number;
  host: string;
  store: EventStoreConfig;
  cors?: {
    origin: string | string[] | boolean;
  };
  auth?: {
    apiKeys: string[];
  };
  rateLimit?: {
    max: number;
    timeWindow: string;
  };
}

export class CollectorServer {
  private app: FastifyInstance;
  private store: EventStore;
  private config: CollectorConfig;
  private subscribers: Map<string, Set<(event: any) => void>> = new Map();

  constructor(config: CollectorConfig) {
    this.config = config;
    this.app = Fastify({ logger: logger });

    // Initialize store
    if (config.store.type === 'clickhouse') {
      this.store = new ClickHouseStore(config.store.clickhouse!);
    } else {
      this.store = new InMemoryStore(config.store.memory);
    }
  }

  async initialize(): Promise<void> {
    // Register plugins
    await this.app.register(cors, {
      origin: this.config.cors?.origin ?? true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await this.app.register(websocket);

    // Auth hook
    if (this.config.auth?.apiKeys?.length) {
      this.app.addHook('preHandler', async (request, reply) => {
        // Skip auth for health check
        if (request.url === '/health') return;

        const apiKey = request.headers['x-api-key'] || request.headers.authorization?.replace('Bearer ', '');
        if (!apiKey || !this.config.auth!.apiKeys.includes(apiKey as string)) {
          reply.code(401).send({ error: 'Unauthorized' });
        }
      });
    }

    // Initialize store
    await this.store.initialize();

    // Register routes
    this.registerRoutes();

    logger.info('Collector server initialized');
  }

  private registerRoutes(): void {
    // Health check
    this.app.get('/health', async () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      store: this.config.store.type,
    }));

    // ============ Events API ============

    // Ingest single event
    this.app.post('/v1/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const event = request.body as any;

      if (!event.id || !event.trace_id || !event.event_type) {
        return reply.code(400).send({ error: 'Missing required fields: id, trace_id, event_type' });
      }

      await this.store.insertEvent(event);
      this.notifySubscribers(event.trace_id, event);

      return { success: true, event_id: event.id };
    });

    // Ingest batch of events
    this.app.post('/v1/events/batch', async (request: FastifyRequest, reply: FastifyReply) => {
      const { events } = request.body as { events: any[] };

      if (!Array.isArray(events) || events.length === 0) {
        return reply.code(400).send({ error: 'Events array required' });
      }

      if (events.length > 1000) {
        return reply.code(400).send({ error: 'Maximum 1000 events per batch' });
      }

      await this.store.insertEvents(events);

      // Notify subscribers
      for (const event of events) {
        this.notifySubscribers(event.trace_id, event);
      }

      return { success: true, count: events.length };
    });

    // Query events
    this.app.get('/v1/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const events = await this.store.getEvents({
        traceId: query.trace_id,
        agentId: query.agent_id,
        eventTypes: query.event_type ? [query.event_type] : undefined,
        startTime: query.start_time,
        endTime: query.end_time,
        limit: parseInt(query.limit) || 100,
        offset: parseInt(query.offset) || 0,
      });

      return { events, count: events.length };
    });

    // ============ Traces API ============

    // Get single trace
    this.app.get('/v1/traces/:traceId', async (request: FastifyRequest, reply: FastifyReply) => {
      const { traceId } = request.params as { traceId: string };
      const trace = await this.store.getTrace(traceId);

      if (!trace) {
        return reply.code(404).send({ error: 'Trace not found' });
      }

      return trace;
    });

    // List traces
    this.app.get('/v1/traces', async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const traces = await this.store.listTraces({
        sessionId: query.session_id,
        userId: query.user_id,
        agentId: query.agent_id,
        status: query.status,
        startTime: query.start_time,
        endTime: query.end_time,
        limit: parseInt(query.limit) || 50,
        offset: parseInt(query.offset) || 0,
      });

      return { traces, count: traces.length };
    });

    // ============ Stats API ============

    // Get aggregated stats
    this.app.get('/v1/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const stats = await this.store.getStats({
        agentId: query.agent_id,
        startTime: query.start_time,
        endTime: query.end_time,
        granularity: query.granularity || 'hour',
      });

      return { stats };
    });

    // Get dashboard summary
    this.app.get('/v1/stats/summary', async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const startTime = query.start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endTime = query.end_time || new Date().toISOString();

      const [traces, stats] = await Promise.all([
        this.store.listTraces({ startTime, endTime, limit: 1000 }),
        this.store.getStats({ startTime, endTime, granularity: 'hour' }),
      ]);

      const summary = {
        totalTraces: traces.length,
        totalTokens: traces.reduce((sum, t) => sum + (t.total_tokens || 0), 0),
        totalCost: traces.reduce((sum, t) => sum + (t.total_cost || 0), 0),
        avgLatency: traces.length > 0
          ? traces.reduce((sum, t) => sum + (t.latency_ms || 0), 0) / traces.length
          : 0,
        errorRate: traces.length > 0
          ? traces.filter((t) => t.status === 'error').length / traces.length
          : 0,
        activeAgents: new Set(traces.map((t) => t.agent_id)).size,
        timeSeriesStats: stats,
      };

      return summary;
    });

    // ============ Agents API ============

    // List agents with stats
    this.app.get('/v1/agents', async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const startTime = query.start_time || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endTime = query.end_time || new Date().toISOString();

      const traces = await this.store.listTraces({ startTime, endTime, limit: 10000 });

      // Aggregate by agent
      const agentMap = new Map<string, any>();
      for (const trace of traces) {
        if (!trace.agent_id) continue;

        const existing = agentMap.get(trace.agent_id) || {
          id: trace.agent_id,
          name: trace.agent_name || trace.agent_id,
          provider: trace.provider,
          model: trace.model,
          totalTraces: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatency: 0,
          errorCount: 0,
          lastActive: trace.timestamp,
        };

        existing.totalTraces++;
        existing.totalTokens += trace.total_tokens || 0;
        existing.totalCost += trace.total_cost || 0;
        existing.avgLatency = (existing.avgLatency * (existing.totalTraces - 1) + (trace.latency_ms || 0)) / existing.totalTraces;
        if (trace.status === 'error') existing.errorCount++;
        if (trace.timestamp > existing.lastActive) existing.lastActive = trace.timestamp;

        agentMap.set(trace.agent_id, existing);
      }

      const agents = Array.from(agentMap.values()).sort((a, b) => b.totalTraces - a.totalTraces);

      return { agents, count: agents.length };
    });

    // Get single agent stats
    this.app.get('/v1/agents/:agentId', async (request: FastifyRequest, reply: FastifyReply) => {
      const { agentId } = request.params as { agentId: string };
      const query = request.query as any;
      const startTime = query.start_time || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endTime = query.end_time || new Date().toISOString();

      const [traces, stats] = await Promise.all([
        this.store.listTraces({ agentId, startTime, endTime, limit: 1000 }),
        this.store.getStats({ agentId, startTime, endTime, granularity: 'hour' }),
      ]);

      if (traces.length === 0) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const agent = {
        id: agentId,
        name: traces[0].agent_name || agentId,
        provider: traces[0].provider,
        model: traces[0].model,
        totalTraces: traces.length,
        totalTokens: traces.reduce((sum, t) => sum + (t.total_tokens || 0), 0),
        totalCost: traces.reduce((sum, t) => sum + (t.total_cost || 0), 0),
        avgLatency: traces.reduce((sum, t) => sum + (t.latency_ms || 0), 0) / traces.length,
        errorCount: traces.filter((t) => t.status === 'error').length,
        firstSeen: traces[traces.length - 1].timestamp,
        lastActive: traces[0].timestamp,
        stats,
        recentTraces: traces.slice(0, 10),
      };

      return agent;
    });

    // ============ Alerts API ============

    // List alerts
    this.app.get('/v1/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
      // Alerts would be stored in a separate collection/table
      // For now return a placeholder
      return { alerts: [], count: 0 };
    });

    // Create alert rule
    this.app.post('/v1/alerts/rules', async (request: FastifyRequest, reply: FastifyReply) => {
      const rule = request.body as any;
      // Store alert rule
      return { success: true, rule_id: `rule-${Date.now()}` };
    });

    // ============ WebSocket for Real-time ============

    this.app.get('/v1/ws', { websocket: true }, (socket, request) => {
      const subscriptions = new Set<string>();

      socket.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.type === 'subscribe' && data.trace_id) {
            subscriptions.add(data.trace_id);
            this.addSubscriber(data.trace_id, (event) => {
              socket.send(JSON.stringify({ type: 'event', data: event }));
            });
            socket.send(JSON.stringify({ type: 'subscribed', trace_id: data.trace_id }));
          }

          if (data.type === 'unsubscribe' && data.trace_id) {
            subscriptions.delete(data.trace_id);
            socket.send(JSON.stringify({ type: 'unsubscribed', trace_id: data.trace_id }));
          }

          if (data.type === 'subscribe_all') {
            this.addSubscriber('*', (event) => {
              socket.send(JSON.stringify({ type: 'event', data: event }));
            });
            socket.send(JSON.stringify({ type: 'subscribed', trace_id: '*' }));
          }
        } catch (err) {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });

      socket.on('close', () => {
        for (const traceId of subscriptions) {
          this.removeSubscribers(traceId);
        }
      });
    });
  }

  private addSubscriber(traceId: string, callback: (event: any) => void): void {
    if (!this.subscribers.has(traceId)) {
      this.subscribers.set(traceId, new Set());
    }
    this.subscribers.get(traceId)!.add(callback);
  }

  private removeSubscribers(traceId: string): void {
    this.subscribers.delete(traceId);
  }

  private notifySubscribers(traceId: string, event: any): void {
    // Notify trace-specific subscribers
    const traceSubscribers = this.subscribers.get(traceId);
    if (traceSubscribers) {
      for (const callback of traceSubscribers) {
        callback(event);
      }
    }

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      for (const callback of wildcardSubscribers) {
        callback(event);
      }
    }
  }

  async start(): Promise<void> {
    await this.app.listen({ port: this.config.port, host: this.config.host });
    logger.info(`Collector server listening on ${this.config.host}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    await this.app.close();
    await this.store.close();
    logger.info('Collector server stopped');
  }

  getApp(): FastifyInstance {
    return this.app;
  }
}

// CLI entry point
if (require.main === module) {
  const config: CollectorConfig = {
    port: parseInt(process.env.PORT || '3100'),
    host: process.env.HOST || '0.0.0.0',
    store: {
      type: (process.env.STORE_TYPE as 'memory' | 'clickhouse') || 'memory',
      clickhouse: process.env.CLICKHOUSE_URL
        ? {
            url: process.env.CLICKHOUSE_URL,
            database: process.env.CLICKHOUSE_DATABASE || 'agentlens',
            username: process.env.CLICKHOUSE_USERNAME,
            password: process.env.CLICKHOUSE_PASSWORD,
          }
        : undefined,
    },
    auth: process.env.API_KEYS
      ? { apiKeys: process.env.API_KEYS.split(',') }
      : undefined,
  };

  const server = new CollectorServer(config);
  server.initialize().then(() => server.start());

  process.on('SIGTERM', () => {
    server.stop().then(() => process.exit(0));
  });
}
