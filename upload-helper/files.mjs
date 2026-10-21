import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl';

export function safePath(root, name) {
  if (
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.split('/').some((p) => !p || p === '.' || p === '..') ||
    path.isAbsolute(name) ||
    /[:]/.test(name)
  )
    throw Error('Unsafe archive path');
  const file = path.resolve(root, name);
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw Error('Archive path escapes its folder');
  return file;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(chunk, crc = 0xffffffff) {
  for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
export async function extractZip(file, root) {
  await mkdir(root, { recursive: true });
  const zip = await new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (e, z) =>
      e ? reject(e) : resolve(z),
    ),
  );
  let count = 0,
    total = 0;
  const seen = new Set();
  await new Promise((resolve, reject) => {
    const fail = (e) => {
      zip.close();
      reject(e);
    };
    zip.on('error', fail);
    zip.on('end', resolve);
    zip.on('entry', async (e) => {
      try {
        const name = e.fileName.replace(/\/$/, '');
        const target = safePath(root, name);
        if (++count > 10000 || seen.has(name.toLowerCase()))
          throw Error('Too many or duplicate archive entries');
        seen.add(name.toLowerCase());
        if (
          e.generalPurposeBitFlag & 1 ||
          ((e.externalFileAttributes >>> 16) & 0xf000) === 0xa000
        )
          throw Error('Encrypted files and symlinks are not supported');
        total += e.uncompressedSize;
        if (total > 40 * 1024 ** 3 || e.uncompressedSize > 20 * 1024 ** 3)
          throw Error('Archive exceeds the helper’s 40 GiB workspace limit');
        if (e.fileName.endsWith('/')) await mkdir(target, { recursive: true });
        else {
          await mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise((r, j) =>
            zip.openReadStream(e, (err, s) => (err ? j(err) : r(s))),
          );
          let crc = 0xffffffff;
          await pipeline(
            stream,
            new Transform({
              transform(chunk, enc, cb) {
                crc = crc32(chunk, crc);
                cb(null, chunk);
              },
            }),
            createWriteStream(target, { flags: 'wx' }),
          );
          if ((crc ^ 0xffffffff) >>> 0 !== e.crc32)
            throw Error('Corrupt ZIP entry: ' + name);
        }
        zip.readEntry();
      } catch (err) {
        fail(err);
      }
    });
    zip.readEntry();
  });
}
export function csvRows(text) {
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (c === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (quoted) throw Error('Invalid CSV quotes');
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  const header = rows.shift() || [];
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
}
export function hostedURL(url, kind) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !/REPLACE|YOUR-TEAM/.test(url) &&
      (['video', 'audio', 'embed'].includes(kind)
        ? u.hostname === 'video.igem.org' &&
          /^\/videos\/embed\/[a-zA-Z0-9-]+$/.test(u.pathname)
        : u.hostname === 'static.igem.wiki')
    );
  } catch {
    return false;
  }
}
export async function digest(file) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}

export async function verifyRuntimeAsset(row, fetcher = fetch) {
  if (row.kind !== 'runtime') return;
  const wasm = /\.wasm$/i.test(row.localFile || row.file || row.source || '');
  const type = wasm ? 'WebAssembly' : 'JavaScript';
  if (!hostedURL(row.url, row.kind) || !row.localFile)
    throw Error(`The runtime ${type} needs its bundled original and an uploaded iGEM URL.`);
  const response = await fetcher(row.url, {
    headers: { Origin: 'https://2026.igem.wiki' },
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`The uploaded runtime ${type} is not accessible; check its processing card.`);
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!(wasm ? ['application/wasm', 'application/octet-stream'] : ['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript']).includes(mime))
    throw Error(`iGEM is not serving the runtime upload as ${type}. Do not publish this URL; check file-type support with iGEM.`);
  if (!['*', 'https://2026.igem.wiki'].includes(response.headers.get('access-control-allow-origin')))
    throw Error(`The runtime ${type} upload does not allow the wiki to load modules (CORS). Check hosting with iGEM before publishing.`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size >= 10_000_000) throw Error(`Unexpectedly large runtime ${type} upload.`);
    hash.update(chunk);
  }
  if (hash.digest('hex') !== await digest(row.localFile))
    throw Error(`The uploaded runtime ${type} does not match this export. Upload the bundled runtime file unchanged.`);
}
export const jsonFile = async (file) =>
  JSON.parse(await readFile(file, 'utf8'));
export const putJSON = async (file, data) =>
  writeFile(file, JSON.stringify(data, null, 2) + '\n');
export function repositoryFile(name) {
  if (name === 'LICENSE') return true;
  if (
    /\.(md|mdx)$/i.test(name) ||
    /(^|\/)(LICENSE[^/]*|\.env[^/]*|node_modules|\.git)(\/|$)/i.test(name)
  )
    return false;
  return (
    [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.gitignore',
      '.gitlab-ci.yml',
    ].includes(name) ||
    (/^(app|components|hooks|lib)\/.*\.(ts|tsx|js|css|json)$/.test(name) &&
      !name.startsWith('app/api/')) ||
    /^scripts\/(build-igem|source-parts|publication-runtime|publication-pages|artifact-size|share-publication-assets|export-static|export-media|export-recordings|google-fonts|pdf-parts|image-export|igem-resources|build-options|static-renderer|static-runtime|preview-static)\.(mjs|ts|tsx)$/.test(
      name,
    ) ||
    name === 'ops/igem.gitlab-ci.yml' ||
    /^publication\/content-parts\/[a-f0-9]{64}\.json$/.test(name) ||
    /^publication\/(content|config|media-map|pdf-parts|google-fonts|search)\.json$/.test(
      name,
    ) ||
    /^publication\/font-licenses\/[a-z0-9]+-(OFL|LICENSE|UFL)\.txt$/.test(
      name,
    ) ||
    [
      'publication/fonts.css',
      'publication/katex-LICENSE.txt',
      'publication/pdf-processing-LICENSES.txt',
    ].includes(name)
  );
}
export async function sourceFiles(root) {
  const result = [];
  const walk = async (relative) => {
    for (const e of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      if (e.isSymbolicLink()) throw Error('Source symlink rejected');
      const name = relative ? relative + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(name);
      else if (repositoryFile(name)) {
        const file = safePath(root, name);
        if ((await stat(file)).size > 16 * 1024 ** 2)
          throw Error('Source file too large: ' + name);
        result.push({ path: name, content: await readFile(file, 'utf8') });
      }
    }
  };
  await walk('');
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
// Upgrade the compiler and publishing pipeline together in earlier exports.
export async function publicationSources(sourceRoot) {
  const files = await sourceFiles(sourceRoot);
  const pkg = JSON.parse(
    files.find((file) => file.path === 'package.json')?.content || '{}',
  );
  const lock = JSON.parse(
    files.find((file) => file.path === 'package-lock.json')?.content || '{}',
  );
  const requiredDependencies = ['pdf-lib', 'jpeg-js', 'pngjs', 'pdfjs-dist'];
  if (
    requiredDependencies.some(
      (name) =>
        !pkg.dependencies?.[name] || !lock.packages?.['node_modules/' + name],
    ) ||
    !files.some((file) => file.path === 'app/pdf-parts-viewer.ts') ||
    !files.some((file) => file.path === 'publication/katex-LICENSE.txt') ||
    !files.some(
      (file) => file.path === 'publication/pdf-processing-LICENSES.txt',
    )
  )
    throw Error(
      'This export predates the current PDF/image compiler. Update the editor server, prepare fresh two ZIPs, and open them in this helper before sending to GitLab. Existing uploads remain available.',
    );
  let pipeline;
  try {
    pipeline = await readFile(
      new URL('./compiler/igem.gitlab-ci.yml', import.meta.url),
      'utf8',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    pipeline = await readFile(
      new URL('../ops/igem.gitlab-ci.yml', import.meta.url),
      'utf8',
    );
  }
  for (const target of ['.gitlab-ci.yml', 'ops/igem.gitlab-ci.yml']) {
    const existing = files.find((file) => file.path === target);
    if (existing) existing.content = pipeline;
    else files.push({ path: target, content: pipeline });
  }
  let license;
  try {
    license = await readFile(
      new URL('./wiki-LICENSE.txt', import.meta.url),
      'utf8',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    license = await readFile(
      new URL('../publication/wiki-LICENSE.txt', import.meta.url),
      'utf8',
    );
  }
  const existingLicense = files.find((file) => file.path === 'LICENSE');
  if (existingLicense) existingLicense.content = license;
  else files.push({ path: 'LICENSE', content: license });
  for (const name of [
    'build-igem.mjs',
    'source-parts.mjs',
    'publication-runtime.mjs',
    'artifact-size.mjs',
    'share-publication-assets.mjs',
    'static-runtime.ts',
    'export-static.mjs',
    'export-media.mjs',
    'export-recordings.mjs',
    'google-fonts.mjs',
    'pdf-parts.mjs',
    'image-export.mjs',
  ]) {
    let content;
    try {
      content = await readFile(
        new URL('./compiler/' + name, import.meta.url),
        'utf8',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Source checkout; release ZIPs include compiler/ explicitly.
      content = await readFile(
        new URL('../scripts/' + name, import.meta.url),
        'utf8',
      );
    }
    const target = 'scripts/' + name;
    const existing = files.find((file) => file.path === target);
    if (existing) existing.content = content;
    else files.push({ path: target, content });
  }
  for (const name of ['site-search.ts', 'site-search.css', 'site-search-index.ts', 'section-links.ts']) {
    let content;
    try { content = await readFile(new URL('./search/' + name, import.meta.url), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      content = await readFile(new URL('../app/' + name, import.meta.url), 'utf8');
    }
    const target = 'app/' + name;
    const existing = files.find((file) => file.path === target);
    if (existing) existing.content = content;
    else files.push({ path: target, content });
  }
  const catalog = await sourceCatalog();
  const contentFile = files.find((file) => file.path === 'publication/content.json');
  if (contentFile) {
    const content = await catalog.resolveSource(JSON.parse(contentFile.content), async (name) => {
      const part = files.find((file) => file.path === 'publication/' + name);
      if (!part) throw Error('Missing publication source part: ' + name);
      return part.content;
    });
    const packed = catalog.partitionSource(content);
    for (let i = files.length - 1; i >= 0; i--)
      if (files[i].path === 'publication/content.json' || files[i].path.startsWith('publication/content-parts/')) files.splice(i, 1);
    files.push(...packed);
  }
  for (const file of files)
    if (Buffer.byteLength(file.content) >= catalog.GIT_FILE_BYTES)
      throw Error(`GitLab source file exceeds the 10 MB limit: ${file.path}. Move embedded media to iGEM static uploads or split this source file before sending.`);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
async function sourceCatalog() {
  try {
    return await import('./compiler/source-parts.mjs');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return import('../scripts/source-parts.mjs');
  }
}
async function fontCatalog() {
  try {
    return await import('./compiler/export-media.mjs');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return import('../scripts/export-media.mjs');
  }
}
export async function readPublicationSource(sourceRoot) {
  const { readSource } = await sourceCatalog();
  return readSource(path.join(sourceRoot, 'publication/content.json'));
}
export async function ensureTemplateFonts(sourceRoot, rows, validatedContent) {
  const { templateFonts, fontLicenses } = await fontCatalog();
  const content = validatedContent || await readPublicationSource(sourceRoot);
  for (const font of templateFonts(content.values || {})) {
    const existing = rows.find((row) => row.source === font.source);
    const metadata = {
      fontFamily: font.family,
      fontWeight: font.weight,
      fontStyle: font.style,
      fontLicense: fontLicenses[font.license],
    };
    if (existing) {
      Object.assign(existing, metadata);
      continue;
    }
    let file = fileURLToPath(
      new URL('./fonts/' + path.basename(font.source), import.meta.url),
    );
    try {
      await stat(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      file = fileURLToPath(new URL('../public' + font.source, import.meta.url));
    }
    rows.push({
      source: font.source,
      kind: 'font',
      bundle: 'assets',
      file: 'assets/fonts/' + path.basename(file),
      localFile: file,
      hash: await digest(file),
      url: '',
      folder: 'fonts',
      ...metadata,
    });
  }
}
export async function manifest(sourceRoot, roots, map = {}) {
  const { bundledFonts, fontLicenses } = await fontCatalog();
  const rows = csvRows(
    await readFile(path.join(sourceRoot, 'upload-manifest.csv'), 'utf8'),
  );
  const result = [];
  for (const row of rows) {
    const kind = row.kind;
    const bundle = ['video', 'audio', 'embed'].includes(kind)
      ? 'media'
      : 'assets';
    let file = '',
      hash = '';
    if (row.file) {
      file = safePath(roots[bundle], row.file);
      if (!(await stat(file)).isFile())
        throw Error('Missing file: ' + row.file);
      hash = await digest(file);
    }
    const font = bundledFonts.find((font) => font.source === row.source);
    result.push({
      ...row,
      ...(font
        ? {
            fontFamily: font.family,
            fontWeight: font.weight,
            fontStyle: font.style,
            fontLicense: fontLicenses[font.license],
          }
        : {}),
      kind,
      bundle,
      localFile: file,
      hash,
      url: hostedURL(map[row.source], kind) ? map[row.source] : '',
    });
  }
  return result;
}
export function mergeChanges(local, remote) {
  return local.flatMap((file) => {
    const prior = remote.get(file.path);
    if (prior?.content === file.content) return [];
    return [
      {
        action: prior ? 'update' : 'create',
        file_path: file.path,
        content: file.content,
        ...(prior?.last_commit_id
          ? { last_commit_id: prior.last_commit_id }
          : {}),
      },
    ];
  });
}

const staticMediaFolders = new Set([
  'banners', 'logos', 'icons', 'images', 'documents', 'models', 'fonts', 'runtime',
]);
export const isStaticMediaFolder = (folder) => staticMediaFolders.has(folder);

export function uploadFolder(row) {
  if (row.folder !== undefined) {
    if (row.folder !== '' && !isStaticMediaFolder(row.folder))
      throw Error('Unsupported upload folder');
    return row.folder;
  }
  const parts = (row.file || '').split('/');
  if (parts.length <= 2) return ''; // Existing flat exports keep their original location.
  if (
    parts.length !== 3 ||
    parts[0] !== 'assets' ||
    !isStaticMediaFolder(parts[1])
  )
    throw Error('Unsupported static-media folder');
  return parts[1];
}
