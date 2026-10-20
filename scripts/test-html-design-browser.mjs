import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

// Same observer/reduced-motion contract as Education's GRIDLESS Workshop.
const fixture = {
  id: 'workshop', kind: 'html', name: 'GRIDLESS Workshop',
  html: '<h2>Workshop</h2>' + [1, 2, 3].map(n =>
    `<section class="step"><div class="card"><h3>Day ${n}</h3><p>Workshop content</p></div></section>`).join(''),
  css: 'body{font:20px Arial}.step{height:600px}.card{opacity:0;transform:translateX(-36px);transition:opacity .6s .45s,transform .7s .45s}.step.in .card{opacity:1;transform:none}.no-anim .card{transition:none!important}',
  javascript: `const steps=[...document.querySelectorAll('.step')];
if(matchMedia('(prefers-reduced-motion: reduce)').matches){
document.body.classList.add('no-anim');steps.forEach(s=>s.classList.add('in'));
}else{const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});steps.forEach(s=>io.observe(s))}`,
};
// Optional private saved node: exercise real content locally without committing it.
const node = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : fixture;
node.html = node.html.replace(/<img\b[^>]*>/gi, '<span>Image placeholder</span>') +
  '<div id="css-entrance">CSS entrance</div><div id="intentionally-hidden">Hidden</div><div id="intentionally-transparent">Transparent</div>';
node.css += '\n#css-entrance{animation:design-test-enter 20s 10s both}@keyframes design-test-enter{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}#intentionally-hidden{display:none}#intentionally-transparent{opacity:0}';
const dir = await mkdtemp(path.resolve('work/html-design-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
await writeFile(path.join(dir, 'entry.tsx'), `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{CustomHtmlBlock}from'/app/custom-html-block';
const node=${JSON.stringify(node)};
function App(){const[mode,setMode]=useState('design');return <><nav>{['design','preview','interact'].map(m=><button id={m} onClick={()=>setMode(m)}>{m}</button>)}</nav><div className="studio-workspace"><CustomHtmlBlock node={node} editing={mode!=='preview'} interacting={mode==='interact'}/></div></>}
createRoot(document.getElementById('root')).render(<App/>);`);
await writeFile(path.join(dir, 'index.html'), '<!doctype html><style>body{margin:0;background:#eee}nav{position:fixed;top:0;background:white;z-index:2;width:100%;height:40px}button{margin:8px}.studio-workspace{margin:55px auto;width:900px}.custom-html-frame{width:100%;height:4000px;border:0}</style><div id="root"></div><script type="module" src="./entry.tsx"></script>');
await build({ ...common, build: { outDir: path.join(dir, 'dist'), rolldownOptions: { input: path.join(dir, 'index.html') } } });
const server = createServer(async (req, res) => {
  try {
    const file = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(path.join(dir, 'dist', file)));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
  const frame = page.frameLocator('iframe');
  const designReady = async () => {
    await frame.locator('html[data-studio-design]').waitFor();
    const state = await frame.locator('body').evaluate(() => ({
      cards: [...document.querySelectorAll('.step .card')].map(e => getComputedStyle(e).opacity),
      unrevealed: document.querySelectorAll('.step:not(.in)').length,
      entrance: getComputedStyle(document.getElementById('css-entrance')).opacity,
      hidden: getComputedStyle(document.getElementById('intentionally-hidden')).display,
      transparent: getComputedStyle(document.getElementById('intentionally-transparent')).opacity,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      normalMotion: matchMedia('(prefers-reduced-motion: no-preference)').matches,
      unrelated: matchMedia('(min-width: 1px)').matches,
    }));
    assert.ok(state.cards.length > 1);
    assert.ok(state.cards.every(opacity => opacity === '1'), JSON.stringify(state));
    assert.equal(state.unrevealed, 0, 'including cards below the viewport');
    assert.equal(state.entrance, '1', 'delayed CSS animation shows final frame');
    assert.equal(state.hidden, 'none');
    assert.equal(state.transparent, '0');
    assert.equal(state.reduced, true);
    assert.equal(state.normalMotion, false);
    assert.equal(state.unrelated, true);
  };
  await designReady();
  assert.ok(!(await page.locator('iframe').getAttribute('data-html-document')).includes('data-studio-design'), 'exported document retains original animation');
  await page.screenshot({ path: path.join(dir, 'design.png') });
  for (const mode of ['preview', 'interact']) {
    await page.locator('#' + mode).click();
    await frame.locator('html:not([data-studio-design]) .step').first().waitFor();
    assert.equal(await frame.locator('body').evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
    assert.ok(await frame.locator('.step:not(.in)').count() > 0, mode + ' retains scroll reveal');
    await page.locator('#design').click();
    await designReady();
  }
  const sandboxed = await frame.locator('body').evaluate(() => {
    try { return parent.document === document; } catch { return true; }
  });
  assert.equal(sandboxed, true);
  assert.deepEqual(errors, []);
  console.log('PASS: Design shows all workshop cards and final CSS entrances immediately; Preview/Interact retain scroll reveals; explicit hiding, export source and sandbox isolation preserved. ' + dir);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
}
