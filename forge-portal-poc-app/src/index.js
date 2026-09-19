import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

resolver.define('probe:context', async ({ context }) => ({
  ok: true,
  accountId: context?.accountId || '',
  accountType: context?.accountType || '',
  portalId: context?.extension?.portal?.id || context?.portal?.id || '',
  location: context?.extension?.location || context?.location || ''
}));

resolver.define('probe:customer-api', async ({ context }) => {
  const output = {
    ok: false,
    accountId: context?.accountId || '',
    accountType: context?.accountType || '',
    status: null,
    requestCount: null,
    error: ''
  };

  try {
    const response = await api.asUser().requestJira(
      route`/rest/servicedeskapi/request?limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    output.status = response.status;
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    output.requestCount = Array.isArray(body?.values) ? body.values.length : null;
    output.ok = response.ok;
    if (!response.ok) output.error = body?.errorMessage || body?.message || raw.slice(0, 180);
  } catch (error) {
    output.error = error?.message || String(error);
  }

  return output;
});

export const handler = resolver.getDefinitions();
