// Isolated UI fixture: no accounts, real MCP keys or production data.
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/ai-links-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(path.join(folder, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(folder, 'entry.tsx'), `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AiLinkDialog} from '/app/ai-link-dialog';import '/app/globals.css';function App(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Connect an AI</button><AiLinkDialog open={open} onOpenChange={setOpen} page="home" pageTitle="Home"/></>};createRoot(document.getElementById('root')).render(<App/>);`);
const dist = path.join(folder, 'dist');
await build({ ...common, build: { outDir: dist, rollupOptions: { input: path.join(folder, 'index.html') } } });
const links = [];
let issued = false;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/mcp-links') {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ links }));
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.action === 'prepare-developer') { issued = true; return res.end(JSON.stringify({ confirmation: 'test-only-confirmation' })); }
      if (body.action === 'revoke') { links.splice(links.findIndex(l => l.id === body.id), 1); return res.end(JSON.stringify({ links })); }
      if (body.mode === 'developer' && (!issued || !body.confirmDeveloper || body.confirmation !== 'test-only-confirmation')) { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Confirm first' })); }
      const link = { id: 'fixture-' + (links.length + 1), mode: body.mode, name: body.name, page: body.page, mine: true, canCopy: true, createdBy: 'Demo editor', createdAt: Date.now(), expiresAt: Date.now() + body.days * 86400000 };
      issued = false; links.push(link);
      return res.end(JSON.stringify({ link, url: 'https://example.invalid/mcp?key=fixture-not-a-real-key' }));
    }
    const file = path.resolve(dist, '.' + url.pathname);
    if (!file.startsWith(dist + path.sep)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
