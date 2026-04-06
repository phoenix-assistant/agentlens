import { z } from 'zod';

export const ConfigSchema = z.object({
  port: z.number().default(3100),
  host: z.string().default('0.0.0.0'),
  
  // Storage
  storage: z.enum(['memory', 'clickhouse']).default('memory'),
  
  // ClickHouse
  clickhouse: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(8123),
    database: z.string().default('agentlens'),
    username: z.string().default('default'),
    password: z.string().default(''),
  }).default({}),
  
  // Redis (for real-time)
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
  }).default({}),
  
  // API
  apiKey: z.string().optional(),
  corsOrigins: z.array(z.string()).default(['*']),
  
  // Retention
  retentionDays: z.number().default(30),
});

export type CollectorConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): CollectorConfig {
  return ConfigSchema.parse({
    port: parseInt(process.env.PORT || '3100', 10),
    host: process.env.HOST || '0.0.0.0',
    storage: process.env.STORAGE || 'memory',
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
      database: process.env.CLICKHOUSE_DB || 'agentlens',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    apiKey: process.env.API_KEY,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
    retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
  });
}
