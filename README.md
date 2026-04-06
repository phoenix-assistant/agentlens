# 🔭 AgentLens

**Multi-Agent Observability Platform** — Full visibility into AI agent orchestration, handoffs, failures, and costs across Claude, GPT, Ollama, LangChain, and more.

![AgentLens Dashboard](./docs/images/dashboard-preview.png)

## Features

- 📊 **Real-time Tracing** — Track every agent call, handoff, and decision
- 🔗 **Multi-Agent Support** — Visualize complex orchestration flows
- 💰 **Cost Analytics** — Per-agent and per-trace cost tracking
- ⚡ **Sub-50ms Overhead** — Minimal impact on your agents
- 🔌 **Easy Integration** — Drop-in SDKs for popular frameworks
- 📈 **Production-Ready** — ClickHouse storage, horizontal scaling

## Quick Start

### 1. Deploy with Docker

```bash
# Clone and start
git clone https://github.com/yourusername/agentlens
cd agentlens
cp .env.example .env
docker-compose up -d

# Dashboard: http://localhost:3000
# API: http://localhost:3100
```

### 2. Install SDK

```bash
npm install @agentlens/sdk
# or
pnpm add @agentlens/sdk
```

### 3. Instrument Your Agent

```typescript
import { AgentLensClient } from '@agentlens/sdk';

const lens = new AgentLensClient({
  endpoint: 'http://localhost:3100',
  apiKey: 'your-api-key',
});

// Start a trace
const trace = lens.startTrace({
  session_id: 'user-session-123',
  user_id: 'user-456',
});

// Record agent execution
const span = trace.startSpan({
  agentId: 'my-agent',
  agentName: 'Research Agent',
  provider: 'anthropic',
  modelVersion: 'claude-3-opus',
});

span.recordInput({ prompt_tokens: 1000 });
// ... your agent logic ...
span.recordOutput({ completion_tokens: 500, status: 'success' });
span.end('success', 1234, 0.05); // latency_ms, cost_usd

trace.end('success');
```

## Framework Integrations

### OpenAI

```typescript
import OpenAI from 'openai';
import { AgentLensClient } from '@agentlens/sdk';
import { wrapOpenAI } from '@agentlens/integrations/openai';

const lens = new AgentLensClient({ endpoint: '...', apiKey: '...' });
const openai = new OpenAI();

const { client: instrumentedOpenAI } = wrapOpenAI(openai, {
  client: lens,
  capturePrompts: true,
});

// All calls are now automatically traced
await instrumentedOpenAI.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Anthropic

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from '@agentlens/integrations/anthropic';

const anthropic = new Anthropic();
const { client: instrumentedAnthropic } = wrapAnthropic(anthropic, {
  client: lens,
});
```

### LangChain

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { AgentLensCallback } from '@agentlens/integrations/langchain';

const callback = new AgentLensCallback({ client: lens });

const llm = new ChatOpenAI({
  callbacks: [callback],
});
```

### LangGraph

```typescript
import { wrapLangGraph } from '@agentlens/integrations/langgraph';

const instrumentedGraph = wrapLangGraph(myGraph, {
  client: lens,
  graphName: 'Research Pipeline',
});

await instrumentedGraph.invoke({ query: 'What is quantum computing?' });
```

### Vercel AI SDK

```typescript
import { createAgentLensMiddleware } from '@agentlens/integrations/vercel-ai';

const middleware = createAgentLensMiddleware({ client: lens });
const instrumentedModel = middleware.wrapModel(openai('gpt-4o'), 'gpt-4o');
```

## CLI Tool

### Installation

```bash
# From npm (when published)
npm install -g @agentlens/cli

# Or from source
git clone https://github.com/yourusername/agentlens
cd agentlens
npm install && npm run build
npm link ./packages/cli
```

### Initialize

```bash
agentlens init --url http://localhost:3100
```

### Wrap AI CLIs with Tracing

```bash
# Claude CLI
agentlens wrap "claude 'explain quantum computing'"

# GitHub Copilot
agentlens wrap "gh copilot suggest 'write a test'"

# Ollama
agentlens wrap "ollama run llama3 'hello'"

# Any command
agentlens wrap --name my-agent "python agent.py"
```

### View Traces in Terminal

```bash
# Live stream traces
agentlens tail
agentlens tail --compact --errors

# List recent traces
agentlens list
agentlens list -n 50 --agent my-agent

# View trace details
agentlens view <trace-id> --events
```

### Statistics

```bash
# Summary
agentlens stats           # Last hour
agentlens stats --24h     # Last 24 hours

# Breakdowns
agentlens stats agents    # Per-agent
agentlens stats models    # Per-model
agentlens stats providers # Per-provider
```

### Example Output

```
$ agentlens stats agents --24h

  🤖 Agents (24h)
  ──────────────────────────────────────────────────────────────────────

  AGENT                     TRACES    TOKENS      COST    AVG LAT   ERR%
  ──────────────────────────────────────────────────────────────────────
  claude-cli                   234      1.2M     $3.42      2.1s   1.2%
  github-copilot               156      890K     $1.87      1.4s   0.5%
  my-custom-agent               89      450K     $0.92      3.2s   2.8%
  ollama-llama3                 67      234K     $0.00      5.1s   0.0%
```

```
$ agentlens stats models --24h

  🧠 Models (24h)
  ───────────────────────────────────────────────────────────────────────────

  MODEL                          TRACES    TOKENS      COST    AVG LAT   ERR%
  ───────────────────────────────────────────────────────────────────────────
  claude-3-5-sonnet-20241022        234      1.2M     $3.42      2.1s   1.2%
  gpt-4-turbo                       156      890K     $1.87      1.4s   0.5%
  gpt-4o                             89      450K     $0.92      1.8s   0.8%
  llama3:70b                         67      234K     $0.00      5.1s   0.0%
```

```
$ agentlens tail --compact

14:32:01 [SUCCESS] anthropic claude-cli     2.3s 1.2K tok $0.012
14:32:15 [ERROR  ] openai   copilot         1.1s  800 tok ✗ Rate limit
14:32:22 [SUCCESS] ollama   llama3          5.2s 2.4K tok $0.000
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Your Application                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Claude   │  │  GPT-4   │  │  Ollama  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │             │                 │
│       └─────────────┼─────────────┘                 │
│                     │                               │
│              ┌──────▼──────┐                       │
│              │ AgentLens   │                       │
│              │    SDK      │                       │
│              └──────┬──────┘                       │
└─────────────────────┼───────────────────────────────┘
                      │ HTTP/WebSocket
                      ▼
┌─────────────────────────────────────────────────────┐
│               AgentLens Collector                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │   API    │  │ WebSocket│  │  Alerts  │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       └─────────────┼─────────────┘                │
│                     │                              │
│              ┌──────▼──────┐                       │
│              │ ClickHouse  │                       │
│              └─────────────┘                       │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│               AgentLens Dashboard                   │
│  ┌──────────────────────────────────────────────┐  │
│  │  Traces  │  Agents  │  Analytics  │  Alerts  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEYS` | Comma-separated API keys | |
| `PORT` | Collector port | `3100` |
| `STORE_TYPE` | Storage backend (`memory`, `clickhouse`) | `memory` |
| `CLICKHOUSE_URL` | ClickHouse HTTP URL | `http://localhost:8123` |
| `CLICKHOUSE_DATABASE` | Database name | `agentlens` |

### SDK Configuration

```typescript
const lens = new AgentLensClient({
  endpoint: 'http://localhost:3100',
  apiKey: 'your-api-key',
  
  // Optional
  batchSize: 100,        // Events per batch
  flushInterval: 1000,   // Flush interval (ms)
  timeout: 5000,         // Request timeout (ms)
  retries: 3,            // Retry attempts
  
  // Environment
  environment: 'production',
  release: 'v1.2.3',
});
```

## Development

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Packages

| Package | Description |
|---------|-------------|
| `@agentlens/sdk` | Client SDK for instrumentation |
| `@agentlens/collector` | Event collection service |
| `@agentlens/integrations` | Framework integrations |
| `@agentlens/cli` | Command-line tool |
| `@agentlens/dashboard` | Web dashboard |

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/events` | Ingest single event |
| `POST` | `/v1/events/batch` | Ingest event batch |
| `GET` | `/v1/events` | Query events |
| `GET` | `/v1/traces` | List traces |
| `GET` | `/v1/traces/:id` | Get trace details |
| `GET` | `/v1/agents` | List agents |
| `GET` | `/v1/stats` | Get statistics |
| `GET` | `/v1/stats/summary` | Dashboard summary |

### WebSocket

Connect to `/v1/ws` for real-time event streaming:

```javascript
const ws = new WebSocket('ws://localhost:3100/v1/ws');

// Subscribe to all events
ws.send(JSON.stringify({ type: 'subscribe_all' }));

// Subscribe to specific trace
ws.send(JSON.stringify({ type: 'subscribe', trace_id: 'trace-123' }));

// Receive events
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  console.log('Event:', data);
};
```

## Roadmap

- [x] Core SDK with batching and retries
- [x] ClickHouse storage with materialized views
- [x] React dashboard with real-time updates
- [x] OpenAI/Anthropic integrations
- [x] LangChain/LangGraph integrations
- [x] Vercel AI SDK integration
- [x] CLI tool for tracing
- [x] Docker deployment
- [ ] Kubernetes Helm chart
- [ ] Slack/PagerDuty alerting
- [ ] Cost anomaly detection
- [ ] Session replay
- [ ] A/B testing for prompts

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).

---

Built with ❤️ for the AI agent community.
