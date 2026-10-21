import { publicationRuntime } from './publication-runtime.mjs';
import { publicationValues } from './publication-pages.mjs';
import { partitionSource, GIT_FILE_BYTES } from './source-parts.mjs';
import { createImageValidationCache } from './export-validation-cache.mjs';
import { downloadExternalAsset } from './export-remote-assets.mjs';
import { createImagePreviews } from './image-previews.mjs';
import { googleFontReferences, prepareGoogleFonts } from './google-fonts.mjs';
import { createExportProcessing } from './export-processing.mjs';
import { isRecording, recordingTasks } from './export-recordings.mjs';
import {
  buildSearchIndex,
  IMAGE_UPLOAD_BYTES,
  PDF_PART_BYTES,
  sponsorLayers,
  wikiPages,
  parseCustomPages,
  parseRemovedPages,
  igemAwards,
  igemPageCheck,
} from './shared.mjs';
import {
  readFile,
  copyFile,
  stat,
  realpath,
  mkdtemp,
  writeFile,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { zipStream } from './export-zip.mjs';
import {
  exportMedia,
  mediaFolder,
  templateFonts,
  fontLicenses,
} from './export-media.mjs';

const names = {
  source: '01-website-source.zip',
  assets: '02-static-assets.zip',
};
const fail = (status, message) => Object.assign(Error(message), { status });
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const textEntry = (name, text) => {
  const data = Buffer.from(text);
  return { name, data, size: data.length };
};
const csv = (rows) =>
  [
    'source,kind,bundle,file,igem_url',
    ...rows.map((row) =>
      [row.source, row.kind, row.bundle, row.file, '']
        .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
        .join(','),
    ),
  ].join('\r\n') + '\r\n';
const common = `Extract these ZIPs before uploading. Upload the files inside assets/, not the ZIP or its manifest.
Keep the category subfolders (banners, logos, icons, images, documents, models, fonts). Only folders with files are included. The upload helper creates matching static-media folders on iGEM.
Match each file to its original URL using upload-manifest.csv. Paste the returned iGEM URLs into publication/media-map.json in ZIP 01.
Audited open-source template fonts and their OFL notices are included in assets/fonts. The helper uploads the fonts and configures them automatically. Referenced Google Fonts are downloaded automatically with their licence notices and uploaded by the helper. Referenced external static files are downloaded into this bundle; an unavailable file must be replaced before export can finish. Video Universe players remain embedded.
Large PDFs are automatically split into reading copies under 9 MB. The original remains in the editor. Other files are copied without conversion: check acceptance and playback in the iGEM upload tools. See the local upload helper for the guided workflow.
`;

export function createBundleExports({
  dataDir,
  clientDir,
  projectSource,
  assetOrigins = [],
  sourceFile = new URL('./export-source.json', import.meta.url),
  now = Date.now,
  processing = createExportProcessing(),
  fontFetcher = fetch,
  remoteDownloader = downloadExternalAsset,
  imagePreview = createImagePreviews(dataDir),
}) {
  const templateOrigins = new Set(
    assetOrigins.filter(Boolean).map((origin) => new URL(origin).origin),
  );
  const imageValidation = createImageValidationCache(
    path.join(dataDir, 'export-cache', 'images'),
  );
  const plans = new Map();
  let sourcePromise,
    active = 0,
    pending = 0;
  const discard = (id, plan) => {
    plans.delete(id);
    if (plan.tempDir)
      void rm(plan.tempDir, { recursive: true, force: true }).catch(() => {});
  };
  const prune = () => {
    for (const [id, plan] of plans)
      if (plan.expires <= now()) discard(id, plan);
  };
  async function localFile(source) {
    // MCP/HTML editing can save full URLs for assets shipped with this server.
    // Resolve configured first-party assets without fetching through sign-in.
    // Keep the original source as the manifest key so publication replaces it.
    if (/^https?:\/\//.test(source)) {
      const url = new URL(source);
      const pathname = /^https?:\/\/[^/?#]+(\/[^?#]*)/.exec(source)?.[1];
      if (
        !url.username &&
        !url.password &&
        templateOrigins.has(url.origin) &&
        (pathname?.startsWith('/templates/') || pathname?.startsWith('/api/media/'))
      )
        source = pathname;
    }
    let root, relative;
    if (source.startsWith('/api/media/')) {
      root = path.join(dataDir, 'media');
      relative = source.slice(11);
    } else if (source.startsWith('/templates/')) {
      root = clientDir;
      relative = source.slice(1);
    } else if (source === '/prion-hero.png') {
      root = clientDir;
      relative = 'prion-hero.png';
    } else if (/^(?:https?:)?\/\//.test(source)) return null;
    else throw fail(422, 'Cannot package this media URL: ' + source);
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
      relative.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw fail(
        422,
        'Invalid media path: ' +
          JSON.stringify(source) +
          '. ' +
          (/[?#]/.test(relative)
            ? 'Local media references cannot contain a query string or fragment. Select the original uploaded file again.'
            : 'Use a local media path with letters, numbers, underscores, hyphens and dots; empty, dot and parent-directory segments are not allowed. Replace or reselect this file in the editor.'),
      );
    try {
      const base = await realpath(root),
        file = await realpath(path.join(root, relative));
      const inside = path.relative(base, file);
      if (inside.startsWith('..') || path.isAbsolute(inside))
        throw Error('Outside media directory');
      const info = await stat(file);
      if (!info.isFile()) throw Error('Not a file');
      return { file, size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      throw fail(
        422,
        'A saved media file is missing or unavailable: ' +
          source +
          '. Restore or replace it before exporting.',
      );
    }
  }
  return {
    async prepare({
      userId,
      project,
      values,
      template,
      team,
      requiredPages = [],
      onProgress = () => {},
    }) {
      if (
        typeof team !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(team) ||
        team.length > 80
      )
        throw fail(
          400,
          'Enter your registered iGEM team URL name, such as imperial-college.',
        );
      if (
        !Array.isArray(requiredPages) ||
        requiredPages.length > igemAwards.length ||
        requiredPages.some((slug) => !igemAwards.some(([id]) => id === slug))
      )
        throw fail(400, 'Choose valid iGEM awards.');
      onProgress({
        message: 'Checking saved pages and required routes…',
        completed: 0,
        total: 0,
      });
      const publication = publicationValues(values, template?.pages || wikiPages);
      const removed = parseRemovedPages(publication.values['pages:removed']);
      const slugs = [
        ...(template?.pages || wikiPages),
        ...parseCustomPages(publication.values['pages:custom']),
      ]
        .map((page) => page.slug)
        .filter((slug) => !removed.includes(slug));
      const standardPages = igemPageCheck(slugs, requiredPages, `/${team}/`);
      const missing = standardPages.filter((page) => !page.present);
      if (missing.length)
        throw fail(
          422,
          'Missing required pages: ' +
            missing.map((page) => page.path).join(', ') +
            '. Add these pages in Pages, save, then export again.',
        );
      prune();
      if (pending >= 2 || plans.size + pending >= 12)
        throw fail(429, 'Export is busy. Try again shortly.');
      pending++;
      let tempDir;
      let retained = false;
      try {
        // Limit retained snapshots; each user can keep two recent preparations.
        for (const [id, oldPlan] of [...plans]
          .filter(([, p]) => p.userId === userId)
          .slice(0, -1))
          discard(id, oldPlan);
        if (plans.size >= 12)
          throw fail(429, 'Export is busy. Try again shortly.');
        const cleanValues = Object.fromEntries(
          Object.entries(publication.values).filter(([key]) => !key.startsWith('ai:')),
        );
        const content = json({
          format: 'prion-wiki-source',
          version: 1,
          values: cleanValues,
        });
        if (Buffer.byteLength(content) > 16 * 1024 * 1024)
          throw fail(
            413,
            'Project source is too large to prepare. Contact the server administrator.',
          );
        sourcePromise ||= readFile(sourceFile, 'utf8')
          .then(JSON.parse)
          .catch((error) => {
            sourcePromise = null;
            throw error;
          });
        const baseSource = await sourcePromise;
        const sourceFiles = projectSource
          ? projectSource.overlay(project.id, baseSource)
          : baseSource;
        const sourceChanges = Object.keys(sourceFiles).filter(
          (name) => sourceFiles[name] !== baseSource[name],
        );
        const entries = {
          source: Object.entries(sourceFiles).map(([name, text]) =>
            textEntry(name, text),
          ),
          assets: [],
        };
        const searchIndex = buildSearchIndex(cleanValues);
        const searchCode = 'export default ' + JSON.stringify(searchIndex) + ';\n';
        if (Buffer.byteLength(searchCode) >= 9_900_000)
          throw fail(422, 'The project search index exceeds the static upload limit. Reduce indexed content before exporting.');
        const searchHash = createHash('sha256').update(searchCode).digest('hex');
        const searchSource = '/templates/runtime/search-' + searchHash + '.js';
        const searchFile = 'assets/runtime/search-' + searchHash + '.js';
        entries.assets.push(textEntry(searchFile, searchCode));
        entries.source.push(textEntry('publication/search.json', json({ version: 1, source: searchSource })));
        const pdfParts = {};
        const rows = [],
          map = {};
        rows.push({ source: searchSource, kind: 'runtime', bundle: names.assets, file: searchFile });
        map[searchSource] = '';
        const locations = new Map();
        const media = exportMedia(
          cleanValues,
          template,
          sponsorLayers,
          locations,
        );
        const recordingTodos = recordingTasks(media, locations, cleanValues);
        // These lazy modules are shared by the exported application. Upload them
        // like images so their bytes do not count against the Pages archive.
        for (const asset of publicationRuntime) {
          media.set(asset.source, 'runtime');
          locations.set(asset.source, [{ pageTitle: 'Website runtime', layerName: asset.name, field: asset.binary ? 'WebAssembly runtime' : 'JavaScript runtime' }]);
        }
        const googleFonts = await prepareGoogleFonts(
          googleFontReferences(
            cleanValues,
            template,
            Object.fromEntries(
              Object.entries(sourceFiles).filter(([file]) =>
                file.endsWith('.css'),
              ),
            ),
          ),
          { fetcher: fontFetcher, onProgress },
        );
        for (const [url] of googleFonts.fonts) media.set(url, 'font');
        entries.source.push(
          textEntry(
            'publication/google-fonts.json',
            json(googleFonts.manifest),
          ),
        );
        for (const license of googleFonts.licenses) {
          entries.assets.push(
            textEntry(
              'assets/fonts/' + license.filename,
              license.data.toString('utf8'),
            ),
          );
          entries.source.push(
            textEntry(
              'publication/font-licenses/' + license.filename,
              license.data.toString('utf8'),
            ),
          );
        }
        for (const [source, kind] of media)
          if (isRecording(kind)) media.delete(source);
        onProgress({
          message: 'Checking images, documents and other static files…',
          completed: 0,
          total: media.size,
        });
        const localFiles = new Map();
        const mediaIssues = [];
        // Validate every reference before splitting PDFs or producing ZIPs, so
        // fixing one broken image does not reveal another one on the next attempt.
        for (const [source, kind] of media) {
          try {
            if (googleFonts.fonts.has(source)) continue;
            let local = await localFile(source);
            if (!local) {
              onProgress({
                message: `Downloading external file: ${source}`,
                completed: localFiles.size,
                total: media.size,
              });
              tempDir ||= await mkdtemp(path.join(tmpdir(), 'prion-external-export-'));
              local = await remoteDownloader(source, tempDir, {
                onRetry: ({ attempt, total, profile }) => onProgress({
                  message: `Retrying external file (${attempt}/${total}, ${profile}): ${source}`,
                  completed: localFiles.size,
                  total: media.size,
                }),
              });
            }
            localFiles.set(source, local);
          } catch (error) {
            if (error.status !== 422) throw error;
            mediaIssues.push({
              source,
              kind,
              reason: error.message,
              locations: locations.get(source) || [],
            });
          }
        }
        if (mediaIssues.length) {
          const first = mediaIssues[0];
          const where = first.locations
            .map((location) =>
              [location.pageTitle, location.layerName, location.field]
                .filter(Boolean)
                .join(' → '),
            )
            .join('; ');
          throw Object.assign(
            fail(
              422,
              `${mediaIssues.length} media ${mediaIssues.length === 1 ? 'file needs' : 'files need'} attention before export. ${where ? where + ': ' : ''}${first.reason}`,
            ),
            { mediaIssues },
          );
        }
        let completed = 0;
        for (const [source, kind] of media) {
          const key = 'assets';
          onProgress({
            message: `Preparing ${path.basename(source)}…`,
            completed: completed++,
            total: media.size,
          });
          const local = localFiles.get(source);
          let name = '';
          const downloadedFont = googleFonts.fonts.get(source);
          if (downloadedFont) {
            name =
              'assets/fonts/google-' +
              createHash('sha256').update(source).digest('hex').slice(0, 20) +
              downloadedFont.extension;
            entries.assets.push({
              name,
              data: downloadedFont.data,
              size: downloadedFont.data.length,
            });
          }
          if (local) {
            name =
              'assets/' +
              mediaFolder(source, kind, cleanValues) +
              '/' +
              createHash('sha256').update(source).digest('hex').slice(0, 12) +
              '-' +
              path.basename(local.file);
            if (kind === 'pdf' && local.size > PDF_PART_BYTES) {
              let parts;
              try {
                onProgress({
                  message: `Splitting PDF: ${path.basename(local.file)}. Large documents can take several minutes.`,
                  completed: completed - 1,
                  total: media.size,
                });
                parts = await processing.run('pdf', local.file);
              } catch (error) {
                throw fail(
                  422,
                  path.basename(local.file) + ': ' + error.message,
                );
              }
              pdfParts[source] = [];
              for (const part of parts) {
                const partName =
                  name.replace(/\.pdf$/i, '') +
                  `-pages-${part.start}-${part.end}.pdf`;
                const partSource =
                  source + `?pdf-part=${part.start}-${part.end}`;
                tempDir ||= await mkdtemp(
                  path.join(tmpdir(), 'prion-pdf-export-'),
                );
                const file = path.join(tempDir, path.basename(partName));
                await writeFile(file, part.data);
                const info = await stat(file);
                entries[key].push({
                  name: partName,
                  file,
                  size: info.size,
                  mtimeMs: info.mtimeMs,
                });
                rows.push({
                  source: partSource,
                  kind: 'pdf',
                  bundle: names[key],
                  file: partName,
                });
                map[partSource] =
                  'https://static.igem.wiki/YOUR-TEAM/uploaded-file';
                pdfParts[source].push({
                  source: partSource,
                  start: part.start,
                  end: part.end,
                });
              }
              continue;
            }
            if (
              /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(local.file) &&
              (local.size > IMAGE_UPLOAD_BYTES ||
                /\.(jpe?g|png)$/i.test(local.file))
            ) {
              let result;
              try {
                onProgress({
                  message: `${local.size > IMAGE_UPLOAD_BYTES ? 'Checking and compressing' : 'Checking'} image: ${path.basename(local.file)}…`,
                  completed: completed - 1,
                  total: media.size,
                });
                const validate = () =>
                  processing.run('image', local.file, {
                    omitUnchangedData: true,
                  });
                result =
                  local.size <= IMAGE_UPLOAD_BYTES
                    ? await imageValidation.check(local.file, validate, () =>
                        onProgress({
                          message: `Reusing verified image: ${path.basename(local.file)}…`,
                          completed: completed - 1,
                          total: media.size,
                        }),
                      )
                    : await validate();
              } catch (error) {
                const usage = locations.get(source) || [];
                const where = usage
                  .map((location) =>
                    [location.pageTitle, location.layerName, location.field]
                      .filter(Boolean)
                      .join(' → '),
                  )
                  .join('; ');
                throw Object.assign(
                  fail(422, `${where ? where + ': ' : ''}${error.message}`),
                  {
                    mediaIssues: [
                      { source, kind, reason: error.message, locations: usage },
                    ],
                  },
                );
              }
              if (!result.changed) {
                entries[key].push({ name, ...local });
              } else {
                name = name.replace(/\.[^.]+$/, result.extension);
                tempDir ||= await mkdtemp(
                  path.join(tmpdir(), 'prion-image-export-'),
                );
                const file = path.join(tempDir, path.basename(name));
                await writeFile(file, result.data);
                const info = await stat(file);
                entries[key].push({
                  name,
                  file,
                  size: info.size,
                  mtimeMs: info.mtimeMs,
                });
              }
            } else {
              if (local.size >= 10_000_000)
                throw fail(
                  422,
                  'Cannot export ' +
                    path.basename(local.file) +
                    ': this file exceeds the 10 MB static upload limit. Compress or replace it before exporting.',
                );
              entries[key].push({ name, ...local });
            }
          }
          rows.push({ source, kind, bundle: names[key], file: name });
          map[source] = source.startsWith('https://static.igem.wiki/')
            ? source
            : 'https://static.igem.wiki/YOUR-TEAM/uploaded-file';
          // Ship smooth display copies through the normal static upload workflow.
          // Pin them into this export: cache eviction must not break a prepared ZIP.
          if (
            kind === 'image' &&
            /^\/api\/media\/[a-f0-9-]+\.jpe?g$/.test(source)
          ) {
            for (const size of [640, 1600]) {
              onProgress({
                message: `Preparing ${size}px display image: ${path.basename(source)}…`,
                completed: completed - 1,
                total: media.size,
              });
              let preview;
              try {
                preview = await imagePreview(source.slice(11), size);
                if ((await stat(preview)).size > IMAGE_UPLOAD_BYTES)
                  throw Error(
                    'The display copy exceeds the static upload limit. Use a smaller image.',
                  );
              } catch (error) {
                throw Object.assign(
                  fail(
                    422,
                    `Cannot prepare display image ${source}: ${error.message}`,
                  ),
                  {
                    mediaIssues: [
                      {
                        source,
                        kind,
                        reason: error.message,
                        locations: locations.get(source) || [],
                      },
                    ],
                  },
                );
              }
              tempDir ||= await mkdtemp(
                path.join(tmpdir(), 'prion-image-export-'),
              );
              const displaySource = source + `?preview=${size}&v=2`;
              const displayName = name.replace(
                /\.[^.]+$/,
                `-display-${size}.webp`,
              );
              const file = path.join(tempDir, path.basename(displayName));
              await copyFile(preview, file);
              const info = await stat(file);
              entries.assets.push({
                name: displayName,
                file,
                size: info.size,
                mtimeMs: info.mtimeMs,
              });
              rows.push({
                source: displaySource,
                kind: 'image',
                bundle: names.assets,
                file: displayName,
              });
              map[displaySource] =
                'https://static.igem.wiki/YOUR-TEAM/uploaded-file';
            }
          }
        }
        for (const key of new Set(
          templateFonts(cleanValues).map((font) => font.license),
        )) {
          entries.assets.push(
            textEntry('assets/fonts/' + key + '-OFL.txt', fontLicenses[key]),
          );
          entries.source.push(
            textEntry(
              'publication/font-licenses/' + key + '-OFL.txt',
              fontLicenses[key],
            ),
          );
        }
        onProgress({
          message: 'Preparing download manifests…',
          completed: media.size,
          total: media.size,
        });
        const id = randomUUID(),
          exportedAt = new Date(now()).toISOString(),
          expires = now() + 30 * 60 * 1000;
        const info = {
          project: project.name,
          exportedAt,
          sourceChanges,
          submissionReady: false,
          standardPages,
          staticFiles: entries.assets.length,
          recordingTodos,
          externalFiles: rows.filter((r) => !r.file).length,
          googleFontsDownloaded: googleFonts.fonts.size,
          fontsIncluded: rows.some((row) => row.kind === 'font'),
        };
        const guide = `# 01 — Website source → iGEM GitLab

1. Extract both ZIPs. Upload images/files to iGEM Uploads. Recordings are not packaged: add Video Universe iframe embeds in the editor and export again.
2. Fill publication/media-map.json with the returned URLs. Existing Video Universe embeds retain their player settings.
3. Review publication/content.json and any publication/content-parts/ files: saved source can include hidden or unpublished text. AI briefs and account metadata are omitted; this is not a full privacy scrub.
4. Configure hosted fonts and selected award page slugs in publication/config.json. Review your content before publishing; review.json is legacy optional metadata and no longer blocks the build.
5. Merge this source into https://gitlab.igem.org/2026/${team}, including its CC BY 4.0 root LICENSE. Third-party assets and fonts retain their own licences and attribution notices.
6. Review the diff and commit through your team's workflow. The included .gitlab-ci.yml builds the wiki from source on each main push.

Local verification: npm ci, then npm run build. The compiler checks required page URLs and media mappings. A ZIP alone does not publish the wiki.

${common}`;
        entries.source.push(
          ...partitionSource(JSON.parse(content)).map((file) => textEntry(file.path, file.content)),
          textEntry('publication/recording-todos.json', json(recordingTodos)),
          textEntry('publication/pdf-parts.json', json(pdfParts)),
          textEntry('publication/media-map.json', json(map)),
          textEntry(
            'publication/config.json',
            json({
              teamSlug: team,
              repository: `https://gitlab.igem.org/2026/${team}`,
              source: 'publication/content.json',
              mediaMap: 'publication/media-map.json',
              review: 'publication/review.json',
              attributionUrl: '',
              requiredPages: [...new Set(requiredPages)],
              fontCss: '',
            }),
          ),
          textEntry(
            'publication/review.json',
            json({
              reviewer: '',
              reviewedAt: '',
              sourceReviewed: false,
              licensingReviewed: false,
              inlineCreditsReviewed: false,
              aiDisclosureReviewed: false,
              scientificContentReviewed: false,
              modelsReviewed: false,
            }),
          ),
          textEntry('UPLOAD-FIRST.txt', guide),
          textEntry(
            'publication/url-check.json',
            json({ base: `/${team}/`, standardPages }),
          ),
        );
        entries.assets.push(
          textEntry(
            'UPLOAD-FIRST.txt',
            '# 02 — Images and files → iGEM Uploads\n\nOpen https://teams.igem.org/go/deliverables/wiki/uploads for your team.\n\n' +
              common,
          ),
        );
        for (const key of Object.keys(entries))
          entries[key].push(
            textEntry(
              'upload-manifest.csv',
              csv(
                rows.filter((r) => key === 'source' || r.bundle === names[key]),
              ),
            ),
            textEntry('bundle-info.json', json(info)),
          );
        const oversizedSource = entries.source.find((entry) => entry.size >= GIT_FILE_BYTES);
        if (oversizedSource)
          throw fail(422, `GitLab source file exceeds the 10 MB limit: ${oversizedSource.name}. Remove embedded media or split this source file before exporting.`);
        plans.set(id, {
          userId,
          projectId: project.id,
          entries,
          expires,
          tempDir,
        });
        retained = true;
        return {
          id,
          project: project.name,
          exportedAt,
          expiresAt: new Date(expires).toISOString(),
          externalFiles: info.externalFiles,
          sourceChanges,
          googleFontsDownloaded: googleFonts.fonts.size,
          recordingTodos,
          downloads: Object.keys(entries).map((key) => ({
            key,
            filename: names[key],
            url: `/api/export/bundles/${id}/${key}`,
            bytes: entries[key].reduce((total, entry) => total + entry.size, 0),
            files: key === 'source' ? entries[key].length : info.staticFiles,
          })),
        };
      } finally {
        pending--;
        if (tempDir && !retained)
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    async download({ id, key, userId, projectId, res }) {
      prune();
      const plan = plans.get(id);
      if (
        !plan ||
        plan.userId !== userId ||
        plan.projectId !== projectId ||
        !Object.hasOwn(names, key)
      )
        throw fail(
          404,
          'Export expired or unavailable. Prepare a new export in the editor.',
        );
      if (active >= 2)
        throw fail(
          429,
          'Two ZIP downloads are already running. Wait for one to finish, then retry.',
        );
      active++;
      try {
        const entries = plan.entries[key];
        for (const entry of entries)
          if (entry.file) {
            const info = await stat(entry.file).catch(() => null);
            if (
              !info?.isFile() ||
              info.size !== entry.size ||
              info.mtimeMs !== entry.mtimeMs
            )
              throw fail(409, 'A media file changed. Prepare a new export.');
          }
        const length = entries.reduce(
          (size, entry) =>
            size +
            BigInt(entry.size) +
            148n +
            2n * BigInt(Buffer.byteLength(entry.name)),
          98n,
        );
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${names[key]}"`,
          'Content-Length': String(length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Accel-Buffering': 'no',
        });
        await pipeline(Readable.from(zipStream(entries)), res);
      } finally {
        active--;
      }
    },
    close() {
      processing.close();
      for (const [id, plan] of plans) discard(id, plan);
    },
  };
}
