import { describe, it, expect, afterAll } from 'vitest';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { createProxyServer } from '../src/proxy-server';
import { proxyCostCalc } from '../src/cost';

describe('proxyCostCalc', () => {
  it('calculates GPT-4o cost', () => {
    const cost = proxyCostCalc('gpt-4o', 1000, 500);
    // 1000 * 2.5/1M + 500 * 10/1M = 0.0025 + 0.005 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it('calculates Claude Sonnet cost', () => {
    const cost = proxyCostCalc('claude-sonnet-4-20250514', 1000, 500);
    // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it('returns 0 for unknown model', () => {
    expect(proxyCostCalc('unknown-model', 100, 50)).toBe(0);
  });

  it('returns 0 for undefined model', () => {
    expect(proxyCostCalc(undefined, 100, 50)).toBe(0);
  });
});

describe('createProxyServer', () => {
  it('starts and stops without error', async () => {
    const proxy = createProxyServer({ port: 0, caDir: '/tmp/agentlens-test-ca' });
    // Use a random port for testing
    const server = createProxyServer({ port: 18877, caDir: '/tmp/agentlens-test-ca' });
    await server.start();
    expect(server.stats.requestsIntercepted).toBe(0);
    expect(server.stats.requestsPassthrough).toBe(0);
    await server.stop();
  });

  it('responds to HTTP GET on proxy port', async () => {
    const server = createProxyServer({ port: 18878, caDir: '/tmp/agentlens-test-ca' });
    await server.start();

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:18878/`, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    expect(body).toContain('AgentLens Proxy running');
    await server.stop();
  });

  it('handles CONNECT for non-AI host (passthrough counting)', async () => {
    const server = createProxyServer({ port: 18879, caDir: '/tmp/agentlens-test-ca' });
    await server.start();

    // Send a CONNECT request to a non-AI host — it will fail to connect
    // but should increment passthrough counter
    await new Promise<void>((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 18879,
        method: 'CONNECT',
        path: 'example.com:443',
      });
      req.on('connect', (_res, socket) => {
        socket.destroy();
        resolve();
      });
      req.on('error', () => resolve());
      req.end();
    });

    // Give it a moment
    await new Promise(r => setTimeout(r, 100));
    expect(server.stats.requestsPassthrough).toBe(1);
    await server.stop();
  });
});
