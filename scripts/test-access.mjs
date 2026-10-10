import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { parseAccessConfig, verifyAccessToken } from '../app/access-token.ts';
const config = parseAccessConfig({
  CF_ACCESS_TEAM_DOMAIN: 'https://igem-imperial-2026.cloudflareaccess.com',
  CF_ACCESS_AUD: 'test-audience',
  CF_ACCESS_ORIGIN: 'https://wiki.example.test',
});
assert.ok(config);
assert.equal(
  parseAccessConfig({
    CF_ACCESS_TEAM_DOMAIN: 'https://evil.example',
    CF_ACCESS_AUD: 'test-audience',
    CF_ACCESS_ORIGIN: 'https://wiki.example.test',
  }),
  null,
);
const key = await generateKeyPair('RS256');
async function token(changes = {}) {
  return new SignJWT({ email: 'researcher@example.test', ...changes })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('test-user')
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key.privateKey);
}
assert.equal(
  (await verifyAccessToken(await token(), config, key.publicKey)).userId,
  'cf:test-user',
);
await assert.rejects(() => verifyAccessToken('invalid', config, key.publicKey));
await assert.rejects(async () =>
  verifyAccessToken(
    await token(),
    { ...config, audience: 'other-app' },
    key.publicKey,
  ),
);
await assert.rejects(async () =>
  verifyAccessToken(
    await token(),
    { ...config, issuer: 'https://other.cloudflareaccess.com' },
    key.publicKey,
  ),
);
await assert.rejects(async () =>
  verifyAccessToken(await token({ email: null }), config, key.publicKey),
);
const wrongKey = await generateKeyPair('RS256');
await assert.rejects(async () =>
  verifyAccessToken(await token(), config, wrongKey.publicKey),
);
const expired = await new SignJWT({ email: 'researcher@example.test' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('test-user')
  .setIssuer(config.issuer)
  .setAudience(config.audience)
  .setIssuedAt(1)
  .setExpirationTime(2)
  .sign(key.privateKey);
await assert.rejects(() => verifyAccessToken(expired, config, key.publicKey));
console.log(
  'Access tests passed: valid user, invalid token, wrong audience/issuer/signature, missing identity, expired token, invalid configuration.',
);
