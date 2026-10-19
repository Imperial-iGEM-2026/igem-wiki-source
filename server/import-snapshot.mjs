// Run once with the service stopped, against a new/empty data directory.
import { createProjects } from './projects.mjs';
import { DatabaseSync } from 'node:sqlite';
import {
  readFile,
  mkdir,
  writeFile,
  unlink,
  open,
  copyFile,
} from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initial,
  templates,
  templateDefaults,
  customDefaults,
  CUSTOM_PAGES,
  validateLayout,
  matchesMedia,
} from './shared.mjs';
if (!process.argv[2])
  throw Error(
    'Usage: DATA_DIR=/var/lib/prion node server/import-snapshot.mjs snapshot.json',
  );
const mediaArg = process.argv.indexOf('--media-dir');
const mediaDir =
  mediaArg >= 0 ? path.resolve(process.argv[mediaArg + 1]) : null;
const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (
  snapshot.format !== 'prion-wiki-snapshot' ||
  snapshot.version !== 1 ||
  !snapshot.values
)
  throw Error('Invalid snapshot');
const root = path.resolve(
  process.env.DATA_DIR ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../data'),
);
await mkdir(root, { recursive: true });
await mkdir(path.join(root, 'media'), { recursive: true });
const db = new DatabaseSync(path.join(root, 'wiki.sqlite'));
db.exec(
  'CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL)',
);
if (db.prepare('SELECT COUNT(*) AS count FROM blocks').get().count)
  throw Error(
    'Import only into an empty database. Stop the service and back up existing data first.',
  );
const templateId = snapshot.values['site:template'];
if (templateId && !Object.hasOwn(templates, templateId))
  throw Error('Unknown template');
const projects = createProjects(db);
if (projects.list().projects.length)
  throw Error('Import only into an empty database.');
const content = [],
  required = new Set();
const defaults = {
  ...(templateId ? templateDefaults(templateId) : initial),
  ...customDefaults(snapshot.values[CUSTOM_PAGES]),
};
for (const [id, value] of Object.entries(snapshot.values)) {
  if (!Object.hasOwn(defaults, id)) continue;
  if (
    typeof value !== 'string' ||
    (id.startsWith('layout:')
      ? (() => {
          try {
            return JSON.stringify({ ...JSON.parse(value), customCss: '' })
              .length;
          } catch {
            return Infinity;
          }
        })()
      : value.length) >
      (id === 'site:header'
        ? 24000
        : id.startsWith('layout:')
          ? (1024 * 1024)
          : id.startsWith('wiki:') || id === CUSTOM_PAGES
            ? 12000
            : 2000)
  )
    throw Error('Invalid content ' + id);
  if (id.startsWith('layout:')) {
    const layout = JSON.parse(value);
    if (!validateLayout(layout)) throw Error('Invalid layout ' + id);
    for (const n of layout.nodes)
      if (n.src.startsWith('/api/media/')) required.add(n.src);
  }
  if (id === 'order' && !/^(1,2,3|1,3,2|2,1,3|2,3,1|3,1,2|3,2,1)$/.test(value))
    throw Error('Invalid order');
  if (templateId || value !== initial[id]) content.push([id, value]);
}
const created = [];
db.exec('BEGIN IMMEDIATE');
try {
  for (const url of required) {
    const key = url.slice('/api/media/'.length),
      ext = key.split('.').pop();
    if (
      !/^[a-f0-9-]+\.[a-z0-9]+$/.test(key) ||
      (!snapshot.media?.[url] && !mediaDir)
    )
      throw Error('Missing media: ' + url);
    const source =
      !snapshot.media?.[url] && mediaDir ? path.join(mediaDir, key) : null;
    let bytes, size;
    if (source) {
      const handle = await open(source, 'r');
      try {
        const meta = await handle.stat();
        if (!meta.isFile()) throw Error('Not a file');
        size = meta.size;
        bytes = Buffer.alloc(16);
        await handle.read(bytes, 0, 16, 0);
      } finally {
        await handle.close();
      }
    } else {
      bytes = Buffer.from(snapshot.media[url], 'base64');
      size = bytes.length;
    }
    if (
      size < 16 ||
      (!['mp4', 'webm', 'glb'].includes(ext) && size > 25 * 1024 * 1024) ||
      !matchesMedia(ext, bytes)
    )
      throw Error('Invalid media: ' + url);
    const dest = path.join(root, 'media', key);
    if (source) await copyFile(source, dest, constants.COPYFILE_EXCL);
    else await writeFile(dest, bytes, { flag: 'wx' });
    created.push(dest);
  }
  if (templateId) {
    const id = 'restored';
    db.prepare(
      'INSERT INTO projects (id,name,created,template_id,archived) VALUES(?,?,?,?,0)',
    ).run(
      id,
      snapshot.project?.name || 'Restored project',
      Date.now(),
      templateId,
    );
    const insert = db.prepare('INSERT INTO project_blocks VALUES(?,?,?,1,?)');
    for (const [key, value] of Object.entries({
      ...defaults,
      ...Object.fromEntries(content),
    }))
      insert.run(id, key, value, 'Imported snapshot');
    projects.setDefault(id);
  } else {
    const insert = db.prepare('INSERT INTO blocks VALUES(?,?,1,?)');
    for (const [id, value] of content)
      insert.run(id, value, 'Imported snapshot');
  }
  db.exec('COMMIT');
  console.log(
    `Imported ${content.length} saved fields and ${created.length} uploaded files.`,
  );
} catch (error) {
  db.exec('ROLLBACK');
  for (const file of created) await unlink(file);
  throw error;
} finally {
  db.close();
}
