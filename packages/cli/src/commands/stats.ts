/**
 * agentlens stats - Quick stats in terminal
 * 
 * Usage:
 *   agentlens stats                # Last hour stats
 *   agentlens stats --24h          # Last 24 hours
 *   agentlens stats --7d           # Last 7 days
 *   agentlens stats --agent foo    # Stats for specific agent
 */

import chalk from 'chalk';
import { getConfig } from '../config';

interface StatsOptions {
  hours?: number;
  days?: number;
  agent?: string;
  json?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function progressBar(value: number, max: number, width = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

export async function stats(options: StatsOptions): Promise<void> {
  const config = getConfig();
  const baseUrl = config.collectorUrl;

  // Calculate time range
  let hours = 1;
  if (options.hours) hours = options.hours;
  else if (options.days) hours = options.days * 24;

  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    start_time: startTime,
    end_time: endTime,
  });
  if (options.agent) params.set('agent_id', options.agent);

  try {
    // Fetch summary stats
    const response = await fetch(`${baseUrl}/v1/stats/summary?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const timeLabel = options.days ? `${options.days}d` : options.hours ? `${options.hours}h` : '1h';

    console.log();
    console.log(chalk.bold.white(`  📊 AgentLens Stats (${timeLabel})`));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    console.log();

    // Main metrics
    const metrics = [
      { label: 'Traces', value: formatNumber(data.totalTraces || 0), icon: '📍' },
      { label: 'Tokens', value: formatNumber(data.totalTokens || 0), icon: '⚡' },
      { label: 'Cost', value: formatCost(data.totalCost || 0), icon: '💰' },
      { label: 'Avg Latency', value: formatDuration(data.avgLatency || 0), icon: '⏱' },
      { label: 'Error Rate', value: `${((data.errorRate || 0) * 100).toFixed(1)}%`, icon: '⚠️' },
      { label: 'Active Agents', value: String(data.activeAgents || 0), icon: '🤖' },
    ];

    for (const m of metrics) {
      console.log(`  ${m.icon}  ${chalk.dim(m.label.padEnd(14))} ${chalk.white.bold(m.value)}`);
    }

    // Provider breakdown if available
    if (data.providerStats && data.providerStats.length > 0) {
      console.log();
      console.log(chalk.dim('  ' + '─'.repeat(40)));
      console.log(chalk.bold.white('  By Provider'));
      console.log();

      const maxTraces = Math.max(...data.providerStats.map((p: any) => p.traces));
      for (const p of data.providerStats) {
        const bar = progressBar(p.traces, maxTraces, 15);
        console.log(
          `  ${p.provider.padEnd(12)} ${bar} ${chalk.white(formatNumber(p.traces))} traces  ${chalk.green(formatCost(p.cost))}`
        );
      }
    }

    // Top agents if available
    if (data.topAgents && data.topAgents.length > 0) {
      console.log();
      console.log(chalk.dim('  ' + '─'.repeat(40)));
      console.log(chalk.bold.white('  Top Agents'));
      console.log();

      for (const agent of data.topAgents.slice(0, 5)) {
        const name = (agent.name || agent.id).slice(0, 20).padEnd(20);
        console.log(
          `  ${chalk.white(name)} ${chalk.dim(formatNumber(agent.traces) + ' traces')}  ${chalk.green(formatCost(agent.cost))}`
        );
      }
    }

    console.log();
  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch stats: ${err.message}`));
    console.error(chalk.dim(`Make sure the collector is running at ${baseUrl}`));
    process.exit(1);
  }
}
