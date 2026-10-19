import { createHash, randomBytes } from 'node:crypto';

export const sectionCodeBytes = 128 * 1024;
export const sectionCodeFields = ['html', 'css', 'javascript'];
export const codeUploadReview = 'Before uploading, inspect the production artifact and remove temporary test harnesses, debug logging, placeholder/demo data and other unnecessary content. Preserve requested content, required runtime code, attribution and licences. Keep useful repository tests in the repository. Only confirm reviewedForUpload after actually checking; do not ask the user to certify the agent’s work.';
export const codeHash = text => createHash('sha256').update(text).digest('hex');

export function checkSectionCode(text, fail) {
  if (typeof text !== 'string') throw fail(400, 'Code must be UTF-8 text.');
  const size = Buffer.byteLength(text, 'utf8');
  if (size > sectionCodeBytes)
    throw fail(413, `Custom component code is ${size} bytes; maximum 128 KiB (131072 bytes) per uploaded field. Remove unnecessary production content or split the component. Nothing was saved.`);
  return size;
}

// Tickets contain metadata only, never file bytes or the full MCP credential.
// A restart expires tickets. A completed ticket caches its receipt for safe retries.
export function createSectionCodeUploads({ fail, now = Date.now }) {
  const tickets = new Map();
  function prune() {
    for (const [key, value] of tickets) if (value.expiresAt <= now()) tickets.delete(key);
  }
  return {
    issue(link, args) {
      prune();
      if (args.reviewedForUpload !== true) throw fail(400, codeUploadReview);
      if (!Number.isSafeInteger(args.size) || args.size < 0 || args.size > sectionCodeBytes)
        throw fail(413, 'Specify the exact UTF-8 file size: maximum 128 KiB (131072 bytes).');
      if (!/^[a-f0-9]{64}$/.test(args.sha256 || '')) throw fail(400, 'Supply the SHA-256 of the actual file bytes.');
      if (tickets.size >= 256 || [...tickets.values()].filter(t => t.linkHash === link.token_hash && !t.receipt).length >= 8)
        throw fail(429, 'Too many code upload tickets. Finish existing uploads or wait for their 10-minute expiry.');
      const secret = randomBytes(32).toString('base64url');
      const ticket = { linkHash: link.token_hash, args: Object.fromEntries(['page', 'id', 'field', 'ifVersion', 'ifHash', 'size', 'sha256'].map(key => [key, args[key]])), expiresAt: Math.min(now() + 10 * 60 * 1000, link.expires_at) };
      tickets.set(codeHash(secret), ticket);
      return { secret, expiresAt: ticket.expiresAt };
    },
    get(secret) { prune(); return tickets.get(codeHash(secret || '')); },
    async receive(req, ticket, commit) {
      if (ticket.busy) throw fail(409, 'This upload is already in progress.');
      if (ticket.expiresAt <= now()) throw fail(410, 'Code upload expired. Request a new URL.');
      const length = req.headers['content-length'];
      if (length !== undefined && Number(length) !== ticket.args.size)
        throw fail(400, 'File size differs from the upload ticket. Nothing was saved.');
      ticket.busy = true;
      try {
        const chunks = [];
        let size = 0;
        // iterator destroyOnReturn=false permits a JSON error on oversize input.
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          size += chunk.length;
          if (size > ticket.args.size || size > sectionCodeBytes) {
            req.resume();
            throw fail(413, 'File exceeds the declared size or 128 KiB. Nothing was saved.');
          }
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (size !== ticket.args.size || codeHash(bytes) !== ticket.args.sha256)
          throw fail(400, 'File size or SHA-256 mismatch. Upload the exact reviewed file bytes; nothing was saved.');
        let content;
        try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
        catch { throw fail(400, 'The file is not valid UTF-8. Nothing was saved.'); }
        if (ticket.expiresAt <= now()) throw fail(410, 'Code upload expired. Nothing was saved.');
        if (ticket.receipt) return { ...ticket.receipt, alreadyApplied: true };
        ticket.receipt = commit(ticket.args, content);
        return ticket.receipt;
      } finally { ticket.busy = false; }
    },
  };
}
