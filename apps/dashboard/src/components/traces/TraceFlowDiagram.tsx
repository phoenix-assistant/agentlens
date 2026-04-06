import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Trace, AgentEvent } from '@agentlens/sdk';
import { getProviderColor, formatDuration, formatTokens } from '@/lib/utils';

interface TraceFlowDiagramProps {
  trace: Trace;
  onNodeClick?: (event: AgentEvent) => void;
}

function AgentNode({ data }: { data: any }) {
  const statusColors = {
    success: 'border-green-500 bg-green-500/10',
    error: 'border-red-500 bg-red-500/10',
    running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  };

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[160px] ${
        statusColors[data.status as keyof typeof statusColors] || 'border-gray-500 bg-gray-500/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: data.providerColor }}
        />
        <span className="font-semibold text-sm">{data.label}</span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>Latency:</span>
          <span>{formatDuration(data.latencyMs)}</span>
        </div>
        {data.tokens > 0 && (
          <div className="flex justify-between">
            <span>Tokens:</span>
            <span>{formatTokens(data.tokens)}</span>
          </div>
        )}
        {data.cost > 0 && (
          <div className="flex justify-between">
            <span>Cost:</span>
            <span>${data.cost.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
};

export function TraceFlowDiagram({ trace, onNodeClick }: TraceFlowDiagramProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const spanPositions: Record<string, { x: number; y: number }> = {};

    // Group events by span
    const spanMap: Record<string, AgentEvent[]> = {};
    for (const event of trace.events) {
      if (!spanMap[event.span_id]) {
        spanMap[event.span_id] = [];
      }
      spanMap[event.span_id].push(event);
    }

    // Build nodes from spans
    let yOffset = 0;
    const xByLevel: Record<number, number> = {};

    const getLevel = (spanId: string, visited = new Set<string>()): number => {
      if (visited.has(spanId)) return 0;
      visited.add(spanId);
      
      const events = spanMap[spanId];
      if (!events?.length) return 0;
      
      const parentSpanId = events[0].parent_span_id;
      if (!parentSpanId) return 0;
      
      return getLevel(parentSpanId, visited) + 1;
    };

    for (const [spanId, events] of Object.entries(spanMap)) {
      const startEvent = events.find((e) => e.event_type === 'agent_start') || events[0];
      const endEvent = events.find((e) => e.event_type === 'agent_end');
      
      const level = getLevel(spanId);
      xByLevel[level] = (xByLevel[level] || 0) + 1;

      const x = level * 250;
      const y = (xByLevel[level] - 1) * 150;
      spanPositions[spanId] = { x, y };

      const status = endEvent?.output?.status || 'running';
      const latencyMs = endEvent?.metrics?.latency_ms || 0;
      const tokens = endEvent?.output?.total_tokens || 0;
      const cost = endEvent?.metrics?.cost_usd || 0;

      nodes.push({
        id: spanId,
        type: 'agent',
        position: { x, y },
        data: {
          label: startEvent.agent.name || startEvent.agent.id,
          provider: startEvent.agent.provider,
          providerColor: getProviderColor(startEvent.agent.provider),
          status,
          latencyMs,
          tokens,
          cost,
          events,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Create edge from parent
      if (startEvent.parent_span_id) {
        edges.push({
          id: `${startEvent.parent_span_id}-${spanId}`,
          source: startEvent.parent_span_id,
          target: spanId,
          animated: status === 'running',
          style: { stroke: status === 'error' ? '#ef4444' : '#6b7280' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: status === 'error' ? '#ef4444' : '#6b7280',
          },
        });
      }
    }

    return { nodes, edges };
  }, [trace]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick && node.data.events?.[0]) {
        onNodeClick(node.data.events[0]);
      }
    },
    [onNodeClick]
  );

  return (
    <div className="h-[500px] rounded-lg border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => node.data.providerColor}
          maskColor="rgb(0, 0, 0, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
