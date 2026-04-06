import { useState } from 'react';
import { Bell, Plus, Trash2, Edit2, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, formatRelativeTime } from '@/lib/utils';

interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  unit: string;
  enabled: boolean;
  lastTriggered?: string;
  status: 'ok' | 'warning' | 'critical';
}

interface AlertHistory {
  id: string;
  alertId: string;
  alertName: string;
  timestamp: string;
  status: 'triggered' | 'resolved';
  value: number;
  threshold: number;
  message: string;
}

const mockAlerts: Alert[] = [
  { id: '1', name: 'High Error Rate', condition: 'error_rate', threshold: 5, unit: '%', enabled: true, lastTriggered: '2026-04-06T05:30:00Z', status: 'ok' },
  { id: '2', name: 'Cost Spike', condition: 'cost_per_hour', threshold: 10, unit: '$', enabled: true, lastTriggered: '2026-04-06T04:15:00Z', status: 'warning' },
  { id: '3', name: 'High Latency', condition: 'avg_latency', threshold: 5000, unit: 'ms', enabled: true, status: 'ok' },
  { id: '4', name: 'Token Budget', condition: 'tokens_per_day', threshold: 1000000, unit: 'tokens', enabled: false, status: 'ok' },
];

const mockHistory: AlertHistory[] = [
  { id: '1', alertId: '2', alertName: 'Cost Spike', timestamp: '2026-04-06T04:15:00Z', status: 'triggered', value: 12.5, threshold: 10, message: 'Cost per hour exceeded $10 threshold' },
  { id: '2', alertId: '1', alertName: 'High Error Rate', timestamp: '2026-04-06T05:30:00Z', status: 'resolved', value: 3.2, threshold: 5, message: 'Error rate returned below 5%' },
  { id: '3', alertId: '2', alertName: 'Cost Spike', timestamp: '2026-04-05T22:00:00Z', status: 'triggered', value: 15.0, threshold: 10, message: 'Cost per hour exceeded $10 threshold' },
  { id: '4', alertId: '2', alertName: 'Cost Spike', timestamp: '2026-04-05T22:45:00Z', status: 'resolved', value: 8.2, threshold: 10, message: 'Cost per hour returned below $10' },
];

export function Alerts() {
  const [alerts] = useState<Alert[]>(mockAlerts);
  const [history] = useState<AlertHistory[]>(mockHistory);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const getStatusIcon = (status: Alert['status']) => {
    switch (status) {
      case 'ok': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Alerts" />

      <div className="flex-1 p-6">
        {/* Summary */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900/30">
                <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{alerts.length}</p>
                <p className="text-sm text-gray-500">Total Alerts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{alerts.filter((a) => a.status === 'ok').length}</p>
                <p className="text-sm text-gray-500">Healthy</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{alerts.filter((a) => a.status === 'warning').length}</p>
                <p className="text-sm text-gray-500">Warning</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{alerts.filter((a) => a.status === 'critical').length}</p>
                <p className="text-sm text-gray-500">Critical</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Alert Rules */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Alert Rules</CardTitle>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} className="mr-1" /> New Alert
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className={cn('flex items-center justify-between rounded-lg border p-4', alert.enabled ? 'border-gray-200 dark:border-gray-800' : 'border-gray-100 bg-gray-50 dark:border-gray-900 dark:bg-gray-900/50')}>
                    <div className="flex items-center gap-3">
                      {getStatusIcon(alert.status)}
                      <div>
                        <p className={cn('font-medium', !alert.enabled && 'text-gray-400')}>{alert.name}</p>
                        <p className="text-sm text-gray-500">{alert.condition.replace(/_/g, ' ')} &gt; {alert.threshold}{alert.unit}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.lastTriggered && (
                        <span className="text-xs text-gray-400">Last: {formatRelativeTime(alert.lastTriggered)}</span>
                      )}
                      <Badge variant={alert.enabled ? 'default' : 'secondary'}>{alert.enabled ? 'Active' : 'Disabled'}</Badge>
                      <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
                        <Edit2 size={14} />
                      </button>
                      <button className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Alert History */}
          <Card>
            <CardHeader>
              <CardTitle>Recent History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                    <div className={cn('mt-0.5 rounded-full p-1', event.status === 'triggered' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30')}>
                      {event.status === 'triggered' ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 dark:text-white">{event.alertName}</p>
                        <span className="text-xs text-gray-400">{formatRelativeTime(event.timestamp)}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{event.message}</p>
                      <p className="mt-1 text-xs text-gray-400">Value: {event.value} (threshold: {event.threshold})</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
