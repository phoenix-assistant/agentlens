import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface InitOptions {
  endpoint?: string;
  apiKey?: string;
}

const DEFAULT_CONFIG = {
  endpoint: 'http://localhost:3100/v1/events',
  apiKey: '',
  environment: 'development',
  defaultTags: {},
  batching: true,
  batchSize: 100,
  flushIntervalMs: 5000,
  captureHashes: true,
  enabled: true,
  debug: false,
};

export async function initCommand(options: InitOptions): Promise<void> {
  const configDir = join(homedir(), '.agentlens');
  const configPath = join(configDir, 'config.json');

  // Create config directory
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Build config
  const config = {
    ...DEFAULT_CONFIG,
    ...(options.endpoint && { endpoint: options.endpoint }),
    ...(options.apiKey && { apiKey: options.apiKey }),
  };

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('✓ AgentLens initialized');
  console.log(`  Config: ${configPath}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Start the collector: docker compose up -d');
  console.log('  2. Wrap your CLI tools: agentlens wrap claude');
  console.log('  3. Or trace any command: agentlens trace -- your-command');
}
