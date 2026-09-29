import { createHmac, timingSafeEqual } from 'node:crypto';

// The bridge accepts the current token and, while a release is rotating it,
// the next one. The release adds PORTAL_BRIDGE_TOKEN_NEXT, moves the Portal
// Reports app onto it, then promotes it, so the portal app never holds a
// token the bridge rejects.
export function bridgeSecrets(env = process.env) {
  return [...new Set([env.PORTAL_BRIDGE_TOKEN_NEXT, env.PORTAL_BRIDGE_TOKEN].map(v => String(v || '')).filter(Boolean))];
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthorized(header, secrets) {
  return secrets.some(secret => safeEqual(header, `Bearer ${secret}`));
}

// Links are signed with the newest secret, so they survive the promotion.
export function signDownload(payload, secrets) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secrets[0]).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyDownload(token, secrets, now = Date.now()) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new Error('Invalid download link.');
  const valid = secrets.some(secret => safeEqual(signature, createHmac('sha256', secret).update(encoded).digest('base64url')));
  if (!valid) throw new Error('Invalid download link.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload?.accountId || !(payload?.reportId || payload?.jobId) || Number(payload?.exp || 0) < now) {
    throw new Error('This download link has expired.');
  }
  return payload;
}
