/**
 * Vercel AI SDK Integration for AgentLens
 * Middleware for automatic instrumentation of AI SDK calls
 */

import { AgentLensClient, Trace, SpanRecorder } from '@agentlens/sdk';
import { IntegrationOptions, calculateCost } from './types';

export interface VercelAIIntegrationOptions extends IntegrationOptions {
  client: AgentLensClient;
}

interface StreamContext {
  trace: Trace;
  span: SpanRecorder;
  startTime: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Creates middleware for Vercel AI SDK
 * Use with experimental_wrapLanguageModel or as callbacks
 */
export function createAgentLensMiddleware(options: VercelAIIntegrationOptions) {
  const { client, agentId, agentName, capturePrompts = false, captureCompletions = false, metadata = {} } = options;

  const activeStreams = new Map<string, StreamContext>();

  return {
    /**
     * Wrap a model provider for automatic instrumentation
     */
    wrapModel: <T extends { doGenerate: Function; doStream?: Function }>(
      model: T,
      modelId: string
    ): T => {
      const originalDoGenerate = model.doGenerate.bind(model);
      const originalDoStream = model.doStream?.bind(model);

      const wrappedDoGenerate = async function (params: any): Promise<any> {
        const trace = client.startTrace({
          session_id: metadata.sessionId as string,
          user_id: metadata.userId as string,
          metadata: { ...metadata, vercelAI: true },
        });

        const span = trace.startSpan({
          agentId: agentId || `vercel-ai-${modelId}`,
          agentName: agentName || `Vercel AI (${modelId})`,
          provider: getProviderFromModel(modelId),
          modelVersion: modelId,
        });

        const startTime = Date.now();

        try {
          span.recordInput({
            prompt_tokens: 0,
            ...(capturePrompts && { 
              prompt: params.prompt,
              messages: params.messages,
            }),
          });

          const result = await originalDoGenerate(params);

          const latencyMs = Date.now() - startTime;
          const inputTokens = result.usage?.promptTokens || 0;
          const outputTokens = result.usage?.completionTokens || 0;
          const costUsd = calculateCost(modelId, inputTokens, outputTokens);

          span.recordOutput({
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            status: 'success',
            stop_reason: result.finishReason,
            ...(captureCompletions && { text: result.text }),
          });

          span.end('success', latencyMs, costUsd);
          trace.end('success');

          return result;
        } catch (error) {
          const latencyMs = Date.now() - startTime;

          span.recordError({
            code: (error as any).code || 'generation_error',
            message: (error as Error).message,
            stack: (error as Error).stack,
          });

          span.end('error', latencyMs);
          trace.end('error');

          throw error;
        }
      };

      const wrappedDoStream = originalDoStream
        ? async function (params: any): Promise<any> {
            const trace = client.startTrace({
              session_id: metadata.sessionId as string,
              user_id: metadata.userId as string,
              metadata: { ...metadata, vercelAI: true, streaming: true },
            });

            const span = trace.startSpan({
              agentId: agentId || `vercel-ai-${modelId}`,
              agentName: agentName || `Vercel AI (${modelId})`,
              provider: getProviderFromModel(modelId),
              modelVersion: modelId,
            });

            const startTime = Date.now();
            let inputTokens = 0;
            let outputTokens = 0;

            try {
              span.recordInput({
                prompt_tokens: 0,
                ...(capturePrompts && {
                  prompt: params.prompt,
                  messages: params.messages,
                }),
              });

              const result = await originalDoStream(params);

              // Wrap the stream to capture metrics
              const originalStream = result.stream;
              const transformedStream = new TransformStream({
                transform(chunk, controller) {
                  // Track token usage from chunks if available
                  if (chunk.type === 'text-delta') {
                    outputTokens += estimateTokens(chunk.textDelta);
                  }
                  controller.enqueue(chunk);
                },
                flush() {
                  const latencyMs = Date.now() - startTime;
                  const costUsd = calculateCost(modelId, inputTokens, outputTokens);

                  span.recordOutput({
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                    status: 'success',
                  });

                  span.end('success', latencyMs, costUsd);
                  trace.end('success');
                },
              });

              return {
                ...result,
                stream: originalStream.pipeThrough(transformedStream),
              };
            } catch (error) {
              const latencyMs = Date.now() - startTime;

              span.recordError({
                code: (error as any).code || 'stream_error',
                message: (error as Error).message,
                stack: (error as Error).stack,
              });

              span.end('error', latencyMs);
              trace.end('error');

              throw error;
            }
          }
        : undefined;

      return {
        ...model,
        doGenerate: wrappedDoGenerate,
        ...(wrappedDoStream && { doStream: wrappedDoStream }),
      } as T;
    },

    /**
     * Callback hooks for use with AI SDK hooks
     */
    callbacks: {
      onStart: (params: { model: string; prompt?: string; messages?: any[] }) => {
        const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const trace = client.startTrace({
          session_id: metadata.sessionId as string,
          user_id: metadata.userId as string,
          metadata: { ...metadata, vercelAI: true, streamId },
        });

        const span = trace.startSpan({
          agentId: agentId || `vercel-ai-${params.model}`,
          agentName: agentName || `Vercel AI (${params.model})`,
          provider: getProviderFromModel(params.model),
          modelVersion: params.model,
        });

        span.recordInput({
          prompt_tokens: 0,
          ...(capturePrompts && {
            prompt: params.prompt,
            messages: params.messages,
          }),
        });

        activeStreams.set(streamId, {
          trace,
          span,
          startTime: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          model: params.model,
        });

        return streamId;
      },

      onToken: (streamId: string, token: string) => {
        const context = activeStreams.get(streamId);
        if (!context) return;

        context.outputTokens += estimateTokens(token);
      },

      onFinish: (
        streamId: string,
        result: {
          text?: string;
          usage?: { promptTokens: number; completionTokens: number };
          finishReason?: string;
        }
      ) => {
        const context = activeStreams.get(streamId);
        if (!context) return;

        const latencyMs = Date.now() - context.startTime;
        const inputTokens = result.usage?.promptTokens || context.inputTokens;
        const outputTokens = result.usage?.completionTokens || context.outputTokens;
        const costUsd = calculateCost(context.model, inputTokens, outputTokens);

        context.span.recordOutput({
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          status: 'success',
          stop_reason: result.finishReason,
          ...(captureCompletions && { text: result.text }),
        });

        context.span.end('success', latencyMs, costUsd);
        context.trace.end('success');

        activeStreams.delete(streamId);
      },

      onError: (streamId: string, error: Error) => {
        const context = activeStreams.get(streamId);
        if (!context) return;

        const latencyMs = Date.now() - context.startTime;

        context.span.recordError({
          code: (error as any).code || 'stream_error',
          message: error.message,
          stack: error.stack,
        });

        context.span.end('error', latencyMs);
        context.trace.end('error');

        activeStreams.delete(streamId);
      },
    },
  };
}

function getProviderFromModel(modelId: string): string {
  if (modelId.includes('gpt') || modelId.includes('o1')) return 'openai';
  if (modelId.includes('claude')) return 'anthropic';
  if (modelId.includes('gemini')) return 'google';
  if (modelId.includes('llama') || modelId.includes('mistral')) return 'groq';
  if (modelId.includes('command')) return 'cohere';
  return 'unknown';
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}
