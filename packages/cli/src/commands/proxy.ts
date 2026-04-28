/**
 * AgentLens Proxy CLI commands
 */
import { execSync, fork } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const PID_FILE = path.join(process.env.HOME || '~', '.agentlens', 'proxy.pid');
const CA_DIR = path.join(process.env.HOME || '~', '.agentlens', 'ca');
const DEFAULT_PORT = 8877;

export function proxyCommand(action: string, opts: { port?: string; shell?: boolean; collectorUrl?: string }) {
  switch (action) {
    case 'start': return proxyStart(opts);
    case 'stop': return proxyStop();
    case 'status': return proxyStatus();
    case 'setup': return proxySetup();
    default:
      console.error(`Unknown proxy action: ${action}. Use: start, stop, status, setup`);
      process.exit(1);
  }
}

function proxyStart(opts: { port?: string; shell?: boolean; collectorUrl?: string }) {
  // Check if already running
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
    try {
      process.kill(pid, 0); // Check if process exists
      console.log(`⚡ Proxy already running (PID ${pid})`);
      printEnvVars(parseInt(opts.port || '') || DEFAULT_PORT, opts.shell);
      return;
    } catch {
      fs.unlinkSync(PID_FILE); // Stale PID file
    }
  }

  // Ensure CA cert exists
  if (!fs.existsSync(path.join(CA_DIR, 'ca.pem'))) {
    console.log('🔐 Generating CA certificate...');
    proxySetup();
  }

  const port = parseInt(opts.port || '') || DEFAULT_PORT;
  const collectorUrl = opts.collectorUrl || 'http://localhost:3100/v1/events';

  // Start proxy as background process
  const proxyScript = path.join(__dirname, '..', '..', 'proxy', 'dist', 'index.js');

  // Fork a child process
  const child = fork(
    path.resolve(__dirname, 'proxy-daemon.js'),
    ['--port', String(port), '--collector', collectorUrl, '--ca-dir', CA_DIR],
    { detached: true, stdio: 'ignore' }
  );

  if (child.pid) {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(child.pid));
    child.unref();
    console.log(`✅ AgentLens Proxy started on port ${port} (PID ${child.pid})`);
  }

  printEnvVars(port, opts.shell);
}

function proxyStop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('⚠️  No proxy running');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  try {
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log(`🛑 Proxy stopped (PID ${pid})`);
  } catch {
    fs.unlinkSync(PID_FILE);
    console.log('⚠️  Proxy was not running (cleaned up stale PID)');
  }
}

function proxyStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('⚪ Proxy not running');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  try {
    process.kill(pid, 0);
    console.log(`🟢 Proxy running (PID ${pid})`);

    // Try to get stats from the proxy
    http.get(`http://127.0.0.1:${DEFAULT_PORT}/`, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => console.log(`   ${data.trim()}`));
    }).on('error', () => {
      console.log('   (could not connect to proxy)');
    });
  } catch {
    console.log('⚪ Proxy not running (stale PID file)');
    fs.unlinkSync(PID_FILE);
  }
}

function proxySetup() {
  try {
    // Dynamic import won't work easily here, so we use the forge approach inline
    const forgePath = require.resolve('node-forge');
    console.log('🔐 Generating CA certificate in', CA_DIR);
    fs.mkdirSync(CA_DIR, { recursive: true });

    // Use the proxy package's TLS module
    const { getOrCreateCA } = require('@agentlens/proxy');
    getOrCreateCA(CA_DIR);

    console.log('✅ CA certificate generated');
    console.log(`   Cert: ${path.join(CA_DIR, 'ca.pem')}`);
    console.log(`   Key:  ${path.join(CA_DIR, 'ca-key.pem')}`);
    console.log('\nTo trust the CA (macOS):');
    console.log(`   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${path.join(CA_DIR, 'ca.pem')}`);
  } catch (e: any) {
    console.error('Failed to generate CA:', e.message);
    process.exit(1);
  }
}

function printEnvVars(port: number, shell?: boolean) {
  if (shell) {
    console.log(`export HTTP_PROXY=http://localhost:${port}`);
    console.log(`export HTTPS_PROXY=http://localhost:${port}`);
  } else {
    console.log(`\nSet these environment variables:`);
    console.log(`   export HTTP_PROXY=http://localhost:${port}`);
    console.log(`   export HTTPS_PROXY=http://localhost:${port}`);
    console.log(`\nOr use: eval $(agentlens proxy start --shell)`);
  }
}
