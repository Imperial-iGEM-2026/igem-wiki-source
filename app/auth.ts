import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from './chatgpt-auth';
import { parseAccessConfig, verifyAccessToken } from './access-token';
export function authMode() {
  return String(
    (env as unknown as Record<string, unknown>).AUTH_MODE || 'chatgpt',
  );
}
export function authConfig() {
  return parseAccessConfig(env as unknown as Record<string, unknown>);
}
export async function getEditorUser() {
  if (authMode() === 'chatgpt') return getChatGPTUser();
  if (authMode() !== 'cloudflare') return null;
  const config = authConfig();
  if (!config) return null;
  const h = await headers();
  const token = h.get('cf-access-jwt-assertion');
  if (!token) return null;
  try {
    return await verifyAccessToken(token, config);
  } catch {
    return null;
  }
}
export async function pageUser() {
  const user = await getEditorUser();
  if (authMode() !== 'chatgpt' && !user) redirect('/auth/login');
  return user;
}
export function loginSettings(returnTo = '/') {
  return {
    provider: authMode() === 'cloudflare' ? 'Cloudflare Access' : 'ChatGPT',
    signIn: '/auth/login?return_to=' + encodeURIComponent(returnTo),
    signOut: '/auth/logout',
  };
}
export async function mayRead() {
  return authMode() === 'chatgpt' || Boolean(await getEditorUser());
}
