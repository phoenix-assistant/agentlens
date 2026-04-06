/**
 * Anthropic Integration for AgentLens
 * Wraps Anthropic client to automatically instrument API calls
 */

import type Anthropic from '@anthropic-ai/sdk';
import { AgentLens } from '@agentlens/sdk';
import { IntegrationOptions, WrappedClient, calculateCost } from './types';

type AnthropicClient = InstanceType<typeof Anthropic>;

export interface AnthropicIntegrationOptions extends IntegrationOptions {
  client: AgentLens;
}

export function wrapAnthropic(
  anthropic: AnthropicClient,
  options: AnthropicIntegrationOptions
): WrappedClient<AnthropicClient> {
  const { client, agentId, agentName, capturePrompts = false, captureCompletions = false, metadata = {} } = options;

  // Store original method
  const originalCreate = anthropic.messages.create.bind(anthropic.messages);

  // Wrap messages.create
  const wrappedCreate = async function (
    this: typeof anthropic.messages,
    body: Parameters<typeof originalCreate>[0],
    requestOptions?: Parameters<typeof originalCreate>[1]
  ): Promise<ReturnType<typeof originalCreate> extends Promise<infer R> ? R : never> {
    const trace = client.startTrace({
      session_id: metadata.sessionId as string,
      user_id: metadata.userId as string,
      metadata: { ...metadata, anthropic: true },
    });

    const span = trace.startSpan({
      agentId: agentId || 'anthropic-messages',
      agentName: agentName || 'Anthropic Messages',
      provider: 'anthropic',
      modelVersion: body.model,
    });

    const startTime = Date.now();

    try {
      span.recordInput({
        prompt_tokens: 0,
        ...(capturePrompts && { messages: body.messages, system: body.system }),
      });

      const response = await originalCreate(body, requestOptions);

      const latencyMs = Date.now() - startTime;
      const usage = (response as any).usage;
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;
      const costUsd = calculateCost(body.model, inputTokens, outputTokens);

      span.recordOutput({
        completion_tokens: outputTokens,
        total_tokens: totalTokens,
        status: 'success',
        stop_reason: (response as any).stop_reason,
        ...(captureCompletions && {
          completion: (response as any).content?.[0]?.text,
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

  // Apply wrapping
  (anthropic.messages as any).create = wrappedCreate;

  return {
    original: anthropic,
    client: anthropic,
    unwrap: () => {
      (anthropic.messages as any).create = originalCreate;
      return anthropic;
    },
  };
}
