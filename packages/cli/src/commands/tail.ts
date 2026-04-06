/**
 * agentlens tail - Live stream traces in terminal
 * 
 * Usage:
 *   agentlens tail                    # Stream all traces
 *   agentlens tail --agent my-agent   # Filter by agent
 *   agentlens tail --errors           # Only show errors
 *   agentlens tail --compact          # One-line per trace
 */

import WebSocket from 'ws';
import chalk from 'chalk';
import { getConfig } from '../config';

interface TailOptions {
  agent?: string;
  errors?: boolean;
  compact?: boolean;
  verbose?: boolean;
}

const statusColors = {
  success: chalk.green,
  error: chalk.red,
  running: chalk.yellow,
  pending: chalk.gray,
};

const providerColors: Record<string, chalk.Chalk> = {
  openai: chalk.green,
  anthropic: chalk.yellow,
  google: chalk.blue,
  groq: chalk.magenta,
  ollama: chalk.gray,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return String(tokens);
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export async function tail(options: TailOptions): Promise<void> {
  const config = getConfig();
  const wsUrl = config.collectorUrl.replace(/^http/, 'ws') + '/v1/ws';

  console.log(chalk.dim(`Connecting to ${wsUrl}...`));

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log(chalk.green('✓ Connected. Streaming traces...\n'));
    
    // Subscribe to events
    ws.send(JSON.stringify({
      type: 'subscribe',
      filters: {
        agent_id: options.agent,
        status: options.errors ? 'error' : undefined,
      },
    }));
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      
      if (event.type === 'trace' || event.type === 'event') {
        printEvent(event, options);
      }
    } catch {
      // Ignore parse errors
    }
  });

  ws.on('error', (err) => {
    console.error(chalk.red(`Connection error: ${err.message}`));
    process.exit(1);
  });

  ws.on('close', () => {
    console.log(chalk.dim('\nConnection closed.'));
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(chalk.dim('\nDisconnecting...'));
    ws.close();
  });
}

function printEvent(event: any, options: TailOptions): void {
  const timestamp = new Date().toLocaleTimeString();
  const status = event.status || 'running';
  const statusColor = statusColors[status as keyof typeof statusColors] || chalk.white;
  const providerColor = providerColors[event.provider?.toLowerCase()] || chalk.white;

  if (options.compact) {
    // One-line format
    const parts = [
      chalk.dim(timestamp),
      statusColor(`[${status.toUpperCase().padEnd(7)}]`),
      providerColor(event.provider || 'unknown'),
      chalk.white(event.agent_name || event.agent_id || 'agent'),
    ];

    if (event.latency_ms) parts.push(chalk.cyan(formatDuration(event.latency_ms)));
    if (event.total_tokens) parts.push(chalk.yellow(formatTokens(event.total_tokens) + ' tok'));
    if (event.total_cost) parts.push(chalk.green(formatCost(event.total_cost)));
    if (event.error_message) parts.push(chalk.red(`✗ ${event.error_message.slice(0, 50)}`));

    console.log(parts.join(' '));
    return;
  }

  // Detailed format
  console.log(chalk.dim('─'.repeat(60)));
  console.log(
    statusColor(`● ${status.toUpperCase()}`),
    chalk.white.bold(event.agent_name || event.agent_id || 'Unknown Agent'),
    chalk.dim(`(${event.trace_id?.slice(0, 8) || 'no-id'})`)
  );

  const meta = [
    providerColor(event.provider || 'unknown'),
    event.model && chalk.dim(event.model),
  ].filter(Boolean);
  if (meta.length) console.log('  ' + meta.join(' · '));

  const metrics = [];
  if (event.latency_ms) metrics.push(chalk.cyan(`⏱ ${formatDuration(event.latency_ms)}`));
  if (event.total_tokens) metrics.push(chalk.yellow(`⚡ ${formatTokens(event.total_tokens)} tokens`));
  if (event.total_cost) metrics.push(chalk.green(`💰 ${formatCost(event.total_cost)}`));
  if (metrics.length) console.log('  ' + metrics.join('  '));

  if (event.error_message) {
    console.log(chalk.red(`  ✗ Error: ${event.error_message}`));
  }

  if (options.verbose && event.input) {
    console.log(chalk.dim('  Input:'), JSON.stringify(event.input).slice(0, 100));
  }
  if (options.verbose && event.output) {
    console.log(chalk.dim('  Output:'), JSON.stringify(event.output).slice(0, 100));
  }

  console.log();
}
