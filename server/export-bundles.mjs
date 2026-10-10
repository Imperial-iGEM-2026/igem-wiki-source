import {
  sponsorLayers,
  wikiPages,
  parseCustomPages,
  parseRemovedPages,
  igemAwards,
  igemPageCheck,
} from './shared.mjs';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
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
  media: '03-video-audio.zip',
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
const common = `Extract these ZIPs before uploading. Upload the files inside assets/ or media/, not the ZIP or its manifest.
Keep the category subfolders (banners, logos, icons, images, documents, models, fonts, videos and audio). Only folders with files are included. The upload helper creates matching static-media folders on iGEM.
Match each file to its original URL using upload-manifest.csv. Paste the returned iGEM URLs into publication/media-map.json in ZIP 01.
Audited open-source template fonts and their OFL notices are included in assets/fonts. The helper uploads the fonts and configures them automatically. Other external files are listed but not downloaded.
Files are copied without conversion: check acceptance and playback in the iGEM upload tools. See the local upload helper for the guided workflow.
`;

export function createBundleExports({
  dataDir,
  clientDir,
  sourceFile = new URL('./export-source.json', import.meta.url),
  now = Date.now,
}) {
  const plans = new Map();
  let sourcePromise,
    active = 0,
    pending = 0;
  const prune = () => {
    for (const [id, plan] of plans) if (plan.expires <= now()) plans.delete(id);
  };
  async function localFile(source) {
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
    } else if (/^https?:\/\//.test(source)) return null;
    else throw fail(422, 'Cannot package this media URL: ' + source);
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
      relative.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw fail(422, 'Invalid media path.');
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
      const removed = parseRemovedPages(values['pages:removed']);
      const slugs = [
        ...(template?.pages || wikiPages),
        ...parseCustomPages(values['pages:custom']),
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
      try {
        // Limit retained snapshots; each user can keep two recent preparations.
        for (const [id] of [...plans]
          .filter(([, p]) => p.userId === userId)
          .slice(0, -1))
          plans.delete(id);
        if (plans.size >= 12)
          throw fail(429, 'Export is busy. Try again shortly.');
        const cleanValues = Object.fromEntries(
          Object.entries(values).filter(([key]) => !key.startsWith('ai:')),
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
        const sourceFiles = await sourcePromise;
        const entries = {
          source: Object.entries(sourceFiles).map(([name, text]) =>
            textEntry(name, text),
          ),
          assets: [],
          media: [],
        };
        const rows = [],
          map = {};
        for (const [source, kind] of exportMedia(
          cleanValues,
          template,
          sponsorLayers,
        )) {
          const recording = ['video', 'audio', 'embed'].includes(kind),
            key = recording ? 'media' : 'assets';
          const local = await localFile(source);
          let name = '';
          if (local) {
            name =
              (recording ? 'media/' : 'assets/') +
              mediaFolder(source, kind, cleanValues) +
              '/' +
              createHash('sha256').update(source).digest('hex').slice(0, 12) +
              '-' +
              path.basename(local.file);
            entries[key].push({ name, ...local });
          }
          rows.push({ source, kind, bundle: names[key], file: name });
          map[source] = recording
            ? 'https://video.igem.org/videos/embed/REPLACE-WITH-VIDEO-ID'
            : 'https://static.igem.wiki/YOUR-TEAM/uploaded-file';
          if (
            (source.startsWith('https://static.igem.wiki/') && !recording) ||
            (/^https:\/\/video\.igem\.org\/videos\/embed\/[a-zA-Z0-9-]+$/.test(
              source,
            ) &&
              recording)
          )
            map[source] = source;
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
        const id = randomUUID(),
          exportedAt = new Date(now()).toISOString(),
          expires = now() + 30 * 60 * 1000;
        const info = {
          project: project.name,
          exportedAt,
          submissionReady: false,
          standardPages,
          staticFiles: entries.assets.length,
          videoAudioFiles: entries.media.length,
          externalFiles: rows.filter((r) => !r.file).length,
          fontsIncluded: rows.some((row) => row.kind === 'font'),
        };
        const guide = `# 01 — Website source → iGEM GitLab

1. Extract all three ZIPs. Upload images/files to iGEM Uploads and video/audio to Video Universe.
2. Fill publication/media-map.json with the returned URLs. For recordings use iframe embed URLs, not watch-page URLs.
3. Review publication/content.json: saved source can include hidden or unpublished text. AI briefs and account metadata are omitted; this is not a full privacy scrub.
4. Configure hosted fonts, your official attribution iframe and selected award page slugs in publication/config.json. Review your content before publishing; review.json is legacy optional metadata and no longer blocks the build.
5. Merge this source into https://gitlab.igem.org/2026/${team}, including its CC BY 4.0 root LICENSE. Third-party assets and fonts retain their own licences and attribution notices.
6. Review the diff and commit through your team's workflow. The included .gitlab-ci.yml builds the wiki from source on each main push.

Local verification: npm ci, then npm run build. The compiler checks required page URLs and media mappings. A ZIP alone does not publish the wiki.

${common}`;
        entries.source.push(
          textEntry('publication/content.json', content),
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
        entries.media.push(
          textEntry(
            'UPLOAD-FIRST.txt',
            "# 03 — Video and audio → Video Universe\n\nOpen https://video.igem.org/ and copy each processed recording's iframe embed URL.\n\n" +
              (!info.videoAudioFiles
                ? 'No local recordings in this saved project. This ZIP contains instructions and a manifest only.\n\n'
                : '') +
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
        plans.set(id, { userId, projectId: project.id, entries, expires });
        return {
          id,
          project: project.name,
          exportedAt,
          expiresAt: new Date(expires).toISOString(),
          externalFiles: info.externalFiles,
          downloads: Object.keys(entries).map((key) => ({
            key,
            filename: names[key],
            url: `/api/export/bundles/${id}/${key}`,
            bytes: entries[key].reduce((total, entry) => total + entry.size, 0),
            files:
              key === 'source'
                ? entries[key].length
                : info[key === 'assets' ? 'staticFiles' : 'videoAudioFiles'],
          })),
        };
      } finally {
        pending--;
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
      plans.clear();
    },
  };
}
