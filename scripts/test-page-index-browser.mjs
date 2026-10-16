import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/page-index-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(
  path.join(folder, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(folder, 'entry.tsx'),
  `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CanvasContext} from '/app/page-canvas';
import {ImportedPage} from '/app/template-renderer';
import {templateDefaults} from '/app/templates';
import {customDefaults,CUSTOM_PAGES} from '/app/custom-pages';
import {newNode,CUSTOM_CONTENT} from '/app/canvas-schema';
import '/app/globals.css';
const params=new URLSearchParams(location.search);
const theme=params.get('theme')||'notebook-white';
const pages=JSON.stringify([{slug:'reading-demo',title:'A material that can mend itself'}]);
const values={...templateDefaults(theme),...customDefaults(pages),[CUSTOM_PAGES]:pages};
const layout=JSON.parse(values['layout:reading-demo']);
const titles=['The question','Designing the network','How we tested it','What we learned','Where we go next','References'];
const paragraphs=[
 'How could a material repair itself after damage? Our project explores how protein building blocks could assemble into a network, and what evidence we need to test that idea.',
 'We designed a network with two kinds of building block: proteins that form fibres and connecting nodes that join those fibres. The arrangement matters as much as the individual components.',
 'Each experiment starts with a specific question. We compare the response of our design with controls, record the conditions and use the observations to decide what to test next.',
 'The notebook captures both useful results and questions that remain open. Keeping those observations together helps us distinguish what we measured from what we still expect.',
 'Our next steps focus on repeatability, material behaviour and learning from people who could use the technology. Each step will inform the next version of our design.',
 'This demonstration shows how the page index follows saved section headings. Project references and supporting evidence remain part of the editable page content.'
];
layout.nodes=layout.nodes.filter(n=>n.id!=='custom-intro');
layout.order=layout.order.filter(id=>id!=='custom-intro');
titles.forEach((title,i)=>{const id='chapter-'+i;layout.nodes.push({...newNode(id,'text',title),parentId:CUSTOM_CONTENT,body:paragraphs[i]+'\\n\\n'+paragraphs[(i+1)%paragraphs.length],minHeight:400,...(i===1?{indexLabel:'Our design'}:{}),...(i===3?{headingLevel:3}:{})});layout.order.push(id)});
layout.nodes.push({...newNode('hidden-heading','text','Hidden draft'),parentId:CUSTOM_CONTENT,indexHidden:true});layout.order.push('hidden-heading');
values['layout:reading-demo']=JSON.stringify(layout);
const initial=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
function Test(){const[data,setData]=useState(initial);return <CanvasContext.Provider value={{data,editing:params.has('editor'),busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>({...prev,[id]:{value,version:version+1,author:'Test'}}));return true;}}}><ImportedPage data={data} page="reading-demo" field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
createRoot(document.getElementById('root')).render(<Test/>);
`,
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rollupOptions: { input: path.join(folder, 'index.html') },
  },
});
const server = createServer(async (req, res) => {
  try {
    const requestPath = req.url.split('?')[0];
    if (requestPath === '/mobile.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><meta name="viewport" content="width=device-width"><iframe title="Mobile wiki preview" style="width:390px;height:844px;border:1px solid #ddd" src="/' +
          relative +
          '/index.html"></iframe>',
      );
      return;
    }
    const file = path.join(
      requestPath.startsWith('/templates/') ? path.resolve('public') : dist,
      requestPath,
    );
    res.setHeader(
      'Content-Type',
      file.endsWith('.svg')
        ? 'image/svg+xml'
        : file.endsWith('.woff2')
          ? 'font/woff2'
          : file.endsWith('.png')
            ? 'image/png'
            : file.endsWith('.js')
              ? 'text/javascript'
              : file.endsWith('.css')
                ? 'text/css'
                : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/${relative}/index.html`;
console.log('Preview: ' + url);
if (process.argv.includes('--serve')) await new Promise(() => {});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  const nav = page.getByRole('navigation', {
    name: 'Page section index',
    exact: true,
  });
  await nav.getByRole('link', { name: 'The question', exact: true }).waitFor();
  assert.equal(await nav.getByRole('link').count(), 6);
  assert.equal(
    await nav.getByRole('link', { name: 'Hidden draft' }).count(),
    0,
  );
  assert.equal(await nav.getByRole('link', { name: 'Our design' }).count(), 1);
  assert.equal(await page.locator('.notebook-section-nav').count(), 1);
  await nav.getByRole('link', { name: 'What we learned', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.wiki-page-index a[aria-current]')
      ?.textContent.includes('What we learned'),
  );
  await nav
    .getByRole('button', { name: 'Hide page index', exact: true })
    .click();
  assert.equal(await nav.locator('ol').isVisible(), false);
  assert.equal(await page.locator('.notebook-section-nav').isVisible(), true);
  await page.reload();
  await nav
    .getByRole('button', { name: 'Show page index', exact: true })
    .waitFor();
  await nav
    .getByRole('button', { name: 'Show page index', exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() =>
    document.querySelector('[data-index-mobile="true"]'),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url + '?editor=1');
  await nav.getByRole('link', { name: 'The question', exact: true }).waitFor();
  await nav
    .getByRole('button', { name: 'Hide page index', exact: true })
    .click();
  assert.equal(await nav.locator('ol').isVisible(), false);
  assert.equal(await page.locator('.studio-selected').count(), 0);
  await nav
    .getByRole('button', { name: 'Show page index', exact: true })
    .click();
  await nav.getByRole('link', { name: 'References', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.wiki-page-index a[aria-current]')
      ?.textContent.includes('References'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS page index: labels, hidden headings, anchor navigation, right navigator retained, collapse persistence, mobile and editor interactions.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
