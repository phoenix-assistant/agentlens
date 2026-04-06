import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Zap,
  DollarSign,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge, ProviderBadge } from '@/components/ui/Badge';
import { api, TraceSummary } from '@/lib/api';
import { useStore } from '@/store';
import {
  formatNumber,
  formatCurrency,
  formatDuration,
  formatRelativeTime,
  chartColors,
  cn,
} from '@/lib/utils';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { getTimeRange, autoRefreshInterval } = useStore();
  const { startTime, endTime } = getTimeRange();

  const {
    data: summary,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['dashboard-summary', startTime, endTime],
    queryFn: () => api.stats.summary({ start_time: startTime, end_time: endTime }),
    refetchInterval: autoRefreshInterval,
  });

  const { data: recentTraces } = useQuery({
    queryKey: ['recent-traces', startTime, endTime],
    queryFn: () =>
      api.traces.list({
        start_time: startTime,
        end_time: endTime,
        limit: 10,
      }),
    refetchInterval: autoRefreshInterval,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', startTime, endTime],
    queryFn: () => api.agents.list({ start_time: startTime, end_time: endTime }),
    refetchInterval: autoRefreshInterval,
  });

  // Transform stats for charts
  const chartData =
    summary?.timeSeriesStats?.map((stat) => ({
      time: new Date(stat.hour).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      traces: stat.trace_count,
      tokens: stat.total_tokens,
      cost: stat.total_cost,
      latency: stat.avg_latency_ms,
      errors: stat.error_count,
    })) || [];

  // Provider distribution
  const providerData =
    agents?.agents?.reduce((acc: any[], agent) => {
      const existing = acc.find((p) => p.name === agent.provider);
      if (existing) {
        existing.value += agent.totalTraces;
      } else {
        acc.push({ name: agent.provider || 'unknown', value: agent.totalTraces });
      }
      return acc;
    }, []) || [];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            title="Total Traces"
            value={formatNumber(summary?.totalTraces || 0)}
            icon={Activity}
            trend={12}
          />
          <StatCard
            title="Total Tokens"
            value={formatNumber(summary?.totalTokens || 0)}
            icon={Zap}
            trend={8}
          />
          <StatCard
            title="Total Cost"
            value={formatCurrency(summary?.totalCost || 0)}
            icon={DollarSign}
            trend={-3}
          />
          <StatCard
            title="Avg Latency"
            value={formatDuration(summary?.avgLatency || 0)}
            icon={Clock}
            trend={-15}
            trendGood="down"
          />
          <StatCard
            title="Error Rate"
            value={`${((summary?.errorRate || 0) * 100).toFixed(1)}%`}
            icon={AlertTriangle}
            trend={-5}
            trendGood="down"
            variant={summary?.errorRate && summary.errorRate > 0.05 ? 'danger' : 'default'}
          />
          <StatCard
            title="Active Agents"
            value={String(summary?.activeAgents || 0)}
            icon={Users}
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Traces Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Traces Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTraces" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="traces"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTraces)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost & Tokens */}
          <Card>
            <CardHeader>
              <CardTitle>Cost & Token Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="time" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="tokens" stroke="#10B981" strokeWidth={2} dot={false} name="Tokens" />
                  <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#F59E0B" strokeWidth={2} dot={false} name="Cost ($)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Provider Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={providerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {providerData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {providerData.map((provider, index) => (
                  <div key={provider.name} className="flex items-center gap-1.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: chartColors[index % chartColors.length] }}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{provider.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Traces */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Traces</CardTitle>
              <Link to="/traces" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
                View all →
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentTraces?.traces?.slice(0, 5).map((trace) => (
                  <TraceRow key={trace.trace_id} trace={trace} />
                ))}
                {(!recentTraces?.traces || recentTraces.traces.length === 0) && (
                  <p className="py-8 text-center text-sm text-gray-500">
                    No traces yet. Start instrumenting your agents!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  trendGood?: 'up' | 'down';
  variant?: 'default' | 'danger';
}

function StatCard({ title, value, icon: Icon, trend, trendGood = 'up', variant = 'default' }: StatCardProps) {
  const isTrendGood = trend ? (trendGood === 'up' ? trend > 0 : trend < 0) : undefined;

  return (
    <Card className={cn(variant === 'danger' && 'border-red-200 dark:border-red-900')}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              'rounded-lg p-2',
              variant === 'danger'
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          {trend !== undefined && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                isTrendGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Trace Row Component
function TraceRow({ trace }: { trace: TraceSummary }) {
  return (
    <Link
      to={`/traces/${trace.trace_id}`}
      className="flex items-center justify-between rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
    >
      <div className="flex items-center gap-3">
        <StatusBadge status={trace.status} />
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {trace.agent_name || trace.agent_id || 'Unknown Agent'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {trace.trace_id.slice(0, 8)}...
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatDuration(trace.latency_ms || 0)}
          </p>
          <p className="text-xs text-gray-500">{formatNumber(trace.total_tokens || 0)} tokens</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatCurrency(trace.total_cost || 0)}
          </p>
          <p className="text-xs text-gray-500">{formatRelativeTime(trace.timestamp)}</p>
        </div>
        {trace.provider && <ProviderBadge provider={trace.provider} />}
      </div>
    </Link>
  );
}
