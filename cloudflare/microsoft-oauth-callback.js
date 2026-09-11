const decodeBase64Url = value => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
};

const callbackFromState = state => {
  const parts = String(state || '').split('.');
  if (parts.length < 2) return '';
  try {
    const callback = decodeBase64Url(parts.slice(1).join('.'));
    const url = new URL(callback);
    const allowed = url.protocol === 'https:' && (
      url.hostname.endsWith('.webtrigger.atlassian.app') ||
      url.hostname.endsWith('.hello.atlassian-dev.net')
    );
    return allowed ? url.toString() : '';
  } catch {
    return '';
  }
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const error = url.searchParams.get('error') || '';
    const errorDescription = url.searchParams.get('error_description') || '';
    const callbackUrl = callbackFromState(state);

    const relayPayload = { code, state, error, errorDescription };
    let relayOk = false;
    let relayMessage = '';

    if (callbackUrl) {
      try {
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(relayPayload)
        });
        relayOk = response.ok;
        if (!response.ok) relayMessage = `Forge callback returned ${response.status}.`;
      } catch (relayError) {
        relayMessage = relayError?.message || 'Could not reach the Forge callback.';
      }
    } else {
      relayMessage = 'The Jira callback address was missing or invalid.';
    }

    const success = !error && relayOk;
    const title = success ? 'Microsoft 365 connected' : 'Microsoft connection was not completed';
    const status = success
      ? 'You can close this tab and return to Jira. The connection will update automatically.'
      : (errorDescription || relayMessage || error || 'Return to Jira and try again.');

    const legacyPayload = JSON.stringify({
      type: 'nuvriqo-microsoft-oauth',
      code,
      state,
      error: error || (!relayOk ? 'callback_failed' : ''),
      errorDescription: errorDescription || relayMessage
    }).replace(/</g, '\\u003c');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nuvriqo Microsoft 365 Connection</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f7f8f9;color:#172b4d;display:grid;place-items:center;min-height:100vh}
    main{background:white;border:1px solid #dfe1e6;border-radius:12px;padding:28px;max-width:540px;box-shadow:0 4px 16px rgba(9,30,66,.08)}
    h1{font-size:22px;margin:0 0 10px}p{line-height:1.5;margin:0}
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p id="status">${String(status).replace(/</g, '&lt;')}</p>
  </main>
  <script>
    const payload = ${legacyPayload};
    if (window.opener) {
      try { window.opener.postMessage(payload, '*'); } catch {}
    }
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'no-store, max-age=0',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    });
  }
};
