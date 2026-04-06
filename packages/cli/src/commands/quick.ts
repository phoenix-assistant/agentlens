/**
 * Quick inline commands for use inside AI agent sessions
 * 
 * These are designed to be fast, produce minimal output, and work
 * well when an AI agent runs them via shell.
 * 
 * Usage (inside Claude Code, Codex, etc.):
 *   agentlens q stats
 *   agentlens q traces
 *   agentlens q errors
 *   agentlens q agents
 *   agentlens q models
 */

import { getConfig } from '../config';

type QuickCommand = 'stats' | 'traces' | 'errors' | 'agents' | 'models' | 'cost';

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatCost(c: number): string {
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export async function quick(command: QuickCommand, options: { hours?: number; json?: boolean } = {}): Promise<void> {
  const config = getConfig();
  const baseUrl = config.collectorUrl;
  const hours = options.hours || 24;
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const endTime = new Date().toISOString();

  try {
    switch (command) {
      case 'stats': {
        const res = await fetch(`${baseUrl}/v1/stats/summary?start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(d, null, 2));
        } else {
          console.log(`Traces: ${formatNum(d.totalTraces || 0)} | Tokens: ${formatNum(d.totalTokens || 0)} | Cost: ${formatCost(d.totalCost || 0)} | Latency: ${formatDur(d.avgLatency || 0)} | Errors: ${((d.errorRate || 0) * 100).toFixed(1)}%`);
        }
        break;
      }

      case 'traces': {
        const res = await fetch(`${baseUrl}/v1/traces?limit=5&start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(d.traces, null, 2));
        } else {
          for (const t of d.traces || []) {
            const status = t.status === 'success' ? '✓' : t.status === 'error' ? '✗' : '◐';
            console.log(`${status} ${(t.trace_id || '').slice(0, 8)} ${(t.agent_name || 'agent').padEnd(16)} ${formatDur(t.latency_ms || 0).padStart(6)} ${formatCost(t.total_cost || 0)}`);
          }
        }
        break;
      }

      case 'errors': {
        const res = await fetch(`${baseUrl}/v1/traces?status=error&limit=5&start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(d.traces, null, 2));
        } else {
          const traces = d.traces || [];
          if (traces.length === 0) {
            console.log('No errors in last 24h ✓');
          } else {
            for (const t of traces) {
              console.log(`✗ ${(t.trace_id || '').slice(0, 8)} ${t.agent_name || 'agent'}: ${(t.error_message || 'error').slice(0, 50)}`);
            }
          }
        }
        break;
      }

      case 'agents': {
        const res = await fetch(`${baseUrl}/v1/agents?start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(d.agents, null, 2));
        } else {
          for (const a of (d.agents || []).slice(0, 5)) {
            const err = a.totalTraces > 0 ? ((a.errorCount / a.totalTraces) * 100).toFixed(0) : '0';
            console.log(`${(a.name || a.id).padEnd(20)} ${formatNum(a.totalTraces).padStart(6)} traces  ${formatCost(a.totalCost || 0).padStart(8)}  ${err}% err`);
          }
        }
        break;
      }

      case 'models': {
        const res = await fetch(`${baseUrl}/v1/agents?start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        
        // Aggregate by model
        const modelMap = new Map<string, { traces: number; cost: number }>();
        for (const a of d.agents || []) {
          const m = a.model || 'unknown';
          const ex = modelMap.get(m) || { traces: 0, cost: 0 };
          ex.traces += a.totalTraces || 0;
          ex.cost += a.totalCost || 0;
          modelMap.set(m, ex);
        }
        
        const models = Array.from(modelMap.entries()).sort((a, b) => b[1].traces - a[1].traces);
        
        if (options.json) {
          console.log(JSON.stringify(Object.fromEntries(models), null, 2));
        } else {
          for (const [model, stats] of models.slice(0, 5)) {
            console.log(`${model.padEnd(28)} ${formatNum(stats.traces).padStart(6)} traces  ${formatCost(stats.cost).padStart(8)}`);
          }
        }
        break;
      }

      case 'cost': {
        const res = await fetch(`${baseUrl}/v1/stats/summary?start_time=${startTime}&end_time=${endTime}`);
        const d = await res.json();
        console.log(formatCost(d.totalCost || 0));
        break;
      }

      default:
        console.error(`Unknown command: ${command}. Use: stats, traces, errors, agents, models, cost`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
