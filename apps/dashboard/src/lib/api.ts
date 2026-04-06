/**
 * AgentLens Dashboard API Client
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3100';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_URL}${endpoint}`;
  
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============ Types ============

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
  input?: Record<string, any>;
  output?: Record<string, any>;
  metrics?: Record<string, any>;
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  tool?: {
    name?: string;
    input?: any;
    output?: any;
  };
  metadata?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  totalTraces: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  errorCount: number;
  lastActive: string;
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

export interface DashboardSummary {
  totalTraces: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  errorRate: number;
  activeAgents: number;
  timeSeriesStats: AgentStats[];
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  channels: string[];
  created_at: string;
}

export interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  triggered_at: string;
  resolved_at?: string;
  metadata?: Record<string, any>;
}

// ============ API Functions ============

export const api = {
  // Health
  health: () => fetchAPI<{ status: string; timestamp: string }>('/health'),

  // Traces
  traces: {
    list: (params?: {
      session_id?: string;
      user_id?: string;
      agent_id?: string;
      status?: string;
      start_time?: string;
      end_time?: string;
      limit?: number;
      offset?: number;
    }) => fetchAPI<{ traces: TraceSummary[]; count: number }>('/v1/traces', { params }),

    get: (traceId: string) =>
      fetchAPI<{ trace: TraceSummary; events: AgentEvent[] }>(`/v1/traces/${traceId}`),
  },

  // Events
  events: {
    list: (params?: {
      trace_id?: string;
      agent_id?: string;
      event_type?: string;
      start_time?: string;
      end_time?: string;
      limit?: number;
      offset?: number;
    }) => fetchAPI<{ events: AgentEvent[]; count: number }>('/v1/events', { params }),

    ingest: (event: AgentEvent) =>
      fetchAPI<{ success: boolean; event_id: string }>('/v1/events', {
        method: 'POST',
        body: JSON.stringify(event),
      }),

    ingestBatch: (events: AgentEvent[]) =>
      fetchAPI<{ success: boolean; count: number }>('/v1/events/batch', {
        method: 'POST',
        body: JSON.stringify({ events }),
      }),
  },

  // Agents
  agents: {
    list: (params?: {
      start_time?: string;
      end_time?: string;
    }) => fetchAPI<{ agents: Agent[]; count: number }>('/v1/agents', { params }),

    get: (agentId: string, params?: {
      start_time?: string;
      end_time?: string;
    }) => fetchAPI<Agent & { stats: AgentStats[]; recentTraces: TraceSummary[] }>(
      `/v1/agents/${agentId}`,
      { params }
    ),
  },

  // Stats
  stats: {
    get: (params?: {
      agent_id?: string;
      start_time?: string;
      end_time?: string;
      granularity?: 'minute' | 'hour' | 'day';
    }) => fetchAPI<{ stats: AgentStats[] }>('/v1/stats', { params }),

    summary: (params?: {
      start_time?: string;
      end_time?: string;
    }) => fetchAPI<DashboardSummary>('/v1/stats/summary', { params }),
  },

  // Alerts
  alerts: {
    listRules: () => fetchAPI<{ rules: AlertRule[] }>('/v1/alerts/rules'),
    
    createRule: (rule: Omit<AlertRule, 'id' | 'created_at'>) =>
      fetchAPI<{ success: boolean; rule_id: string }>('/v1/alerts/rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      }),

    listEvents: (params?: {
      rule_id?: string;
      severity?: string;
      start_time?: string;
      end_time?: string;
      limit?: number;
    }) => fetchAPI<{ alerts: AlertEvent[] }>('/v1/alerts', { params }),
  },
};

// ============ WebSocket ============

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Set<(event: AgentEvent) => void>> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = API_URL.replace(/^http/, 'ws') + '/v1/ws';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'event') {
            this.notifyListeners(data.data);
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };
    });
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  subscribe(traceId: string, callback: (event: AgentEvent) => void): () => void {
    if (!this.listeners.has(traceId)) {
      this.listeners.set(traceId, new Set());
      this.ws?.send(JSON.stringify({ type: 'subscribe', trace_id: traceId }));
    }
    this.listeners.get(traceId)!.add(callback);

    return () => {
      this.listeners.get(traceId)?.delete(callback);
      if (this.listeners.get(traceId)?.size === 0) {
        this.listeners.delete(traceId);
        this.ws?.send(JSON.stringify({ type: 'unsubscribe', trace_id: traceId }));
      }
    };
  }

  subscribeAll(callback: (event: AgentEvent) => void): () => void {
    if (!this.listeners.has('*')) {
      this.listeners.set('*', new Set());
      this.ws?.send(JSON.stringify({ type: 'subscribe_all' }));
    }
    this.listeners.get('*')!.add(callback);

    return () => {
      this.listeners.get('*')?.delete(callback);
    };
  }

  private notifyListeners(event: AgentEvent): void {
    // Notify trace-specific listeners
    this.listeners.get(event.trace_id)?.forEach((cb) => cb(event));
    // Notify wildcard listeners
    this.listeners.get('*')?.forEach((cb) => cb(event));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }
}

export const realtimeClient = new RealtimeClient();
