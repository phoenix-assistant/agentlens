import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import { nanoid } from 'nanoid';
import { ProxyConfig, DEFAULT_CONFIG } from './config';
import { shouldIntercept } from './interceptor';
import { buildTraceEvent } from './interceptor';
import { emitTraceEvent } from './emitter';
import { getTLSContextForHost, getOrCreateCA } from './tls';

export interface ProxyServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
  readonly stats: ProxyStats;
}

export interface ProxyStats {
  requestsIntercepted: number;
  requestsPassthrough: number;
  totalTokens: number;
  totalCost: number;
}

/**
 * Create and return a proxy server instance
 */
export function createProxyServer(config: Partial<ProxyConfig> = {}): ProxyServer {
  const cfg: ProxyConfig = { ...DEFAULT_CONFIG, ...config };
  const stats: ProxyStats = { requestsIntercepted: 0, requestsPassthrough: 0, totalTokens: 0, totalCost: 0 };

  // Ensure CA exists
  getOrCreateCA(cfg.caDir);

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AgentLens Proxy running\n');
  });

  // Handle CONNECT for HTTPS tunneling
  server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    const [hostname, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr) || 443;

    if (!shouldIntercept(hostname, cfg)) {
      // Pure passthrough — TCP tunnel
      const upstream = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => upstream.destroy());
      stats.requestsPassthrough++;
      return;
    }

    // MITM for AI hosts
    stats.requestsIntercepted++;
    const tlsContext = getTLSContextForHost(hostname, cfg.caDir);

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const tlsSocket = new tls.TLSSocket(clientSocket, {
      isServer: true,
      secureContext: tlsContext,
    });

    tlsSocket.on('error', () => clientSocket.destroy());

    // Now handle the decrypted HTTP request
    const mitmServer = http.createServer();
    mitmServer.emit('connection', tlsSocket);

    tlsSocket.on('data', function onFirstData(chunk: Buffer) {
      tlsSocket.removeListener('data', onFirstData);
      // Re-emit for the http parser
      tlsSocket.unshift(chunk);
      handleMITMRequest(tlsSocket, hostname, port, cfg, stats);
    });
  });

  return {
    get port() { return cfg.port; },
    get stats() { return { ...stats }; },
    start() {
      return new Promise<void>((resolve, reject) => {
        server.listen(cfg.port, '127.0.0.1', () => resolve());
        server.on('error', reject);
      });
    },
    stop() {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

function handleMITMRequest(
  tlsSocket: tls.TLSSocket,
  hostname: string,
  port: number,
  config: ProxyConfig,
  stats: ProxyStats
): void {
  // Parse the incoming HTTP request from the decrypted TLS socket
  const parser = http.createServer();

  // Use a simple approach: read the raw data and forward it
  let requestData = Buffer.alloc(0);

  const httpServer = http.createServer((clientReq, clientRes) => {
    const startTime = Date.now();
    const traceId = nanoid();
    const userAgent = clientReq.headers['user-agent'];
    const isStreaming = clientReq.headers['accept']?.includes('text/event-stream') ?? false;

    // Collect request body
    const reqChunks: Buffer[] = [];
    clientReq.on('data', (chunk: Buffer) => reqChunks.push(chunk));

    clientReq.on('end', () => {
      // Forward to real API
      const options: https.RequestOptions = {
        hostname,
        port,
        path: clientReq.url,
        method: clientReq.method,
        headers: { ...clientReq.headers, host: hostname },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        const resChunks: Buffer[] = [];

        // Stream response back to client in real-time
        clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);

        proxyRes.on('data', (chunk: Buffer) => {
          resChunks.push(chunk);
          clientRes.write(chunk);
        });

        proxyRes.on('end', () => {
          clientRes.end();

          const responseBody = Buffer.concat(resChunks).toString('utf-8');
          const latencyMs = Date.now() - startTime;

          try {
            const event = buildTraceEvent({
              traceId,
              hostname,
              userAgent,
              responseBody,
              statusCode: proxyRes.statusCode || 200,
              latencyMs,
              isStreaming,
            });

            stats.totalTokens += event.total_tokens;
            stats.totalCost += event.cost_usd;

            emitTraceEvent(config.collectorUrl, event);
          } catch {
            // Don't let trace failures break the proxy
          }
        });
      });

      proxyReq.on('error', (err) => {
        clientRes.writeHead(502);
        clientRes.end(`Proxy error: ${err.message}`);
      });

      const reqBody = Buffer.concat(reqChunks);
      if (reqBody.length > 0) proxyReq.write(reqBody);
      proxyReq.end();
    });
  });

  httpServer.emit('connection', tlsSocket);
}
