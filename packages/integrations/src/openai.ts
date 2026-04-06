/**
 * OpenAI Integration for AgentLens
 * Wraps OpenAI client to automatically instrument API calls
 */

import type OpenAI from 'openai';
import { AgentLensClient } from '@agentlens/sdk';
import { IntegrationOptions, WrappedClient, calculateCost } from './types';

type OpenAIClient = InstanceType<typeof OpenAI>;

export interface OpenAIIntegrationOptions extends IntegrationOptions {
  client: AgentLensClient;
}

export function wrapOpenAI(
  openai: OpenAIClient,
  options: OpenAIIntegrationOptions
): WrappedClient<OpenAIClient> {
  const { client, agentId, agentName, capturePrompts = false, captureCompletions = false, metadata = {} } = options;

  // Store original methods
  const originalChatCreate = openai.chat.completions.create.bind(openai.chat.completions);
  const originalEmbeddingsCreate = openai.embeddings.create.bind(openai.embeddings);

  // Wrap chat completions
  const wrappedChatCreate = async function (
    this: typeof openai.chat.completions,
    body: Parameters<typeof originalChatCreate>[0],
    requestOptions?: Parameters<typeof originalChatCreate>[1]
  ): Promise<ReturnType<typeof originalChatCreate> extends Promise<infer R> ? R : never> {
    const trace = client.startTrace({
      session_id: metadata.sessionId as string,
      user_id: metadata.userId as string,
      metadata: { ...metadata, openai: true },
    });

    const span = trace.startSpan({
      agentId: agentId || 'openai-chat',
      agentName: agentName || 'OpenAI Chat',
      provider: 'openai',
      modelVersion: body.model,
    });

    const startTime = Date.now();

    try {
      span.recordInput({
        prompt_tokens: 0, // Will be updated from response
        ...(capturePrompts && { messages: body.messages }),
      });

      const response = await originalChatCreate(body, requestOptions);

      const latencyMs = Date.now() - startTime;
      const usage = (response as any).usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;
      const costUsd = calculateCost(body.model, inputTokens, outputTokens);

      span.recordOutput({
        completion_tokens: outputTokens,
        total_tokens: totalTokens,
        status: 'success',
        stop_reason: (response as any).choices?.[0]?.finish_reason,
        ...(captureCompletions && { 
          completion: (response as any).choices?.[0]?.message?.content 
        }),
      });

      span.end('success', latencyMs, costUsd);
      trace.end('success');

      return response as any;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      span.recordError({
        code: (error as any).status || 'unknown',
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      
      span.end('error', latencyMs);
      trace.end('error');
      
      throw error;
    }
  };

  // Wrap embeddings
  const wrappedEmbeddingsCreate = async function (
    this: typeof openai.embeddings,
    body: Parameters<typeof originalEmbeddingsCreate>[0],
    requestOptions?: Parameters<typeof originalEmbeddingsCreate>[1]
  ): Promise<ReturnType<typeof originalEmbeddingsCreate> extends Promise<infer R> ? R : never> {
    const trace = client.startTrace({
      session_id: metadata.sessionId as string,
      metadata: { ...metadata, openai: true, type: 'embedding' },
    });

    const span = trace.startSpan({
      agentId: agentId || 'openai-embeddings',
      agentName: agentName || 'OpenAI Embeddings',
      provider: 'openai',
      modelVersion: body.model,
    });

    const startTime = Date.now();

    try {
      span.recordInput({
        prompt_tokens: 0,
        ...(capturePrompts && { input: body.input }),
      });

      const response = await originalEmbeddingsCreate(body, requestOptions);

      const latencyMs = Date.now() - startTime;
      const usage = (response as any).usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const costUsd = (inputTokens / 1000) * 0.0001; // text-embedding-3-small pricing

      span.recordOutput({
        completion_tokens: 0,
        total_tokens: inputTokens,
        status: 'success',
      });

      span.end('success', latencyMs, costUsd);
      trace.end('success');

      return response as any;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      span.recordError({
        code: (error as any).status || 'unknown',
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      
      span.end('error', latencyMs);
      trace.end('error');
      
      throw error;
    }
  };

  // Apply wrapping
  (openai.chat.completions as any).create = wrappedChatCreate;
  (openai.embeddings as any).create = wrappedEmbeddingsCreate;

  return {
    original: openai,
    client: openai,
    unwrap: () => {
      (openai.chat.completions as any).create = originalChatCreate;
      (openai.embeddings as any).create = originalEmbeddingsCreate;
      return openai;
    },
  };
}
