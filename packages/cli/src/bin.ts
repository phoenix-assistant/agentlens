#!/usr/bin/env node
/**
 * AgentLens CLI
 * 
 * Commands:
 *   agentlens init                    Initialize config
 *   agentlens tail                    Live stream traces
 *   agentlens list                    List recent traces
 *   agentlens view <id>               View trace details
 *   agentlens stats                   Show statistics
 *   agentlens wrap <cmd>              Wrap and trace a command
 */

import { program } from 'commander';
import { init } from './commands/init';
import { tail } from './commands/tail';
import { list } from './commands/list';
import { view } from './commands/view';
import { stats } from './commands/stats';
import { wrap } from './commands/wrap';
import { trace } from './commands/trace';

program
  .name('agentlens')
  .description('Multi-agent observability CLI')
  .version('0.1.0');

// Init
program
  .command('init')
  .description('Initialize AgentLens configuration')
  .option('-u, --url <url>', 'Collector URL')
  .action(init);

// Tail - live stream
program
  .command('tail')
  .description('Live stream traces in terminal')
  .option('-a, --agent <id>', 'Filter by agent ID')
  .option('-e, --errors', 'Only show errors')
  .option('-c, --compact', 'One-line per trace')
  .option('-v, --verbose', 'Show input/output')
  .action(tail);

// List traces
program
  .command('list')
  .alias('ls')
  .description('List recent traces')
  .option('-n, --limit <n>', 'Number of traces', '20')
  .option('-a, --agent <id>', 'Filter by agent')
  .option('-e, --errors', 'Only show errors')
  .option('--json', 'Output as JSON')
  .action((opts) => list({ ...opts, limit: parseInt(opts.limit) }));

// View trace
program
  .command('view <traceId>')
  .alias('show')
  .description('View trace details')
  .option('--json', 'Output as JSON')
  .option('--events', 'Show all events')
  .action(view);

// Stats
program
  .command('stats')
  .description('Show statistics')
  .option('--1h', 'Last hour (default)')
  .option('--24h', 'Last 24 hours')
  .option('--7d', 'Last 7 days')
  .option('--hours <n>', 'Custom hours')
  .option('--days <n>', 'Custom days')
  .option('-a, --agent <id>', 'Filter by agent')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    let hours: number | undefined;
    let days: number | undefined;
    if (opts['24h']) hours = 24;
    else if (opts['7d']) days = 7;
    else if (opts.hours) hours = parseInt(opts.hours);
    else if (opts.days) days = parseInt(opts.days);
    else hours = 1;
    stats({ hours, days, agent: opts.agent, json: opts.json });
  });

// Wrap command
program
  .command('wrap <command...>')
  .description('Wrap and trace a CLI command (claude, gh copilot, ollama)')
  .option('-n, --name <name>', 'Agent name')
  .option('-p, --provider <provider>', 'Provider override')
  .action((command, opts) => wrap(command.join(' '), opts));

// Trace (alias for wrap)
program
  .command('trace <command...>')
  .description('Alias for wrap')
  .option('-n, --name <name>', 'Agent name')
  .option('-p, --provider <provider>', 'Provider override')
  .action((command, opts) => trace(command.join(' '), opts));

program.parse();
