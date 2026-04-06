import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      secondary: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

// Status-specific badge
export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'success'
      ? 'success'
      : status === 'error'
      ? 'error'
      : status === 'running'
      ? 'info'
      : 'default';

  return <Badge variant={variant}>{status}</Badge>;
}

// Provider badge with colors
export function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    openai: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    google: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    groq: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    ollama: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    cohere: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    langgraph: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colors[provider.toLowerCase()] || colors.ollama
      )}
    >
      {provider}
    </span>
  );
}
