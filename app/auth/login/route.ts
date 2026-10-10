import { authMode, authConfig, getEditorUser } from '../../auth';
export async function GET(request: Request) {
  const url = new URL(request.url);
  let path = url.searchParams.get('return_to') || '/';
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.startsWith('/auth/')
  )
    path = '/';
  try {
    const target = new URL(path, 'https://return.local');
    if (target.origin !== 'https://return.local') path = '/';
    else path = target.pathname + target.search + target.hash;
  } catch {
    path = '/';
  }
  if (authMode() === 'chatgpt')
    return Response.redirect(
      new URL(
        '/signin-with-chatgpt?return_to=' + encodeURIComponent(path),
        url,
      ),
      302,
    );
  const config = authConfig();
  if (!config)
    return new Response(
      'Cloudflare Access is not configured. The administrator must set the team domain, application audience, and protected origin.',
      { status: 503 },
    );
  if (await getEditorUser())
    return Response.redirect(new URL(path, config.origin), 302);
  if (url.origin !== config.origin)
    return Response.redirect(new URL(path, config.origin), 302);
  return new Response(
    'Cloudflare Access did not provide a valid identity. Protect this hostname and all paths with an Access Allow policy before enabling Cloudflare authentication.',
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}
