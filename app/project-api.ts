import { LAYOUT_WRITE_PROTOCOL } from './layout-protocol';
export type Project = {
  id: string;
  name: string;
  templateId?: string;
  appearanceId?: string;
};
export type Projects = {
  projects: Project[];
  defaultId: string;
  templates?: { id: string; name: string; pageCount: number }[];
  archivedProjects?: Project[];
  deletedProjects?: Project[];
};
let projectId: string | undefined;
export function setApiProject(id: string) {
  projectId = id;
}
// Explicit per-tab context: a teammate changing the published default must not
// redirect a running editor's saves, AI proposals, or export to another project.
export function projectFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('X-Prion-Layout-Protocol', LAYOUT_WRITE_PROTOCOL);
  if (projectId) headers.set('X-Prion-Project', projectId);
  return fetch(url, { ...options, headers });
}
export function projectURL(path: string, editing = true) {
  const [address, fragment] = path.split('#', 2);
  const [pathname, query] = address.split('?', 2);
  const params = new URLSearchParams(query);
  if (editing) params.set('studio', '1');
  else params.delete('studio');
  if (projectId) params.set('project', projectId);
  return (
    pathname +
    (params.size ? '?' + params : '') +
    (fragment !== undefined ? '#' + fragment : '')
  );
}
