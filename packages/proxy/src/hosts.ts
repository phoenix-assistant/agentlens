/**
 * Known AI API hosts to intercept
 */
export const AI_HOSTS: string[] = [
  'api.openai.com',
  'api.anthropic.com',
  'api.githubcopilot.com',
  'copilot-proxy.githubusercontent.com',
  'generativelanguage.googleapis.com',
  'api.cohere.ai',
  'api.mistral.ai',
  'api.together.xyz',
  'api.groq.com',
  'api.fireworks.ai',
  'api.deepseek.com',
  'api.perplexity.ai',
];

const HOST_TO_PROVIDER: Record<string, string> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'api.githubcopilot.com': 'openai',
  'copilot-proxy.githubusercontent.com': 'openai',
  'generativelanguage.googleapis.com': 'google',
  'api.cohere.ai': 'cohere',
  'api.mistral.ai': 'mistral',
  'api.together.xyz': 'together',
  'api.groq.com': 'groq',
  'api.fireworks.ai': 'fireworks',
  'api.deepseek.com': 'deepseek',
  'api.perplexity.ai': 'perplexity',
};

export function isAIHost(hostname: string, customHosts?: string[]): boolean {
  const hosts = customHosts ?? AI_HOSTS;
  return hosts.includes(hostname);
}

export function detectProvider(hostname: string): string {
  return HOST_TO_PROVIDER[hostname] ?? 'unknown';
}

export function detectAgentFromUserAgent(ua?: string): string {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (lower.includes('copilot')) return 'github-copilot';
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('claude')) return 'claude-code';
  if (lower.includes('windsurf') || lower.includes('codeium')) return 'windsurf';
  if (lower.includes('continue')) return 'continue';
  if (lower.includes('aider')) return 'aider';
  return 'unknown';
}
