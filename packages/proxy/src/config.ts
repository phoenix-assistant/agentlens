/**
 * Proxy configuration
 */
export interface ProxyConfig {
  /** Proxy listen port */
  port: number;
  /** AgentLens collector URL */
  collectorUrl: string;
  /** Directory for CA cert/key */
  caDir: string;
  /** Hosts to intercept (MITM). If empty, uses default AI_HOSTS */
  interceptHosts?: string[];
  /** Enable verbose logging */
  verbose?: boolean;
}

export const DEFAULT_CONFIG: ProxyConfig = {
  port: 8877,
  collectorUrl: 'http://localhost:3100/v1/events',
  caDir: `${process.env.HOME || '~'}/.agentlens/ca`,
};
