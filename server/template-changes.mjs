import { createHash, randomUUID } from 'node:crypto';
import { templates, templateDefaults, customDefaults } from './shared.mjs';

// Appearance is independent of the content template. No page or layout is replaced.
export function createTemplateChanges(db, projects) {
  db.exec(`CREATE TABLE IF NOT EXISTS template_previews (
    token TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner TEXT NOT NULL,
    target TEXT NOT NULL, fingerprint TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS template_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
    before_theme TEXT NOT NULL, after_theme TEXT NOT NULL, version INTEGER NOT NULL,
    author TEXT NOT NULL, created INTEGER NOT NULL, rolled_back INTEGER NOT NULL DEFAULT 0);`);
  const fail = (message, status = 409) =>
    Object.assign(Error(message), { status });
  function context(id) {
    if (!projects.has(id)) throw fail('Project not found.', 404);
    const source = projects.templateId(id);
    if (!templates[source])
      throw fail('This archived project cannot change template.', 400);
    const store = projects.scope(id);
    const row = store.select.get('site:appearance');
    return {
      source,
      store,
      theme: row?.value || source,
      version: row?.version || 0,
    };
  }
  const fingerprint = (id) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          source: projects.templateId(id),
          rows: projects
            .scope(id)
            .rows.all()
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest('hex');
  function status(id) {
    const c = context(id);
    const last = db
      .prepare(
        'SELECT * FROM template_changes WHERE project_id=? ORDER BY id DESC LIMIT 1',
      )
      .get(id);
    return {
      theme: c.theme,
      version: c.version,
      rollback:
        last &&
        !last.rolled_back &&
        last.version === c.version &&
        last.after_theme === c.theme
          ? { id: last.id, theme: last.before_theme, created: last.created }
          : null,
    };
  }
  function preview(id, target, owner) {
    const c = context(id);
    if (
      typeof target !== 'string' ||
      !Object.hasOwn(templates, target) ||
      target === 'blank'
    )
      throw fail('Choose a template style.', 400);
    if (target === c.theme)
      throw fail('This template style is already active.', 400);
    db.prepare('DELETE FROM template_previews WHERE expires<?').run(Date.now());
    const rows = c.store.rows.all();
    const defaults = {
      ...templateDefaults(c.source),
      ...customDefaults(c.store.select.get('pages:custom')?.value || '[]'),
    };
    const data = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        { value, version: 0, author: '' },
      ]),
    );
    for (const { id: key, ...row } of rows) data[key] = row;
    data['site:appearance'] = {
      value: target,
      version: c.version,
      author: owner,
    };
    const token = randomUUID();
    db.prepare('INSERT INTO template_previews VALUES(?,?,?,?,?,?)').run(
      token,
      id,
      owner,
      target,
      fingerprint(id),
      Date.now() + 30 * 60 * 1000,
    );
    return { token, data, ...status(id) };
  }
  function write(c, target, author) {
    const result = c.version
      ? c.store.update.run(target, author, 'site:appearance', c.version)
      : c.store.insert.run('site:appearance', target, author);
    if (!result.changes)
      throw fail('The template changed. Refresh and preview again.');
    return c.version + 1;
  }
  function apply(id, token, owner) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const c = context(id);
      const p = db
        .prepare(
          'SELECT * FROM template_previews WHERE token=? AND project_id=? AND owner=?',
        )
        .get(token || '', id, owner);
      if (!p || p.expires < Date.now())
        throw fail('Preview expired. Generate a new preview before applying.');
      if (p.fingerprint !== fingerprint(id))
        throw fail(
          'This project changed since your preview. Preview the latest content before applying.',
        );
      const version = write(c, p.target, owner);
      db.prepare(
        'INSERT INTO template_changes(project_id,before_theme,after_theme,version,author,created) VALUES(?,?,?,?,?,?)',
      ).run(id, c.theme, p.target, version, owner, Date.now());
      db.prepare('DELETE FROM template_previews WHERE project_id=?').run(id);
      db.exec('COMMIT');
      return status(id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function rollback(id, changeId, version, owner) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const c = context(id),
        current = status(id);
      if (
        !current.rollback ||
        current.rollback.id !== changeId ||
        current.version !== version
      )
        throw fail('The template changed. Refresh before rolling back.');
      write(c, current.rollback.theme, owner);
      db.prepare('UPDATE template_changes SET rolled_back=1 WHERE id=?').run(
        changeId,
      );
      db.prepare('DELETE FROM template_previews WHERE project_id=?').run(id);
      db.exec('COMMIT');
      return status(id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { status, preview, apply, rollback };
}
