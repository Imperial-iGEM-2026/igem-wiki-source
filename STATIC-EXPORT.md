# Publish the wiki from source on iGEM

Corrected 5 October 2026 using the Wiki requirements supplied by the team. This replaces the earlier instructions to commit a compiled `public/` folder: **do not do that**. Compiled HTML, CSS and JavaScript are CI artifacts, not files to hand-upload or commit. GitLab must build from source on every push to `main`.

## Easier handoff: three ZIPs

In the updated live editor, save your project, click **Export wiki**, check your registered team URL name, then click **Prepare three ZIPs**. Download each part with its ZIP button. No terminal or separate media-folder transfer is needed to create the three downloads.

All three downloads capture the same saved project. Links are private to your signed-in account and project, last 30 minutes, and stop working after a server restart. Use the refresh button to capture newer saves. Local files are checked before download; missing media must be restored or replaced. The source ZIP contains unset review declarations, so it cannot publish accidentally before configuration.

The downloads are split by destination:

1. **01-website-source.zip** — extract and merge the reviewed source into the official GitLab repository. The CI file and source content are included; no compiled website, embedded media, private snapshot wrapper, AI brief, server database or replacement LICENSE is included. Saved page values can still include hidden/unpublished text and require review.
2. **02-static-assets.zip** — extract the image/document/model files and upload accepted formats through iGEM Uploads. Google Fonts are not downloaded automatically; licensed fonts still need the font setup below.
3. **03-video-audio.zip** — extract and upload recordings to Video Universe. If the snapshot contains no local recordings, this ZIP explicitly says so. Remote media is listed but not downloaded.

Each contains `UPLOAD-FIRST.md`, bundle information and an upload manifest. ZIP 01 contains `publication/media-map.json`: paste the actual returned iGEM URLs against the original source keys. Archive names are convenience labels; do not assume that GitLab or iGEM's media tools automatically import a ZIP. Extract first. Uploading all three ZIP files themselves is not a publication workflow.

For an **older local snapshot**, the optional command-line packager is still available with Python 3.10+ and Node.js 24 in the source kit:

```sh
python scripts/package-igem.py --snapshot ./prion-snapshot.json --media-dir ./media --team imperial-college --out ./work/upload-bundles
```

Omit `--media-dir` when the snapshot already embeds the uploaded files. Choose a new/empty output directory. Files stream from disk into ZIP64 archives; the packager imposes no 150 MiB media limit. Do not use a template-only bundle as a substitute for a fresh snapshot of your saved server project.

## What the requirements mean for this project

| Area | Required workflow / current status |
| --- | --- |
| Website source | Commit source, reviewed content data, build scripts and `package-lock.json` to `https://gitlab.igem.org/2026/imperial-college`. The supplied CI job runs `npm ci` and the compiler. |
| URL paths | Use `/imperial-college/`. Notebook, Swiss and Purple include `contribution`, `engineering` and `human-practices`. Set `requiredPages` to the exact standard slugs of the selected awards; add missing pages in the editor. An existing route does not establish that its scientific content meets a criterion. |
| Images, documents, fonts, static files | Upload to the team's CDN area, then map their actual `static.igem.wiki` URLs. The editor's private media domain is not a publication host. |
| Video **and audio** | Upload to iGEM Video Universe and use the actual iframe embed URL. Both kinds now become iframe embeds in the export. An MP3 on the static CDN is not the required audio workflow. |
| Runtime dependencies | Serve all dependencies from iGEM infrastructure. Literal external HTML/CSS dependencies are now flagged. This is not a complete JavaScript/network audit: run the official HAR check after deployment. Ordinary outbound citation links are allowed. |
| Fonts | Notebook/Purple import Google Fonts until replaced. Supply `fontCss` with reviewed `@font-face` rules using iGEM-hosted font files; the compiler replaces Google Fonts imports. The editor need not lose its fonts. |
| Licensing | Include the exported **CC BY 4.0 root LICENSE** for original team wiki work. Third-party materials retain their own licences. Check third-party rights and place source/license credits next to each asset. A footer-only credits list or a global CC BY notice does not replace inline credits. |
| AI use and evidence | Add the required AI-use section and nearby model credits for decorative AI imagery. Team members must author and verify scientific substance, claims, evidence, quotations and citations. Code cannot certify this. |

The pasted rules settle hosting and build requirements, but do not list allowed file extensions, codecs or uploader size limits. Check the signed-in upload pages for those details. The exporter copies files; it does not transcode them. Never rename an extension as a substitute for conversion. Editor GLB support is not evidence that the iGEM uploader accepts GLB; verify acceptance and embedded textures/decoder dependencies. A labelled still image or Video Universe recording is a fallback.

## Large media

The updated editor streams ZIP64 files from the server to the browser download folder. It does not embed media in browser JSON, buffer an entire ZIP in memory or impose the old 150 MiB media cap. Disk space, network capacity and the destination uploader's own limits still apply. Two downloads can run at once; retry after one finishes if the server is busy.

Older editor versions limited base64 media snapshots to 150 MiB to avoid exhausting browser memory. That was an application safeguard, not an iGEM requirement. The authenticated `/api/export` metadata endpoint remains available for administrative scripts; it does not embed media.

**Using the three ZIPs:** follow `UPLOAD-FIRST.md` in ZIP 01. After uploading ZIP 02/03 files and filling `publication/media-map.json`, configure `publication/config.json` (no review JSON is required). Continue with the licensing, font and build instructions below. The next snapshot commands are an alternative for existing local snapshots, not an extra prerequisite for the editor downloads.

## 1. Save and review locally

For the legacy command-line workflow, use a fresh saved-project snapshot. Keep it private: hidden sections and unpublished text can be present even when the rendered export hides them. Local preview is separate from public source preparation.

Extract the latest source kit and open a terminal in `prion-source`, with Node.js 24 installed:

```sh
npm ci
npm run export:static -- --snapshot ./prion-snapshot.json --media-dir ./media --base /imperial-college/ --out ./wiki-review
npm run preview:static -- --dir ./wiki-review --base /imperial-college/
```

Omit `--media-dir ./media` if the portable snapshot embeds all uploads. Choose a new/empty output directory for each build. The `wiki-review/public/` directory is for local inspection only; do not commit it.

For large files, privately copy `/var/lib/prion/media` from the server, retaining its filenames. Copy after downloading the snapshot so that all referenced immutable uploads exist. An administrator can create a private transfer archive on the server:

```sh
sudo tar -czf /root/prion-media-transfer.tar.gz -C /var/lib/prion media
sudo chmod 600 /root/prion-media-transfer.tar.gz
```

Retrieve it using the team's private SSH/file-transfer workflow and extract it locally. It may include hidden material; do not put this archive in the public GitLab repository.

## 2. Upload assets to iGEM

Use the team's official, signed-in destinations:

- [Imperial wiki uploads](https://teams.igem.org/6377/deliverables/wiki/uploads) for images, documents, fonts and other accepted static files.
- [iGEM Video Universe](https://video.igem.org/) for **videos and audio**. Wait for processing and verify playback. Copy the iframe `src`, of the form `https://video.igem.org/videos/embed/ACTUAL-ID`, rather than a watch/share URL. This exporter uses the bare embed URL, without optional player query parameters.
- [Wiki instructions](https://teams.igem.org/go/deliverables/wiki) for the current allowed formats and limits.

`wiki-review/publication-report.json` lists each asset's source URL and the local exported `file`. Upload those files and copy the returned URLs. Copy `wiki-review/media-map.example.json` to `publication/media-map.json` and replace every example value with the URL for that exact file. Keep the original source keys unchanged. Illustrative entries (not real uploaded destinations):

```json
{
  "/templates/notebook-purple/logo-transparent.png": "https://static.igem.wiki/teams/6377/ACTUAL-PATH/logo.png",
  "/api/media/ORIGINAL-VIDEO-ID.mp4": "https://video.igem.org/videos/embed/ACTUAL-VIDEO-ID",
  "/api/media/ORIGINAL-AUDIO-ID.mp3": "https://video.igem.org/videos/embed/ACTUAL-AUDIO-ID"
}
```

For fonts, obtain licensed files for each family/weight/style actually used, upload them, and create `publication/fonts.css` with `@font-face` rules pointing to their real iGEM CDN URLs. Set `fontCss` in the build config to `publication/fonts.css`. Notebook/Purple use DM Sans, Libre Caslon Display and Caveat; preserve the necessary weights, add inline font credits near their use as required, and visually verify the result. The compiler validates hosted URLs and replaces the Google imports, but cannot infer licences or verify that a downloaded font file is correct. No font upload or automatic conversion has been performed for you.

## 3. Prepare reviewed content source

JSON page text/layout data is an input to the renderer, not compiled HTML. Create a **private candidate** from the snapshot:

```sh
node scripts/prepare-igem-source.mjs --snapshot ./prion-snapshot.json --out ./work/publication-source-candidate.json
```

This strips the snapshot wrapper metadata and embedded media only. **It is not a privacy scrub.** Review all `values`, including hidden/deleted-page text, layout bodies, captions, URLs and custom CSS. Remove unpublished content and personal information before making it public. Retain the structural hidden-layer settings needed to keep sections hidden; removing an override can restore a template default. Re-preview after changing source values.

Only after that review, copy the candidate to `publication/content.json`. Its allowed shape is:

```json
{
  "format": "prion-wiki-source",
  "version": 1,
  "values": { "site:template": "notebook-purple" }
}
```

The shape above is an illustration, not a replacement for your reviewed page values. The CI builder rejects portable snapshots, embedded media and unexpected wrapper properties. Unknown content fields also fail the export. No tool can infer whether the remaining text is appropriate to publish; that remains a team review.

## 4. Configure the source build

Copy `publication/config.example.json` to `publication/config.json`. Set:

- `teamSlug`: `imperial-college`.
- `repository`: `https://gitlab.igem.org/2026/imperial-college`.
- `source`: `publication/content.json`.
- `mediaMap`: `publication/media-map.json`.
- `review`: legacy optional metadata; the build no longer reads or requires it.
- `attributionUrl` (optional legacy embed; not required for 2026): the **actual** official iframe URL supplied by the team's attribution form. The compiler accepts HTTPS iGEM infrastructure hosts, including current `teams.igem.org` URLs; it does not invent the team's iframe URL.
- `requiredPages`: the standard path slugs for the awards the team selected. For example `["education", "model", "sustainability"]` is merely an example, not a statement of your award selection. The pasted text omitted the expanded award tables.
- `fontCss`: `publication/fonts.css` if supplying hosted fonts, otherwise an empty string. Leaving it empty does not bypass external-font checks.

The helper and CI no longer require review checkboxes, reviewer names or a review JSON file. They do not generate declarations on your behalf. The following are publication guidance, not upload gates:

1. **Source privacy:** every public source value and file is suitable to release.
2. **Licensing:** team work is CC BY 4.0, the exported CC BY 4.0 root LICENSE is included, and third-party rights permit the required reuse. Included sponsor/company logos need the permission required by the supplied rules; presence in a template does not establish permission.
3. **Inline credits:** third-party assets have source and licence credits next to them. Add captions/nearby text in the editor and export again. AI-generated decorative images need a nearby model credit as well.
4. **AI disclosure:** publish the models/versions where known, their purposes, and who reviewed each use. Record actual historical models, not just today's server default. Do not invent a version when the tool did not expose one. For this project's logo, disclose the AI-assisted background removal if retaining that result.
5. **Scientific review:** team-authored substance and genuine evidence; real citations; accurate quotations/interviews. Do not use AI-generated or AI-cleaned evidentiary figures. The conceptual template drawings and network slider must remain clearly illustrative, not presented as measured or simulated experimental results. Review all inherited template prose before publication.

Put the AI-use disclosure in visible page content (for example a dedicated linked page), not just the repository or review JSON. The helper does not create disclosures or inline credits.

For hosted GLB models, check rendering, embedded textures and external decoder dependencies. The report includes this guidance without a checkbox gate; local model validation still applies.

## 5. Set up the official repository

Work in a clone of the team's official repository. Include the root `LICENSE` from the website source ZIP (or copy `publication/wiki-LICENSE.txt` from the source kit to `LICENSE`). The helper adds it on the new review branch even if `main` has no licence. Copy the renderer/build source from the source kit into it, preserving the directory structure:

- `app/`, `components/`, `hooks/`, `lib/`, `package.json`, `package-lock.json`, `tsconfig.json`.
- `scripts/build-igem.mjs`, `scripts/export-static.mjs`, `scripts/igem-resources.mjs`, `scripts/build-options.mjs`, `scripts/static-renderer.tsx`, `scripts/static-runtime.ts`.
- `ops/igem.gitlab-ci.yml` and the reviewed `publication/` files.
- Original template source/provenance, applicable third-party licence notices and credits needed for reproducibility. `app/template-data.json` and `app/template-styles.json` are renderer input data and must be included.

The strict mapped-media build does not need `public/` image files: it references their official uploaded URLs. Do not copy the source-kit ZIP wholesale. In particular, do not commit `selfhost-dist/`, `.static-build/`, `igem-build/`, local `wiki-review/` or other export output, `work/`, private snapshots, media backups, databases, secrets or environment files. Do not commit `node_modules/`.

Copy `ops/igem.gitlab-ci.yml` to the root as `.gitlab-ci.yml`, reconciling it with existing jobs so an older job cannot overwrite/deploy different output. It runs on every `main` push, installs from `package-lock.json`, builds all pages from source, and publishes `igem-build/public` as a Pages artifact. It uses the modern nested `pages.publish` syntax ([GitLab reference](https://docs.gitlab.com/ci/yaml/#pagespublish)); validate it in the team's GitLab CI Lint before deploying. The exact Node image version is pinned in the supplied job. Runtime assets still must be on iGEM infrastructure; downloading build dependencies in CI is a separate operation.

Add `/igem-build/`, `/.static-build/`, `/node_modules/`, `/work/` and private snapshot/export patterns to the official repository's `.gitignore`. A `.gitignore` entry does not untrack already committed files: inspect `git status`/the staged diff and remove previously committed compiled output from tracking through the team's normal review workflow, preserving the source and exported CC BY 4.0 LICENSE.

## 6. Build, deploy and check

Run the same command that CI uses, in the prepared official source checkout:

```sh
npm ci --include=dev --no-audit --no-fund
node scripts/build-igem.mjs
```

It stops if the exported LICENSE is absent, the source is still a portable snapshot, required routes are missing, external resources remain, or other strict export issues are found. Use a fresh output directory for subsequent local checks:

```sh
node scripts/build-igem.mjs --out ./work/igem-review-2
```

Review `publication-report.json` and the rendered result. A clear automated report does not certify scientific, legal or judging compliance. Commit/push the reviewed **source**, never the generated output. GitLab builds and publishes the output. No live GitLab pipeline has been run by this local task.

After a passing deployment, directly open and refresh:

- `https://2026.igem.wiki/imperial-college/`
- `https://2026.igem.wiki/imperial-college/contribution`
- `https://2026.igem.wiki/imperial-college/engineering`
- `https://2026.igem.wiki/imperial-college/human-practices`
- The standard URLs for the selected awards. Attributions are submitted through the official team page; a wiki attribution page or embed is not required.

Check actual page content, fonts, pictures, audio/video playback, any optional attribution iframe, inline credits, AI disclosure and visible footer source/CC BY links. A homepage shown as a 404 fallback does not count as the requested page. Run the team's [External Content Check](https://teams.igem.org/6377/deliverables/wiki/har-check) before the Wiki Freeze. The static checker examines literal markup/CSS; it does not execute every interaction, fetch, XHR or third-party JavaScript path.

Future editor changes require a new reviewed content source and any new uploaded asset mappings, then another source commit/build. The public wiki is independent of the Cloudflare-protected editor.
# Standard URL checks

In **Export wiki → Award pages**, select the awards the team is entering. Medal pages are always checked. Add any missing pages through Pages and write/review their content before exporting. ZIP 01 saves the selection in `publication/config.json` and the check results in `publication/url-check.json`. CI checks the pages again; page existence does not establish eligibility or content quality.

Existing `safety` content publishes at `safety-and-security`, with the old route preserved. If both pages exist, each retains its own content. All generated page links use the configured team prefix.

## Included template fonts

Notebook and Purple Notebook exports include DM Sans (normal and italic), Caveat and Libre Caslon Display. Swiss includes Caveat for its handwritten elements. These fonts are unmodified Google Fonts releases under SIL OFL 1.1. Original copyright and licence notices accompany the font files in `assets/fonts` and are retained in generated font CSS. The helper uploads fonts and configures their returned iGEM URLs automatically; no manual font CSS is required. Device fonts (including Arial, Georgia and Segoe Print) remain fallbacks and their binaries are not redistributed. Custom fonts beyond this audited set still need suitable rights and user-supplied files.

## Large PDFs

Prepare three ZIPs automatically partitions local PDFs larger than 9,000,000 bytes into valid PDFs below that target. Upload all parts through the helper as usual. `publication/pdf-parts.json` records page ranges and the helper maps each part to its uploaded URL. Rebuild the website after uploading. The original saved PDF and editor layout are unchanged.

The editor, Preview and published wiki use the same Edge-style reader, with continuous page scrolling, thumbnails, page navigation, zoom, fit, rotation and fullscreen. Parts are fetched as needed and nearby pages are drawn progressively. **Download complete PDF** fetches all parts and merges their pages in order; it includes progress, cancellation and retry after errors. Downloading the full file needs browser memory and the media host must allow cross-origin fetching. Normal viewing does not download the whole notebook. Open the downloaded PDF in your browser or desktop reader for text search, printing and annotation; these are not included in the embedded reader.

Parts are reading copies: page appearance and order are retained, but document-level bookmarks, attachments and digital signatures are not retained. Large PDFs with interactive forms are rejected; provide a flattened reading copy. If an individual page exceeds the target, export identifies its page number for image compression. No pages are silently omitted. Standalone snapshot export also splits local PDFs and lists each part in its publication report for upload and mapping.

## Large images

Local JPEG and static PNG images above 9,900,000 bytes are automatically compressed during export. The original stays unchanged. JPEG quality is reduced first; images are resized proportionally if necessary. PNGs stay PNGs with transparency. Review exported scientific figures for legibility. Oversized unsupported formats (including animated images), unsafe/corrupt images, or images that cannot meet the target stop export with the filename and a request to compress or replace it. Re-export older ZIPs to benefit from this processing. The helper rejects static files of 10,000,000 bytes or larger before uploading.
