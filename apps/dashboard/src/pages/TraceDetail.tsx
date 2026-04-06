import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Zap, DollarSign, Copy, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Play, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge, ProviderBadge } from '@/components/ui/Badge';
import { api, AgentEvent } from '@/lib/api';
import { formatNumber, formatCurrency, formatDuration, formatDateTime, copyToClipboard, cn } from '@/lib/utils';

export function TraceDetail() {
  const { traceId } = useParams<{ traceId: string }>();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => api.traces.get(traceId!),
    enabled: !!traceId,
  });

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-500">Trace not found</p>
        <Link to="/traces"><Button variant="outline">← Back to Traces</Button></Link>
      </div>
    );
  }

  const { trace, events } = data;

  return (
    <div className="flex flex-col">
      <Header title="Trace Details" onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="flex-1 p-6">
        <Link to="/traces" className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={16} /> Back to Traces
        </Link>

        {/* Trace Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={trace.status} />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{trace.agent_name || 'Unknown Agent'}</h2>
                  {trace.provider && <ProviderBadge provider={trace.provider} />}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800">{trace.trace_id}</code>
                  <button onClick={() => copyToClipboard(trace.trace_id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                    <Copy size={14} />
                  </button>
                </div>
                {trace.model && <p className="mt-2 text-sm text-gray-500">Model: {trace.model}</p>}
                <p className="mt-1 text-sm text-gray-500">Started: {formatDateTime(trace.timestamp)}</p>
              </div>

              {/* Stats */}
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400"><Clock size={14} /><span className="text-xs">Latency</span></div>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{formatDuration(trace.latency_ms || 0)}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400"><Zap size={14} /><span className="text-xs">Tokens</span></div>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{formatNumber(trace.total_tokens || 0)}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-gray-400"><DollarSign size={14} /><span className="text-xs">Cost</span></div>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(trace.total_cost || 0)}</p>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {trace.error_message && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-400">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{trace.error_message}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Events Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Events Timeline ({events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.map((event, index) => (
                <EventCard key={event.id} event={event} expanded={expandedEvents.has(event.id)} onToggle={() => toggleEvent(event.id)} isLast={index === events.length - 1} />
              ))}
              {events.length === 0 && <p className="py-8 text-center text-gray-500">No events recorded</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EventCard({ event, expanded, onToggle, isLast }: { event: AgentEvent; expanded: boolean; onToggle: () => void; isLast: boolean }) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'agent_start': return <Play size={14} className="text-blue-500" />;
      case 'agent_end': return event.error ? <AlertCircle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />;
      case 'tool_call': return <Wrench size={14} className="text-orange-500" />;
      default: return <div className="h-3.5 w-3.5 rounded-full bg-gray-300" />;
    }
  };

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && <div className="absolute left-[17px] top-10 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />}

      <div className={cn('flex gap-4 rounded-lg border p-4 transition-colors', expanded ? 'border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-900/20' : 'border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50')}>
        {/* Icon */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
          {getEventIcon(event.event_type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <button onClick={onToggle} className="flex items-center gap-2 text-left">
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="font-medium text-gray-900 dark:text-white">{event.event_type.replace(/_/g, ' ')}</span>
              {event.agent?.name && <Badge>{event.agent.name}</Badge>}
            </button>
            <span className="text-xs text-gray-500">{formatDateTime(event.timestamp)}</span>
          </div>

          {/* Metrics preview */}
          {event.metrics && (
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              {event.metrics.latency_ms && <span>{formatDuration(event.metrics.latency_ms)}</span>}
              {event.metrics.cost_usd && <span>{formatCurrency(event.metrics.cost_usd)}</span>}
            </div>
          )}

          {/* Expanded content */}
          {expanded && (
            <div className="mt-4 space-y-3">
              {event.input && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Input</p>
                  <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">{JSON.stringify(event.input, null, 2)}</pre>
                </div>
              )}
              {event.output && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Output</p>
                  <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">{JSON.stringify(event.output, null, 2)}</pre>
                </div>
              )}
              {event.error && (
                <div>
                  <p className="mb-1 text-xs font-medium text-red-500">Error</p>
                  <pre className="overflow-x-auto rounded bg-red-50 p-3 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-300">{JSON.stringify(event.error, null, 2)}</pre>
                </div>
              )}
              {event.tool && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Tool: {event.tool.name}</p>
                  <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800">{JSON.stringify(event.tool, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
