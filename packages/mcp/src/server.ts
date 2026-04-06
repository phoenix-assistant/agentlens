#!/usr/bin/env node
/**
 * AgentLens MCP Server
 * 
 * Provides tools for AI agents (Claude Code, Codex, etc.) to query
 * their own traces, stats, and observability data without leaving the session.
 * 
 * Install in Claude Code:
 *   claude mcp add agentlens -- npx @agentlens/mcp
 * 
 * Or in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "agentlens": {
 *         "command": "npx",
 *         "args": ["@agentlens/mcp"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const COLLECTOR_URL = process.env.AGENTLENS_URL || 'http://localhost:3100';

// Helper to fetch from collector
async function fetchCollector(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(path, COLLECTOR_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Format helpers
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatCost(c: number): string {
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Create server
const server = new Server(
  { name: 'agentlens', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'agentlens_stats',
      description: 'Get AgentLens statistics summary. Shows total traces, tokens, cost, latency, error rate.',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Time range in hours (default: 1)' },
          agent_id: { type: 'string', description: 'Filter by agent ID' },
        },
      },
    },
    {
      name: 'agentlens_agents',
      description: 'List all agents with their stats (traces, tokens, cost, latency, errors).',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Time range in hours (default: 24)' },
          limit: { type: 'number', description: 'Max agents to return (default: 10)' },
        },
      },
    },
    {
      name: 'agentlens_models',
      description: 'Get stats broken down by model (gpt-4o, claude-3-5-sonnet, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Time range in hours (default: 24)' },
        },
      },
    },
    {
      name: 'agentlens_traces',
      description: 'List recent traces with status, latency, cost.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of traces (default: 10)' },
          status: { type: 'string', enum: ['success', 'error', 'running'], description: 'Filter by status' },
          agent_id: { type: 'string', description: 'Filter by agent ID' },
        },
      },
    },
    {
      name: 'agentlens_trace',
      description: 'Get details for a specific trace including events timeline.',
      inputSchema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string', description: 'Trace ID to fetch' },
        },
        required: ['trace_id'],
      },
    },
    {
      name: 'agentlens_errors',
      description: 'List recent errors across all agents.',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Time range in hours (default: 24)' },
          limit: { type: 'number', description: 'Max errors to return (default: 10)' },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'agentlens_stats': {
        const hours = (args?.hours as number) || 1;
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const endTime = new Date().toISOString();
        
        const params: Record<string, string> = { start_time: startTime, end_time: endTime };
        if (args?.agent_id) params.agent_id = args.agent_id as string;
        
        const data = await fetchCollector('/v1/stats/summary', params);
        
        return {
          content: [{
            type: 'text',
            text: `## AgentLens Stats (${hours}h)

| Metric | Value |
|--------|-------|
| Total Traces | ${formatNumber(data.totalTraces || 0)} |
| Total Tokens | ${formatNumber(data.totalTokens || 0)} |
| Total Cost | ${formatCost(data.totalCost || 0)} |
| Avg Latency | ${formatDuration(data.avgLatency || 0)} |
| Error Rate | ${((data.errorRate || 0) * 100).toFixed(1)}% |
| Active Agents | ${data.activeAgents || 0} |`,
          }],
        };
      }

      case 'agentlens_agents': {
        const hours = (args?.hours as number) || 24;
        const limit = (args?.limit as number) || 10;
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        const data = await fetchCollector('/v1/agents', {
          start_time: startTime,
          end_time: new Date().toISOString(),
        });
        
        const agents = (data.agents || []).slice(0, limit);
        
        let text = `## Agents (${hours}h)\n\n| Agent | Traces | Tokens | Cost | Avg Latency | Errors |\n|-------|--------|--------|------|-------------|--------|\n`;
        
        for (const a of agents) {
          const errRate = a.totalTraces > 0 ? ((a.errorCount / a.totalTraces) * 100).toFixed(1) : '0.0';
          text += `| ${a.name || a.id} | ${formatNumber(a.totalTraces)} | ${formatNumber(a.totalTokens || 0)} | ${formatCost(a.totalCost || 0)} | ${formatDuration(a.avgLatency || 0)} | ${errRate}% |\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      case 'agentlens_models': {
        const hours = (args?.hours as number) || 24;
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        
        const data = await fetchCollector('/v1/agents', {
          start_time: startTime,
          end_time: new Date().toISOString(),
        });
        
        // Aggregate by model
        const modelMap = new Map<string, any>();
        for (const a of data.agents || []) {
          const model = a.model || 'unknown';
          const existing = modelMap.get(model) || { traces: 0, tokens: 0, cost: 0, errors: 0 };
          existing.traces += a.totalTraces || 0;
          existing.tokens += a.totalTokens || 0;
          existing.cost += a.totalCost || 0;
          existing.errors += a.errorCount || 0;
          modelMap.set(model, existing);
        }
        
        const models = Array.from(modelMap.entries())
          .sort((a, b) => b[1].traces - a[1].traces)
          .slice(0, 10);
        
        let text = `## Models (${hours}h)\n\n| Model | Traces | Tokens | Cost | Errors |\n|-------|--------|--------|------|--------|\n`;
        
        for (const [model, stats] of models) {
          const errRate = stats.traces > 0 ? ((stats.errors / stats.traces) * 100).toFixed(1) : '0.0';
          text += `| ${model} | ${formatNumber(stats.traces)} | ${formatNumber(stats.tokens)} | ${formatCost(stats.cost)} | ${errRate}% |\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      case 'agentlens_traces': {
        const limit = (args?.limit as number) || 10;
        const params: Record<string, string> = {
          limit: String(limit),
          start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          end_time: new Date().toISOString(),
        };
        if (args?.status) params.status = args.status as string;
        if (args?.agent_id) params.agent_id = args.agent_id as string;
        
        const data = await fetchCollector('/v1/traces', params);
        const traces = data.traces || [];
        
        let text = `## Recent Traces\n\n| Status | Trace ID | Agent | Latency | Cost |\n|--------|----------|-------|---------|------|\n`;
        
        for (const t of traces) {
          const status = t.status === 'success' ? '✓' : t.status === 'error' ? '✗' : '◐';
          text += `| ${status} | ${(t.trace_id || '').slice(0, 8)}... | ${t.agent_name || 'unknown'} | ${formatDuration(t.latency_ms || 0)} | ${formatCost(t.total_cost || 0)} |\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      case 'agentlens_trace': {
        const traceId = args?.trace_id as string;
        if (!traceId) throw new Error('trace_id is required');
        
        const data = await fetchCollector(`/v1/traces/${traceId}`);
        const { trace, events } = data;
        
        let text = `## Trace: ${trace.trace_id}\n\n`;
        text += `**Status:** ${trace.status}\n`;
        text += `**Agent:** ${trace.agent_name || trace.agent_id || 'unknown'}\n`;
        text += `**Provider:** ${trace.provider || 'unknown'}\n`;
        text += `**Model:** ${trace.model || 'unknown'}\n`;
        text += `**Latency:** ${formatDuration(trace.latency_ms || 0)}\n`;
        text += `**Tokens:** ${formatNumber(trace.input_tokens || 0)} in / ${formatNumber(trace.output_tokens || 0)} out\n`;
        text += `**Cost:** ${formatCost(trace.total_cost || 0)}\n`;
        
        if (trace.error_message) {
          text += `\n**Error:** ${trace.error_message}\n`;
        }
        
        if (events && events.length > 0) {
          text += `\n### Events (${events.length})\n\n`;
          for (const e of events.slice(0, 20)) {
            text += `- **${e.event_type}** at ${new Date(e.timestamp).toLocaleTimeString()}`;
            if (e.agent?.name) text += ` (${e.agent.name})`;
            if (e.tool?.name) text += ` - tool: ${e.tool.name}`;
            text += '\n';
          }
        }
        
        return { content: [{ type: 'text', text }] };
      }

      case 'agentlens_errors': {
        const hours = (args?.hours as number) || 24;
        const limit = (args?.limit as number) || 10;
        
        const data = await fetchCollector('/v1/traces', {
          status: 'error',
          limit: String(limit),
          start_time: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
          end_time: new Date().toISOString(),
        });
        
        const traces = data.traces || [];
        
        if (traces.length === 0) {
          return { content: [{ type: 'text', text: `No errors in the last ${hours}h! 🎉` }] };
        }
        
        let text = `## Recent Errors (${hours}h)\n\n`;
        
        for (const t of traces) {
          text += `### ${(t.trace_id || '').slice(0, 8)}... - ${t.agent_name || 'unknown'}\n`;
          text += `- **Error:** ${t.error_message || 'Unknown error'}\n`;
          text += `- **Time:** ${new Date(t.timestamp).toLocaleString()}\n`;
          text += `- **Model:** ${t.model || 'unknown'}\n\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}\n\nMake sure the AgentLens collector is running at ${COLLECTOR_URL}`,
      }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentLens MCP server running');
}

main().catch(console.error);
