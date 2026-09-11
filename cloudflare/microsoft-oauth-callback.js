export default {
  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const error = url.searchParams.get('error') || '';
    const errorDescription = url.searchParams.get('error_description') || '';

    const payload = JSON.stringify({
      type: 'nuvriqo-microsoft-oauth',
      code,
      state,
      error,
      errorDescription
    }).replace(/</g, '\\u003c');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nuvriqo Microsoft 365 Connection</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f7f8f9;color:#172b4d;display:grid;place-items:center;min-height:100vh}
    main{background:white;border:1px solid #dfe1e6;border-radius:12px;padding:28px;max-width:520px;box-shadow:0 4px 16px rgba(9,30,66,.08)}
    h1{font-size:22px;margin:0 0 10px}p{line-height:1.5;margin:0}
  </style>
</head>
<body>
  <main>
    <h1>${error ? 'Microsoft connection was not completed' : 'Microsoft 365 connected'}</h1>
    <p id="status">${error ? 'You can close this window and try again from Jira.' : 'Finishing the connection in Jira…'}</p>
  </main>
  <script>
    const payload = ${payload};
    if (window.opener) {
      window.opener.postMessage(payload, '*');
      setTimeout(() => window.close(), 600);
    } else {
      document.getElementById('status').textContent = 'Return to Jira to finish the connection.';
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
