import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const problem = (status, message) => Object.assign(Error(message), { status });
// This is a virtual source tree from the release allowlist, never a server path.
const editableApp = new Set([
  'home.tsx', 'canvas-surface.tsx', 'page-canvas.tsx', 'wiki-components.tsx',
  'site-header.tsx', 'header-design.tsx', 'media-block.tsx', 'references.tsx',
  'equation-block.tsx', 'custom-html-block.tsx', 'html-document.ts',
  'pdf-reader.tsx', 'pdf-reader.css', 'pdf-parts-viewer.ts', 'globals.css',
  'templates.ts', 'template-renderer.tsx', 'template-css.ts', 'template-transform.ts',
  'template-data.json', 'template-styles.json', 'template-motion.js',
  'luca-template.json', 'luca-styles.json', 'luca-theme.css', 'luca-sponsors.js',
  'page-index.js', 'page-index.css', 'section-navigator.js', 'section-position.js',
  'purple-interactions.js', 'motion-loop.js', 'reference-navigation.ts',
]);
// Brackets are literal route filename characters (e.g. app/[slug]/page.tsx),
// never glob patterns. Reads still require membership in the release allowlist.
const safePath = name => typeof name === 'string' &&
  /^[a-zA-Z0-9_./[\]-]+$/.test(name) &&
  name.split('/').every(part => part && part !== '.' && part !== '..');
const canWrite = name => safePath(name) && (
  (name.startsWith('app/') && editableApp.has(name.slice(4))) ||
  /^(app\/project-components|components\/project)\/[a-zA-Z0-9_/-]+\.(tsx?|jsx?|css|json)$/.test(name)
);
export const sourceNotice = 'Project source edits are included in the next website-source ZIP and take effect when that source is built and deployed. Studio and its normal preview use the installed release, not these edits. Source is not executed on this server. Read get_page and get_page_styles for the project’s current saved content and CSS.';

export function createProjectSource({ db, sourceFile = new URL('./export-source.json', import.meta.url), now = Date.now }) {
  let base;
  const files = () => base ||= JSON.parse(readFileSync(sourceFile, 'utf8'));
  db.exec(`CREATE TABLE IF NOT EXISTS project_source (
    project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT, version INTEGER NOT NULL,
    base_hash TEXT NOT NULL, author TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY(project_id,path));
    CREATE TABLE IF NOT EXISTS project_source_history (
    project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT, version INTEGER NOT NULL,
    base_hash TEXT NOT NULL, author TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY(project_id,path,version));
    CREATE TABLE IF NOT EXISTS project_source_locks (
    project_id TEXT NOT NULL, path TEXT NOT NULL, owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL, approved_by TEXT NOT NULL, editor_name TEXT NOT NULL,
    token_hash TEXT NOT NULL, acquired_at INTEGER NOT NULL, renewed_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, PRIMARY KEY(project_id,path));`);
  const row = db.prepare('SELECT * FROM project_source WHERE project_id=? AND path=?');
  const rows = db.prepare('SELECT * FROM project_source WHERE project_id=? ORDER BY path');
  const leaseRow = db.prepare('SELECT * FROM project_source_locks WHERE project_id=? AND path=? AND expires_at>?');
  function lockStatus(project, name, ownerId) {
    const lock = leaseRow.get(project, name, now());
    return lock ? { status: 'locked', owner: { linkId: lock.owner_id, linkName: lock.owner_name, approvedBy: lock.approved_by, editorName: lock.editor_name },
      ownedByThisLink: lock.owner_id === ownerId, acquiredAt: lock.acquired_at, renewedAt: lock.renewed_at, expiresAt: lock.expires_at,
      remainingSeconds: Math.max(0, Math.ceil((lock.expires_at - now()) / 1000)) } : { status: 'unlocked' };
  }
  function lockError(project, name, ownerId, message) {
    return Object.assign(problem(409, message), { details: { code: 'SOURCE_LOCK_CONFLICT', path: name, lock: lockStatus(project, name, ownerId) } });
  }
  function requireLease(project, name, owner, token) {
    const lock = leaseRow.get(project, name, now());
    if (!lock || lock.owner_id !== owner?.id || typeof token !== 'string' || digest(token) !== lock.token_hash)
      throw lockError(project, name, owner?.id, 'A valid source-file lock is required. Check get_source_status; acquire_source_lock before editing. Never reuse another editor’s lock.');
    return lock;
  }
  function expiry(owner, seconds = 300) {
    if (!owner?.id || !Number.isInteger(seconds) || seconds < 30 || seconds > 900)
      throw problem(400, 'Lock duration must be 30–900 seconds (default 300).');
    const until = Math.min(now() + seconds * 1000, owner.expiresAt);
    if (!Number.isFinite(until) || until <= now()) throw problem(403, 'Developer access has expired.');
    return until;
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function original(name) {
    if (!safePath(name)) throw problem(400, 'Use an exact relative path from list_source_files.');
    return Object.hasOwn(files(), name) ? files()[name] : null;
  }
  function state(project, name) {
    const value = original(name), saved = row.get(project, name);
    if (value === null && !canWrite(name)) throw problem(404, 'Source file not available.');
    return { path: name, content: saved?.content ?? value, version: saved?.version || 0,
      updatedBy: saved?.author ?? null, updatedAt: saved?.updated_at ?? null,
      baseHash: digest(value ?? ''), editable: canWrite(name), modified: saved?.content != null,
      conflict: saved?.content != null && saved.base_hash !== digest(value ?? '') };
  }
  function save(project, author, args, content, owner) {
    return transaction(() => {
    const before = state(project, args.path);
    if (!before.editable) throw problem(403, 'Only wiki template/components may be changed. Build scripts, dependencies and Studio controls are read-only.');
    requireLease(project, args.path, owner, args.lockToken);
    if (!Number.isSafeInteger(args.ifVersion) || args.ifVersion !== before.version || args.ifBaseHash !== before.baseHash)
      throw problem(409, 'Source conflict. Read the file again and use its version and baseHash.');
    if (content !== null && (typeof content !== 'string' || Buffer.byteLength(content) > 16 * 1024 * 1024))
      throw problem(400, 'Source must be text under 16 MiB. Use replace_source_text for a large existing file.');
    if (content !== null && args.path.endsWith('.json')) {
      try { JSON.parse(content); } catch { throw problem(400, 'Invalid JSON. Nothing was saved.'); }
    }
    const version = before.version + 1, savedAt = now();
      const old = row.get(project, args.path);
      if (old) db.prepare('INSERT OR REPLACE INTO project_source_history VALUES(?,?,?,?,?,?,?)')
        .run(project, args.path, old.content, old.version, old.base_hash, old.author, old.updated_at);
      db.prepare('INSERT OR REPLACE INTO project_source VALUES(?,?,?,?,?,?,?)')
        .run(project, args.path, content, version, before.baseHash, author, savedAt);
      db.prepare('DELETE FROM project_source_history WHERE project_id=? AND path=? AND version NOT IN (SELECT version FROM project_source_history WHERE project_id=? AND path=? ORDER BY version DESC LIMIT 20)')
        .run(project, args.path, project, args.path);
    return { path: args.path, version, baseHash: before.baseHash, modified: content !== null, lock: lockStatus(project, args.path, owner.id), notice: sourceNotice };
    });
  }
  return {
    acquire(project, owner, args) {
      return transaction(() => {
        if (!state(project, args.path).editable) throw problem(403, 'This file is read-only.');
        const expires = expiry(owner, args.ttlSeconds);
        if (leaseRow.get(project, args.path, now())) throw lockError(project, args.path, owner.id, 'This file is already reserved. Wait for release/expiry or work on another file. Even agents sharing a link need separate leases.');
        if (args.editorName !== undefined && (typeof args.editorName !== 'string' || !args.editorName.trim() || args.editorName.length > 80)) throw problem(400, 'editorName must contain 1–80 characters.');
        const token = randomBytes(32).toString('base64url');
        db.prepare('INSERT OR REPLACE INTO project_source_locks VALUES(?,?,?,?,?,?,?,?,?,?)').run(project, args.path, owner.id, owner.name, owner.approvedBy, args.editorName?.trim() || owner.name, digest(token), now(), now(), expires);
        return { path: args.path, lockToken: token, lock: lockStatus(project, args.path, owner.id), next: 'Read the file again, then edit using lockToken, ifVersion and ifBaseHash. Renew before expiry; release when finished.' };
      });
    },
    renew(project, owner, args) {
      return transaction(() => {
        state(project, args.path);
        requireLease(project, args.path, owner, args.lockToken);
        db.prepare('UPDATE project_source_locks SET renewed_at=?,expires_at=? WHERE project_id=? AND path=?').run(now(), expiry(owner, args.ttlSeconds), project, args.path);
        return { path: args.path, lock: lockStatus(project, args.path, owner.id) };
      });
    },
    release(project, owner, args) {
      return transaction(() => {
        state(project, args.path);
        requireLease(project, args.path, owner, args.lockToken);
        db.prepare('DELETE FROM project_source_locks WHERE project_id=? AND path=?').run(project, args.path);
        return { path: args.path, lock: { status: 'unlocked' } };
      });
    },
    releaseOwner(ownerId) { db.prepare('DELETE FROM project_source_locks WHERE owner_id=?').run(ownerId); },
    status(project, name, ownerId) {
      if (name !== undefined) {
        const { content, ...info } = state(project, name);
        return { ...info, lock: lockStatus(project, name, ownerId) };
      }
      return { serverTime: now(), locks: db.prepare('SELECT path FROM project_source_locks WHERE project_id=? AND expires_at>? ORDER BY path').all(project, now()).map(r => ({ path: r.path, lock: lockStatus(project, r.path, ownerId) })),
        modifiedFiles: rows.all(project).filter(r => r.content !== null).map(r => ({ path: r.path, version: r.version, updatedBy: r.author, updatedAt: r.updated_at })),
        note: 'Lock ownership indicates a reservation, not proof that a developer is currently typing. editorName is supplied by the agent; linkName/approvedBy identify the authorized connection. Give each developer a separate link.' };
    },
    list(project, ownerId) {
      const lockedNames = db.prepare('SELECT path FROM project_source_locks WHERE project_id=? AND expires_at>?').all(project, now()).map(r => r.path);
      const names = new Set([...Object.keys(files()), ...rows.all(project).filter(r => r.content !== null).map(r => r.path), ...lockedNames]);
      return [...names].sort().map(name => {
        const { content, ...info } = state(project, name);
        return { ...info, bytes: Buffer.byteLength(content ?? ''), lock: lockStatus(project, name, ownerId) };
      });
    },
    read(project, args, ownerId) {
      const value = { ...state(project, args.path), lock: lockStatus(project, args.path, ownerId) };
      if (value.content === null) return { ...value, exists: false, notice: sourceNotice };
      const start = args.startLine ?? 1, limit = args.lineCount ?? 200;
      if (!Number.isInteger(start) || start < 1 || !Number.isInteger(limit) || limit < 1 || limit > 500)
        throw problem(400, 'Use startLine >= 1 and lineCount between 1 and 500.');
      const lines = value.content.split('\n');
      // Some generated JSON files are one long line: provide an explicit offset too.
      const offset = args.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0) throw problem(400, 'offset must be a nonnegative character offset within the selected lines.');
      const selected = lines.slice(start - 1, start - 1 + limit).join('\n');
      const content = selected.slice(offset, offset + 64000);
      return { ...value, exists: true, content, startLine: start, totalLines: lines.length, offset,
        nextOffset: offset + content.length < selected.length ? offset + content.length : null,
        nextLine: start + limit <= lines.length ? start + limit : null, notice: sourceNotice };
    },
    write: (project, author, args, owner) => save(project, author, args, args.content, owner),
    replace(project, author, args, owner) {
      const { content } = state(project, args.path);
      if (!content || typeof args.oldText !== 'string' || !args.oldText || typeof args.newText !== 'string')
        throw problem(400, 'Provide nonempty oldText and replacement newText for an existing file.');
      const at = content.indexOf(args.oldText);
      if (at < 0 || content.indexOf(args.oldText, at + 1) >= 0)
        throw problem(409, 'oldText must match exactly once. Include more surrounding code.');
      return save(project, author, args, content.slice(0, at) + args.newText + content.slice(at + args.oldText.length), owner);
    },
    history(project, name) {
      state(project, name);
      return db.prepare('SELECT version,author,updated_at AS updatedAt,content IS NOT NULL AS modified FROM project_source_history WHERE project_id=? AND path=? ORDER BY version DESC').all(project, name);
    },
    restore(project, author, args, owner) {
      if (args.targetVersion === 0) return save(project, author, args, null, owner);
      const old = db.prepare('SELECT * FROM project_source_history WHERE project_id=? AND path=? AND version=?').get(project, args.path, args.targetVersion);
      if (!old) throw problem(404, 'That source revision is unavailable. Use get_source_history.');
      return save(project, author, args, old.content, owner);
    },
    overlay(project, source) {
      const result = { ...source };
      for (const saved of rows.all(project)) {
        if (saved.content === null) continue;
        if (!canWrite(saved.path) || saved.base_hash !== digest(source[saved.path] ?? ''))
          throw problem(409, 'Developer source conflicts with this server release: ' + saved.path + '. Read and reconcile it, or restore version 0 before exporting.');
        result[saved.path] = saved.content;
      }
      return result;
    },
  };
}
