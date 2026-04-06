/**
 * CLI Configuration
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CLIConfig {
  collectorUrl: string;
  dashboardUrl?: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: CLIConfig = {
  collectorUrl: 'http://localhost:3100',
  dashboardUrl: 'http://localhost:5173',
};

const CONFIG_FILE = '.agentlens.json';

export function getConfigPath(): string {
  // Check current directory first
  const localConfig = path.join(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(localConfig)) return localConfig;

  // Fall back to home directory
  return path.join(os.homedir(), CONFIG_FILE);
}

export function getConfig(): CLIConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
  } catch {
    // Ignore parse errors
  }

  // Check environment variables
  return {
    collectorUrl: process.env.AGENTLENS_URL || DEFAULT_CONFIG.collectorUrl,
    dashboardUrl: process.env.AGENTLENS_DASHBOARD_URL || DEFAULT_CONFIG.dashboardUrl,
    apiKey: process.env.AGENTLENS_API_KEY,
  };
}

export function saveConfig(config: Partial<CLIConfig>): void {
  const configPath = path.join(os.homedir(), CONFIG_FILE);
  const existing = getConfig();
  const merged = { ...existing, ...config };

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
