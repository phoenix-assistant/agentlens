#!/usr/bin/env node

import { program } from 'commander';
import { traceCommand } from './commands/trace';
import { wrapCommand } from './commands/wrap';
import { initCommand } from './commands/init';

program
  .name('agentlens')
  .description('AgentLens CLI - Trace and monitor AI agent workflows')
  .version('0.1.0');

// Main trace command: agentlens trace -- <command>
program
  .command('trace')
  .description('Trace a command execution')
  .option('-n, --name <name>', 'Agent name', 'cli-agent')
  .option('-p, --provider <provider>', 'Provider (anthropic, openai, ollama, custom)', 'custom')
  .option('--session <id>', 'Session ID to group traces')
  .option('--endpoint <url>', 'Collector endpoint', 'http://localhost:3100/v1/events')
  .option('--api-key <key>', 'API key for collector')
  .option('--capture-output', 'Capture stdout/stderr (privacy risk)', false)
  .option('--json', 'Parse JSON output for metrics', false)
  .option('--debug', 'Debug mode - print events', false)
  .argument('<command...>', 'Command to trace')
  .action(traceCommand);

// Wrap specific CLI tools
program
  .command('wrap')
  .description('Install a wrapper for a specific CLI tool')
  .argument('<tool>', 'Tool to wrap (claude, ollama, gh-copilot)')
  .option('--shell <shell>', 'Shell to configure (bash, zsh, fish)', 'zsh')
  .option('--uninstall', 'Remove the wrapper', false)
  .action(wrapCommand);

// Initialize configuration
program
  .command('init')
  .description('Initialize AgentLens configuration')
  .option('--endpoint <url>', 'Collector endpoint')
  .option('--api-key <key>', 'API key')
  .action(initCommand);

// Shorthand: agentlens -- <command> (same as agentlens trace -- <command>)
program
  .argument('[command...]', 'Command to trace (shorthand for trace command)')
  .action((command, options) => {
    if (command.length > 0) {
      traceCommand(command, { ...options, name: 'cli-agent', provider: 'custom' });
    }
  });

program.parse();
