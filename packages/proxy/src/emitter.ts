import * as http from 'http';

export interface TraceEvent {
  event_type: 'llm_call';
  trace_id: string;
  agent_id: string;
  agent_name: string;
  provider: string;
  model_version?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
  status: 'success' | 'error';
  metadata: Record<string, any>;
}

/**
 * Emit a trace event to the AgentLens collector
 */
export function emitTraceEvent(collectorUrl: string, event: TraceEvent): void {
  try {
    const url = new URL(collectorUrl);
    const payload = JSON.stringify(event);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });

    req.on('error', () => { /* silent — don't break proxy if collector is down */ });
    req.write(payload);
    req.end();
  } catch {
    // silent
  }
}
