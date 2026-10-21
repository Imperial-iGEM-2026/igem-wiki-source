**Smaller Pages artifacts (upload helper 1.0.27):** PDF.js, the complete-PDF download library, the 3D model viewer, and the JPEG 2000/JBIG2 JavaScript decoders now join the PDF worker in `02-static-assets.zip` under `assets/runtime`. The helper uploads these files to iGEM Uploads just like images and saves their URLs in the media mapping. CI imports these verified standalone modules from iGEM and omits their implementations from the Pages artifact. Small local decoder forwarding modules preserve PDF.js filename resolution. CSS and application code stay in Pages. Install the new server package, refresh Studio, prepare fresh ZIPs, and use the new helper to upload/check remaining assets before Send to GitLab. Older exports without these mappings retain local libraries. The existing artifact budget remains unchanged; check the new build estimate. Regression tests cover PDF rendering, complete-document download, decoder initialization, and the 3D viewer module in Edge.

Large saved content is exported as a small `publication/content.json` index (version 2) and `publication/content-parts/*.json`. Commit all these files together. Each part is capped at 512 KiB and checked by size and SHA-256 before the compiler reconstructs the original string values in memory. Do not concatenate them into a large committed file. Small version-1 sources remain supported. To edit generated content, change it in Studio and export again; manually changing a part without its matching index will fail integrity validation. Upload helper 1.0.25 upgrades older monolithic source on Check source changes and reports other files that exceed GitLab’s 10 MB limit before sending.

External download retries: requests use Chrome headers first. HTTP 403 responses may retry with Firefox and Studio User-Agents (three attempts total), with bounded backoff under the same timeout. Other HTTP failures stop immediately. These profiles do not provide a browser session or guarantee access: a host can still reject all attempts. New images should be uploaded to Studio and referenced by their permanent media URLs rather than third-party hotlinks.

External static assets: Studio Prepare downloads referenced public images, PDFs and other supported static files into `02-static-assets.zip`, including literal image references in Custom HTML and page CSS. Every collected static asset must have a local bundled file; unavailable links produce page/layer errors before the ZIPs are offered. Public HTTP(S) downloads stream to disk sequentially, with a 128 MiB per-file download bound and a two-minute deadline. Existing upload-size checks, image processing and PDF splitting still apply. No Studio credentials are sent to external hosts. Video Universe embeds remain embeds; direct video/audio remain recording TODOs. Install the updated server and prepare fresh ZIPs to replace older exports with empty file rows.

**Image processing for a 1 GB VPS:** The server now uses bundled sharp/libvips in a separate process with a 64 MiB JavaScript heap, one native processing thread, and no operation cache. It reads through the final scanline without retaining full-size JavaScript pixel arrays, checks PNG chunk CRCs, and releases the native process after every image. Successful unchanged-file checks remain cached by content. Healthy under-limit files retain their original bytes. Converted export copies keep PNG transparency, apply JPEG orientation and have a maximum 4096-pixel edge.

The existing 448 MiB service memory limit is unchanged. Baseline JPEGs and PNGs keep the 40 megapixel limit; progressive JPEGs above 24 megapixels stop before allocating full-image coefficient buffers and ask for a baseline JPEG or smaller export copy. Decoder memory is still additional to the 64 MiB JS heap. The package includes pinned Linux x64/ARM64 native binaries and licences; installation checks the decoder before stopping the service. Install the complete package, save drafts and refresh the editor, then Prepare again. No RAM-limit increase or server-side npm install is needed.

**Faster image preparation:** Exports reuse a lightweight media worker and serialize heavy decoding to keep the server responsive. Successful checks of unchanged images are cached by their exact file contents for up to 30 days, including across server restarts. Changed files are checked again; failed checks and converted images are not cached. Connection timeouts now explain how to reconnect to the same background job with Prepare. Install this package and refresh the editor after saving drafts. The first export still needs to validate each new image.


Google Fonts in exports: Prepare now downloads referenced Google Fonts and their original licence notices automatically. The font files join the static asset ZIP, and the updated upload helper maps them to iGEM URLs. Publication rewrites stylesheet links and CSS imports, including custom HTML frames, from a frozen manifest without fetching Google during CI. Download the new helper and prepare fresh ZIPs after this server update. Unavailable fonts or licence downloads produce a page/layer error. Recording TODOs remain visible in the export panel and build log.

# Publish the wiki from source on iGEM

The exporter does not add a repository/licence footer or rewrite your footer text. Add any visible source and licence links yourself in the wiki editor. Exported licence files and publication checks remain included.

Publication excludes pages with whole `backup`, `test` or `scratch` slug segments, including their copied fields and unused media. Studio retains the original pages. Scientific pages such as `testing-methods` and `contest` remain published. The build log and `publication-report.json` list the excluded slugs.

PDF WebAssembly decoders (`openjpeg`, `jbig2`, and `qcms_bg`) now join JavaScript in `assets/runtime`. Upload them through the current helper, which checks the MIME type, CORS access and exact bytes. Fresh exports map each file to its uploaded iGEM URL; the compiler removes mapped WASM binaries from the Pages artifact. A small dedicated PDF worker adapter resolves both asynchronous decoder requests and synchronous colour-profile requests. Unmapped older exports retain the local binaries. The unused PDF scripting engine remains excluded. Download the updated helper and prepare fresh ZIPs after installing this update.

**Image integrity before upload:** Export preparation now decodes local JPEG and PNG files even when they are below 10 MB. Truncated JPEG scans/end markers and invalid PNG data/checksums stop preparation with the affected file and page/layer in the existing media-error panel. Re-export the original in an image editor and upload a fresh copy, then prepare again. Valid images below the limit keep their original bytes. This checks locally packaged files; existing remote iGEM URLs and other image formats do not receive this decoding check.

Corrected 5 October 2026 using the Wiki requirements supplied by the team. This replaces the earlier instructions to commit a compiled `public/` folder: **do not do that**. Compiled HTML, CSS and JavaScript are CI artifacts, not files to hand-upload or commit. GitLab must build from source on every push to `main`.

## Manual recording embeds

Upload video and audio to Video Universe yourself, finish their settings, and copy the HTML iframe into an HTML block (or its `src` into a Video embed block). The exporter preserves valid `https://video.igem.org/videos/embed/ID` players and their query settings. It does not upload, transcode, package or map recordings.

Raw video/audio players and non-iGEM video players become amber TODO frames in the exported page. Their surrounding editor layout is retained; saved editor content is not changed. The export dialog and `publication/recording-todos.json` identify saved recordings to fix; the compiled `publication-report.json` also lists TODOs found in template/custom HTML. Re-export after replacing them. Builds remain available for review with TODOs, but `submissionReady` stays false until these are resolved. Arbitrary JavaScript-generated players still need a visual review.

## Easier handoff: two ZIPs

In the updated live editor, save your project, click **Export wiki**, check your registered team URL name, then click **Prepare two ZIPs**. Preparation runs in the background with the current file shown in the dialog, so large PDFs do not hit the proxy request timeout. Download each part with its ZIP button. No terminal or separate media-folder transfer is needed to create the two downloads.

All two downloads capture the same saved project. Links are private to your signed-in account and project, last 30 minutes, and stop working after a server restart. Use the refresh button to capture newer saves. Local files are checked before download; missing static media must be restored or replaced. Missing recording files do not block export because they are not packaged. The source ZIP contains unset review declarations, so it cannot publish accidentally before configuration.

The downloads are split by destination:

1. **01-website-source.zip** — extract and merge the reviewed source into the official GitLab repository. The CI file and source content are included; no compiled website, embedded media, private snapshot wrapper, AI brief, server database or replacement LICENSE is included. Saved page values can still include hidden/unpublished text and require review.
2. **02-static-assets.zip** — extract the image/document/model files and upload accepted formats through iGEM Uploads. Referenced Google Fonts and their licence notices are included automatically; other custom fonts still need the font setup below.

Each contains `UPLOAD-FIRST.txt`, bundle information and an upload manifest. ZIP 01 contains `publication/media-map.json`: paste the actual returned iGEM URLs against the original source keys. Archive names are convenience labels; do not assume that GitLab or iGEM's media tools automatically import a ZIP. Extract first. Uploading both ZIP files themselves is not a publication workflow.

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
| Video **and audio** | Upload to iGEM Video Universe and use the actual iframe embed URL. Add the iframe HTML or embed URL in the editor before exporting. Raw video/audio frames become TODO placeholders; recordings are excluded from upload ZIPs and media maps. An MP3 on the static CDN is not the required audio workflow. |
| Runtime dependencies | Serve all dependencies from iGEM infrastructure. Literal external HTML/CSS dependencies are now flagged. This is not a complete JavaScript/network audit: run the official HAR check after deployment. Ordinary outbound citation links are allowed. |
| Fonts | Notebook/Purple import Google Fonts until replaced. Supply `fontCss` with reviewed `@font-face` rules using iGEM-hosted font files; the compiler replaces Google Fonts imports. The editor need not lose its fonts. |
| Licensing | Include the exported **CC BY 4.0 root LICENSE** for original team wiki work. Third-party materials retain their own licences. Check third-party rights and place source/license credits next to each asset. A footer-only credits list or a global CC BY notice does not replace inline credits. |
| AI use and evidence | Add the required AI-use section and nearby model credits for decorative AI imagery. Team members must author and verify scientific substance, claims, evidence, quotations and citations. Code cannot certify this. |

The pasted rules settle hosting and build requirements, but do not list allowed file extensions, codecs or uploader size limits. Check the signed-in upload pages for those details. The exporter copies files; it does not transcode them. Never rename an extension as a substitute for conversion. Editor GLB support is not evidence that the iGEM uploader accepts GLB; verify acceptance and embedded textures/decoder dependencies. A labelled still image or Video Universe recording is a fallback.

## Large media

The updated editor streams ZIP64 files from the server to the browser download folder. It does not embed media in browser JSON, buffer an entire ZIP in memory or impose the old 150 MiB media cap. Disk space, network capacity and the destination uploader's own limits still apply. Two downloads can run at once; retry after one finishes if the server is busy.

Older editor versions limited base64 media snapshots to 150 MiB to avoid exhausting browser memory. That was an application safeguard, not an iGEM requirement. The authenticated `/api/export` metadata endpoint remains available for administrative scripts; it does not embed media.

**Using the two ZIPs:** follow `UPLOAD-FIRST.txt` in ZIP 01. After uploading ZIP 02 files and filling `publication/media-map.json`, configure `publication/config.json` (no review JSON is required). Continue with the licensing, font and build instructions below. The next snapshot commands are an alternative for existing local snapshots, not an extra prerequisite for the editor downloads.

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
- [iGEM Video Universe](https://video.igem.org/) for **videos and audio**. Wait for processing and verify playback. Copy the iframe `src`, of the form `https://video.igem.org/videos/embed/ACTUAL-ID`, rather than a watch/share URL. Player query parameters such as `title=0` and `warningTitle=0` are preserved.
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

If the build succeeds but **Uploading artifacts** fails with **413 Request Entity Too Large**, the GitLab coordinator or its reverse proxy rejected the archive. This is separate from the static uploader's per-file limit and Studio VPS memory. The supplied job explicitly enables Fastzip compression (`ARTIFACT_COMPRESSION_LEVEL: "slowest"`) and transfer progress; the build prints uncompressed size, a compressed ZIP estimate and the largest files. The estimate does not certify acceptance: iGEM's configured limit is not known. If compression still fails, give iGEM support the job ID, correlation ID and size output and ask them to check the artifact and proxy upload limits. Changing your own VPS Nginx configuration does not change iGEM GitLab. Do not remove required assets or bypass publication checks to conceal this failure.

Compressed Pages artifacts do not support HTTP Range requests on GitLab Pages ([runner documentation](https://docs.gitlab.com/ci/runners/configure_runners/#artifact-and-cache-settings)). The iGEM export serves media/PDF parts from static iGEM hosting and recordings from Video Universe, so their range support is unaffected. If you customise the build to serve range-dependent files directly from Pages, use uncompressed artifacts (`fastest`) and arrange a sufficient upload limit instead.

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

Prepare two ZIPs automatically partitions local PDFs larger than 9,000,000 bytes into valid PDFs below that target. Upload all parts through the helper as usual. `publication/pdf-parts.json` records page ranges and the helper maps each part to its uploaded URL. Rebuild the website after uploading. The original saved PDF and editor layout are unchanged.

The editor, Preview and published wiki use the same Edge-style reader, with continuous page scrolling, thumbnails, page navigation, zoom, fit, rotation and fullscreen. Parts are fetched as needed and nearby pages are drawn progressively. **Download complete PDF** fetches all parts and merges their pages in order; it includes progress, cancellation and retry after errors. Downloading the full file needs browser memory and the media host must allow cross-origin fetching. Normal viewing does not download the whole notebook. Open the downloaded PDF in your browser or desktop reader for text search, printing and annotation; these are not included in the embedded reader.

Parts are reading copies: page appearance and order are retained, but document-level bookmarks, attachments and digital signatures are not retained. Large PDFs with interactive forms are rejected; provide a flattened reading copy. If an individual page exceeds the target, export identifies its page number for image compression. No pages are silently omitted. Standalone snapshot export also splits local PDFs and lists each part in its publication report for upload and mapping.

## Large images

Local JPEG and static PNG images above 9,900,000 bytes are automatically compressed during export. The original stays unchanged. JPEG quality is reduced first; images are resized proportionally if necessary. PNGs stay PNGs with transparency. Review exported scientific figures for legibility. Oversized unsupported formats (including animated images), unsafe/corrupt images, or images that cannot meet the target stop export with the filename and a request to compress or replace it. Re-export older ZIPs to benefit from this processing. The helper rejects static files of 10,000,000 bytes or larger before uploading.


### Shared publication assets and uploaded PDF worker

New two-ZIP exports with PDF elements include `assets/runtime/pdfjs-6.4.299-worker.js` (with a source-key prefix in the upload filename). Upload this JavaScript unchanged using the helper. The helper verifies its content type, CORS response and SHA-256 against the bundled original before preparing GitLab changes. Rejected JavaScript uploads or incompatible hosting stop with a clear error; do not disguise code as an image. A live upload acceptance check is still required.

The source media map points `/templates/runtime/pdfjs-6.4.299-worker.js` to the actual upload URL. CI regenerates the same pinned worker from npm dependencies, rewrites its runtime reference, and removes its local copy only after finding that reference. Older exports without the mapping keep the local copy. The source and lockfile remain in GitLab; the hosted worker is only a runtime distribution asset.

Template styles and custom HTML component parts are deduplicated by content. JSON components remain inert in the parent; the browser reconstructs the original opaque sandboxed document. Relative stylesheet URLs are kept inline. Canonical page aliases use redirects preserving query/hash. PDF scripting-engine WASM is not included because this reader does not import the PDF scripting sandbox; normal PDF resources remain.

`IGEM_ARTIFACT_BUDGET_BYTES` in the generated CI defaults to 4,800,000 bytes of estimated compressed ZIP size. It stops an over-budget build before upload with actionable instructions. Adjust it if iGEM confirms a different limit. This conservative budget is not an assertion about the actual GitLab/proxy setting.


## Project search (upload helper 1.0.28)

Fresh exports include a project-wide search dialog, opened by the Search button or Ctrl/Cmd+K. It searches page titles, headings and saved text, including text inside Custom HTML. Hidden/deleted layers and removed pages are omitted; headers, scripts and styles are excluded. It does not execute custom scripts, extract text from PDFs, OCR images, or index text generated only at runtime. Review this limitation for script-generated interviews or charts.

Search ranks page-title and heading matches above body matches, requires all query terms (apart from common stop words), folds case/accents, and returns the best match per page. Pages whose URL slug contains a whole `backup`, `test` or `scratch` segment are excluded from the index entirely, in both Preview and export. Saved pages are unchanged; this exclusion does not remove their HTML from the exported website. A one-edit spelling fallback is tried only when there are no exact matches, and the dialog labels any correction. Result links open the matching page, not a section anchor.

The exporter creates a content-hashed `assets/runtime/search-<hash>.js` in **02-static-assets.zip**. The file is a data-only ES module uploaded unchanged by the helper, like other runtime assets. **01-website-source.zip** contains only its small `publication/search.json` pointer and the media mapping. CI requires its verified iGEM static URL and never copies the index into the Pages artifact. The small search UI remains in the application bundle. The index is loaded on the first nonempty query and cached for the page visit; unchanged content produces an identical asset. Indexes at or above 9,900,000 bytes stop export with an error. The existing 4,800,000-byte compressed Pages budget remains in force.

Install the new server package, refresh Studio, prepare fresh ZIPs and upload/check assets with helper 1.0.28 before sending to GitLab. Older source ZIPs without a search manifest continue to build without published search.

### UI API

The live website, Studio Preview and exported website expose this browser API after initialization:

```js
window.websiteSearch.open();
window.websiteSearch.close();
const results = await window.websiteSearch.search('streptavidin', { limit: 10 });
// [{ id, title, page, excerpt, url, score, correction? }]
```

`limit` defaults to 20 (maximum 50). Empty queries return an empty array. Failed index downloads reject the promise and can be retried; custom UIs should handle the error. Use `textContent` to render titles/excerpts. Use the returned `url` for navigation: it includes the exported team prefix or the live project query. Sandboxed Custom HTML has its own window and cannot call the parent API directly; use this API in the template/application UI. It is a browser search API, so the exported wiki needs no search server.

For the Studio-hosted website, authenticated `GET /api/search-index?project=<project-id>` returns `{ version: 1, documents: [{ id, page, title, text }] }`. It uses the existing project/authentication boundary and only saved content. This endpoint is not needed after static export.

Run `node scripts/test-site-search.mjs` for reproducible ranking, exclusion, accent/CJK, keyboard, retry and lazy-loading checks. An optional second argument can point to a local saved-values JSON snapshot for the Imperial project relevance regression; private content is not committed with the tests.


## Links to sections on other pages

Open the text editor (choose **Expand editor** from the on-canvas editor), select the words, then choose **Link selected text**. Choose a website page, choose its section or collapsible subsection, press **Insert link**, then **Save text**. Existing link/button settings also offer the section picker. Links are saved as `[label](/page#section-id)` in plain text and rendered as normal anchors. Select words within one paragraph; code spans and unsafe URLs remain literal.

Section fragments use persistent layer/item IDs, so renaming or reordering a destination does not break its link. Hidden/deleted sections and removed pages are absent from the picker. Deleting and recreating a destination creates a new ID and requires updating its links. All templates use the same anchors without requiring a page index/sidebar. A Custom HTML block is a destination as a whole; headings inside its isolated frame are not individual targets.

Preview and live navigation reveal collapsed ancestors, scroll to the destination and briefly highlight it (respecting reduced-motion preferences). Export rewrites the page path to the team's prefix while preserving its fragment. MCP `get_page.linkTargets` returns each available `{ anchor, label, href }`; use these URLs with `update_text`, section bodies or button links instead of guessing IDs. Install the new server and prepare fresh exports to deploy new anchors. Upload helper 1.0.29 carries the section navigation dependency when upgrading older source ZIPs; older ZIPs need a fresh export for the full feature.


## Colour accessibility API

Preview and exported websites include a **Colours** button with a preset selector, filter strength slider, labelled comparison sample and reset button. Choices are saved per website/project; Preview is separate from the live website.

```js
const colours = window.websiteAccessibility;
colours.openSettings();
colours.getColorModes(); // value/label pairs
colours.setColorMode('protanopia'); // or deuteranopia, tritanopia, grayscale
colours.setColorStrength(0.65); // 0–1, visual strength, not clinical severity
colours.getColorMode();
colours.getColorStrength();
colours.setColorMode('high-contrast');
colours.setColorMode('default'); // restore authored appearance
colours.toggleColorMode(); // off / last selected active preset
```

Modes: `default`, `high-contrast`, `protanopia`, `deuteranopia`, `tritanopia` and `grayscale`. High contrast is a separate text/controls theme with no image filter; its strength slider is disabled. The four filter presets act once on the entire rendered website: text, backgrounds, image buttons, logos, Custom HTML, charts, video and PDFs. Grayscale at 100% removes all colour; zero strength restores original pixels. The Protan/Deutan/Tritan presets are adjustable hue/saturation preferences, not simulations or medically calibrated corrections.

```html
<button type="button" data-website-color-settings>Colour preferences</button>
<button type="button" data-website-color-toggle aria-pressed="false">Toggle colour assistance</button>
<label>Preset
  <select data-website-color-mode>
    <option value="default">Original colours</option>
    <option value="high-contrast">High contrast</option>
    <option value="protanopia">Protan assistance</option>
    <option value="deuteranopia">Deutan assistance</option>
    <option value="tritanopia">Tritan assistance</option>
    <option value="grayscale">Grayscale</option>
  </select>
</label>
<label>Strength <input data-website-color-strength type="range" min="0" max="100" step="5"></label>
```

Custom HTML supports the same API and controls through the existing frame bridge without access to editor data. State changes are asynchronous there. `website:colormodechange` includes `{ mode, strength, palette, chartPalette, pageFiltered }`. Floating Colours and Search launcher buttons are hidden by default in Design, Preview and export. Add your own header/button controls with `data-website-color-settings` or call `window.websiteAccessibility.openSettings()` and `window.websiteSearch.open()`. Search keyboard shortcuts remain available.

### Whole-page filtering

Preview and export apply one native CSS filter at the document root, preserving viewport-fixed positioning. Design applies it to the already transformed artboard; Studio controls and the contained Colours panel remain outside that filter. Custom HTML receives state but does not filter its document a second time. PDF shadow roots and cross-origin player surfaces are included in the parent's composition. Website modal dialogs and popovers in the browser top layer receive an equivalent filter because they paint outside ordinary ancestor composition; the colour chooser remains readable and unfiltered.

Native CSS `grayscale()` and `hue-rotate()`/`saturate()` are used throughout. SVG reference matrices can leave embedded surfaces unfiltered in Chromium, so the same CSS operation is used for the whole page. There is no background-image discovery, per-element filter scan or per-frame JavaScript pixel processing. Dynamically inserted and lazy-loaded content is covered automatically. Original mode removes the filter and restores authored styles. The Protan/Deutan/Tritan API identifiers are retained for compatibility; these visual preferences are not clinical correction.

`data-preserve-colors` only exempts content from the High contrast theme. It cannot cancel an ancestor's page filter; all website content, including marked charts, participates in whole-page filtering. `data-website-media` is no longer needed for filter coverage. Tests cover Custom HTML image buttons, background images, unmarked HTML bars, SVG, playing video, external frames, rendered PDF pages, source Design/Preview, actual static export, fixed positioning, top-layer dialogs and restoration.

### Custom HTML charts in High contrast

Mark the chart root `data-website-chart` (or `role="img"`) to preserve its authored bars, background and legend in the High contrast theme. Common Recharts, Plotly, Highcharts and Vega containers are recognised too. This marker does not exempt a chart from whole-page filters.

Charts that redraw can opt into `window.websiteAccessibility.getChartPalette()`: six `{ color, dash, marker }` styles with at least 3:1 colour contrast against white. Use them with labels, distinct dashes and markers; they do not guarantee all pairs are distinguishable or suitable on other backgrounds. CSS variables `--website-chart-series-1` through `--website-chart-series-6` are provided only in High contrast. Supply original fallback colours in `var()`.

```js
window.addEventListener('website:colormodechange', ({ detail }) => {
  // Your chart supplies redrawChart and originalSeries.
  redrawChart(detail.mode === 'high-contrast' ? detail.chartPalette : originalSeries);
});
```

Do not recolour chart series for Protan/Deutan/Tritan/Grayscale: `pageFiltered` is true and the browser already filters the complete chart. Custom HTML receives its first state asynchronously; listen for that event (`getChartPalette()` is empty until then). Labels and non-colour cues remain necessary: [W3C colour and pattern guidance](https://www.w3.org/WAI/WCAG21/Techniques/general/G111). Whole-page composition follows the [CSS filter model](https://www.w3.org/TR/filter-effects-1/#FilterProperty).
