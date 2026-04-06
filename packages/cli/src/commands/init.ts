/**
 * agentlens init - Initialize configuration
 */

import chalk from 'chalk';
import { saveConfig } from '../config';

export interface InitOptions {
  url?: string;
}

export async function init(options: InitOptions): Promise<void> {
  const config: Record<string, string> = {};
  
  if (options.url) {
    config.collectorUrl = options.url;
  }
  
  saveConfig(config);
  
  console.log(chalk.green('✓ AgentLens initialized'));
  console.log(chalk.dim(`  Config saved to ~/.agentlens.json`));
  console.log();
  console.log('Next steps:');
  console.log('  1. Start the collector: docker compose up -d');
  console.log('  2. Wrap CLI tools: agentlens wrap "claude \'hello\'"');
  console.log('  3. View traces: agentlens list');
}
