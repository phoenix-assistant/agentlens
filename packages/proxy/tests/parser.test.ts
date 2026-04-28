import { describe, it, expect } from 'vitest';
import { parseAIResponse, parseStreamingResponse } from '../src/parser';

describe('parseAIResponse', () => {
  it('parses OpenAI format', () => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const result = parseAIResponse('openai', body, 200);
    expect(result.model).toBe('gpt-4o');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.status).toBe('success');
  });

  it('parses Anthropic format', () => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 200, output_tokens: 80 },
    });
    const result = parseAIResponse('anthropic', body, 200);
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(80);
  });

  it('parses Google Gemini format', () => {
    const body = JSON.stringify({
      modelVersion: 'gemini-1.5-pro',
      candidates: [{}],
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 60 },
    });
    const result = parseAIResponse('google', body, 200);
    expect(result.model).toBe('gemini-1.5-pro');
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(60);
  });

  it('parses Cohere format', () => {
    const body = JSON.stringify({
      model: 'command-r-plus',
      meta: { billed_units: { input_tokens: 300, output_tokens: 120 } },
    });
    const result = parseAIResponse('cohere', body, 200);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(120);
  });

  it('handles error status codes', () => {
    const result = parseAIResponse('openai', '{}', 429);
    expect(result.status).toBe('error');
    expect(result.inputTokens).toBe(0);
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseAIResponse('openai', 'not json', 200);
    expect(result.status).toBe('success');
    expect(result.inputTokens).toBe(0);
  });

  it('handles missing usage fields', () => {
    const result = parseAIResponse('openai', JSON.stringify({ model: 'gpt-4o' }), 200);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('falls back to OpenAI format for unknown providers', () => {
    const body = JSON.stringify({
      model: 'some-model',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const result = parseAIResponse('unknown-provider', body, 200);
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });
});

describe('parseStreamingResponse', () => {
  it('extracts usage from SSE stream with final usage chunk', () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: {"model":"gpt-4o","usage":{"prompt_tokens":50,"completion_tokens":20}}',
      'data: [DONE]',
    ].join('\n');
    const result = parseStreamingResponse('openai', body, 200);
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(20);
  });

  it('handles stream with no usage data', () => {
    const body = 'data: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n';
    const result = parseStreamingResponse('openai', body, 200);
    expect(result.inputTokens).toBe(0);
    expect(result.status).toBe('success');
  });

  it('handles error status in streaming', () => {
    const result = parseStreamingResponse('openai', '', 500);
    expect(result.status).toBe('error');
  });
});
