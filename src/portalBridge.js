import { handlePortalAction } from './portalCustomer.js';

function headerValue(headers, name) {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': ['application/json'], 'Cache-Control': ['no-store'] },
    body: JSON.stringify(body)
  };
}

export async function trigger(request) {
  const expected = String(process.env.PORTAL_BRIDGE_TOKEN || '');
  const auth = headerValue(request?.headers, 'authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return response(401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const input = request?.body ? JSON.parse(request.body) : {};
    if (input.action === 'ping') return response(200, { ok: true });

    const accountId = String(input.accountId || '').trim();
    if (!accountId) return response(400, { ok: false, error: 'Missing accountId' });

    const portalId = String(input.portalId || '').trim();
    const context = {
      accountId,
      accountType: 'customer',
      extension: { portal: { id: portalId } }
    };
    const data = await handlePortalAction(input.action, input.payload || {}, context);
    return response(200, { ok: true, data });
  } catch (error) {
    return response(400, { ok: false, error: error?.message || 'Portal bridge request failed.' });
  }
}
