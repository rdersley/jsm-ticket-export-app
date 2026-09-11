import { completeMicrosoftConnect, failMicrosoftConnect } from './services/microsoftOAuth.js';

const json = (statusCode, body) => ({
  statusCode,
  contentType: 'application/json',
  headers: {
    'Cache-Control': ['no-store']
  },
  body: JSON.stringify(body)
});

export async function handler(request) {
  let payload = {};
  try {
    payload = request?.body ? JSON.parse(request.body) : {};
  } catch {
    return json(400, { ok: false, error: 'Invalid callback payload.' });
  }

  const state = String(payload.state || '').trim();
  if (!state) return json(400, { ok: false, error: 'Missing Microsoft OAuth state.' });

  if (payload.error) {
    const error = new Error(String(payload.errorDescription || payload.error));
    await failMicrosoftConnect(state, error);
    return json(200, { ok: false, error: error.message });
  }

  try {
    const connection = await completeMicrosoftConnect({ code: payload.code, state });
    return json(200, { ok: true, email: connection.email || '' });
  } catch (error) {
    await failMicrosoftConnect(state, error);
    return json(200, { ok: false, error: String(error?.message || error) });
  }
}
