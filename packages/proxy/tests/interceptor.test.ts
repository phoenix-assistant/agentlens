import { describe, it, expect } from 'vitest';
import { shouldIntercept, buildTraceEvent } from '../src/interceptor';
import { isAIHost, detectProvider, detectAgentFromUserAgent } from '../src/hosts';
import { DEFAULT_CONFIG } from '../src/config';

describe('isAIHost', () => {
  it('matches known AI hosts', () => {
    expect(isAIHost('api.openai.com')).toBe(true);
    expect(isAIHost('api.anthropic.com')).toBe(true);
    expect(isAIHost('generativelanguage.googleapis.com')).toBe(true);
    expect(isAIHost('api.groq.com')).toBe(true);
  });

  it('rejects non-AI hosts', () => {
    expect(isAIHost('google.com')).toBe(false);
    expect(isAIHost('github.com')).toBe(false);
    expect(isAIHost('example.com')).toBe(false);
  });

  it('supports custom host list', () => {
    expect(isAIHost('my-custom-ai.com', ['my-custom-ai.com'])).toBe(true);
    expect(isAIHost('api.openai.com', ['my-custom-ai.com'])).toBe(false);
  });
});

describe('detectProvider', () => {
  it('maps hosts to providers', () => {
    expect(detectProvider('api.openai.com')).toBe('openai');
    expect(detectProvider('api.anthropic.com')).toBe('anthropic');
    expect(detectProvider('generativelanguage.googleapis.com')).toBe('google');
    expect(detectProvider('api.cohere.ai')).toBe('cohere');
    expect(detectProvider('api.groq.com')).toBe('groq');
  });

  it('returns unknown for unmapped hosts', () => {
    expect(detectProvider('random.com')).toBe('unknown');
  });
});

describe('detectAgentFromUserAgent', () => {
  it('detects copilot', () => {
    expect(detectAgentFromUserAgent('GithubCopilot/1.0')).toBe('github-copilot');
  });
  it('detects cursor', () => {
    expect(detectAgentFromUserAgent('Cursor/0.40')).toBe('cursor');
  });
  it('detects claude', () => {
    expect(detectAgentFromUserAgent('claude-code/1.0')).toBe('claude-code');
  });
  it('returns unknown for unrecognized', () => {
    expect(detectAgentFromUserAgent('Mozilla/5.0')).toBe('unknown');
    expect(detectAgentFromUserAgent(undefined)).toBe('unknown');
  });
});

describe('shouldIntercept', () => {
  it('intercepts AI hosts', () => {
    expect(shouldIntercept('api.openai.com', DEFAULT_CONFIG)).toBe(true);
  });
  it('does not intercept non-AI hosts', () => {
    expect(shouldIntercept('google.com', DEFAULT_CONFIG)).toBe(false);
  });
});

describe('buildTraceEvent', () => {
  it('builds a complete trace event from OpenAI response', () => {
    const event = buildTraceEvent({
      traceId: 'test-123',
      hostname: 'api.openai.com',
      userAgent: 'Cursor/0.40',
      responseBody: JSON.stringify({
        model: 'gpt-4o',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      statusCode: 200,
      latencyMs: 1500,
      isStreaming: false,
    });

    expect(event.event_type).toBe('llm_call');
    expect(event.trace_id).toBe('test-123');
    expect(event.provider).toBe('openai');
    expect(event.agent_name).toBe('cursor');
    expect(event.model_version).toBe('gpt-4o');
    expect(event.input_tokens).toBe(100);
    expect(event.output_tokens).toBe(50);
    expect(event.total_tokens).toBe(150);
    expect(event.latency_ms).toBe(1500);
    expect(event.cost_usd).toBeGreaterThan(0);
    expect(event.status).toBe('success');
    expect(event.metadata.source).toBe('proxy');
  });

  it('handles error responses', () => {
    const event = buildTraceEvent({
      traceId: 'err-1',
      hostname: 'api.anthropic.com',
      responseBody: '{}',
      statusCode: 429,
      latencyMs: 200,
      isStreaming: false,
    });
    expect(event.status).toBe('error');
    expect(event.provider).toBe('anthropic');
  });
});
