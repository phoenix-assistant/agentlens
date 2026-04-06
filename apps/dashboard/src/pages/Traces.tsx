import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronRight, Clock, Zap, DollarSign } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, ProviderBadge } from '@/components/ui/Badge';
import { api, TraceSummary } from '@/lib/api';
import { useStore } from '@/store';
import { formatNumber, formatCurrency, formatDuration, formatRelativeTime, cn } from '@/lib/utils';

export function Traces() {
  const navigate = useNavigate();
  const { getTimeRange, autoRefreshInterval, selectedAgentId, selectedStatus } = useStore();
  const { startTime, endTime } = getTimeRange();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(selectedStatus);
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['traces', startTime, endTime, statusFilter, selectedAgentId, page],
    queryFn: () =>
      api.traces.list({
        start_time: startTime,
        end_time: endTime,
        status: statusFilter || undefined,
        agent_id: selectedAgentId || undefined,
        limit,
        offset: page * limit,
      }),
    refetchInterval: autoRefreshInterval,
  });

  const filteredTraces = data?.traces?.filter((trace) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      trace.trace_id.toLowerCase().includes(searchLower) ||
      trace.agent_name?.toLowerCase().includes(searchLower) ||
      trace.agent_id?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex flex-col">
      <Header title="Traces" onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="flex-1 p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by trace ID, agent name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>

          {/* Status Filter */}
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-700">
            {['all', 'success', 'error', 'running'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status === 'all' ? null : status)}
                className={cn(
                  'px-3 py-2 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg',
                  (status === 'all' && !statusFilter) || status === statusFilter
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                )}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Traces Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                        Trace ID
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                        Agent
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-end gap-1">
                          <Clock size={14} />
                          Latency
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-end gap-1">
                          <Zap size={14} />
                          Tokens
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign size={14} />
                          Cost
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                        Time
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTraces?.map((trace) => (
                      <tr
                        key={trace.trace_id}
                        onClick={() => navigate(`/traces/${trace.trace_id}`)}
                        className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-3">
                          <StatusBadge status={trace.status} />
                        </td>
                        <td className="px-4 py-3">
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800">
                            {trace.trace_id.slice(0, 12)}...
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {trace.agent_name || 'Unknown'}
                            </p>
                            {trace.model && (
                              <p className="text-xs text-gray-500">{trace.model}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {trace.provider && <ProviderBadge provider={trace.provider} />}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {formatDuration(trace.latency_ms || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {formatNumber(trace.total_tokens || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {formatCurrency(trace.total_cost || 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500">
                          {formatRelativeTime(trace.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </td>
                      </tr>
                    ))}
                    {(!filteredTraces || filteredTraces.length === 0) && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-gray-500">
                          No traces found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.count >= limit && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {page * limit + 1} - {Math.min((page + 1) * limit, data.count)} of {data.count}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= data.count}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
