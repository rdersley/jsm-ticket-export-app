import Resolver from '@forge/resolver';
import api from '@forge/api';

const resolver = new Resolver();

function portalIdFrom(context) {
  const direct = String(context?.extension?.portal?.id || context?.portal?.id || '').trim();
  if (direct) return direct;
  const location = String(context?.extension?.location || context?.location || '').trim();
  const match = location.match(/\/portal\/(\d+)(?:\/|$|\?)/i);
  return match?.[1] || '';
}

async function bridge(action, payload, context) {
  const url = String(process.env.PORTAL_BRIDGE_URL || '').trim();
  const token = String(process.env.PORTAL_BRIDGE_TOKEN || '');
  if (!url || !token) throw new Error('Portal Reports service is not configured.');

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

for (const action of [
  'portal:list',
  'portal:run',
  'portal:job-status',
  'portal:job-cleanup',
  'portal:latest-meta',
  'portal:latest-chunk'
]) {
  resolver.define(action, ({ payload, context }) => bridge(action, payload, context));
}

export const handler = resolver.getDefinitions();
