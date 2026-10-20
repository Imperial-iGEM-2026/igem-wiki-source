import { mappedRuntime, runtimeImports } from './publication-runtime.mjs';
import { resolveSource, readSource } from './source-parts.mjs';
import {
  defaultLoading,
  validLoading,
  startSiteLoading,
} from '../app/site-loading.js';
import { rewriteGoogleFonts } from './google-fonts.mjs';
import { sharedPublicationAssets } from './share-publication-assets.mjs';
import {
  isRecording,
  isVideoUniverseEmbed,
  replaceRecordingFrames,
} from './export-recordings.mjs';
import { compressExportImage, IMAGE_UPLOAD_BYTES } from './image-export.mjs';
import { splitPdf, PDF_PART_BYTES } from './pdf-parts.mjs';
import {
  exportMedia,
  dynamicHtmlImages,
  PDF_WORKER_SOURCE,
  mediaFolder,
  templateFontCss,
  siteIcon,
} from './export-media.mjs';
import { build } from 'vite';
import {
  readFile,
  open,
  writeFile,
  mkdir,
  readdir,
  copyFile,
  cp,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { common, root } from './build-options.mjs';
import {
  igemURL,
  cssResources,
  externalResources,
  withoutGoogleFontImports,
} from './igem-resources.mjs';

const args = process.argv.slice(2),
  option = (key, fallback) => {
    const i = args.indexOf('--' + key);
    return i < 0 ? fallback : args[i + 1];
  };
const source = option('snapshot'),
  base = option('base', '/'),
  output = path.resolve(option('out', './wiki-export'));
if (!source)
  throw Error(
    'Use --snapshot path/to/snapshot.json --base /registered-team/ --out ./wiki-export',
  );
if (!/^\/(?:[a-z0-9-]+\/)*$/.test(base))
  throw Error(
    '--base must be / or /registered-team/ with lowercase letters, numbers and hyphens.',
  );
try {
  if ((await readdir(output)).length)
    throw Error(
      'Output directory is not empty. Choose a new --out directory to preserve earlier exports.',
    );
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const input = JSON.parse(await readFile(source, 'utf8'));
const snapshot = input.format === 'prion-wiki-source'
  ? input.version === 2 ? await readSource(source) : await resolveSource(input)
  : input;
if (
  !['prion-wiki-snapshot', 'prion-wiki-source'].includes(snapshot.format) ||
  snapshot.version !== 1 ||
  !snapshot.values
)
  throw Error(
    'Unsupported snapshot. Download a fresh snapshot from the editor.',
  );
const map = option('media-map')
  ? JSON.parse(await readFile(option('media-map'), 'utf8'))
  : {};
let searchURL = '';
if (snapshot.format === 'prion-wiki-source') {
  try {
    const search = JSON.parse(await readFile(path.join(path.dirname(source), 'search.json'), 'utf8'));
    if (search.version !== 1 || !/^\/templates\/runtime\/search-[a-f0-9]{64}\.js$/.test(search.source)) throw Error('Invalid project search manifest.');
    searchURL = map[search.source];
    if (typeof searchURL !== 'string' || !/^https:\/\/static\.igem\.wiki\/[^\s"'`<>\\]+$/.test(searchURL) || searchURL.includes('YOUR-TEAM'))
      throw Error('Upload the project search index from assets/runtime and include its iGEM URL in the media mapping.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
let pdfParts = {};
if (snapshot.format === 'prion-wiki-source') {
  try {
    pdfParts = JSON.parse(
      await readFile(path.join(path.dirname(source), 'pdf-parts.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
let googleFonts = {};
if (snapshot.format === 'prion-wiki-source') {
  try {
    googleFonts = JSON.parse(
      await readFile(
        path.join(path.dirname(source), 'google-fonts.json'),
        'utf8',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const pdfViewers = {};
const strict = args.includes('--igem');
let fontCss = option('font-css')
  ? await readFile(option('font-css'), 'utf8')
  : '';
if (
  fontCss &&
  (/<\/style/i.test(fontCss) ||
    cssResources(fontCss).some(
      (url) => !url.startsWith('https://static.igem.wiki/'),
    ))
)
  throw Error(
    '--font-css must use only actual font URLs on https://static.igem.wiki/ and cannot contain HTML.',
  );
const issues = [],
  assets = [],
  mediaMap = {};
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const scratch = path.join(root, '.static-build');
await build({
  ...common,
  build: {
    ssr: path.join(root, 'scripts/static-renderer.tsx'),
    outDir: scratch,
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'renderer.mjs' } },
  },
});
const {
  initial,
  wikiPages: corePages,
  render,
  validateLayout,
  customDefaults,
  parseCustomPages,
  customWikiPage,
  CUSTOM_PAGES,
  REMOVED_PAGES,
  parseRemovedPages,
  templates,
  templateDefaults,
  sponsorLayers,
  igemPageCheck,
  publicationSlug,
} = await import(
  pathToFileURL(path.join(scratch, 'renderer.mjs')).href + '?v=' + Date.now()
);
const templateId = snapshot.values['site:template'];
if (templateId && !Object.hasOwn(templates, templateId))
  throw Error('Unknown template');
const template = templateId ? templates[templateId] : null;
const extraDefaults = customDefaults(snapshot.values[CUSTOM_PAGES]);
const allowed = {
  ...(template ? templateDefaults(templateId) : initial),
  ...extraDefaults,
};
const wikiPages = [
  ...(template
    ? template.pages
        .filter(
          (p) =>
            p.slug !== 'home' &&
            !parseRemovedPages(snapshot.values[REMOVED_PAGES]).includes(p.slug),
        )
        .map((p) => customWikiPage({ slug: p.slug, title: p.title }))
    : corePages.filter(
        (p) =>
          !parseRemovedPages(snapshot.values[REMOVED_PAGES]).includes(p.slug),
      )),
  ...parseCustomPages(snapshot.values[CUSTOM_PAGES]).map(customWikiPage),
];
const requiredPages = [
  ...new Set([
    'contribution',
    'engineering',
    'human-practices',
    ...option('required-pages', '').split(',').filter(Boolean),
  ]),
];
if (requiredPages.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))
  throw Error('--required-pages must contain comma-separated page slugs.');
const pageSlugs = wikiPages.map((page) => page.slug);
const routeSlug = (slug) => publicationSlug(slug, pageSlugs);
const standardPages = igemPageCheck(pageSlugs, requiredPages, base);
for (const page of standardPages)
  if (!page.present) issues.push('Missing required iGEM page: ' + page.path);
const data = Object.fromEntries(
  Object.entries(allowed).map(([id, value]) => [
    id,
    { value, version: 0, author: '' },
  ]),
);
for (const [key, value] of Object.entries(snapshot.values)) {
  if (snapshot.format === 'prion-wiki-source' && !Object.hasOwn(allowed, key))
    throw Error('Unknown field in reviewed publication source: ' + key);
  if (!Object.hasOwn(allowed, key)) continue;
  if (
    typeof value !== 'string' ||
    (key.startsWith('layout:')
      ? (() => {
          try {
            return JSON.stringify({ ...JSON.parse(value), customCss: '' })
              .length;
          } catch {
            return Infinity;
          }
        })() >
        1024 * 1024
      : value.length > 12000)
  )
    throw Error('Invalid field: ' + key);
  if (key.startsWith('layout:')) {
    const layout = JSON.parse(value);
    if (!validateLayout(layout)) throw Error('Invalid layout: ' + key);
  }
  data[key] = { value, version: value === initial[key] ? 0 : 1, author: '' };
  if (key.startsWith('wiki:') && value === initial[key])
    issues.push('Unfinished team section: ' + key);
}
if (!/^(1,2,3|1,3,2|2,1,3|2,3,1|3,1,2|3,2,1)$/.test(data.order.value))
  throw Error('Invalid topic order');
const refs = exportMedia(
  Object.fromEntries(
    Object.entries(data).map(([key, block]) => [key, block.value]),
  ),
  template,
  sponsorLayers,
);
// Fresh exports include display copies; older/offline snapshots need no new media.
for (const source of [...refs.keys()]) {
  for (const size of [640, 1600]) {
    const display = source + `?preview=${size}&v=2`;
    if (map[display]) refs.set(display, 'image');
  }
}
for (const url of googleFonts.fonts || []) refs.set(url, 'font');
for (const [source, kind] of refs) if (isRecording(kind)) refs.delete(source);
const recordingTodos = [];
// Only the render copy changes: invalid/empty media blocks must produce a TODO
// instead of an empty frame (embedURL would otherwise silently discard them).
for (const [key, block] of Object.entries(data)) {
  if (!key.startsWith('layout:')) continue;
  const layout = JSON.parse(block.value);
  layout.nodes = layout.nodes.map((node) => {
    if (node.kind === 'embed' && !isVideoUniverseEmbed(node.src))
      return {
        ...node,
        kind: 'video',
        src: node.src || 'https://video.igem.org/RECORDING-NOT-SET',
      };
    if (['video', 'audio'].includes(node.kind) && !node.src)
      return { ...node, src: 'https://video.igem.org/RECORDING-NOT-SET' };
    return node;
  });
  if (!validateLayout(layout))
    throw Error('Invalid export recording layout: ' + key);
  data[key] = { ...block, value: JSON.stringify(layout) };
}

await mkdir(path.join(output, 'public/assets/media'), { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs'])
  await cp(
    path.join(root, 'node_modules/pdfjs-dist', dir),
    path.join(output, 'public/assets/pdfjs', dir),
    {
      recursive: true,
      filter: (source) => path.basename(source) !== 'quickjs-eval.wasm',
    },
  );
// Source bundles contain LICENSE; editor checkouts keep the export licence scoped
// to publication/ so exporting does not relicense the editor itself.
let wikiLicense;
try {
  wikiLicense = await readFile(
    path.join(root, 'publication/wiki-LICENSE.txt'),
    'utf8',
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  wikiLicense = await readFile(path.join(root, 'LICENSE'), 'utf8');
}
await writeFile(path.join(output, 'LICENSE'), wikiLicense);
await writeFile(path.join(output, 'public/LICENSE'), wikiLicense);
await writeFile(
  path.join(output, 'public/katex-LICENSE.txt'),
  await readFile(path.join(root, 'publication/katex-LICENSE.txt'), 'utf8'),
);
await writeFile(
  path.join(output, 'public/pdf-processing-LICENSES.txt'),
  await readFile(path.join(root, 'publication/pdf-processing-LICENSES.txt')),
);
for (const [url, kind] of refs) {
  if (kind === 'pdf' && pdfParts[url]) {
    let nextPage = 1;
    const parts = pdfParts[url];
    if (!Array.isArray(parts) || !parts.length)
      throw Error('Invalid PDF parts: ' + url);
    pdfViewers[url] = parts.map((part) => {
      if (
        !Number.isInteger(part.start) ||
        !Number.isInteger(part.end) ||
        part.start !== nextPage ||
        part.end < part.start
      )
        throw Error('PDF page ranges must be complete and ordered: ' + url);
      nextPage = part.end + 1;
      const hosted = map[part.source];
      if (
        typeof hosted !== 'string' ||
        !hosted.startsWith('https://static.igem.wiki/') ||
        /["<>\s]|YOUR-TEAM/.test(hosted)
      )
        throw Error(
          'Upload and map every PDF part before building: ' + part.source,
        );
      assets.push({ source: part.source, kind: 'pdf', publishedURL: hosted });
      return { start: part.start, end: part.end, url: hosted };
    });
    continue;
  }
  const mapped = map[url];
  if (mapped && /YOUR-TEAM|REPLACE-WITH-VIDEO-ID/.test(mapped))
    issues.push(
      'Replace the example media URL with the actual uploaded URL: ' + url,
    );
  if (
    mapped &&
    (typeof mapped !== 'string' ||
      !/^https:\/\/(static\.igem\.wiki|video\.igem\.org)\//.test(mapped) ||
      /["<>\s]/.test(mapped))
  )
    throw Error(
      'Media map values must be HTTPS URLs on static.igem.wiki or video.igem.org: ' +
        url,
    );
  if (strict && mapped) {
    // CI uses hosted media, never the editor's private media store or a base64 snapshot.
    mediaMap[url] = mapped;
    assets.push({ source: url, kind, publishedURL: mapped });
  } else if (url.startsWith('/templates/')) {
    if (
      !/^\/templates\/(regelerate|swiss|notebook-purple|fonts)\/[a-zA-Z0-9_./-]+$/.test(
        url,
      ) ||
      url.includes('..')
    )
      throw Error('Invalid template asset');
    let bytes = await readFile(path.join(root, 'public', url));
    if (
      /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(url) &&
      (bytes.length > IMAGE_UPLOAD_BYTES || /\.(jpe?g|png)$/i.test(url))
    )
      bytes = compressExportImage(bytes, url).data;
    const file = 'public' + url;
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await writeFile(path.join(output, file), bytes);
    mediaMap[url] = mapped || base + url.slice(1);
    assets.push({
      source: url,
      file,
      kind,
      bytes: bytes.length,
      publishedURL: mapped || null,
    });
    if (!mapped) issues.push('Upload and map media on iGEM hosting: ' + url);
  } else if (url.startsWith('/api/media/') || url === '/prion-hero.png') {
    const filename =
      url === '/prion-hero.png'
        ? 'prion-hero.png'
        : url.slice('/api/media/'.length);
    if (
      !/^[a-f0-9-]+\.[a-z0-9]+$/.test(filename) &&
      filename !== 'prion-hero.png'
    )
      throw Error('Invalid media filename');
    const mediaDir = option('media-dir');
    const external =
      filename !== 'prion-hero.png' && !snapshot.media?.[url] && mediaDir
        ? path.resolve(mediaDir, filename)
        : null;
    let externalSize = 0;
    let bytes;
    if (external) {
      const handle = await open(external, 'r');
      try {
        const meta = await handle.stat();
        if (!meta.isFile()) throw Error('Media is not a file');
        externalSize = meta.size;
        // Inspect only the GLB JSON chunk; copy the binary asset without buffering it.
        const header = Buffer.alloc(Math.min(20, meta.size));
        await handle.read(header, 0, header.length, 0);
        bytes = header;
        if (filename.endsWith('.glb') && header.length === 20) {
          const jsonBytes = header.readUInt32LE(12);
          if (jsonBytes <= 8 * 1024 * 1024 && jsonBytes + 20 <= meta.size) {
            bytes = Buffer.alloc(jsonBytes + 20);
            await handle.read(bytes, 0, bytes.length, 0);
          }
        }
      } finally {
        await handle.close();
      }
    } else
      bytes =
        filename === 'prion-hero.png'
          ? await readFile(path.join(root, 'public/prion-hero.png'))
          : snapshot.media?.[url]
            ? Buffer.from(snapshot.media[url], 'base64')
            : null;
    if (!bytes)
      throw Error(
        'Missing uploaded media: ' +
          url +
          '. Download a complete portable snapshot.',
      );
    if (kind === 'pdf' && (externalSize || bytes.length) > PDF_PART_BYTES) {
      const parts = await splitPdf(external ? await readFile(external) : bytes);
      pdfViewers[url] = [];
      for (const part of parts) {
        const partName =
          filename.replace(/\.pdf$/i, '') +
          `-pages-${part.start}-${part.end}.pdf`;
        const partSource = url + `?pdf-part=${part.start}-${part.end}`;
        const file = 'public/assets/media/' + partName;
        await writeFile(path.join(output, file), part.data);
        const hosted = map[partSource];
        if (
          hosted &&
          (typeof hosted !== 'string' ||
            !hosted.startsWith('https://static.igem.wiki/') ||
            /["<>\s]|YOUR-TEAM/.test(hosted))
        )
          throw Error('Invalid hosted PDF part: ' + partSource);
        if (!hosted)
          issues.push('Upload and map PDF part on iGEM hosting: ' + partSource);
        assets.push({
          source: partSource,
          kind: 'pdf',
          file,
          bytes: part.data.length,
          publishedURL: hosted || null,
        });
        pdfViewers[url].push({
          start: part.start,
          end: part.end,
          url: hosted || base + 'assets/media/' + partName,
        });
      }
      continue;
    }
    if (filename.endsWith('.glb')) {
      try {
        if (
          bytes.toString('ascii', 0, 4) !== 'glTF' ||
          bytes.readUInt32LE(4) !== 2 ||
          bytes.toString('ascii', 16, 20) !== 'JSON'
        )
          throw Error();
        const gltf = JSON.parse(
          bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)),
        );
        if (
          (gltf.extensionsUsed || []).some((x) =>
            /draco|basisu|meshopt/i.test(x),
          ) ||
          [...(gltf.buffers || []), ...(gltf.images || [])].some(
            (x) => x.uri && !x.uri.startsWith('data:'),
          )
        )
          issues.push(
            '3D model must be self-contained and uncompressed to avoid external decoder/texture requests: ' +
              filename,
          );
      } catch {
        issues.push('Could not validate GLB: ' + filename);
      }
    }
    let compressed = false;
    if (
      /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(filename) &&
      ((externalSize || bytes.length) > IMAGE_UPLOAD_BYTES ||
        /\.(jpe?g|png)$/i.test(filename))
    ) {
      const checked = compressExportImage(
        external ? await readFile(external) : bytes,
        filename,
      );
      bytes = checked.data;
      externalSize = bytes.length;
      compressed = checked.changed;
    }
    if (external && !compressed)
      await copyFile(
        external,
        path.join(output, 'public/assets/media', filename),
      );
    else
      await writeFile(
        path.join(output, 'public/assets/media', filename),
        bytes,
      );
    mediaMap[url] = mapped || base + 'assets/media/' + filename;
    assets.push({
      source: url,
      file: 'public/assets/media/' + filename,
      kind,
      bytes: external ? externalSize : bytes.length,
      publishedURL: mapped || null,
    });
    if (!mapped) issues.push('Upload and map media on iGEM hosting: ' + url);
  } else {
    mediaMap[url] = mapped || url;
    if (
      !/^https:\/\/(static\.igem\.wiki|video\.igem\.org)\//.test(mediaMap[url])
    )
      issues.push('External media must be moved to iGEM hosting: ' + url);
    assets.push({ source: url, kind, publishedURL: mapped || url });
  }
  if (
    ['image', 'pdf', 'model'].includes(kind) &&
    mediaMap[url].startsWith('https://video.igem.org/')
  )
    issues.push(
      'Static asset must be uploaded and mapped to static.igem.wiki: ' + url,
    );
}
const repository = option('repository', '');
if (
  repository &&
  !/^https:\/\/gitlab\.igem\.org\/[a-zA-Z0-9_./-]+$/.test(repository)
)
  throw Error(
    '--repository must be your official gitlab.igem.org repository URL',
  );
if (!repository)
  issues.push('Add --repository with the official iGEM source repository URL.');
const attribution = option('attribution-url', '');
if (attribution && (!igemURL(attribution) || /["<>\s]/.test(attribution)))
  throw Error(
    '--attribution-url must be the exact official HTTPS iframe URL supplied by iGEM, hosted on iGEM infrastructure.',
  );
// Attributions are submitted on the team page; a wiki embed is optional.
if (!args.includes('--license-confirmed'))
  issues.push(
    'Review media/content rights and pass --license-confirmed for CC BY 4.0 publication.',
  );
if (!/^\/[a-z0-9-]+\/$/.test(base))
  issues.push(
    'Set --base to your registered iGEM team URL path for iGEM publication.',
  );
// Keep complete license texts with the site when distributing standalone runtimes.
const modelLicenses = [];
for (const name of ['@google/model-viewer', 'three', 'lit', 'lit-html', 'lit-element', '@lit/reactive-element', '@monogrid/gainmap-js', 'promise-worker-transferable']) {
  modelLicenses.push(name + '\n' + await readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8'));
}
await writeFile(path.join(output, 'public/model-viewer-LICENSES.txt'), modelLicenses.join('\n\n'));
const uploadedRuntime = mappedRuntime(map);
await build({
  ...common,
  plugins: [...(common.plugins || []), runtimeImports(uploadedRuntime)],
  base,
  build: {
    outDir: path.join(output, 'public'),
    emptyOutDir: false,
    cssCodeSplit: false,
    rolldownOptions: {
      input: path.join(root, 'scripts/static-runtime.ts'),
      output: {
        entryFileNames: 'assets/wiki.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
const savedLoading = JSON.parse(snapshot.values['site:header'] || '{}').loading;
if (savedLoading && !validLoading(savedLoading))
  throw Error('Invalid website loading animation settings.');
const loading = { ...defaultLoading, ...savedLoading };
if (loading.image) loading.image = mediaMap[loading.image] || loading.image;
if (loading.enabled)
  await writeFile(
    path.join(output, 'public/assets/site-loading.js'),
    '(' +
      startSiteLoading.toString() +
      ')(' +
      JSON.stringify(loading) +
      ',' +
      JSON.stringify('publication:' + base) +
      ');',
  );
const loadingScript = loading.enabled
  ? `<script src="${base}assets/site-loading.js"></script>`
  : '';
const assetFiles = await readdir(path.join(output, 'public/assets'));
const hostedPdfWorker = map[PDF_WORKER_SOURCE];
if (hostedPdfWorker) {
  if (
    typeof hostedPdfWorker !== 'string' ||
    !/^https:\/\/static\.igem\.wiki\/[^\s"'`<>\\]+$/.test(hostedPdfWorker) ||
    /YOUR-TEAM/.test(hostedPdfWorker)
  )
    throw Error(
      'Upload the PDF JavaScript worker and use its actual static.igem.wiki URL.',
    );
  // The worker is a self-contained ES module. PDF.js wraps a cross-origin worker
  // in a blob module; no relative module dependencies need URL rewriting.
  let rewritten = false;
  for (const file of assetFiles.filter((name) => name.endsWith('.js'))) {
    const target = path.join(output, 'public/assets', file);
    const original = await readFile(target, 'utf8');
    const from = base + 'assets/pdf.worker.min.mjs';
    if (original.includes(from)) {
      await writeFile(target, original.replaceAll(from, hostedPdfWorker));
      rewritten = true;
    }
  }
  if (!rewritten)
    throw Error(
      'Could not locate the PDF worker reference; refusing to remove its local copy.',
    );
  await unlink(path.join(output, 'public/assets/pdf.worker.min.mjs'));
  assets.push({
    source: PDF_WORKER_SOURCE,
    kind: 'runtime',
    publishedURL: hostedPdfWorker,
  });
}
for (const asset of uploadedRuntime) {
  if (asset.forward) {
    // PDF.js constructs decoder filenames at runtime. Keep a tiny forwarding
    // module at that path; the decoder implementation loads from iGEM instead.
    await writeFile(path.join(output, 'public', asset.forward),
      `export { default } from ${JSON.stringify(asset.url)};\n`);
  }
  if (asset.source !== PDF_WORKER_SOURCE)
    assets.push({ source: asset.source, kind: 'runtime', publishedURL: asset.url });
}
const css = assetFiles.filter((f) => f.endsWith('.css'));
for (const file of css) {
  const target = path.join(output, 'public/assets', file);
  const text = rewriteGoogleFonts(
    await readFile(target, 'utf8'),
    googleFonts,
    mediaMap,
  );
  await writeFile(target, text);
  for (const url of cssResources(text))
    if (/^(?:https?:)?\/\//i.test(url) && !igemURL(url))
      issues.push('External stylesheet dependency in ' + file + ': ' + url);
}
fontCss = templateFontCss(snapshot.values, mediaMap) + fontCss;
const htmlLinkRoutes = Object.fromEntries([
  ['/', base],
  ['/home', base],
  ...wikiPages.flatMap((p) => [
    ['/' + p.slug, base + routeSlug(p.slug) + '/'],
    ['/' + routeSlug(p.slug), base + routeSlug(p.slug) + '/'],
  ]),
]);
const known = new Set(
  wikiPages.flatMap((p) => ['/' + p.slug, '/' + routeSlug(p.slug)]),
);
const sharedAssets = sharedPublicationAssets(output, base);
const mappedImageSources = new Set(Object.keys(mediaMap).map(esc));
for (const page of [undefined, ...wikiPages]) {
  let html = replaceRecordingFrames(render(data, page), recordingTodos, {
    page: page?.slug || 'home',
    pageTitle: page?.title || 'Home',
  });
  html = rewriteGoogleFonts(html, googleFonts, mediaMap);
  const htmlImageMap = Object.fromEntries(
    dynamicHtmlImages(html)
      .filter((source) => mediaMap[source])
      .map((source) => [source, mediaMap[source]]),
  );
  const htmlImageData = Buffer.from(JSON.stringify(htmlImageMap)).toString(
    'base64',
  );
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const small = /data-image-small="([^"]+)"/.exec(tag)?.[1];
    const large = /data-image-large="([^"]+)"/.exec(tag)?.[1];
    if (!small || !large) return tag;
    if (mappedImageSources.has(small) && mappedImageSources.has(large))
      return tag;
    return tag.replace(
      /\s(?:srcSet|srcset|data-image-small|data-image-large|data-image-capped)="[^"]*"/g,
      '',
    );
  });
  if (fontCss) {
    html = html.replace(
      /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
      (_, css) => '<style>' + withoutGoogleFontImports(css) + '</style>',
    );
    html += '<style>' + fontCss + '</style>';
  }
  // Strip authoring-only calls to action instead of leaving unusable buttons in publication.
  html = html
    .replace(/<div class="collab-strip"[\s\S]*?<\/button><\/div>/g, '')
    .replace(/<section class="invitation"[\s\S]*?<\/button><\/section>/g, '');
  for (const [original, parts] of Object.entries(pdfViewers)) {
    html = html.replace(
      /<div class="partitioned-pdf"[^>]*>(<iframe\b[^>]*src="([^"]*)"[^>]*><\/iframe>)<\/div>/g,
      (whole, frame, src) => {
        if (src !== esc(original)) return whole;
        return `<div class="partitioned-pdf" data-pdf-assets="${esc(base)}assets/pdfjs/" data-pdf-parts="${esc(JSON.stringify(parts))}">${frame.replace(`src="${esc(original)}"`, `src="${esc(parts[0].url)}"`)}<noscript>${parts.map((p) => `<a href="${esc(p.url)}">Pages ${p.start}–${p.end}</a>`).join(' · ')}</noscript></div>`;
      },
    );
    html = html.replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/g,
      (link, href) => (href === esc(original) ? '' : link),
    );
  }
  // Match full URLs before their relative-path suffixes and replace once.
  // Sequential substitutions can produce "https://editorhttps://static..."
  // when both absolute and relative references point to the same template logo.
  const replacements = new Map(
    Object.entries(mediaMap).map(([from, to]) => [esc(from), esc(to)]),
  );
  if (replacements.size) {
    const pattern = [...replacements.keys()]
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    html = html.replace(new RegExp(pattern, 'g'), (match) =>
      replacements.get(match),
    );
  }
  html = html.replace(/href="(\/[^"]*)"/g, (match, value) => {
    if (value.startsWith('//')) return match;
    const [, pathname, suffix] = value.match(/^([^?#]*)(.*)$/);
    const normalized = pathname.replace(/\/$/, '') || '/';
    if (normalized === '/') return 'href="' + base + suffix + '"';
    if (known.has(normalized))
      return (
        'href="' + base + routeSlug(normalized.slice(1)) + '/' + suffix + '"'
      );
    return match;
  });
  if (repository && !template)
    html = html.replace(
      esc(data['footer:repository'].value),
      `<a href="${esc(repository)}">Website source on iGEM GitLab</a>`,
    );
  if (template && (repository || args.includes('--license-confirmed')))
    html += `<footer class="publication-source">${repository ? `<a href="${esc(repository)}">Website source on iGEM GitLab</a>` : ''}${args.includes('--license-confirmed') ? ' · Content licensed under <a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>' : ''}</footer>`;
  if (template && attribution && page?.slug === 'attributions')
    html += `<iframe title="Official team attributions" src="${esc(attribution)}" loading="lazy"></iframe>`;
  if (args.includes('--license-confirmed'))
    html = html.replace(
      'Publication license to confirm: CC BY 4.0',
      'Content licensed under CC BY 4.0',
    );
  if (attribution && page?.slug === 'attributions')
    html = html.replace(
      /<div class="form-pending">[\s\S]*?<\/div><\/div>/,
      `<div class="form-pending"><iframe title="Official team attributions" src="${esc(attribution)}" loading="lazy"></iframe></div>`,
    );
  html = html.replaceAll(
    'data-pdf-assets="/assets/pdfjs/"',
    `data-pdf-assets="${esc(base)}assets/pdfjs/"`,
  );
  const ids = new Set(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  );
  html = html.replace(
    /<a\b[^>]*href="#([^"]+)"[^>]*>[\s\S]*?<\/a>/g,
    (link, id) => {
      try {
        return ids.has(decodeURIComponent(id)) ? link : '';
      } catch {
        return ids.has(id) ? link : '';
      }
    },
  );
  const title = page
    ? data[page.slug + ':title'].value + ' — ' + data.brand.value
    : data.brand.value;
  const description = page
    ? data[page.slug + ':summary'].value
    : data.intro.value;
  const doc =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) +
    `</title><link rel="icon" href="${esc(mediaMap[siteIcon(snapshot.values)])}"><meta name="description" content="` +
    esc(description) +
    '">' +
    css
      .map((file) => `<link rel="stylesheet" href="${base}assets/${file}">`)
      .join('') +
    `<script type="module" src="${base}assets/wiki.js"></script></head><body class="publication" data-site-search="${esc(searchURL)}" data-site-base="${esc(base)}" data-custom-html-routes="${esc(JSON.stringify(htmlLinkRoutes))}" data-custom-html-media="${htmlImageData}">` +
    loadingScript +
    html +
    '</body></html>';
  if (/\b(?:href|src)="\/(api|auth)\//.test(doc) || /class="account"/.test(doc))
    throw Error(
      'Private runtime dependency remained in ' + (page?.slug || 'home'),
    );
  for (const [url] of doc.matchAll(
    /https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^\s"'<>\\)]*/g,
  )) {
    const issue = `Google Fonts dependency on ${page?.title || 'Home'} (${page?.slug || 'home'}): ${url}. Prepare a fresh export to download and host this font on iGEM.`;
    if (!issues.includes(issue)) issues.push(issue);
  }
  for (const url of externalResources(doc)) {
    const issue =
      'External embedded resource must move to iGEM infrastructure: ' + url;
    if (!issues.includes(issue)) issues.push(issue);
  }
  const slug = page?.slug || '';
  const folder = path.join(output, 'public', routeSlug(slug));
  await mkdir(folder, { recursive: true });
  const compactDoc = sharedAssets.rewrite(doc);
  await writeFile(path.join(folder, 'index.html'), compactDoc);
  if (routeSlug(slug) !== slug) {
    const legacy = path.join(output, 'public', slug);
    await mkdir(legacy, { recursive: true });
    // Keep legacy links working without another complete copy of the page.
    const target = base + routeSlug(slug) + '/';
    await writeFile(
      path.join(legacy, 'index.html'),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="canonical" href="${esc(target)}"><meta http-equiv="refresh" content="0;url=${esc(target)}"><title>${esc(title)}</title></head><body><a href="${esc(target)}">Continue to ${esc(title)}</a><script>location.replace(${JSON.stringify(target)}+location.search+location.hash)</script></body></html>`,
    );
  }
}
await sharedAssets.write();
await copyFile(
  path.join(output, 'public/index.html'),
  path.join(output, 'public/404.html'),
);
const report = {
  exportedAt: snapshot.exportedAt,
  compiledAt: new Date().toISOString(),
  base,
  pageCount: wikiPages.length + 1,
  routes: [base, ...wikiPages.map((page) => base + routeSlug(page.slug))],
  standardPages,
  aliases: Object.fromEntries(
    pageSlugs
      .filter((slug) => routeSlug(slug) !== slug)
      .map((slug) => [base + slug, base + routeSlug(slug)]),
  ),
  sourceFields: Object.keys(allowed).filter((key) => !key.startsWith('ai:')),
  assets: assets.map((asset) => ({
    ...asset,
    folder: mediaFolder(asset.source, asset.kind, snapshot.values),
  })),
  issues,
  recordingTodos,
  submissionReady: issues.length === 0 && recordingTodos.length === 0,
  manualReview: [
    'Check hosted 3D models render correctly with embedded textures and no external decoders; remote model bytes are not inspected by this build.',
    'Review the public source for hidden/private data.',
    'Include the exported CC BY 4.0 LICENSE; retain third-party licences and inline source/license credits.',
    'Publish AI model/use/reviewer disclosure and decorative-image model credits.',
    'Team-check all scientific substance, evidence, interviews and citations.',
    'Run the official External Content Check on the deployed wiki; static checks cannot cover arbitrary JavaScript.',
  ],
  note: 'Automated checks do not certify iGEM compliance. Review the current official rules and all team content.',
  mediaVerification:
    'Recordings are never uploaded, copied or mapped by this exporter. Replace recording TODOs in the editor with Video Universe iframe embeds and export again. Existing embed settings are preserved. Inline SVG remains page markup.',
};
await writeFile(
  path.join(output, 'publication-report.json'),
  JSON.stringify(report, null, 2),
);
await writeFile(
  path.join(output, 'media-map.example.json'),
  JSON.stringify(
    Object.fromEntries(
      [...refs.entries()].map(([url]) => [
        url,
        map[url] || 'https://static.igem.wiki/YOUR-TEAM/uploaded-file',
      ]),
    ),
    null,
    2,
  ),
);
await copyFile(
  path.join(root, 'ops/igem.gitlab-ci.yml'),
  path.join(output, '.gitlab-ci.yml'),
);
await writeFile(
  path.join(output, 'README.md'),
  `# Static wiki review build\n\n${report.pageCount} pages, URL prefix ${base}.\n\nUse public/ for LOCAL REVIEW ONLY. Do not commit compiled HTML/CSS/JS to iGEM GitLab. Commit the source/compiler, package-lock.json and reviewed publication/content.json, media-map.json, config.json and review.json. Include the exported CC BY 4.0 LICENSE; third-party materials retain their own licences. Copy the generated .gitlab-ci.yml (same as ops/igem.gitlab-ci.yml) to the repository root: it runs npm ci and scripts/build-igem.mjs on every main push, publishing only the CI-generated igem-build/public artifact. See STATIC-EXPORT.md for the source workflow. Never commit private portable snapshots, embedded media, databases or server configuration.\n`,
);
console.log(
  `Exported ${report.pageCount} pages to ${output}. ${issues.length} publication issues listed in publication-report.json.`,
);
if (recordingTodos.length)
  console.warn(
    `${recordingTodos.length} recording TODOs: add Video Universe embeds in the editor, then export again. See publication-report.json.`,
  );
for (const issue of issues) console.error('Publication issue: ' + issue);
for (const item of recordingTodos)
  console.warn(
    `Recording TODO on ${item.pageTitle || item.page}: ${item.title || item.source || item.kind}`,
  );
if (strict && issues.length) {
  console.error(
    'iGEM preflight failed; this is a review build, not submission-ready.',
  );
  process.exitCode = 2;
}
