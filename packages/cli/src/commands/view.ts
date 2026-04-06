/**
 * agentlens view <trace-id> - View trace details in terminal
 * 
 * Usage:
 *   agentlens view abc123           # View specific trace
 *   agentlens view abc123 --json    # Output as JSON
 *   agentlens view abc123 --events  # Show all events
 */

import chalk from 'chalk';
import { getConfig } from '../config';

interface ViewOptions {
  json?: boolean;
  events?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return String(tokens);
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

const eventIcons: Record<string, string> = {
  agent_start: '▶',
  agent_end: '■',
  llm_start: '🧠',
  llm_end: '💬',
  tool_call: '🔧',
  tool_result: '📤',
  error: '❌',
  handoff: '🔄',
};

const statusStyles = {
  success: { icon: '✓', color: chalk.green },
  error: { icon: '✗', color: chalk.red },
  running: { icon: '◐', color: chalk.yellow },
};

export async function view(traceId: string, options: ViewOptions): Promise<void> {
  const config = getConfig();
  const baseUrl = config.collectorUrl;

  try {
    const response = await fetch(`${baseUrl}/v1/traces/${traceId}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.error(chalk.red(`Trace not found: ${traceId}`));
        process.exit(1);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const { trace, events } = data;
    const statusStyle = statusStyles[trace.status as keyof typeof statusStyles] || statusStyles.running;

    // Header
    console.log();
    console.log(
      statusStyle.color(`${statusStyle.icon} ${trace.status.toUpperCase()}`),
      chalk.white.bold(trace.agent_name || 'Unknown Agent')
    );
    console.log(chalk.dim(`  Trace ID: ${trace.trace_id}`));
    console.log();

    // Metadata
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    const meta = [
      ['Provider', trace.provider],
      ['Model', trace.model],
      ['Started', new Date(trace.timestamp).toLocaleString()],
      ['Duration', formatDuration(trace.latency_ms || 0)],
    ];
    for (const [label, value] of meta) {
      if (value) {
        console.log(`  ${chalk.dim(label.padEnd(12))} ${chalk.white(value)}`);
      }
    }
    console.log();

    // Metrics
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    console.log(chalk.bold('  Metrics'));
    console.log();
    console.log(`  ⚡ Tokens      ${chalk.yellow(formatTokens(trace.input_tokens || 0))} in / ${chalk.yellow(formatTokens(trace.output_tokens || 0))} out`);
    console.log(`  💰 Cost        ${chalk.green(formatCost(trace.total_cost || 0))}`);
    console.log(`  ⏱  Latency     ${chalk.cyan(formatDuration(trace.latency_ms || 0))}`);
    console.log();

    // Error if present
    if (trace.error_message) {
      console.log(chalk.dim('  ' + '─'.repeat(50)));
      console.log(chalk.red.bold('  Error'));
      console.log(chalk.red(`  ${trace.error_message}`));
      console.log();
    }

    // Events timeline
    if (options.events && events && events.length > 0) {
      console.log(chalk.dim('  ' + '─'.repeat(50)));
      console.log(chalk.bold(`  Events (${events.length})`));
      console.log();

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const isLast = i === events.length - 1;
        const icon = eventIcons[event.event_type] || '●';
        const connector = isLast ? '└' : '├';
        const line = isLast ? ' ' : '│';

        console.log(
          chalk.dim(`  ${connector}─`),
          icon,
          chalk.white(event.event_type.replace(/_/g, ' ')),
          chalk.dim(new Date(event.timestamp).toLocaleTimeString())
        );

        if (event.agent?.name) {
          console.log(chalk.dim(`  ${line}    Agent: ${event.agent.name}`));
        }
        if (event.tool?.name) {
          console.log(chalk.dim(`  ${line}    Tool: ${event.tool.name}`));
        }
        if (event.metrics?.latency_ms) {
          console.log(chalk.dim(`  ${line}    Duration: ${formatDuration(event.metrics.latency_ms)}`));
        }
        if (event.error) {
          console.log(chalk.red(`  ${line}    Error: ${event.error.message || JSON.stringify(event.error)}`));
        }
      }
      console.log();
    }

    // Quick actions
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    console.log(chalk.dim(`  View in dashboard: ${config.dashboardUrl || 'http://localhost:5173'}/traces/${trace.trace_id}`));
    console.log();

  } catch (err: any) {
    console.error(chalk.red(`Failed to fetch trace: ${err.message}`));
    process.exit(1);
  }
}
