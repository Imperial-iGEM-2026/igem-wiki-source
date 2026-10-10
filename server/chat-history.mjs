const fail = (status, message) => Object.assign(Error(message), { status });
export function createChatHistory(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS assistant_chats (
    owner TEXT NOT NULL, id TEXT NOT NULL, project TEXT NOT NULL, page TEXT NOT NULL,
    target TEXT NOT NULL, title TEXT NOT NULL, messages TEXT NOT NULL, search_text TEXT NOT NULL,
    revision INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(owner,id));
    CREATE INDEX IF NOT EXISTS assistant_chats_owner_updated ON assistant_chats(owner,updated DESC);
    CREATE TABLE IF NOT EXISTS assistant_chat_deletions (
      owner TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(owner,id));`);
  return {
    remove(owner, body) {
      const validId = (id) =>
        typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
      if (
        !body ||
        Object.keys(body).some(
          (key) => !['action', 'id', 'pendingIds'].includes(key),
        ) ||
        !['delete', 'clear'].includes(body.action) ||
        (body.action === 'delete' &&
          (!validId(body.id) || body.pendingIds !== undefined)) ||
        (body.action === 'clear' &&
          (body.id !== undefined ||
            (body.pendingIds !== undefined &&
              (!Array.isArray(body.pendingIds) ||
                body.pendingIds.length > 100 ||
                !body.pendingIds.every(validId)))))
      )
        throw fail(400, 'Invalid history deletion.');
      if (
        body.action === 'delete' &&
        !db
          .prepare('SELECT 1 FROM assistant_chats WHERE owner=? AND id=?')
          .get(owner, body.id)
      )
        throw fail(404, 'Chat not found.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const ids =
          body.action === 'delete'
            ? [body.id]
            : [
                ...new Set([
                  ...db
                    .prepare('SELECT id FROM assistant_chats WHERE owner=?')
                    .all(owner)
                    .map((row) => row.id),
                  ...(body.pendingIds || []),
                ]),
              ];
        const tombstone = db.prepare(
          'INSERT OR IGNORE INTO assistant_chat_deletions(owner,id) VALUES(?,?)',
        );
        const remove = db.prepare(
          'DELETE FROM assistant_chats WHERE owner=? AND id=?',
        );
        for (const id of ids) {
          tombstone.run(owner, id);
          remove.run(owner, id);
        }
        db.exec('COMMIT');
        return { deletedIds: ids };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    list(owner, query = '') {
      if (query.length > 200) throw fail(400, 'Search is too long.');
      return db
        .prepare(`SELECT c.id,c.page,c.target,c.title,c.updated,p.name AS projectName,
        substr(c.search_text,1,220) AS excerpt FROM assistant_chats c
        LEFT JOIN projects p ON p.id=c.project
        WHERE c.owner=? AND instr(lower(c.search_text),lower(?))>0
        ORDER BY c.updated DESC LIMIT 50`)
        .all(owner, query.trim());
    },
    get(owner, id) {
      const row = db
        .prepare(
          'SELECT id,project,page,target,title,messages,updated FROM assistant_chats WHERE owner=? AND id=?',
        )
        .get(owner, id);
      if (!row) throw fail(404, 'Chat not found.');
      return { ...row, messages: JSON.parse(row.messages) };
    },
    save(owner, project, body) {
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some(
          (k) => !['id', 'page', 'target', 'messages', 'revision'].includes(k),
        ) ||
        typeof body.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(body.id) ||
        typeof body.page !== 'string' ||
        !/^[a-z0-9-]{1,80}$/.test(body.page) ||
        typeof body.target !== 'string' ||
        body.target.length > 240 ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 1 ||
        !Array.isArray(body.messages) ||
        !body.messages.length ||
        body.messages.length > 100 ||
        body.messages.some(
          (m) =>
            !m ||
            !['user', 'assistant'].includes(m.role) ||
            typeof m.text !== 'string' ||
            m.text.length > 30000 ||
            Object.keys(m).some((k) => !['role', 'text'].includes(k)),
        )
      )
        throw fail(400, 'Invalid chat history.');
      // Retain only deleted identifiers, never transcript content. Late autosaves cannot resurrect them.
      if (
        db
          .prepare(
            'SELECT 1 FROM assistant_chat_deletions WHERE owner=? AND id=?',
          )
          .get(owner, body.id)
      )
        return { saved: false, deleted: true };
      const messages = JSON.stringify(body.messages);
      if (Buffer.byteLength(messages) > 512000)
        throw fail(413, 'Chat history is too large.');
      const existing = db
        .prepare(
          'SELECT project,page,target FROM assistant_chats WHERE owner=? AND id=?',
        )
        .get(owner, body.id);
      if (
        existing &&
        (existing.project !== project || existing.page !== body.page)
      )
        throw fail(409, 'Chat context changed.');
      if (
        !existing &&
        db
          .prepare('SELECT count(*) AS n FROM assistant_chats WHERE owner=?')
          .get(owner).n >= 500
      )
        throw fail(409, 'Your saved chat limit has been reached.');
      const title = (
        body.messages.find((m) => m.role === 'user')?.text || 'Conversation'
      ).slice(0, 100);
      db.prepare(`INSERT INTO assistant_chats VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(owner,id) DO UPDATE SET target=excluded.target,title=excluded.title,messages=excluded.messages,search_text=excluded.search_text,revision=excluded.revision,updated=excluded.updated
        WHERE excluded.revision>assistant_chats.revision`).run(
        owner,
        body.id,
        project,
        body.page,
        body.target,
        title,
        messages,
        [body.page, body.target, ...body.messages.map((m) => m.text)].join(
          '\n',
        ),
        body.revision,
        Date.now(),
      );
      return { saved: true };
    },
  };
}
