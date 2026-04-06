/**
 * LangChain Integration for AgentLens
 * Callback handler for automatic instrumentation
 */

import type {
  BaseCallbackHandler,
  CallbackHandlerMethods,
} from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChainValues } from '@langchain/core/utils/types';
import type { AgentAction, AgentFinish } from '@langchain/core/agents';
import { AgentLensClient, Trace, SpanRecorder } from '@agentlens/sdk';
import { IntegrationOptions, calculateCost } from './types';

export interface LangChainIntegrationOptions extends IntegrationOptions {
  client: AgentLensClient;
}

interface RunInfo {
  trace: Trace;
  span: SpanRecorder;
  startTime: number;
  parentRunId?: string;
}

export class AgentLensCallback implements Partial<CallbackHandlerMethods> {
  name = 'AgentLensCallback';
  private client: AgentLensClient;
  private runs: Map<string, RunInfo> = new Map();
  private options: LangChainIntegrationOptions;

  constructor(options: LangChainIntegrationOptions) {
    this.client = options.client;
    this.options = options;
  }

  // LLM Callbacks
  handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): void {
    const parentRun = parentRunId ? this.runs.get(parentRunId) : undefined;
    
    const trace = parentRun?.trace || this.client.startTrace({
      session_id: this.options.metadata?.sessionId as string,
      user_id: this.options.metadata?.userId as string,
      metadata: { 
        ...this.options.metadata, 
        langchain: true,
        tags,
      },
    });

    const modelName = (llm.kwargs as any)?.model_name || 
                      (llm.kwargs as any)?.model || 
                      llm.id?.[llm.id.length - 1] || 
                      'unknown';

    const span = trace.startSpan({
      agentId: this.options.agentId || `langchain-llm-${runId.slice(0, 8)}`,
      agentName: this.options.agentName || `LangChain LLM`,
      provider: this.getProvider(llm),
      modelVersion: modelName,
      parentSpanId: parentRun?.span.spanId,
    });

    span.recordInput({
      prompt_tokens: 0,
      ...(this.options.capturePrompts && { prompts }),
    });

    this.runs.set(runId, {
      trace,
      span,
      startTime: Date.now(),
      parentRunId,
    });
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;
    const usage = output.llmOutput?.tokenUsage || output.llmOutput?.usage;
    const inputTokens = usage?.promptTokens || usage?.prompt_tokens || 0;
    const outputTokens = usage?.completionTokens || usage?.completion_tokens || 0;
    const model = output.llmOutput?.modelName || 'unknown';
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    run.span.recordOutput({
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      status: 'success',
      ...(this.options.captureCompletions && {
        generations: output.generations,
      }),
    });

    run.span.end('success', latencyMs, costUsd);

    // End trace if no parent
    if (!run.parentRunId) {
      run.trace.end('success');
    }

    this.runs.delete(runId);
  }

  handleLLMError(err: Error, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;

    run.span.recordError({
      code: (err as any).status || 'llm_error',
      message: err.message,
      stack: err.stack,
    });

    run.span.end('error', latencyMs);

    if (!run.parentRunId) {
      run.trace.end('error');
    }

    this.runs.delete(runId);
  }

  // Chain Callbacks
  handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): void {
    const parentRun = parentRunId ? this.runs.get(parentRunId) : undefined;
    
    const trace = parentRun?.trace || this.client.startTrace({
      session_id: this.options.metadata?.sessionId as string,
      user_id: this.options.metadata?.userId as string,
      metadata: { 
        ...this.options.metadata, 
        langchain: true,
        chainType: chain.id?.[chain.id.length - 1],
        tags,
      },
    });

    const span = trace.startSpan({
      agentId: this.options.agentId || `langchain-chain-${runId.slice(0, 8)}`,
      agentName: this.options.agentName || chain.id?.[chain.id.length - 1] || 'LangChain Chain',
      provider: 'langchain',
      agentType: 'orchestrator',
      parentSpanId: parentRun?.span.spanId,
    });

    span.recordInput({
      prompt_tokens: 0,
      ...(this.options.capturePrompts && { inputs }),
    });

    this.runs.set(runId, {
      trace,
      span,
      startTime: Date.now(),
      parentRunId,
    });
  }

  handleChainEnd(outputs: ChainValues, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;

    run.span.recordOutput({
      completion_tokens: 0,
      total_tokens: 0,
      status: 'success',
      ...(this.options.captureCompletions && { outputs }),
    });

    run.span.end('success', latencyMs);

    if (!run.parentRunId) {
      run.trace.end('success');
    }

    this.runs.delete(runId);
  }

  handleChainError(err: Error, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;

    run.span.recordError({
      code: (err as any).status || 'chain_error',
      message: err.message,
      stack: err.stack,
    });

    run.span.end('error', latencyMs);

    if (!run.parentRunId) {
      run.trace.end('error');
    }

    this.runs.delete(runId);
  }

  // Tool Callbacks
  handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): void {
    const parentRun = parentRunId ? this.runs.get(parentRunId) : undefined;
    
    const trace = parentRun?.trace || this.client.startTrace({
      session_id: this.options.metadata?.sessionId as string,
      metadata: { ...this.options.metadata, langchain: true, tags },
    });

    const toolName = tool.id?.[tool.id.length - 1] || 'unknown-tool';

    const span = trace.startSpan({
      agentId: this.options.agentId || `langchain-tool-${runId.slice(0, 8)}`,
      agentName: toolName,
      provider: 'langchain',
      agentType: 'tool',
      parentSpanId: parentRun?.span.spanId,
    });

    span.recordTool({
      name: toolName,
      input: this.options.capturePrompts ? input : undefined,
    });

    this.runs.set(runId, {
      trace,
      span,
      startTime: Date.now(),
      parentRunId,
    });
  }

  handleToolEnd(output: string, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;

    run.span.recordOutput({
      completion_tokens: 0,
      total_tokens: 0,
      status: 'success',
      ...(this.options.captureCompletions && { toolOutput: output }),
    });

    run.span.end('success', latencyMs);

    if (!run.parentRunId) {
      run.trace.end('success');
    }

    this.runs.delete(runId);
  }

  handleToolError(err: Error, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const latencyMs = Date.now() - run.startTime;

    run.span.recordError({
      code: 'tool_error',
      message: err.message,
      stack: err.stack,
    });

    run.span.end('error', latencyMs);

    if (!run.parentRunId) {
      run.trace.end('error');
    }

    this.runs.delete(runId);
  }

  // Agent Callbacks
  handleAgentAction(action: AgentAction, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    // Record the agent action as metadata
    this.client.record({
      ...run.span['createEvent']('agent_action'),
      metadata: {
        tool: action.tool,
        toolInput: this.options.capturePrompts ? action.toolInput : '[redacted]',
        log: action.log,
      },
    } as any);
  }

  handleAgentEnd(action: AgentFinish, runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;

    // Agent finish is handled by chain end
  }

  private getProvider(llm: Serialized): string {
    const id = llm.id || [];
    if (id.some((s) => s.toLowerCase().includes('openai'))) return 'openai';
    if (id.some((s) => s.toLowerCase().includes('anthropic'))) return 'anthropic';
    if (id.some((s) => s.toLowerCase().includes('google'))) return 'google';
    if (id.some((s) => s.toLowerCase().includes('bedrock'))) return 'aws-bedrock';
    if (id.some((s) => s.toLowerCase().includes('ollama'))) return 'ollama';
    return 'langchain';
  }
}
