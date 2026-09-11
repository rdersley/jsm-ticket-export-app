import { fetch } from '@forge/api';
import { kvs } from '@forge/kvs';
import crypto from 'node:crypto';

const TOKEN_KEY = 'email:microsoft-oauth-token';
const META_KEY = 'email:microsoft-oauth-meta';
const STATE_PREFIX = 'email:microsoft-oauth-state:';
const DEFAULT_REDIRECT_URI = 'https://auth.nuvriqo.com/microsoft/callback';
const SCOPES = 'openid profile offline_access User.Read Mail.Send Mail.Send.Shared';

const base64url = value => Buffer.from(value).toString('base64url');
const clientId = () => String(process.env.MS_CLIENT_ID || '').trim();
const clientSecret = () => String(process.env.MS_CLIENT_SECRET || '').trim();
const redirectUri = () => String(process.env.MS_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();

function requireAppConfig() {
  if (!clientId()) throw new Error('Microsoft Easy Connect client ID is not configured.');
  if (!clientSecret()) throw new Error('Microsoft Easy Connect client secret is not configured.');
}

export async function getMicrosoftConnection() {
  const meta = await kvs.get(META_KEY);
  return meta ? { connected: true, ...meta } : { connected: false };
}

export async function beginMicrosoftConnect() {
  requireAppConfig();
  const state = base64url(crypto.randomBytes(32));
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  await kvs.set(`${STATE_PREFIX}${state}`, {
    verifier,
    expiresAt: Date.now() + (10 * 60 * 1000)
  });

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
    redirectUri: redirectUri()
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

  const stateKey = `${STATE_PREFIX}${safeState}`;
  const pending = await kvs.get(stateKey);
  if (!pending?.verifier || Number(pending.expiresAt || 0) < Date.now()) {
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
  return { connected: true, ...meta };
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
