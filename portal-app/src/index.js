import Resolver from '@forge/resolver';
import api from '@forge/api';
import { kvs } from '@forge/kvs';

const resolver = new Resolver();
const BRIDGE_URL_KEY = 'portal:bridge-url';
const BRIDGE_TOKEN_KEY = 'portal:bridge-token';

function portalIdFrom(context) {
  const direct = String(context?.extension?.portal?.id || context?.portal?.id || '').trim();
  if (direct) return direct;
  const location = String(context?.extension?.location || context?.location || '').trim();
  const match = location.match(/\/portal\/(\d+)(?:\/|$|\?)/i);
  return match?.[1] || '';
}

async function bridgeConfig() {
  const url = String((await kvs.get(BRIDGE_URL_KEY)) || '').trim();
  const token = String((await kvs.getSecret(BRIDGE_TOKEN_KEY)) || '').trim();
  return { url, token, connected: Boolean(url && token) };
}

async function bridge(action, payload, context) {
  const { url, token, connected } = await bridgeConfig();
  if (!connected) throw new Error('Portal Reports Companion is not connected. Ask a Jira administrator to complete setup.');

  const accountId = String(context?.accountId || '').trim();
  if (!accountId) throw new Error('You must be signed in to use portal reports.');

  const response = await api.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action,
      payload: payload || {},
      accountId,
      portalId: portalIdFrom(context)
    })
  });

  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error('Portal Reports service returned an invalid response.'); }

  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Portal Reports service failed (${response.status}).`);
  }
  return body?.data;
}

function decodeSetupCode(code) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(code || '').trim(), 'base64url').toString('utf8'));
  } catch {
    throw new Error('The setup code is not valid.');
  }

  const url = String(parsed?.url || '').trim();
  const token = String(parsed?.token || '').trim();
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { throw new Error('The setup code contains an invalid bridge URL.'); }

  if (parsed?.v !== 1 || !parsedUrl.hostname.endsWith('.webtrigger.atlassian.app') || token.length < 32) {
    throw new Error('The setup code is not valid for Portal Reports Companion.');
  }

  return { url, token, host: parsedUrl.host };
}

resolver.define('companion:status', async () => {
  const { url, connected } = await bridgeConfig();
  let host = '';
  if (url) {
    try { host = new URL(url).host; } catch {}
  }
  return { connected, host };
});

resolver.define('companion:connect', async ({ payload }) => {
  const config = decodeSetupCode(payload?.code);
  await kvs.set(BRIDGE_URL_KEY, config.url);
  await kvs.setSecret(BRIDGE_TOKEN_KEY, config.token);

  const response = await api.fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify({ action: 'ping' })
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok || body?.ok !== true) {
    await kvs.delete(BRIDGE_URL_KEY);
    await kvs.deleteSecret(BRIDGE_TOKEN_KEY);
    throw new Error(body?.error || 'The companion could not connect to Excel Report Manager.');
  }

  return { connected: true, host: config.host };
});

resolver.define('companion:disconnect', async () => {
  await kvs.delete(BRIDGE_URL_KEY);
  await kvs.deleteSecret(BRIDGE_TOKEN_KEY);
  return { connected: false, host: '' };
});

resolver.define('portal:list', async ({ context }) => {
  const reports = await bridge('portal:list', {}, context);
  const { url: bridgeUrl } = await bridgeConfig();

  return Promise.all((reports || []).map(async report => {
    if (!report?.allowDownload || !report?.latest) return report;
    try {
      const link = await bridge('portal:download-link', { reportId: report.id }, context);
      const token = String(link?.token || '').trim();
      return { ...report, downloadUrl: bridgeUrl && token ? `${bridgeUrl}?download=${encodeURIComponent(token)}` : '' };
    } catch {
      return report;
    }
  }));
});

for (const action of [
  'portal:run',
  'portal:job-status',
  'portal:job-cleanup',
  'portal:latest-meta',
  'portal:latest-chunk',
  'portal:download-link'
]) {
  resolver.define(action, ({ payload, context }) => bridge(action, payload, context));
}

export const handler = resolver.getDefinitions();
