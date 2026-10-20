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
const page=params.get('page')||'reading-demo';
const pages=JSON.stringify([{slug:'reading-demo',title:'A material that can mend itself'}]);
const values={...templateDefaults(theme),...customDefaults(pages),[CUSTOM_PAGES]:pages};
if(params.has('appearance'))values['site:appearance']=params.get('appearance');
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
if(params.has('layers')){
 const frame={...newNode('experiment-frame','section','Experiment notes'),parentId:CUSTOM_CONTENT,layoutMode:'flow'};
 const accordion={...newNode('experiment-accordion','accordion','Experimental details'),parentId:frame.id,items:[{id:'method-item',title:'Method',body:'Existing method text.'},{id:'result-item',title:'Observations',body:'Existing observations.'}]};
 layout.nodes.push(frame,accordion);layout.order.push(frame.id,accordion.id);
}
if(params.has('flat')){layout.nodes=layout.nodes.filter(n=>!['custom-content','custom-heading'].includes(n.id)).map(({parentId,...n})=>n);layout.order=layout.order.filter(id=>layout.nodes.some(n=>n.id===id));}
if(params.has('no-sidebar'))layout.sidebar=false;
values['layout:reading-demo']=JSON.stringify(layout);
const initial=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
function Test(){const[data,setData]=useState(initial);return <CanvasContext.Provider value={{data,editing:params.has('editor'),busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>({...prev,[id]:{value,version:version+1,author:'Test'}}));return true;}}}><ImportedPage data={data} page={page} field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
createRoot(document.getElementById('root')).render(<Test/>);
`,
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rolldownOptions: { input: [path.join(folder, 'index.html'), path.resolve('server/preview.html')] },
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
      requestPath === '/studio-preview' ? 'server/preview.html' : requestPath,
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
  assert.equal(await page.locator('.notebook-section-nav').count(), 0);
  await nav.getByRole('link', { name: 'What we learned', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.wiki-page-index a[aria-current]')
      ?.textContent.includes('What we learned'),
  );
  await nav
    .getByRole('button', { name: 'Hide page index', exact: true })
    .click();
  assert.equal(await nav.locator('ol').isVisible(), true);
  assert.equal(await nav.locator('.wiki-page-index-label').first().isVisible(), false);
  // Let anchor navigation finish before hovering; scrolling intentionally hides tips.
  await page.evaluate(async () => {
    let last = window.scrollY, stable = 0;
    while (stable < 4) {
      await new Promise(requestAnimationFrame);
      const next = window.scrollY;
      stable = next === last ? stable + 1 : 0;
      last = next;
    }
  });
  await nav.getByRole('link', { name: 'Our design', exact: true }).hover();
  assert.equal(await nav.locator('.wiki-page-index-tip').isVisible(), true);
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
  assert.equal(await nav.locator('ol').isVisible(), true);
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
  // Actual template prose must use the space released by the sidebar, not
  // just move left with the old 710/780 px reading-width cap.
  for (const theme of ['regelerate', 'notebook-white', 'notebook-purple', 'swiss']) {
    for (const editor of [false, true]) {
      await page.goto(url + '?page=description&theme=' + theme + (editor ? '&editor=1' : ''));
      const show = nav.getByRole('button', { name: 'Show page index', exact: true });
      const hide = nav.getByRole('button', { name: 'Hide page index', exact: true });
      await nav.waitFor();
      if (await show.isVisible()) await show.click();
      const prose = page.locator('.wiki-content > article');
      const expandedWidth = await prose.evaluate(el => el.getBoundingClientRect().width);
      await hide.click();
      const widths = await prose.evaluate(el => ({
        prose: (el.querySelector('.wiki-prose') || el).getBoundingClientRect().width,
        column: el.getBoundingClientRect().width,
      }));
      assert.ok(widths.prose > expandedWidth + 30, theme + ': collapsed content expands');
      assert.ok(Math.abs(widths.prose - widths.column) < 2, theme + ': prose fills the column');
      await show.click();
      assert.ok(Math.abs(await prose.evaluate(el => el.getBoundingClientRect().width) - expandedWidth) < 2,
        theme + ': expanding index restores original reading width');
    }
  }
  // The appearance may be Luca while the saved content is still Blank.
  for (const flat of [false, true]) {
    await page.goto(url + '?theme=blank&appearance=luca&editor=1' + (flat ? '&flat=1' : ''));
    await nav.waitFor();
    const show = nav.getByRole('button', { name: 'Show page index', exact: true });
    if (await show.isVisible()) await show.click();
    assert.equal(await nav.getByRole('link').count(), 6);
    assert.equal(await page.locator('[data-page-index-host]').count(), 1);
    const alignment = await page.evaluate(() => ({
      index: document.querySelector('.wiki-page-index').getBoundingClientRect().top,
      heading: document.querySelector('#page-section-1').getBoundingClientRect().top,
    }));
    assert.ok(Math.abs(alignment.index - alignment.heading) < 2, 'index aligns with article');
    const zoom = page.getByRole('spinbutton', { name: 'Canvas zoom percent', exact: true });
    await zoom.fill('30'); await zoom.press('Enter');
    await page.locator('.studio-stage').evaluate(el => { el.scrollTop = 250; });
    const pinnedInStage = () => Math.abs(
      document.querySelector('.wiki-page-index').getBoundingClientRect().top -
      document.querySelector('.studio-stage').getBoundingClientRect().top - 24
    ) < 2;
    await page.waitForFunction(pinnedInStage);
    assert.equal(await nav.getAttribute('data-scroll-pinned'), '');
    assert.equal(await nav.getAttribute('data-pinned'), null);
    const scrollRange = await nav.getAttribute('style');
    await page.locator('.studio-stage').evaluate(el => { el.scrollTop += 80; });
    await page.waitForFunction(pinnedInStage);
    assert.equal(await nav.getAttribute('style'), scrollRange, 'scrolling does not rewrite pinning transforms or range endpoints');
    await zoom.fill('60'); await zoom.press('Enter');
    await page.waitForFunction(pinnedInStage);
    const toggle = page.getByRole('switch', { name: 'Left contents sidebar', exact: true });
    await toggle.click();
    await page.locator('[data-page-index-host]').waitFor({ state: 'detached' });
    await toggle.click();
    await nav.waitFor();
    assert.equal(await nav.getByRole('link').count(), 6);
    const designNav = await nav.elementHandle();
    const designState = await page.locator('.studio-stage').evaluate(el => ({
      scrollTop: el.scrollTop,
      zoom: document.querySelector('[aria-label="Canvas zoom percent"]').value,
    }));
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.frameLocator('iframe[title="Complete website preview"]');
    await preview.getByRole('heading', { name: 'The question', exact: true }).waitFor();
    const previewNav = preview.getByRole('navigation', { name: 'Page section index', exact: true });
    assert.equal(await previewNav.getByRole('link').count(), 6);
    await preview.locator('body').evaluate(async () => {
      await document.fonts.ready;
      let previous = window.scrollY, stable = 0;
      for (let frame = 0; frame < 300 && stable < 20; frame++) {
        await new Promise(requestAnimationFrame);
        const next = window.scrollY;
        stable = previous === next ? stable + 1 : 0;
        previous = next;
      }
    });
    // A descendant can override inherited visibility (authored CSS, shadow
    // resets, animated/composited navigation). It must still never paint over
    // the independently mounted Preview. Compare actual pixels, not isVisible,
    // which intentionally ignores ancestor opacity.
    const workspace = page.locator('.studio-workspace-hidden');
    assert.equal(await workspace.evaluate(el => el.inert), true);
    // Keep a positioned copy inside the viewport regardless of the editor's
    // current scroll/zoom. This simulates a widget resetting visibility inside
    // the retained workspace, without depending on an offscreen index's bounds.
    await workspace.evaluate(el => {
      const copy = el.querySelector('.wiki-page-index').cloneNode(true);
      copy.id = 'visibility-regression';
      copy.style.cssText = 'position:absolute;top:180px;left:450px;width:180px;height:450px;visibility:visible!important;background:#ff00ff!important;z-index:10000';
      el.append(copy);
    });
    const clip = await page.locator('.studio-preview-viewport').boundingBox();
    const withDesign = await page.screenshot({ clip, animations: 'disabled' });
    await page.locator('#visibility-regression').evaluate(el => el.style.setProperty('visibility', 'hidden', 'important'));
    const withoutDesign = await page.screenshot({ clip, animations: 'disabled' });
    await writeFile(path.join(folder, 'preview-with-design.png'), withDesign);
    await writeFile(path.join(folder, 'preview-without-design.png'), withoutDesign);
    assert.ok(withDesign.equals(withoutDesign), 'hidden Design index cannot paint above Preview');
    await page.locator('#visibility-regression').evaluate(el => el.remove());
    const previewShow = previewNav.getByRole('button', { name: 'Show page index', exact: true });
    if (await previewShow.isVisible()) await previewShow.click();
    await previewNav.getByRole('button', { name: 'Hide page index', exact: true }).click();
    await previewShow.waitFor();
    await page.getByRole('button', { name: 'Back to editor', exact: true }).click();
    assert.equal(await designNav.evaluate(el => el === document.querySelector('.wiki-page-index')), true,
      'Design index stays mounted');
    assert.equal(await page.locator('.studio-workspace').evaluate(el => el.inert), false);
    assert.deepEqual(await page.locator('.studio-stage').evaluate(el => ({
      scrollTop: el.scrollTop,
      zoom: document.querySelector('[aria-label="Canvas zoom percent"]').value,
    })), designState, 'Preview preserves Design scroll and zoom');
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS page index: labels, hidden headings, anchor navigation, merged marker rail, collapse persistence, mobile and editor interactions.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
