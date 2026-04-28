import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';

interface CACert {
  cert: string;
  key: string;
}

let cachedCA: CACert | null = null;
const certCache = new Map<string, tls.SecureContext>();

/**
 * Get or create the local CA certificate
 */
export function getOrCreateCA(caDir: string): CACert {
  if (cachedCA) return cachedCA;

  const certPath = path.join(caDir, 'ca.pem');
  const keyPath = path.join(caDir, 'ca-key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    cachedCA = {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
    };
    return cachedCA;
  }

  // Generate new CA
  fs.mkdirSync(caDir, { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [{ name: 'commonName', value: 'AgentLens Local CA' }, { name: 'organizationName', value: 'AgentLens' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(certPath, certPem);
  fs.writeFileSync(keyPath, keyPem);

  cachedCA = { cert: certPem, key: keyPem };
  return cachedCA;
}

/**
 * Generate a TLS context for a specific hostname, signed by our CA
 */
export function getTLSContextForHost(hostname: string, caDir: string): tls.SecureContext {
  const cached = certCache.get(hostname);
  if (cached) return cached;

  const ca = getOrCreateCA(caDir);
  const caCert = forge.pki.certificateFromPem(ca.cert);
  const caKey = forge.pki.privateKeyFromPem(ca.key);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const ctx = tls.createSecureContext({
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
    ca: ca.cert,
  });

  certCache.set(hostname, ctx);
  return ctx;
}

/**
 * Clear cert cache (for testing)
 */
export function clearCertCache(): void {
  certCache.clear();
  cachedCA = null;
}
