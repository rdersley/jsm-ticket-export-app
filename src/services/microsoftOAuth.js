import { fetch, webTrigger } from '@forge/api';
import { kvs } from '@forge/kvs';
import crypto from 'node:crypto';

const TOKEN_KEY = 'email:microsoft-oauth-token';
const META_KEY = 'email:microsoft-oauth-meta';
const STATE_PREFIX = 'email:microsoft-oauth-state:';
const RESULT_PREFIX = 'email:microsoft-oauth-result:';
const WEBTRIGGER_KEY = 'microsoft-oauth-callback';
const DEFAULT_REDIRECT_URI = 'https://auth.nuvriqo.com/microsoft/callback';
const SCOPES = 'openid profile offline_access User.Read Mail.Send Mail.Send.Shared';

const base64url = value => Buffer.from(value).toString('base64url');
const fromBase64url = value => Buffer.from(value, 'base64url').toString('utf8');
const clientId = () => String(process.env.MS_CLIENT_ID || '').trim();
const clientSecret = () => String(process.env.MS_CLIENT_SECRET || '').trim();
const redirectUri = () => String(process.env.MS_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();

function requireAppConfig() {
  if (!clientId()) throw new Error('Microsoft Easy Connect client ID is not configured.');
  if (!clientSecret()) throw new Error('Microsoft Easy Connect client secret is not configured.');
}

function parseState(state) {
  const raw = String(state || '').trim();
  const dot = raw.indexOf('.');
  if (dot <= 0) return { nonce: raw, callbackUrl: '' };
  const nonce = raw.slice(0, dot);
  let callbackUrl = '';
  try { callbackUrl = fromBase64url(raw.slice(dot + 1)); } catch {}
  return { nonce, callbackUrl };
}

export function getMicrosoftStateNonce(state) {
  return parseState(state).nonce;
}

async function setConnectResult(nonce, result) {
  if (!nonce) return;
  await kvs.set(`${RESULT_PREFIX}${nonce}`, {
    ...result,
    expiresAt: Date.now() + (15 * 60 * 1000)
  });
}

export async function getMicrosoftConnection() {
  const meta = await kvs.get(META_KEY);
  return meta ? { connected: true, ...meta } : { connected: false };
}

export async function getMicrosoftConnectStatus(requestId) {
  const nonce = String(requestId || '').trim();
  if (!nonce) return { status: 'missing' };
  const result = await kvs.get(`${RESULT_PREFIX}${nonce}`);
  if (!result) return { status: 'pending' };
  if (Number(result.expiresAt || 0) < Date.now()) {
    await kvs.delete(`${RESULT_PREFIX}${nonce}`);
    return { status: 'expired' };
  }
  return result;
}

export async function beginMicrosoftConnect() {
  requireAppConfig();
  const nonce = base64url(crypto.randomBytes(24));
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const callbackUrl = await webTrigger.getUrl(WEBTRIGGER_KEY);
  const state = `${nonce}.${base64url(callbackUrl)}`;

  await kvs.set(`${STATE_PREFIX}${nonce}`, {
    verifier,
    state,
    expiresAt: Date.now() + (10 * 60 * 1000)
  });
  await kvs.delete(`${RESULT_PREFIX}${nonce}`).catch(() => {});

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  return {
    authorizeUrl: `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${params.toString()}`,
    redirectUri: redirectUri(),
    requestId: nonce
  };
}

async function tokenRequest(body) {
  const response = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error_description || ''; } catch {}
    throw new Error(`Microsoft authorization failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

async function readProfile(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Microsoft profile lookup failed (${response.status}).`);
  return response.json();
}

export async function completeMicrosoftConnect({ code, state } = {}) {
  requireAppConfig();
  const safeCode = String(code || '').trim();
  const safeState = String(state || '').trim();
  if (!safeCode || !safeState) throw new Error('Microsoft authorization response is incomplete.');

  const { nonce } = parseState(safeState);
  if (!nonce) throw new Error('Microsoft connection state is invalid.');
  const stateKey = `${STATE_PREFIX}${nonce}`;
  const pending = await kvs.get(stateKey);
  if (!pending?.verifier || pending.state !== safeState || Number(pending.expiresAt || 0) < Date.now()) {
    if (pending) await kvs.delete(stateKey);
    throw new Error('Microsoft connection request has expired. Please connect again.');
  }
  await kvs.delete(stateKey);

  const token = await tokenRequest({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code: safeCode,
    redirect_uri: redirectUri(),
    code_verifier: pending.verifier,
    scope: SCOPES
  });

  if (!token.refresh_token) throw new Error('Microsoft did not return an offline refresh token. Please reconnect and grant access.');
  const profile = await readProfile(token.access_token);
  const email = String(profile.mail || profile.userPrincipalName || '').trim();

  await kvs.setSecret(TOKEN_KEY, JSON.stringify({
    refreshToken: token.refresh_token,
    accessToken: token.access_token,
    expiresAt: Date.now() + (Number(token.expires_in || 3600) * 1000),
    scope: token.scope || SCOPES
  }));

  const meta = {
    email,
    displayName: String(profile.displayName || '').trim(),
    userId: String(profile.id || '').trim(),
    connectedAt: new Date().toISOString()
  };
  await kvs.set(META_KEY, meta);
  const result = { status: 'success', connection: { connected: true, ...meta } };
  await setConnectResult(nonce, result);
  return { connected: true, ...meta, requestId: nonce };
}

export async function failMicrosoftConnect(state, error) {
  const nonce = getMicrosoftStateNonce(state);
  if (!nonce) return;
  await kvs.delete(`${STATE_PREFIX}${nonce}`).catch(() => {});
  await setConnectResult(nonce, {
    status: 'failed',
    message: String(error?.message || error || 'Microsoft 365 connection failed.')
  });
}

export async function disconnectMicrosoft() {
  await kvs.deleteSecret(TOKEN_KEY);
  await kvs.delete(META_KEY);
  return { connected: false };
}

export async function getMicrosoftAccessToken() {
  requireAppConfig();
  const raw = await kvs.getSecret(TOKEN_KEY);
  if (!raw) throw new Error('Microsoft 365 Easy Connect is not connected.');
  let stored;
  try { stored = JSON.parse(raw); } catch { throw new Error('Microsoft 365 connection data is invalid. Please reconnect.'); }

  if (stored.accessToken && Number(stored.expiresAt || 0) > Date.now() + 120000) return stored.accessToken;
  if (!stored.refreshToken) throw new Error('Microsoft 365 refresh token is missing. Please reconnect.');

  const token = await tokenRequest({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
    scope: SCOPES
  });

  const refreshed = {
    refreshToken: token.refresh_token || stored.refreshToken,
    accessToken: token.access_token,
    expiresAt: Date.now() + (Number(token.expires_in || 3600) * 1000),
    scope: token.scope || stored.scope || SCOPES
  };
  await kvs.setSecret(TOKEN_KEY, JSON.stringify(refreshed));
  return refreshed.accessToken;
}
