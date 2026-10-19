// Isolated export-error UI fixture; no accounts, uploads or production data.
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/export-diagnostics-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(path.join(folder, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(folder, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {ExportPanel} from '/app/export-panel';import {setApiProject} from '/app/project-api';import '/app/globals.css';setApiProject('fixture-project');createRoot(document.getElementById('root')).render(<ExportPanel disabled={false}/>);`);
const dist = path.join(folder, 'dist');
await build({ ...common, build: { outDir: dist, rolldownOptions: { input: path.join(folder, 'index.html') } } });
let attempts = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/export/bundles') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 422;
      attempts++;
      return res.end(JSON.stringify(attempts === 2 ? { error: 'Missing required pages: /imperial-college/contribution.' } : {
        error: '2 media files need attention before export.',
        mediaIssues: [
          { source: '/templates/notebook-purple//logo.png', kind: 'image', reason: 'Invalid media path: empty path segments are not allowed. Replace or reselect this file in the editor.', locations: [{page:'home',pageTitle:'Home',layerId:'sponsor-logo',layerName:'Sponsor logo',field:'Media source'}] },
          { source: '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf', kind: 'pdf', reason: 'A saved media file is missing or unavailable. Restore or replace it before exporting.', locations: [{page:'notebook',pageTitle:'Lab notebooks',layerId:'lab-pdf',layerName:'Lab notebook PDF',field:'Media source'}] },
        ],
      }));
    }
    const file = path.resolve(dist, '.' + url.pathname);
    if (!file.startsWith(dist + path.sep)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
