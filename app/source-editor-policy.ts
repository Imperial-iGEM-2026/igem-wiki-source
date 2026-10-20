import { LAYOUT_WRITE_PROTOCOL } from './layout-protocol';

// Only the outer, authenticated editor uses this capability. A publication
// preview never receives it. Source cannot choose another project or forward
// cookies, authorization headers, connector credentials or arbitrary API calls.
export function sourceEditorRequest(
  url: URL,
  method: string,
  body: unknown,
  project: string,
  origin: string,
): RequestInit | null {
  if (!project || url.origin !== origin) return null;
  const read =
    method === 'GET' &&
    [
      '/api/content',
      '/api/projects',
      '/api/ai/status',
      '/api/ai/chats',
    ].includes(url.pathname);
  const rename =
    method === 'POST' &&
    url.pathname === '/api/projects' &&
    typeof body === 'string' &&
    (() => {
      try {
        const v = JSON.parse(body);
        return v.action === 'rename' && v.id === project;
      } catch {
        return false;
      }
    })();
  const write =
    rename ||
    (method === 'POST' &&
      [
        '/api/content',
        '/api/pages',
        '/api/live',
        '/api/ai/page',
        '/api/ai/css',
        '/api/ai/apply',
      ].includes(url.pathname));
  if (!read && !write) return null;
  if (write && (typeof body !== 'string' || body.length > 24 * 1024 * 1024))
    throw Error('Invalid editor request body.');
  if (write) {
    const value = JSON.parse(body as string);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Invalid editor request.');
    // The parent owns project scope, even if source supplies query/body IDs.
    if ('projectId' in value) value.projectId = project;
    if ('project' in value) value.project = project;
    body = JSON.stringify(value);
  }
  url.searchParams.set('project', project);
  return {
    method,
    ...(write ? { body: body as string } : {}),
    headers: {
      'Content-Type': 'application/json',
      'X-Prion-Project': project,
      'X-Prion-Layout-Protocol': LAYOUT_WRITE_PROTOCOL,
    },
  };
}
