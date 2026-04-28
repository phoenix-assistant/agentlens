/**
 * Response parser — extracts token usage from various AI provider response formats
 */

export interface ParsedResponse {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export function parseAIResponse(provider: string, body: string, statusCode: number): ParsedResponse {
  if (statusCode >= 400) {
    return { inputTokens: 0, outputTokens: 0, status: 'error', errorMessage: `HTTP ${statusCode}` };
  }

  try {
    const data = JSON.parse(body);
    switch (provider) {
      case 'openai':
      case 'groq':
      case 'together':
      case 'fireworks':
      case 'deepseek':
      case 'perplexity':
      case 'mistral':
        return parseOpenAIFormat(data);
      case 'anthropic':
        return parseAnthropicFormat(data);
      case 'google':
        return parseGoogleFormat(data);
      case 'cohere':
        return parseCohereFormat(data);
      default:
        return parseOpenAIFormat(data); // fallback
    }
  } catch {
    return { inputTokens: 0, outputTokens: 0, status: 'success' };
  }
}

function parseOpenAIFormat(data: any): ParsedResponse {
  return {
    model: data.model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    status: 'success',
  };
}

function parseAnthropicFormat(data: any): ParsedResponse {
  return {
    model: data.model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    status: 'success',
  };
}

function parseGoogleFormat(data: any): ParsedResponse {
  const meta = data.usageMetadata;
  return {
    model: data.modelVersion,
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    status: 'success',
  };
}

function parseCohereFormat(data: any): ParsedResponse {
  const billed = data.meta?.billed_units;
  return {
    model: data.model,
    inputTokens: billed?.input_tokens ?? 0,
    outputTokens: billed?.output_tokens ?? 0,
    status: 'success',
  };
}

/**
 * Parse streaming SSE response — concatenates data lines and parses the final one with usage
 */
export function parseStreamingResponse(provider: string, body: string, statusCode: number): ParsedResponse {
  if (statusCode >= 400) {
    return { inputTokens: 0, outputTokens: 0, status: 'error', errorMessage: `HTTP ${statusCode}` };
  }

  // For SSE, look for the last data line that contains usage info
  const lines = body.split('\n').filter(l => l.startsWith('data: '));
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i].slice(6).trim();
    if (raw === '[DONE]') continue;
    try {
      const data = JSON.parse(raw);
      if (data.usage) {
        return parseAIResponse(provider, JSON.stringify(data), 200);
      }
    } catch { /* skip */ }
  }
  return { inputTokens: 0, outputTokens: 0, status: 'success' };
}
