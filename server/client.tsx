import { TemplateLibrary } from '../app/template-library';
import { EditorLoading } from '../app/editor-loading';
/* oxlint-disable next/no-html-link-for-pages -- This is the standalone self-hosted client. */
import { projectFetch, setApiProject, type Projects } from '../app/project-api';
import { createRoot } from 'react-dom/client';
import Home from '../app/home';
import type { Blocks } from '../app/content';
import { pageCatalog } from '../app/custom-pages';
import '../app/globals.css';
const root = createRoot(document.getElementById('root')!);
if (
  location.pathname === '/workspace' ||
  new URLSearchParams(location.search).get('studio') === '1'
) {
  root.render(
    <EditorLoading
      workspace={
        location.pathname === '/workspace' ||
        !new URLSearchParams(location.search).has('project')
      }
    />,
  );
}
void (async () => {
  const [response, sessionResponse] = await Promise.all([
    fetch('/api/projects', { cache: 'no-store' }),
    fetch('/api/session', { cache: 'no-store' }),
  ]);
  if (!response.ok) throw Error('Could not load the workspace. Sign in again.');
  const registry = (await response.json()) as Projects;
  if (!sessionResponse.ok) throw Error('Sign in again to continue.');
  const session = (await sessionResponse.json()) as {
    user: { id: string; name: string };
  };
  const params = new URLSearchParams(location.search);
  if (
    location.pathname === '/workspace' ||
    !registry.projects.length ||
    (params.get('studio') === '1' && !params.has('project'))
  ) {
    root.render(
      <TemplateLibrary initial={registry} name={session.user.name} />,
    );
    return null;
  }
  const id =
    new URLSearchParams(location.search).get('project') || registry.defaultId;
  if (!registry.projects.some((p: { id: string }) => p.id === id))
    throw Error('This project does not exist.');
  setApiProject(id);
  return {
    session,
    contentResponse: await projectFetch('/api/content', { cache: 'no-store' }),
  };
})()
  .then(async (responses) => {
    if (!responses) return;
    const { session, contentResponse } = responses;
    if (!contentResponse.ok)
      throw Error(
        'Cloudflare Access could not verify your account. Sign in through the protected hostname.',
      );
    const content = (await contentResponse.json()) as {
      projectId: string;
      rows: ({ id: string } & Blocks[string])[];
    };
    const data = {} as Blocks;
    for (const row of content.rows) data[row.id] = row;
    const pathname = location.pathname.replace(/\/$/, '') || '/';
    const page = pageCatalog(data).find((p) => '/' + p.slug === pathname);
    if (pathname !== '/' && !page) {
      root.render(
        <main>
          <h1>Page not found</h1>
          <a href="/">Return home</a>
        </main>,
      );
      return;
    }
    root.render(
      <Home
        projectId={content.projectId}
        user={session.user}
        wiki={page}
        initialData={data}
        startEditing={
          new URLSearchParams(location.search).get('studio') === '1'
        }
        login={{
          provider: 'Cloudflare Access',
          signIn: '/auth/login',
          signOut: '/auth/logout',
        }}
      />,
    );
  })
  .catch((error: Error) =>
    root.render(
      <main style={{ padding: 40 }}>
        <h1>Sign in to the workspace</h1>
        <p>{error.message}</p>
        <a href="/auth/login">Continue with Cloudflare Access</a>
      </main>,
    ),
  );
