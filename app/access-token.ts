import { createRemoteJWKSet, jwtVerify } from 'jose';
export type AccessConfig = { issuer: string; audience: string; origin: string };
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function parseAccessConfig(
  values: Record<string, unknown>,
): AccessConfig | null {
  const issuer = String(values.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  const audience = String(values.CF_ACCESS_AUD || '');
  const origin = String(values.CF_ACCESS_ORIGIN || '');
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
    !audience
  )
    return null;
  try {
    const u = new URL(origin);
    if (
      u.protocol !== 'https:' ||
      u.origin !== origin ||
      u.username ||
      u.password
    )
      return null;
  } catch {
    return null;
  }
  return { issuer, audience, origin };
}
export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  keyOverride?: Parameters<typeof jwtVerify>[1],
) {
  let keys = keyOverride;
  if (!keys) {
    if (!keySets.has(config.issuer))
      keySets.set(
        config.issuer,
        createRemoteJWKSet(new URL(config.issuer + '/cdn-cgi/access/certs')),
      );
    keys = keySets.get(config.issuer)!;
  }
  const { payload } = await jwtVerify(token, keys, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'exp', 'iat'],
    clockTolerance: 5,
  });
  if (
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.email !== 'string' ||
    !payload.email.includes('@')
  )
    throw Error('Individual user identity required');
  return {
    userId: 'cf:' + payload.sub,
    displayName: payload.email,
    email: payload.email,
    fullName: null,
  };
}
