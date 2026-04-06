/**
 * agentlens stats - Quick stats in terminal
 * 
 * Usage:
 *   agentlens stats                # Last hour summary
 *   agentlens stats --24h          # Last 24 hours
 *   agentlens stats --7d           # Last 7 days
 *   agentlens stats agents         # Per-agent breakdown
 *   agentlens stats models         # Per-model breakdown
 *   agentlens stats providers      # Per-provider breakdown
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
  if (cost < 0.001) return '$0.00';
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
  const filled = Math.min(Math.round((value / Math.max(max, 1)) * width), width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function getTimeParams(options: StatsOptions): { startTime: string; endTime: string; label: string } {
  let hours = 1;
  let label = '1h';
  
  if (options.hours) {
    hours = options.hours;
    label = `${hours}h`;
  } else if (options.days) {
    hours = options.days * 24;
    label = `${options.days}d`;
  }

  return {
    startTime: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    endTime: new Date().toISOString(),
    label,
  };
}

export async function stats(options: StatsOptions, subcommand?: string): Promise<void> {
  const config = getConfig();
  const baseUrl = config.collectorUrl;
  const { startTime, endTime, label } = getTimeParams(options);

  // Route to subcommand
  if (subcommand === 'agents') {
    return showAgentStats(baseUrl, startTime, endTime, label, options);
  }
  if (subcommand === 'models') {
    return showModelStats(baseUrl, startTime, endTime, label, options);
  }
  if (subcommand === 'providers') {
    return showProviderStats(baseUrl, startTime, endTime, label, options);
  }

  // Default: summary
  return showSummary(baseUrl, startTime, endTime, label, options);
}

async function showSummary(baseUrl: string, startTime: string, endTime: string, label: string, options: StatsOptions): Promise<void> {
  const params = new URLSearchParams({ start_time: startTime, end_time: endTime });
  if (options.agent) params.set('agent_id', options.agent);

  try {
    const response = await fetch(`${baseUrl}/v1/stats/summary?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold.white(`  📊 AgentLens Stats (${label})`));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    console.log();

    const metrics = [
      { label: 'Traces', value: formatNumber(data.totalTraces || 0), icon: '📍' },
      { label: 'Tokens', value: formatNumber(data.totalTokens || 0), icon: '⚡' },
      { label: 'Cost', value: formatCost(data.totalCost || 0), icon: '💰' },
      { label: 'Avg Latency', value: formatDuration(data.avgLatency || 0), icon: '⏱ ' },
      { label: 'Error Rate', value: `${((data.errorRate || 0) * 100).toFixed(1)}%`, icon: '⚠️ ' },
      { label: 'Active Agents', value: String(data.activeAgents || 0), icon: '🤖' },
    ];

    for (const m of metrics) {
      console.log(`  ${m.icon}  ${chalk.dim(m.label.padEnd(14))} ${chalk.white.bold(m.value)}`);
    }

    console.log();
    console.log(chalk.dim('  More: agentlens stats agents | models | providers'));
    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch stats: ${err.message}`));
    console.error(chalk.dim(`Make sure collector is running at ${baseUrl}`));
    process.exit(1);
  }
}

async function showAgentStats(baseUrl: string, startTime: string, endTime: string, label: string, options: StatsOptions): Promise<void> {
  const params = new URLSearchParams({ start_time: startTime, end_time: endTime });

  try {
    const response = await fetch(`${baseUrl}/v1/agents?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const agents = (data.agents || []).sort((a: any, b: any) => b.totalTraces - a.totalTraces);

    console.log();
    console.log(chalk.bold.white(`  🤖 Agents (${label})`));
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    console.log();

    if (agents.length === 0) {
      console.log(chalk.dim('  No agents found.'));
      console.log();
      return;
    }

    // Header
    console.log(
      '  ',
      chalk.dim('AGENT'.padEnd(24)),
      chalk.dim('TRACES'.padStart(8)),
      chalk.dim('TOKENS'.padStart(10)),
      chalk.dim('COST'.padStart(10)),
      chalk.dim('AVG LAT'.padStart(10)),
      chalk.dim('ERR%'.padStart(6))
    );
    console.log(chalk.dim('  ' + '─'.repeat(70)));

    const maxTraces = Math.max(...agents.map((a: any) => a.totalTraces));

    for (const agent of agents.slice(0, 15)) {
      const name = (agent.name || agent.id || 'unknown').slice(0, 22);
      const errRate = agent.totalTraces > 0 ? ((agent.errorCount / agent.totalTraces) * 100).toFixed(1) : '0.0';
      const errColor = parseFloat(errRate) > 5 ? chalk.red : chalk.dim;

      console.log(
        '  ',
        chalk.white(name.padEnd(24)),
        chalk.cyan(formatNumber(agent.totalTraces).padStart(8)),
        chalk.yellow(formatNumber(agent.totalTokens || 0).padStart(10)),
        chalk.green(formatCost(agent.totalCost || 0).padStart(10)),
        chalk.blue(formatDuration(agent.avgLatency || 0).padStart(10)),
        errColor((errRate + '%').padStart(6))
      );
    }

    if (agents.length > 15) {
      console.log(chalk.dim(`  ... and ${agents.length - 15} more agents`));
    }

    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch agent stats: ${err.message}`));
    process.exit(1);
  }
}

async function showModelStats(baseUrl: string, startTime: string, endTime: string, label: string, options: StatsOptions): Promise<void> {
  const params = new URLSearchParams({ start_time: startTime, end_time: endTime });

  try {
    const response = await fetch(`${baseUrl}/v1/agents?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Aggregate by model
    const modelMap = new Map<string, { traces: number; tokens: number; cost: number; latencySum: number; errors: number }>();
    
    for (const agent of data.agents || []) {
      const model = agent.model || 'unknown';
      const existing = modelMap.get(model) || { traces: 0, tokens: 0, cost: 0, latencySum: 0, errors: 0 };
      existing.traces += agent.totalTraces || 0;
      existing.tokens += agent.totalTokens || 0;
      existing.cost += agent.totalCost || 0;
      existing.latencySum += (agent.avgLatency || 0) * (agent.totalTraces || 0);
      existing.errors += agent.errorCount || 0;
      modelMap.set(model, existing);
    }

    const models = Array.from(modelMap.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        avgLatency: stats.traces > 0 ? stats.latencySum / stats.traces : 0,
      }))
      .sort((a, b) => b.traces - a.traces);

    console.log();
    console.log(chalk.bold.white(`  🧠 Models (${label})`));
    console.log(chalk.dim('  ' + '─'.repeat(75)));
    console.log();

    if (models.length === 0) {
      console.log(chalk.dim('  No models found.'));
      console.log();
      return;
    }

    // Header
    console.log(
      '  ',
      chalk.dim('MODEL'.padEnd(30)),
      chalk.dim('TRACES'.padStart(8)),
      chalk.dim('TOKENS'.padStart(10)),
      chalk.dim('COST'.padStart(10)),
      chalk.dim('AVG LAT'.padStart(10)),
      chalk.dim('ERR%'.padStart(6))
    );
    console.log(chalk.dim('  ' + '─'.repeat(75)));

    const maxTraces = Math.max(...models.map((m) => m.traces));

    for (const model of models.slice(0, 15)) {
      const name = model.name.slice(0, 28);
      const errRate = model.traces > 0 ? ((model.errors / model.traces) * 100).toFixed(1) : '0.0';
      const errColor = parseFloat(errRate) > 5 ? chalk.red : chalk.dim;

      console.log(
        '  ',
        chalk.white(name.padEnd(30)),
        chalk.cyan(formatNumber(model.traces).padStart(8)),
        chalk.yellow(formatNumber(model.tokens).padStart(10)),
        chalk.green(formatCost(model.cost).padStart(10)),
        chalk.blue(formatDuration(model.avgLatency).padStart(10)),
        errColor((errRate + '%').padStart(6))
      );
    }

    if (models.length > 15) {
      console.log(chalk.dim(`  ... and ${models.length - 15} more models`));
    }

    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch model stats: ${err.message}`));
    process.exit(1);
  }
}

async function showProviderStats(baseUrl: string, startTime: string, endTime: string, label: string, options: StatsOptions): Promise<void> {
  const params = new URLSearchParams({ start_time: startTime, end_time: endTime });

  try {
    const response = await fetch(`${baseUrl}/v1/agents?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Aggregate by provider
    const providerMap = new Map<string, { traces: number; tokens: number; cost: number; latencySum: number; errors: number }>();
    
    for (const agent of data.agents || []) {
      const provider = agent.provider || 'unknown';
      const existing = providerMap.get(provider) || { traces: 0, tokens: 0, cost: 0, latencySum: 0, errors: 0 };
      existing.traces += agent.totalTraces || 0;
      existing.tokens += agent.totalTokens || 0;
      existing.cost += agent.totalCost || 0;
      existing.latencySum += (agent.avgLatency || 0) * (agent.totalTraces || 0);
      existing.errors += agent.errorCount || 0;
      providerMap.set(provider, existing);
    }

    const providers = Array.from(providerMap.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        avgLatency: stats.traces > 0 ? stats.latencySum / stats.traces : 0,
      }))
      .sort((a, b) => b.traces - a.traces);

    console.log();
    console.log(chalk.bold.white(`  🏢 Providers (${label})`));
    console.log(chalk.dim('  ' + '─'.repeat(70)));
    console.log();

    if (providers.length === 0) {
      console.log(chalk.dim('  No providers found.'));
      console.log();
      return;
    }

    const maxTraces = Math.max(...providers.map((p) => p.traces));

    for (const provider of providers) {
      const bar = progressBar(provider.traces, maxTraces, 15);
      const errRate = provider.traces > 0 ? ((provider.errors / provider.traces) * 100).toFixed(1) : '0.0';

      console.log(
        '  ',
        chalk.white(provider.name.padEnd(12)),
        bar,
        chalk.cyan(formatNumber(provider.traces).padStart(7)),
        chalk.yellow(formatNumber(provider.tokens).padStart(8) + ' tok'),
        chalk.green(formatCost(provider.cost).padStart(8)),
        chalk.dim(`${errRate}% err`)
      );
    }

    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch provider stats: ${err.message}`));
    process.exit(1);
  }
}
