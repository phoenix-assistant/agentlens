import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { formatNumber, formatCurrency, formatDuration, chartColors, getProviderColor } from '@/lib/utils';

export function Analytics() {
  const { getTimeRange, autoRefreshInterval } = useStore();
  const { startTime, endTime } = getTimeRange();

  const { data: summary, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['analytics-summary', startTime, endTime],
    queryFn: () => api.stats.summary({ start_time: startTime, end_time: endTime }),
    refetchInterval: autoRefreshInterval,
  });

  const { data: agents } = useQuery({
    queryKey: ['analytics-agents', startTime, endTime],
    queryFn: () => api.agents.list({ start_time: startTime, end_time: endTime }),
    refetchInterval: autoRefreshInterval,
  });

  // Time series data
  const timeSeriesData = summary?.timeSeriesStats?.map((stat) => ({
    time: new Date(stat.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    traces: stat.trace_count,
    tokens: stat.total_tokens,
    cost: stat.total_cost,
    latency: stat.avg_latency_ms,
    errors: stat.error_count,
  })) || [];

  // Provider breakdown
  const providerData = agents?.agents?.reduce((acc: any[], agent) => {
    const existing = acc.find((p) => p.name === agent.provider);
    if (existing) {
      existing.traces += agent.totalTraces;
      existing.cost += agent.totalCost;
      existing.tokens += agent.totalTokens || 0;
    } else {
      acc.push({
        name: agent.provider || 'unknown',
        traces: agent.totalTraces,
        cost: agent.totalCost,
        tokens: agent.totalTokens || 0,
      });
    }
    return acc;
  }, []) || [];

  // Model breakdown
  const modelData = agents?.agents?.reduce((acc: any[], agent) => {
    const existing = acc.find((m) => m.name === agent.model);
    if (existing) {
      existing.value += agent.totalTraces;
    } else if (agent.model) {
      acc.push({ name: agent.model, value: agent.totalTraces });
    }
    return acc;
  }, [])?.sort((a, b) => b.value - a.value).slice(0, 8) || [];

  // Cost by agent
  const costByAgent = agents?.agents?.sort((a, b) => b.totalCost - a.totalCost).slice(0, 10).map((a) => ({
    name: a.name.length > 12 ? a.name.slice(0, 12) + '...' : a.name,
    cost: a.totalCost,
  })) || [];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header title="Analytics" onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="flex-1 space-y-6 p-6">
        {/* Token & Cost Trends */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Token Usage Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" tick={{ fill: 'currentColor', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                  <Area type="monotone" dataKey="tokens" stroke="#10B981" strokeWidth={2} fill="url(#colorTokens)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cost Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" tick={{ fill: 'currentColor', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="cost" stroke="#F59E0B" strokeWidth={2} fill="url(#colorCost)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Latency & Errors */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Latency Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" tick={{ fill: 'currentColor', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => formatDuration(v)} />
                  <Tooltip formatter={(v: number) => formatDuration(v)} />
                  <Line type="monotone" dataKey="latency" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Error Rate</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" tick={{ fill: 'currentColor', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="traces" fill="#8B5CF6" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" fill="#EF4444" name="Errors" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Provider & Model Breakdown */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>By Provider</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={providerData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="traces" paddingAngle={2}>
                    {providerData.map((entry, i) => (
                      <Cell key={entry.name} fill={getProviderColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatNumber(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {providerData.map((p) => (
                  <div key={p.name} className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getProviderColor(p.name) }} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{p.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>By Model</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={modelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                    {modelData.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 max-h-20 overflow-y-auto">
                <div className="flex flex-wrap justify-center gap-2">
                  {modelData.slice(0, 6).map((m, i) => (
                    <div key={m.name} className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                      <span className="text-xs text-gray-600 dark:text-gray-400">{m.name.split('/').pop()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cost by Agent</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={costByAgent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis type="number" tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'currentColor', fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="cost" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
