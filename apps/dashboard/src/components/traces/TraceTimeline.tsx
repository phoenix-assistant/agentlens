import { useMemo } from 'react';
import { Trace, AgentEvent } from '@agentlens/sdk';
import { cn, formatDuration, getProviderColor } from '@/lib/utils';

interface TraceTimelineProps {
  trace: Trace;
  onEventClick?: (event: AgentEvent) => void;
  selectedEventId?: string;
}

export function TraceTimeline({
  trace,
  onEventClick,
  selectedEventId,
}: TraceTimelineProps) {
  const timelineData = useMemo(() => {
    if (!trace.events.length) return [];

    const startTime = new Date(trace.start_time).getTime();
    const endTime = new Date(trace.end_time!).getTime();
    const totalDuration = endTime - startTime;

    // Group events by span
    const spanMap: Record<string, {
      startEvent: AgentEvent;
      endEvent?: AgentEvent;
      startTime: number;
      endTime?: number;
    }> = {};

    for (const event of trace.events) {
      if (!spanMap[event.span_id]) {
        spanMap[event.span_id] = {
          startEvent: event,
          startTime: new Date(event.timestamp).getTime(),
        };
      }
      
      if (event.event_type === 'agent_end') {
        spanMap[event.span_id].endEvent = event;
        spanMap[event.span_id].endTime = new Date(event.timestamp).getTime();
      }
    }

    return Object.entries(spanMap)
      .map(([spanId, data]) => {
        const spanStart = data.startTime - startTime;
        const spanEnd = (data.endTime || endTime) - startTime;
        const duration = spanEnd - spanStart;

        return {
          spanId,
          agent: data.startEvent.agent,
          startPercent: (spanStart / totalDuration) * 100,
          widthPercent: (duration / totalDuration) * 100,
          duration,
          status: data.endEvent?.output?.status || 'running',
          tokens: data.endEvent?.output?.total_tokens,
          cost: data.endEvent?.metrics?.cost_usd,
        };
      })
      .sort((a, b) => a.startPercent - b.startPercent);
  }, [trace]);

  const totalDuration = trace.summary?.total_duration_ms || 0;

  return (
    <div className="space-y-2">
      {/* Time axis */}
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>0ms</span>
        <span>{formatDuration(totalDuration / 4)}</span>
        <span>{formatDuration(totalDuration / 2)}</span>
        <span>{formatDuration((totalDuration * 3) / 4)}</span>
        <span>{formatDuration(totalDuration)}</span>
      </div>

      {/* Timeline bars */}
      <div className="space-y-1">
        {timelineData.map((item) => (
          <div
            key={item.spanId}
            className="relative h-8 bg-secondary/30 rounded cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => onEventClick?.({} as AgentEvent)}
          >
            <div
              className={cn(
                'absolute h-full rounded flex items-center px-2 text-xs font-medium text-white overflow-hidden',
                item.status === 'success' && 'bg-green-500/80',
                item.status === 'error' && 'bg-red-500/80',
                item.status === 'running' && 'bg-blue-500/80 animate-pulse',
                !['success', 'error', 'running'].includes(item.status) && 'bg-gray-500/80'
              )}
              style={{
                left: `${item.startPercent}%`,
                width: `${Math.max(item.widthPercent, 2)}%`,
                backgroundColor:
                  item.status === 'running'
                    ? undefined
                    : getProviderColor(item.agent.provider),
              }}
            >
              <span className="truncate">
                {item.agent.name || item.agent.id}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-4 text-xs">
        {timelineData.map((item) => (
          <div key={item.spanId} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: getProviderColor(item.agent.provider) }}
            />
            <span className="text-muted-foreground">
              {item.agent.name || item.agent.id}: {formatDuration(item.duration)}
              {item.tokens && ` • ${item.tokens} tokens`}
              {item.cost && ` • $${item.cost.toFixed(4)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
