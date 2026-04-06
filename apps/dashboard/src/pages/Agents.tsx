import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Users, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge, ProviderBadge } from '@/components/ui/Badge';
import { api, Agent } from '@/lib/api';
import { useStore } from '@/store';
import { formatNumber, formatCurrency, formatDuration, formatRelativeTime, getErrorRate, cn } from '@/lib/utils';

export function Agents() {
  const navigate = useNavigate();
  const { getTimeRange, autoRefreshInterval } = useStore();
  const { startTime, endTime } = getTimeRange();
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agents', startTime, endTime],
    queryFn: () => api.agents.list({ start_time: startTime, end_time: endTime }),
    refetchInterval: autoRefreshInterval,
  });

  const filteredAgents = data?.agents?.filter((agent) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return agent.id.toLowerCase().includes(searchLower) || agent.name.toLowerCase().includes(searchLower);
  });

  // Chart data
  const chartData = filteredAgents?.slice(0, 10).map((agent) => ({
    name: agent.name.length > 15 ? agent.name.slice(0, 15) + '...' : agent.name,
    traces: agent.totalTraces,
    errors: agent.errorCount,
  }));

  return (
    <div className="flex flex-col">
      <Header title="Agents" onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="flex-1 p-6">
        {/* Summary Cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900/30">
                  <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{data?.count || 0}</p>
                  <p className="text-sm text-gray-500">Total Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                  <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatNumber(data?.agents?.reduce((sum, a) => sum + a.totalTraces, 0) || 0)}</p>
                  <p className="text-sm text-gray-500">Total Traces</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                  <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(data?.agents?.reduce((sum, a) => sum + a.totalCost, 0) || 0)}</p>
                  <p className="text-sm text-gray-500">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                  <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{(getErrorRate(data?.agents?.reduce((sum, a) => sum + a.errorCount, 0) || 0, data?.agents?.reduce((sum, a) => sum + a.totalTraces, 0) || 1)).toFixed(1)}%</p>
                  <p className="text-sm text-gray-500">Error Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {chartData && chartData.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Agent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
                  <Tooltip />
                  <Bar dataKey="traces" fill="#8B5CF6" name="Traces" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" fill="#EF4444" name="Errors" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        {/* Agents Grid */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAgents?.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onClick={() => navigate(`/agents/${agent.id}`)} />
            ))}
            {(!filteredAgents || filteredAgents.length === 0) && (
              <div className="col-span-full py-12 text-center text-gray-500">No agents found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const errorRate = getErrorRate(agent.errorCount, agent.totalTraces);

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{agent.name}</h3>
            <p className="text-sm text-gray-500">{agent.id}</p>
          </div>
          {agent.provider && <ProviderBadge provider={agent.provider} />}
        </div>

        {agent.model && <p className="mt-2 text-sm text-gray-500">Model: {agent.model}</p>}

        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{formatNumber(agent.totalTraces)}</p>
            <p className="text-xs text-gray-500">Traces</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(agent.totalCost)}</p>
            <p className="text-xs text-gray-500">Cost</p>
          </div>
          <div>
            <p className={cn('text-lg font-bold', errorRate > 5 ? 'text-red-600' : 'text-gray-900 dark:text-white')}>{errorRate.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Errors</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Avg: {formatDuration(agent.avgLatency)}</span>
          <span>{formatRelativeTime(agent.lastActive)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
