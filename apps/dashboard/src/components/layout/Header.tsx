import { RefreshCw, Moon, Sun, Monitor, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useStore, timeRanges } from '@/store';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ title, onRefresh, isRefreshing }: HeaderProps) {
  const {
    selectedTimeRange,
    setTimeRange,
    theme,
    setTheme,
    realtimeEnabled,
    setRealtimeEnabled,
  } = useStore();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-950">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Time Range Selector */}
        <select
          value={selectedTimeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          {timeRanges.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>

        {/* Real-time Toggle */}
        <button
          onClick={() => setRealtimeEnabled(!realtimeEnabled)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
            realtimeEnabled
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          )}
        >
          {realtimeEnabled ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span className="hidden sm:inline">
            {realtimeEnabled ? 'Live' : 'Paused'}
          </span>
        </button>

        {/* Refresh Button */}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              size={16}
              className={cn('mr-2', isRefreshing && 'animate-spin')}
            />
            Refresh
          </Button>
        )}

        {/* Theme Toggle */}
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-700">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'rounded-l-lg p-2 transition-colors',
              theme === 'light'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <Sun size={16} />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={cn(
              'border-x border-gray-300 p-2 transition-colors dark:border-gray-700',
              theme === 'system'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <Monitor size={16} />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'rounded-r-lg p-2 transition-colors',
              theme === 'dark'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            )}
          >
            <Moon size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
