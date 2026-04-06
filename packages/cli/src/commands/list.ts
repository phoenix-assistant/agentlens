/**
 * agentlens list - List recent traces in terminal
 * 
 * Usage:
 *   agentlens list                  # Last 20 traces
 *   agentlens list -n 50            # Last 50 traces
 *   agentlens list --errors         # Only errors
 *   agentlens list --agent my-agent # Filter by agent
 */

import chalk from 'chalk';
import { getConfig } from '../config';

interface ListOptions {
  limit?: number;
  errors?: boolean;
  agent?: string;
  json?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.001) return '-';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatRelativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const statusChars = {
  success: chalk.green('✓'),
  error: chalk.red('✗'),
  running: chalk.yellow('◐'),
};

const providerColors: Record<string, chalk.Chalk> = {
  openai: chalk.green,
  anthropic: chalk.yellow,
  google: chalk.blue,
  groq: chalk.magenta,
  ollama: chalk.gray,
};

export async function list(options: ListOptions): Promise<void> {
  const config = getConfig();
  const baseUrl = config.collectorUrl;
  const limit = options.limit || 20;

  const params = new URLSearchParams({
    limit: String(limit),
    start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date().toISOString(),
  });

  if (options.errors) params.set('status', 'error');
  if (options.agent) params.set('agent_id', options.agent);

  try {
    const response = await fetch(`${baseUrl}/v1/traces?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const traces = data.traces || [];

    if (traces.length === 0) {
      console.log(chalk.dim('\nNo traces found.\n'));
      return;
    }

    console.log();
    console.log(chalk.bold.white(`  Recent Traces (${traces.length})`));
    console.log(chalk.dim('  ' + '─'.repeat(80)));
    console.log();

    // Header
    console.log(
      chalk.dim('  '),
      chalk.dim('STATUS'.padEnd(8)),
      chalk.dim('TRACE ID'.padEnd(14)),
      chalk.dim('AGENT'.padEnd(20)),
      chalk.dim('PROVIDER'.padEnd(12)),
      chalk.dim('LATENCY'.padEnd(10)),
      chalk.dim('COST'.padEnd(10)),
      chalk.dim('TIME')
    );
    console.log(chalk.dim('  ' + '─'.repeat(80)));

    for (const trace of traces) {
      const status = statusChars[trace.status as keyof typeof statusChars] || chalk.gray('?');
      const provider = trace.provider || 'unknown';
      const providerColor = providerColors[provider.toLowerCase()] || chalk.white;
      const agentName = (trace.agent_name || trace.agent_id || 'unknown').slice(0, 18);

      console.log(
        '  ',
        status,
        chalk.dim((trace.trace_id || '').slice(0, 12).padEnd(14)),
        chalk.white(agentName.padEnd(20)),
        providerColor(provider.padEnd(12)),
        chalk.cyan(formatDuration(trace.latency_ms || 0).padEnd(10)),
        chalk.green(formatCost(trace.total_cost || 0).padEnd(10)),
        chalk.dim(formatRelativeTime(trace.timestamp))
      );
    }

    console.log();
    console.log(chalk.dim(`  View details: agentlens view <trace-id>`));
    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch traces: ${err.message}`));
    console.error(chalk.dim(`Make sure the collector is running at ${baseUrl}`));
    process.exit(1);
  }
}
