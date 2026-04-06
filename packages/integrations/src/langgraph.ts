/**
 * LangGraph Integration for AgentLens
 * Wrapper for LangGraph state machines with automatic instrumentation
 */

import { AgentLensClient, Trace, SpanRecorder } from '@agentlens/sdk';
import { IntegrationOptions, calculateCost } from './types';

export interface LangGraphIntegrationOptions extends IntegrationOptions {
  client: AgentLensClient;
  graphName?: string;
}

interface NodeExecution {
  span: SpanRecorder;
  startTime: number;
}

interface GraphExecution {
  trace: Trace;
  rootSpan: SpanRecorder;
  nodeExecutions: Map<string, NodeExecution>;
  edgeHistory: Array<{ from: string; to: string; timestamp: number }>;
  startTime: number;
}

/**
 * Creates instrumentation callbacks for LangGraph
 */
export function createLangGraphCallbacks(options: LangGraphIntegrationOptions) {
  const { client, graphName = 'LangGraph', agentId, agentName, metadata = {} } = options;
  let currentExecution: GraphExecution | null = null;

  return {
    onGraphStart: (input: unknown) => {
      const trace = client.startTrace({
        session_id: metadata.sessionId as string,
        user_id: metadata.userId as string,
        metadata: { ...metadata, langgraph: true, graphName },
      });

      const rootSpan = trace.startSpan({
        agentId: agentId || `langgraph-${graphName}`,
        agentName: agentName || graphName,
        provider: 'langgraph',
        agentType: 'orchestrator',
      });

      rootSpan.recordInput({
        prompt_tokens: 0,
        ...(options.capturePrompts && { input }),
      });

      currentExecution = {
        trace,
        rootSpan,
        nodeExecutions: new Map(),
        edgeHistory: [],
        startTime: Date.now(),
      };

      return currentExecution;
    },

    onNodeStart: (nodeName: string, nodeInput: unknown) => {
      if (!currentExecution) return;

      const span = currentExecution.trace.startSpan({
        agentId: `${agentId || graphName}-node-${nodeName}`,
        agentName: nodeName,
        provider: 'langgraph',
        agentType: 'worker',
        parentSpanId: currentExecution.rootSpan.spanId,
      });

      span.recordInput({
        prompt_tokens: 0,
        ...(options.capturePrompts && { input: nodeInput }),
      });

      currentExecution.nodeExecutions.set(nodeName, {
        span,
        startTime: Date.now(),
      });
    },

    onNodeEnd: (nodeName: string, nodeOutput: unknown, error?: Error) => {
      if (!currentExecution) return;

      const nodeExec = currentExecution.nodeExecutions.get(nodeName);
      if (!nodeExec) return;

      const latencyMs = Date.now() - nodeExec.startTime;

      if (error) {
        nodeExec.span.recordError({
          code: 'node_error',
          message: error.message,
          stack: error.stack,
        });
        nodeExec.span.end('error', latencyMs);
      } else {
        nodeExec.span.recordOutput({
          completion_tokens: 0,
          total_tokens: 0,
          status: 'success',
          ...(options.captureCompletions && { output: nodeOutput }),
        });
        nodeExec.span.end('success', latencyMs);
      }

      currentExecution.nodeExecutions.delete(nodeName);
    },

    onEdge: (fromNode: string, toNode: string, condition?: string) => {
      if (!currentExecution) return;

      currentExecution.edgeHistory.push({
        from: fromNode,
        to: toNode,
        timestamp: Date.now(),
      });

      // Record edge transition as a custom event
      client.record({
        id: `edge-${Date.now()}`,
        trace_id: currentExecution.trace.traceId,
        span_id: currentExecution.rootSpan.spanId,
        timestamp: new Date().toISOString(),
        event_type: 'custom',
        agent: {
          id: `${agentId || graphName}-router`,
          name: 'Edge Router',
          type: 'router',
          provider: 'langgraph',
        },
        metadata: {
          edgeType: 'transition',
          fromNode,
          toNode,
          condition,
        },
      });
    },

    onGraphEnd: (output: unknown, error?: Error) => {
      if (!currentExecution) return;

      const latencyMs = Date.now() - currentExecution.startTime;

      // End any remaining node executions
      for (const [nodeName, nodeExec] of currentExecution.nodeExecutions) {
        nodeExec.span.end('cancelled', Date.now() - nodeExec.startTime);
      }

      if (error) {
        currentExecution.rootSpan.recordError({
          code: 'graph_error',
          message: error.message,
          stack: error.stack,
        });
        currentExecution.rootSpan.end('error', latencyMs);
        currentExecution.trace.end('error');
      } else {
        currentExecution.rootSpan.recordOutput({
          completion_tokens: 0,
          total_tokens: 0,
          status: 'success',
          edgeCount: currentExecution.edgeHistory.length,
          ...(options.captureCompletions && { output }),
        });
        currentExecution.rootSpan.end('success', latencyMs);
        currentExecution.trace.end('success');
      }

      const result = currentExecution;
      currentExecution = null;
      return result;
    },

    getCurrentExecution: () => currentExecution,
  };
}

/**
 * Wraps a LangGraph graph instance with automatic instrumentation
 */
export function wrapLangGraph<T extends { invoke: Function; stream?: Function }>(
  graph: T,
  options: LangGraphIntegrationOptions
): T & { unwrap: () => T } {
  const callbacks = createLangGraphCallbacks(options);
  const originalInvoke = graph.invoke.bind(graph);
  const originalStream = graph.stream?.bind(graph);

  const wrappedInvoke = async function (input: any, config?: any): Promise<any> {
    callbacks.onGraphStart(input);

    try {
      // Inject our callbacks into the config
      const instrumentedConfig = {
        ...config,
        callbacks: [
          ...(config?.callbacks || []),
          {
            handleLLMStart: () => {},
            handleLLMEnd: () => {},
            handleChainStart: (chain: any, inputs: any, runId: string) => {
              const nodeName = chain?.id?.[chain.id.length - 1] || runId.slice(0, 8);
              callbacks.onNodeStart(nodeName, inputs);
            },
            handleChainEnd: (outputs: any, runId: string) => {
              // Node name tracking would need to be maintained
            },
            handleChainError: (error: Error, runId: string) => {
              // Handle error
            },
          },
        ],
      };

      const result = await originalInvoke(input, instrumentedConfig);
      callbacks.onGraphEnd(result);
      return result;
    } catch (error) {
      callbacks.onGraphEnd(undefined, error as Error);
      throw error;
    }
  };

  const wrappedStream = originalStream
    ? async function* (input: any, config?: any): AsyncGenerator<any> {
        callbacks.onGraphStart(input);
        let lastOutput: any;

        try {
          const stream = originalStream(input, config);
          for await (const chunk of stream) {
            lastOutput = chunk;
            yield chunk;
          }
          callbacks.onGraphEnd(lastOutput);
        } catch (error) {
          callbacks.onGraphEnd(undefined, error as Error);
          throw error;
        }
      }
    : undefined;

  return {
    ...graph,
    invoke: wrappedInvoke,
    ...(wrappedStream && { stream: wrappedStream }),
    unwrap: () => graph,
  } as T & { unwrap: () => T };
}
