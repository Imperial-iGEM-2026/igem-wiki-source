import {
  templates,
  templateList,
  templateDefaults,
  projectNameKey,
} from './shared.mjs';
import { randomUUID } from 'node:crypto';

// The original tables remain the first project's storage, preserving existing
// installations and the snapshot import command without rewriting live data.
export function createProjects(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS project_settings (id INTEGER PRIMARY KEY CHECK(id=1), default_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_blocks (project_id TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL, author TEXT NOT NULL, PRIMARY KEY(project_id,id));
    CREATE TABLE IF NOT EXISTS project_presence (project_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, seen INTEGER NOT NULL, PRIMARY KEY(project_id,id));
    INSERT OR IGNORE INTO projects (id,name,created) VALUES('main','Prion Collective',0);
    INSERT OR IGNORE INTO project_settings VALUES(1,'main');`);
  const columns = db
    .prepare('PRAGMA table_info(projects)')
    .all()
    .map((c) => c.name);
  if (!columns.includes('template_id'))
    db.exec('ALTER TABLE projects ADD COLUMN template_id TEXT');
  if (!columns.includes('archived'))
    db.exec(
      'ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0',
    );
  if (!columns.includes('deleted'))
    db.exec(
      'ALTER TABLE projects ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0',
    );
  db.exec('UPDATE projects SET archived=1 WHERE template_id IS NULL');
  // SQLite triggers preserve the previous layout atomically for every writer,
  // including browser saves, AI tools, shared chrome sync and page deletion.
  db.exec(`CREATE TABLE IF NOT EXISTS layout_history (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL,
    version INTEGER NOT NULL, author TEXT NOT NULL, saved_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS layout_history_page ON layout_history(project_id,id,sequence);`);
  for (const table of ['blocks', 'project_blocks']) {
    const project = table === 'blocks' ? "'main'" : 'OLD.project_id';
    for (const event of ['UPDATE', 'DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS preserve_layout_${table}_${event}
        BEFORE ${event} ON ${table}
        WHEN OLD.id LIKE 'layout:%' ${event === 'UPDATE' ? 'AND OLD.value != NEW.value' : ''}
        BEGIN
          INSERT INTO layout_history(project_id,id,value,version,author,saved_at)
          VALUES(${project},OLD.id,OLD.value,OLD.version,OLD.author,unixepoch()*1000);
          DELETE FROM layout_history WHERE project_id=${project} AND id=OLD.id
            AND sequence NOT IN (SELECT sequence FROM layout_history WHERE project_id=${project} AND id=OLD.id ORDER BY sequence DESC LIMIT 20);
        END;`);
    }
  }
  const list = () => ({
    projects: db
      .prepare(
        `SELECT id,name,template_id AS templateId, COALESCE(
          CASE WHEN id='main' THEN (SELECT value FROM blocks WHERE id='site:appearance')
          ELSE (SELECT value FROM project_blocks WHERE project_id=projects.id AND id='site:appearance') END,
          template_id) AS appearanceId FROM projects WHERE archived=0 AND deleted=0 ORDER BY created,id`,
      )
      .all(),
    templates: templateList,
    deletedProjects: db
      .prepare(
        'SELECT id,name,template_id AS templateId FROM projects WHERE deleted=1 ORDER BY created,id',
      )
      .all(),
    archivedProjects: db
      .prepare(
        "SELECT id,name FROM projects WHERE archived=1 AND deleted=0 AND (id != 'main' OR EXISTS (SELECT 1 FROM blocks)) ORDER BY created,id",
      )
      .all(),
    defaultId: db
      .prepare('SELECT default_id FROM project_settings WHERE id=1')
      .get().default_id,
  });
  const has = (id, includeArchived = false) =>
    typeof id === 'string' &&
    !!db
      .prepare(
        'SELECT id FROM projects WHERE id=? AND deleted=0 AND (archived=0 OR ?=1)',
      )
      .get(id, includeArchived ? 1 : 0);
  function create(name, templateId) {
    if (!Object.hasOwn(templates, templateId)) throw Error('Unknown template');
    const id = randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (
        list().projects.some(
          (p) => projectNameKey(p.name) === projectNameKey(name),
        )
      )
        throw Object.assign(
          Error(
            'A project with this name already exists. Open it from Your projects, or choose a different name for a new copy.',
          ),
          { status: 409 },
        );
      db.prepare(
        'INSERT INTO projects (id,name,created,template_id,archived) VALUES(?,?,?,?,0)',
      ).run(id, name, Date.now(), templateId);
      const put = db.prepare('INSERT INTO project_blocks VALUES(?,?,?,1,?)');
      for (const [key, value] of Object.entries(templateDefaults(templateId)))
        put.run(id, key, value, 'Template');
      const current = db
        .prepare('SELECT default_id FROM project_settings WHERE id=1')
        .get().default_id;
      if (!has(current)) setDefault(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return id;
  }
  function remove(id, replacementId) {
    const current = list();
    if (!has(id, true))
      throw Object.assign(Error('Project not found.'), { status: 404 });
    if (
      current.defaultId === id &&
      current.projects.some((p) => p.id !== id) &&
      (replacementId === id || !has(replacementId))
    )
      throw Object.assign(
        Error('Choose another project for the main website.'),
        { status: 409 },
      );
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE projects SET deleted=1 WHERE id=?').run(id);
      db.prepare('DELETE FROM project_presence WHERE project_id=?').run(id);
      if (id === 'main') db.exec('DELETE FROM presence');
      if (current.defaultId === id)
        setDefault(replacementId && has(replacementId) ? replacementId : '');
      db.exec('COMMIT');
      scopes.delete(id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function restore(id) {
    if (typeof id !== 'string')
      throw Object.assign(Error('Deleted project not found.'), { status: 404 });
    const project = db
      .prepare('SELECT * FROM projects WHERE id=? AND deleted=1')
      .get(id);
    if (!project)
      throw Object.assign(Error('Deleted project not found.'), { status: 404 });
    if (!project.archived && list().projects.length >= 50)
      throw Object.assign(
        Error(
          'Delete another project before restoring. The limit is 50 active projects.',
        ),
        { status: 409 },
      );
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE projects SET deleted=0 WHERE id=?').run(id);
      if (!project.archived && !has(list().defaultId)) setDefault(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const templateId = (id) =>
    db.prepare('SELECT template_id FROM projects WHERE id=?').get(id)
      ?.template_id;
  function setDefault(id) {
    db.prepare('UPDATE project_settings SET default_id=? WHERE id=1').run(id);
  }
  const scopes = new Map();
  function scope(id) {
    if (scopes.has(id)) return scopes.get(id);
    const original = id === 'main';
    const table = original ? 'blocks' : 'project_blocks';
    const presence = original ? 'presence' : 'project_presence';
    const condition = original ? '' : 'project_id=? AND ';
    const prefix = original ? [] : [id];
    const select = db.prepare(
      `SELECT value,version,author FROM ${table} WHERE ${condition}id=?`,
    );
    const rows = db.prepare(
      `SELECT id,value,version,author FROM ${table}${original ? '' : ' WHERE project_id=?'}`,
    );
    const insert = db.prepare(
      `INSERT INTO ${table} VALUES(${original ? '' : '?,'}?,?,1,?) ON CONFLICT DO NOTHING`,
    );
    const update = db.prepare(
      `UPDATE ${table} SET value=?,version=version+1,author=? WHERE ${condition}id=? AND version=?`,
    );
    const people = db.prepare(
      `SELECT id,name FROM ${presence} WHERE ${condition}seen>?`,
    );
    const erase = db.prepare(`DELETE FROM ${table} WHERE ${condition}id=?`);
    const pulse = db.prepare(
      `INSERT INTO ${presence} VALUES(${original ? '' : '?,'}?,?,?) ON CONFLICT DO UPDATE SET name=excluded.name,seen=excluded.seen`,
    );
    const write = (statement, ...args) => {
      if (!has(id, true))
        throw Object.assign(
          Error('This project was deleted. Return to the project library.'),
          { status: 404 },
        );
      return statement.run(...args);
    };
    const store = {
      rows: { all: () => rows.all(...prefix) },
      select: { get: (key) => select.get(...prefix, key) },
      insert: { run: (...args) => write(insert, ...prefix, ...args) },
      update: {
        run: (value, author, key, version) =>
          write(update, value, author, ...prefix, key, version),
      },
      people: { all: (seen) => people.all(...prefix, seen) },
      erase: { run: (key) => write(erase, ...prefix, key) },
      pulse: { run: (...args) => write(pulse, ...prefix, ...args) },
    };
    scopes.set(id, store);
    return store;
  }
  return { list, has, create, setDefault, scope, templateId, remove, restore };
}
