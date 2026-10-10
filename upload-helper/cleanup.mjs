import { randomUUID } from 'node:crypto';

function accessRequired(unavailable = false) {
  const error = Error(
    unavailable
      ? 'Sign in to iGEM Uploads in the helper’s browser and check that your account can access this team. Then click “Check sign-in & scan”.'
      : 'Sign in to iGEM Uploads in the browser opened by this helper. Then click “Check sign-in & scan”.',
  );
  error.code = unavailable ? 'STORAGE_ACCESS_REQUIRED' : 'SIGN_IN_REQUIRED';
  return error;
}

export function storageRoute(teamId) {
  if (!/^\d{1,8}$/.test(teamId)) throw Error('Invalid team ID');
  return `https://teams.igem.org/${teamId}/deliverables/wiki/uploads`;
}

export function folderFromURL(href, teamId, parent) {
  const root = new URL(storageRoute(teamId));
  const url = new URL(href, root);
  if (url.origin !== root.origin || url.pathname !== root.pathname) return null;
  const folder = url.searchParams.get('path');
  if (
    !folder ||
    folder.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return null;
  if (parent && !folder.startsWith(parent + '/')) return null;
  return folder;
}

export async function scanStorage(adapter, teamId, team) {
  const folders = [''],
    seen = new Set(),
    files = [];
  for (let index = 0; index < folders.length; index++) {
    const folder = folders[index];
    if (seen.has(folder)) continue;
    seen.add(folder);
    if (seen.size > 1000)
      throw Error(
        'More than 1,000 folders. Scan stopped without deleting anything.',
      );
    const rows = await adapter.list(teamId, folder);
    for (const row of rows) {
      const child = folderFromURL(row.url, teamId, folder);
      if (child) {
        if (!seen.has(child)) folders.push(child);
        continue;
      }
      const url = new URL(row.url);
      if (url.protocol !== 'https:' || url.hostname !== 'static.igem.wiki')
        throw Error('Unrecognized storage entry. Nothing has been deleted.');
      files.push({ ...row, folder });
      if (files.length > 20000)
        throw Error(
          'More than 20,000 files. Scan stopped without deleting anything.',
        );
    }
  }
  return {
    id: randomUUID(),
    teamId,
    team,
    createdAt: Date.now(),
    files,
    folders: seen.size - 1,
    deleted: [],
  };
}

export function confirmCleanup(plan, data, job) {
  if (
    !plan ||
    plan.id !== data.id ||
    plan.teamId !== job.teamId ||
    plan.team !== job.team
  )
    throw Error('Scan this team’s storage again before deleting.');
  if (Date.now() - plan.createdAt > 15 * 60 * 1000)
    throw Error('The preview expired. Scan again.');
  if (data.confirmTeam !== plan.team || data.acknowledged !== true)
    throw Error('Type the exact team name and confirm permanent deletion.');
  if (plan.started)
    throw Error(
      'This deletion was already started. Scan again to review any remaining files.',
    );
}

export async function removeStorage(
  adapter,
  plan,
  onDeleted,
  stopped = () => false,
) {
  plan.started = true;
  for (const file of plan.files) {
    if (stopped())
      throw Error('Cleanup paused. Scan again to review remaining files.');
    await adapter.remove(plan.teamId, file);
    // Record only after the official UI verifies the file is absent.
    plan.deleted.push(file.url);
    await onDeleted(file);
  }
}

export function clearDeletedMappings(job, map, deletedURLs) {
  let changed = false;
  for (const row of job.rows || []) {
    if (!deletedURLs.has(row.url) && !deletedURLs.has(map[row.source]))
      continue;
    delete map[row.source];
    Object.assign(row, {
      url: '',
      attempted: false,
      processingComplete: false,
      uploadError: '',
      rejected: false,
    });
    changed = true;
  }
  for (const [source, url] of Object.entries(map)) {
    if (deletedURLs.has(url)) {
      delete map[source];
      changed = true;
    }
  }
  if (changed && job.publication) job.publication.mediaRemoved = true;
  return changed;
}

export function storageAdapter(sites) {
  let currentFolder = null;
  const pageFor = (teamId) => {
    const page = sites.tabs.assets;
    const root = storageRoute(teamId);
    if (!page || page.isClosed() || page.url().split('?')[0] !== root)
      throw accessRequired();
    return page;
  };
  const visit = async (teamId, folder) => {
    const page = pageFor(teamId);
    const response = await page.goto(
      storageRoute(teamId) +
        (folder ? '?path=' + encodeURIComponent(folder) : ''),
      { waitUntil: 'domcontentloaded' },
    );
    if ([401, 403].includes(response?.status())) throw accessRequired(true);
    pageFor(teamId);
    try {
      await page
        .getByRole('button', { name: 'New folder', exact: true })
        .waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // A session may expire after navigation, including without changing the
      // URL. Never mistake a login or permission screen for empty storage.
      pageFor(teamId);
      throw accessRequired(true);
    }
    await page.waitForFunction(
      () =>
        document.querySelector('table tbody tr a[href]') ||
        document.body.textContent.includes('This folder is empty.'),
    );
    currentFolder = folder;
    return page;
  };
  return {
    async list(teamId, folder) {
      if (sites.stopped)
        throw Error('Storage scan paused. Nothing was deleted.');
      sites.log('Scanning team storage: ' + (folder || 'root'));
      const page = await visit(teamId, folder);
      return page.locator('table tbody tr').evaluateAll((rows) =>
        rows.flatMap((row) => {
          const link = row.querySelector('a[href]');
          if (!link) return [];
          const cells = row.querySelectorAll('td');
          return [
            {
              url: link.href,
              name: (
                cells[0]?.querySelector('span.truncate')?.textContent ||
                cells[0]?.textContent ||
                ''
              )
                .replace(/View details/g, '')
                .trim(),
              size: cells[3]?.textContent?.trim() || '',
            },
          ];
        }),
      );
    },
    async remove(teamId, file) {
      let page = pageFor(teamId);
      if (
        currentFolder !== file.folder ||
        (new URL(page.url()).searchParams.get('path') || '') !== file.folder
      )
        page = await visit(teamId, file.folder);
      // Match the exact public URL from the preview, never a row position.
      const row = page
        .locator('table tbody tr')
        .filter({ has: page.locator(`a[href=${JSON.stringify(file.url)}]`) });
      if ((await row.count()) === 0) {
        await visit(teamId, file.folder);
        if ((await row.count()) === 0) return;
      }
      if ((await row.count()) !== 1)
        throw Error('Ambiguous file match. Cleanup stopped: ' + file.name);
      const size = await row.locator('td').nth(3).textContent();
      if ((size || '').trim() !== file.size)
        throw Error('File changed since preview. Scan again: ' + file.name);
      sites.log(
        'Removing ' + (file.folder ? file.folder + '/' : '') + file.name,
      );
      await row.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('Delete this file?', { exact: true }).waitFor();
      if ((await dialog.locator('code').textContent())?.trim() !== file.name)
        throw Error(
          'The delete dialog names a different file. Cleanup stopped.',
        );
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await row.waitFor({ state: 'detached' });
    },
  };
}
