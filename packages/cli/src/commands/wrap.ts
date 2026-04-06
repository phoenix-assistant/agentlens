import { writeFileSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface WrapOptions {
  shell: string;
  uninstall?: boolean;
}

const WRAPPERS: Record<string, { alias: string; description: string }> = {
  claude: {
    alias: 'claude="agentlens trace --name claude --provider anthropic --json -- claude"',
    description: 'Claude CLI (Anthropic)',
  },
  ollama: {
    alias: 'ollama="agentlens trace --name ollama --provider ollama -- ollama"',
    description: 'Ollama (Local LLMs)',
  },
  'gh-copilot': {
    alias:
      'alias ghc="agentlens trace --name gh-copilot --provider openai -- gh copilot"',
    description: 'GitHub Copilot CLI',
  },
};

const SHELL_CONFIGS: Record<string, string> = {
  bash: '.bashrc',
  zsh: '.zshrc',
  fish: '.config/fish/config.fish',
};

export async function wrapCommand(
  tool: string,
  options: WrapOptions
): Promise<void> {
  const wrapper = WRAPPERS[tool];

  if (!wrapper) {
    console.error(`Unknown tool: ${tool}`);
    console.log('Available tools:', Object.keys(WRAPPERS).join(', '));
    process.exit(1);
  }

  const configFile = SHELL_CONFIGS[options.shell];
  if (!configFile) {
    console.error(`Unknown shell: ${options.shell}`);
    console.log('Available shells:', Object.keys(SHELL_CONFIGS).join(', '));
    process.exit(1);
  }

  const configPath = join(homedir(), configFile);
  const aliasLine = `alias ${wrapper.alias}`;
  const marker = `# AgentLens: ${tool}`;
  const fullLine = `${marker}\n${aliasLine}`;

  if (options.uninstall) {
    uninstallWrapper(configPath, marker);
    console.log(`✓ Removed ${tool} wrapper from ${configPath}`);
    console.log(`  Run 'source ${configPath}' or restart your shell`);
    return;
  }

  installWrapper(configPath, fullLine, marker);
  console.log(`✓ Installed ${tool} wrapper (${wrapper.description})`);
  console.log(`  Added to ${configPath}:`);
  console.log(`    ${aliasLine}`);
  console.log(`  Run 'source ${configPath}' or restart your shell`);
}

function installWrapper(
  configPath: string,
  fullLine: string,
  marker: string
): void {
  let content = '';

  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf-8');

    // Check if already installed
    if (content.includes(marker)) {
      // Replace existing
      const lines = content.split('\n');
      const newLines: string[] = [];
      let skip = false;

      for (const line of lines) {
        if (line.includes(marker)) {
          skip = true;
          newLines.push(fullLine);
        } else if (skip && line.startsWith('alias ')) {
          skip = false;
        } else if (!skip) {
          newLines.push(line);
        }
      }

      content = newLines.join('\n');
    } else {
      // Append
      content = content.trimEnd() + '\n\n' + fullLine + '\n';
    }
  } else {
    content = fullLine + '\n';
  }

  writeFileSync(configPath, content);
}

function uninstallWrapper(configPath: string, marker: string): void {
  if (!existsSync(configPath)) {
    console.log(`Config file not found: ${configPath}`);
    return;
  }

  const content = readFileSync(configPath, 'utf-8');
  const lines = content.split('\n');
  const newLines: string[] = [];
  let skip = false;

  for (const line of lines) {
    if (line.includes(marker)) {
      skip = true;
    } else if (skip && line.startsWith('alias ')) {
      skip = false;
    } else if (!skip) {
      newLines.push(line);
    }
  }

  writeFileSync(configPath, newLines.join('\n'));
}
