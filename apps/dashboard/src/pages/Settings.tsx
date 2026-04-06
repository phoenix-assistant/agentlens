import { useState } from 'react';
import { Save, Database, Bell, Palette, Key, CheckCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

export function Settings() {
  const { theme, setTheme, autoRefreshInterval, setAutoRefreshInterval } = useStore();
  const [saved, setSaved] = useState(false);

  const [config, setConfig] = useState({
    collectorUrl: 'http://localhost:3100',
    clickhouseHost: 'localhost',
    clickhousePort: '8123',
    clickhouseDatabase: 'agentlens',
    retentionDays: '90',
    webhookUrl: '',
    slackWebhook: '',
  });

  const handleSave = () => {
    localStorage.setItem('agentlens-config', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col">
      <Header title="Settings" />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database size={20} /> Connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Collector URL</label>
                <input type="text" value={config.collectorUrl} onChange={(e) => setConfig({ ...config, collectorUrl: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ClickHouse Host</label>
                  <input type="text" value={config.clickhouseHost} onChange={(e) => setConfig({ ...config, clickhouseHost: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Port</label>
                  <input type="text" value={config.clickhousePort} onChange={(e) => setConfig({ ...config, clickhousePort: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Database</label>
                  <input type="text" value={config.clickhouseDatabase} onChange={(e) => setConfig({ ...config, clickhouseDatabase: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Retention (days)</label>
                <input type="number" value={config.retentionDays} onChange={(e) => setConfig({ ...config, retentionDays: e.target.value })} className="mt-1 w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette size={20} /> Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
                <div className="mt-2 flex gap-2">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button key={t} onClick={() => setTheme(t)} className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors', theme === t ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800')}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Refresh</label>
                <select value={autoRefreshInterval} onChange={(e) => setAutoRefreshInterval(Number(e.target.value))} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900">
                  <option value={0}>Disabled</option>
                  <option value={10000}>10 seconds</option>
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell size={20} /> Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Webhook URL</label>
                <input type="url" value={config.webhookUrl} onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })} placeholder="https://..." className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slack Webhook</label>
                <input type="url" value={config.slackWebhook} onChange={(e) => setConfig({ ...config, slackWebhook: e.target.value })} placeholder="https://hooks.slack.com/..." className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900" />
              </div>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key size={20} /> API Keys</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <p className="text-sm text-gray-600 dark:text-gray-400">Your SDK API key:</p>
                <code className="mt-2 block rounded bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800">al_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
                <p className="mt-2 text-xs text-gray-500">Use this key in your AgentLens SDK configuration.</p>
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave}>
              {saved ? <><CheckCircle size={16} className="mr-2" /> Saved!</> : <><Save size={16} className="mr-2" /> Save Settings</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
