import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeSecrets, isAuthorized, signDownload, verifyDownload } from '../src/services/bridgeAuth.js';

test('uses the next token first, then the current one', () => {
  assert.deepEqual(bridgeSecrets({ PORTAL_BRIDGE_TOKEN: 'old', PORTAL_BRIDGE_TOKEN_NEXT: 'new' }), ['new', 'old']);
  assert.deepEqual(bridgeSecrets({ PORTAL_BRIDGE_TOKEN: 'old' }), ['old']);
  assert.deepEqual(bridgeSecrets({ PORTAL_BRIDGE_TOKEN: 'same', PORTAL_BRIDGE_TOKEN_NEXT: 'same' }), ['same']);
  assert.deepEqual(bridgeSecrets({}), []);
});

test('accepts either token during a rotation and nothing else', () => {
  const secrets = ['new', 'old'];
  assert.equal(isAuthorized('Bearer old', secrets), true);
  assert.equal(isAuthorized('Bearer new', secrets), true);
  assert.equal(isAuthorized('Bearer other', secrets), false);
  assert.equal(isAuthorized('', secrets), false);
  assert.equal(isAuthorized('Bearer old', []), false);
});

test('download links signed during a rotation still work after promotion', () => {
  const payload = { accountId: 'a1', reportId: 'r1', exp: Date.now() + 60000 };
  const link = signDownload(payload, ['new', 'old']);
  assert.equal(verifyDownload(link, ['new']).reportId, 'r1');
  assert.equal(verifyDownload(signDownload(payload, ['old']), ['new', 'old']).reportId, 'r1');
});

test('rejects tampered, foreign and expired links', () => {
  const link = signDownload({ accountId: 'a1', jobId: 'j1', exp: Date.now() + 60000 }, ['new']);
  const [encoded, signature] = link.split('.');
  const forged = Buffer.from(JSON.stringify({ accountId: 'a2', jobId: 'j1', exp: Date.now() + 60000 })).toString('base64url');
  assert.throws(() => verifyDownload(`${forged}.${signature}`, ['new']), /Invalid/);
  assert.throws(() => verifyDownload(link, ['other']), /Invalid/);
  assert.throws(() => verifyDownload(`${encoded}`, ['new']), /Invalid/);
  const expired = signDownload({ accountId: 'a1', jobId: 'j1', exp: Date.now() - 1 }, ['new']);
  assert.throws(() => verifyDownload(expired, ['new']), /expired/);
});
