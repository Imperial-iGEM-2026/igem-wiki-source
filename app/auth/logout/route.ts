import { authMode, authConfig } from '../../auth';
export async function GET(request: Request) {
  if (authMode() === 'chatgpt')
    return Response.redirect(
      new URL('/signout-with-chatgpt?return_to=%2F', request.url),
      302,
    );
  const c = authConfig();
  return c
    ? Response.redirect(c.origin + '/cdn-cgi/access/logout', 302)
    : new Response('Authentication not configured', { status: 503 });
}
