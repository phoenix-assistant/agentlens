import { isAIHost, detectProvider, detectAgentFromUserAgent } from './hosts';
import { parseAIResponse, parseStreamingResponse, ParsedResponse } from './parser';
import { proxyCostCalc } from './cost';
import { emitTraceEvent, TraceEvent } from './emitter';
import { ProxyConfig } from './config';

/**
 * Determine if a request should be intercepted (MITM'd)
 */
export function shouldIntercept(hostname: string, config: ProxyConfig): boolean {
  return isAIHost(hostname, config.interceptHosts);
}

/**
 * Build a trace event from intercepted request/response data
 */
export function buildTraceEvent(params: {
  traceId: string;
  hostname: string;
  userAgent?: string;
  responseBody: string;
  statusCode: number;
  latencyMs: number;
  isStreaming: boolean;
}): TraceEvent {
  const { traceId, hostname, userAgent, responseBody, statusCode, latencyMs, isStreaming } = params;
  const provider = detectProvider(hostname);

  let parsed: ParsedResponse;
  if (isStreaming) {
    parsed = parseStreamingResponse(provider, responseBody, statusCode);
  } else {
    parsed = parseAIResponse(provider, responseBody, statusCode);
  }

  const totalTokens = parsed.inputTokens + parsed.outputTokens;

  return {
    event_type: 'llm_call',
    trace_id: traceId,
    agent_id: 'proxy-intercepted',
    agent_name: detectAgentFromUserAgent(userAgent),
    provider,
    model_version: parsed.model,
    input_tokens: parsed.inputTokens,
    output_tokens: parsed.outputTokens,
    total_tokens: totalTokens,
    latency_ms: latencyMs,
    cost_usd: proxyCostCalc(parsed.model, parsed.inputTokens, parsed.outputTokens),
    status: parsed.status,
    metadata: {
      source: 'proxy',
      target_host: hostname,
      user_agent: userAgent,
    },
  };
}

/**
 * Process an intercepted request/response and emit trace event
 */
export function processInterceptedCall(
  config: ProxyConfig,
  params: Parameters<typeof buildTraceEvent>[0]
): TraceEvent {
  const event = buildTraceEvent(params);
  emitTraceEvent(config.collectorUrl, event);
  return event;
}
