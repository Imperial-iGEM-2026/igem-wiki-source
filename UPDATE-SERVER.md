**Smaller Pages artifacts (upload helper 1.0.27):** PDF.js, the complete-PDF download library, the 3D model viewer, and the JPEG 2000/JBIG2 JavaScript decoders now join the PDF worker in `02-static-assets.zip` under `assets/runtime`. The helper uploads these files to iGEM Uploads just like images and saves their URLs in the media mapping. CI imports these verified standalone modules from iGEM and omits their implementations from the Pages artifact. Small local decoder forwarding modules preserve PDF.js filename resolution. CSS and application code stay in Pages. Install the new server package, refresh Studio, prepare fresh ZIPs, and use the new helper to upload/check remaining assets before Send to GitLab. Older exports without these mappings retain local libraries. The existing artifact budget remains unchanged; check the new build estimate. Regression tests cover PDF rendering, complete-document download, decoder initialization, and the 3D viewer module in Edge.

**Project search / helper 1.0.28:** Adds a Search dialog (Ctrl/Cmd+K) and `window.websiteSearch.search/open/close` for template UI. Search is available in the live site and Studio Preview. It indexes saved page text and Custom HTML markup, excludes hidden/deleted content and scripts, favors page titles, deduplicates results by page, and labels spelling corrections. It does not index PDF contents or text generated exclusively by scripts.

Install this server package, refresh Studio, then prepare fresh source/assets ZIPs. The search index goes in `02-static-assets.zip/assets/runtime` and is uploaded by the helper like images. The published site fetches its mapped iGEM URL only when searching; the index is not included in the Pages artifact. Existing unchanged assets remain reusable. Older exports still build but need a fresh export to gain search. Full API and export details are in STATIC-EXPORT.md.


**Upload helper 1.0.26 — importing partitioned exports:** Fixed a missed version-1-only check in the initial ZIP import. Prepare now uses the same validated source reader as the compiler, so version-1 and version-2 exports work and missing/corrupt parts are rejected before the job becomes ready. Resume automatically finishes validation for an interrupted import whose source and assets ZIPs are already extracted. Close the helper, replace its files, keep `jobs`, restart and Continue the failed import. Existing export ZIPs remain valid; no fresh export or media upload is required. Tests now exercise both formats, damaged/missing parts, mapping and resume through HTTP against the extracted release ZIP as well as the source checkout. The server package includes the corrected helper download.

**Upload helper 1.0.25 — large publication content:** GitLab rejected a 10.1 MB `publication/content.json`; request batching cannot bypass its per-file limit. Large publication data now uses a small version-2 index plus deterministic, integrity-checked JSON parts capped at 512 KiB. Individual long values are split without changing their text. Both CI and static export read the parts directly. The helper upgrades existing source during Check source changes and rejects any other source file at or above 10,000,000 bytes before sending. If a failed partial upload has different reviewed source after the upgrade, the helper creates a separate review branch and preserves the old one. Close the helper, replace its files with version 1.0.25, keep `jobs`, restart, Continue earlier upload, sign in, Check source changes, then Send. Existing media URLs are reused; no new export is needed for this failed job. Install the server package for future exports and the updated helper download. Tests include a >10 MB exact Unicode round trip, helper migration, packaged compiler closure, and a full CI build from partitioned source.

**Upload helper 1.0.24 — GitLab sending and resume:** Fixed the generic “unexpected response / check your login” message hiding HTTP errors from GitLab or its proxy. Errors now include the method, endpoint, status and request ID when available. Source changes use small byte-budgeted batches; explicit 413 responses reduce multi-file batches. An individual rejected file is named. Progress is saved before and after writes; retry checks the branch and exact contents of an unconfirmed commit, refuses unrelated edits and reuses a previously created merge request. The Send button now permits retry after failure. Close the helper, replace its files with the new helper ZIP in the same folder, **keep `jobs`**, restart, Continue an earlier upload, sign in in the helper browser, Check source changes, then Retry / resume. Older attempted branches are not overwritten. No new media upload or export is required. Install the server package to serve the new helper download. Tests: upload-helper `npm test`, `scripts/test-helper-gitlab-browser.mjs`, and `scripts/test-helper-closure.mjs`. Production upload remains subject to the actual GitLab response.

**Chrome-first image downloads and local-image AI guidance:** External downloads now start with Chrome headers. An HTTP 403 triggers at most two further attempts, using Firefox and then Studio, with short backoff and one shared two-minute deadline. The export dialog shows retry progress. Redirect/address checks remain active on every request, and no browser cookies or Studio credentials are sent. Authentication errors and rate-limit responses are not retried. MCP Standard/Developer instructions and the built-in assistant now tell agents to upload original images to Studio before inserting them, instead of hotlinking third-party images. Video Universe embeds stay supported. Save drafts, install the package, refresh Studio, reconnect AI/MCP and prepare a fresh export. Tests: `test-export-remote-assets.mjs`, `test-codex-worker.mjs`, and `test-mcp.mjs` in `scripts/`.

**External static files are included locally:** Export preparation now downloads public external images, PDFs and other supported static assets into ZIP 02 instead of leaving empty manifest rows for the upload helper. Literal image URLs in Custom HTML, photo arrays and page CSS are collected too. Downloads stream sequentially to disk, use the returned media type for filenames, and pass through existing image validation/compression and PDF splitting. Failed downloads stop preparation with page/layer details; private addresses, credentials in URLs and unsafe redirects are rejected. Google Fonts retain their licence workflow; Video Universe players stay embedded and direct recordings remain TODOs. Save drafts, install this package, refresh Studio and prepare fresh ZIPs. Older ZIPs are unchanged. Test: `npm run build` then `node scripts/test-export-remote-assets.mjs`.

**Design sidebar overlapping Preview:** The hidden Design workspace now suppresses its entire painted subtree, so an animated sidebar or a widget with its own visibility rules cannot float above Preview. Design stays mounted and inert while Preview is open; returning preserves scroll, zoom and widget state. Preview retains its own working page index. Save drafts, install this server package and refresh Studio tabs. No page edits or re-export are needed. Regression: `node scripts/test-page-index-browser.mjs` checks rendered pixels and navigation in both nested and flat Luca layouts.

**Invisible Education talk widgets in Design:** The Szymon Manka and Tom Ellis HTML frames loaded correctly, but their page CSS applied a scroll-driven entrance animation to the containing wrapper. In the editor this could remain at opacity zero. Design now shows the completed state of page-CSS scroll/view timeline animations, including responsive rules; Preview and export retain the original animation. Explicitly hidden/transparent elements and ordinary timed animations keep their behavior. Saved HTML, image files and CSS are unchanged. Save drafts, install this package and refresh Studio tabs. Regression: `node scripts/test-editor-scroll-reveal.mjs`.

**Faster Studio Preview:** After its first snapshot, Preview receives only changed content rows and deletions. Reopening an unchanged page preserves its mounted widgets; iframe reloads and project changes receive a fresh snapshot. Draft layout serialization is deferred until Preview is open. The hidden Design canvas keeps its lightweight editor images and pauses Custom HTML animations instead of reloading original photos in the background. Page metadata is reused and 3D support is loaded only when the current page needs it. Save drafts, install the package and refresh Studio tabs. Browser tests cover draft changes, deletions, reopening, viewport changes, reloads and page/project switching. A synthetic 36-page fixture sent 88 bytes on unchanged reopen versus a 2.9 MB initial snapshot; this measures message traffic, not total page load time.

**Blank image-rich Custom HTML in Design:** Fixed large Custom HTML blocks remaining blank in the editor while Preview/export work. Private editor image copies can make the iframe navigation URL several megabytes long, which Chromium silently refuses. Large documents now enter the same opaque sandbox through a small bootstrap and a one-use, frame-specific message; photo bytes no longer enlarge the navigation URL. Page scripts, CSP, nested video permissions, offscreen animation suspension and saved content are preserved. The shared loader covers Design, Preview and new exports. Save drafts, install this package and refresh Studio; no photo re-upload or page rewrite is required. Existing working exports do not need republishing. Regression: `node scripts/test-html-large-browser.mjs`.

**PDF reader floating over Preview:** Fixed the hidden Design canvas's PDF remaining visible above the separate Preview page. The reader now inherits ancestor visibility across its shadow-root style reset, while retaining its protection from page CSS. Repeated Preview/Design switches preserve its page and dimensions. Save drafts, install this server package and refresh Studio tabs. Existing PDF uploads and page content need no changes. Test: `node scripts/test-pdf-editor.mjs`.

**Media-library photos in Custom HTML and flip cards:** The loader now discovers literal uploaded UUID filenames in JavaScript data arrays, resolves the images through the signed-in parent and supplies them to dynamically created images, srcset and inline CSS backgrounds. Static export collects these files and maps the same runtime references to iGEM-hosted images. Private original-image reads use an authenticated same-origin byte response rather than a cross-origin redirect. The custom frame retains its opaque origin and blocked network-fetch policy. Missing-image messages include the HTTP status and offer Retry images; a failed widget does not mean the original photo is missing. MCP guidance explains supported references and tells agents to verify originals before requesting replacements. Save drafts, install the package, refresh editor tabs and reconnect MCP; prepare a fresh export to update published widgets. No image re-upload is needed for working originals. Tests: `scripts/test-html-card-images-browser.mjs` and `scripts/test-html-images.mjs`.

**Cleaner photos in small frames:** Uploaded JPEG Image elements now choose filtered 640px or 1600px display copies according to frame size, crop mode and screen pixel density. Editor, Preview and fresh exports share this selection; large Preview/published frames can use the original. Resampling avoids aggressive decoder shortcuts and saves the resized pixels as lossless WebP. Original source URLs and download links remain intact. Export includes both display copies in the static asset ZIP for the upload helper, not in the GitLab Pages archive. Repeated exports reuse identical bytes. PNG/WebP animation playback, SVGs, GIFs and external images retain their original behavior outside the editor. Custom HTML retains its authored published image behavior.

**High-resolution photos in the editor:** JPEG, PNG and WebP previews stay capped at 1600 pixels in the canvas and 160 pixels in Layers; small Image frames can use 640 pixels. Custom HTML uses capped previews while editing and resolves at most two uploaded images at once per block. Preview generation uses isolated native processes, one at a time, with a 30-second timeout, existing input-pixel safeguards and a disposable 128 MiB disk cache. Failed editor previews do not automatically load the large original. Install the complete server package and refresh saved editor tabs. Prepare a fresh export and upload its display copies to update the published wiki. Tests: `test-image-previews.mjs`, `test-image-preview-quality.mjs`, `test-image-previews-browser.mjs`, and `test-image-display-export.mjs` in `scripts/`.

**Offscreen Custom HTML:** Blocks and their uploaded images now start loading only within 300 pixels of the viewport. CSS, inline SVG (SMIL), Web Animations and requestAnimationFrame loops pause outside the visible area or when the browser tab is hidden, then resume without reloading the frame. Editor, Preview and fresh exports share the lifecycle. Image blocks use lazy loading with asynchronous decoding; newly inserted Custom HTML images get the same defaults. Existing image loading/decoding attributes are respected. Application timers, audio/video playback and third-party players are not forcibly stopped. Custom timer-driven effects can listen for `studio:visibility` and check `event.detail.visible`. Run `node scripts/test-html-visibility-browser.mjs` to verify React, inline export and shared-source export paths. Install this package, refresh editor tabs and prepare/publish a fresh export.

**Smoother exported-page scrolling:** The sticky page index now caches heading positions and uses binary search during scrolling instead of measuring and sorting every heading on every frame. Closed tooltips no longer cause attribute updates across the index. Resize, image/font loading, content changes and accordion toggles refresh the cache; editor coordinate handling is preserved. In a 200-heading fixture, 100 scroll steps dropped from 20,000 heading measurements and 21,400 tooltip attribute removals to zero of either during steady scrolling. This measures index work, not an overall frame-rate guarantee for arbitrary custom animations. Install this package and prepare/publish a fresh export; existing deployed files do not change automatically.

**Website loading animation:** In the editor, open **Pages → Loading animation**. Enable it, select a preset or custom CSS animation, upload a logo/animated image, and set the message, colours and timing. **Once per session** is the default frequency (one browser tab, across page navigation and reloads); **First visit only** remembers the browser, while **Every page visit** replays on navigation. The feature is disabled for existing projects until enabled. **Preview animation** replays unsaved settings without using up a visitor session. **Save animation** applies project-wide; Cancel discards changes. Save drafts before installing and refresh editor tabs afterwards. Prepare a fresh export to include it in the published wiki. Animation images are collected with the other static media.

The screen dismisses when the initial page is ready and the minimum display time has elapsed, with an independent maximum wait (up to ten seconds). Visitors can always skip or press Escape. Reduced-motion preferences bypass it. Custom CSS runs inside an isolated frame and can target `.loader-content`, `.loader-mark`, `.loader-symbol` and `.loader-label`, with custom `@keyframes`. Use the image field for assets; CSS resource URLs/imports are not supported. No scripts or extra dependencies are required on the website.

**Editor performance:** Layer-tree traversal and template ordering now use indexed lookups; selection-only updates reuse the layer rows and saved-state comparison. Drag hit testing reads each target rectangle once. Concurrent content refreshes coalesce into one active request and a catch-up request, while hidden-tab polling/presence pauses and resumes on return. Save, Undo, conflict checks and the live revision channel are unchanged. Install the server archive, save drafts, then refresh editor tabs. Run `node scripts/test-studio-performance.mjs` for ordering/concurrency regression checks and synthetic layer-tree measurements; these measure tree construction, not total editor latency.

**Upload helper 1.0.23 and repeatable PDF partitions:** Fixes both "Invalid upload folder" and "Unsupported static-media folder" for `assets/runtime/`. Manifest validation and browser folder navigation now share one allowlist. Close the running helper, replace its files with the updated helper ZIP in the same folder, preserve `jobs`, then restart and continue the upload. Existing export ZIPs can be reused for the folder fix.

Install this server package to fix repeated PDF uploads. Previously, each partition acquired fresh PDF creation/modification timestamps, changing its content hash on every export. Partitions now omit generated metadata, so unchanged PDF bytes with the same splitter settings produce identical files and the helper can reuse existing hosted hashes. Prepare a fresh export after installing. Parts made by the old splitter may need one upload after this change; subsequent unchanged exports reuse the new parts. Existing hosted files are not deleted.

**Smaller Pages archive:** Fresh exports include the pinned PDF.js worker as a JavaScript file in `02-static-assets.zip` under `assets/runtime/`. Upload it with the new helper like the images. Before creating the GitLab review, the helper checks JavaScript MIME type, CORS and exact bytes. The compiler uses its returned URL and excludes that worker from the Pages archive. Existing source without its mapping keeps the local worker. Shared template CSS and custom HTML CSS/scripts are now stored once; custom frames are reconstructed as the same opaque data documents. Legacy page aliases redirect to canonical pages, preserving query/hash. The unused PDF scripting-engine WASM is omitted; all reader decoding, CMaps, standard fonts and colour resources remain.

The CI template enforces a configurable 4,800,000-byte compressed archive estimate as a conservative budget. This is not a verified iGEM server limit; the runner archive can differ. Install the package, download the new helper, and Prepare fresh source/assets ZIPs. Existing image uploads can be reused. A VPS update alone does not change GitLab source.

**GitLab artifact uploads (HTTP 413):** New exports and the upload helper now explicitly compress the Pages archive and print artifact size diagnostics. This is a mitigation, not a guarantee: iGEM controls its GitLab/proxy upload limit. Updating this VPS alone does not alter committed `.gitlab-ci.yml`. For an existing successful build, apply the CI compression variables directly in GitLab and run a new pipeline; a full media re-upload is unnecessary. If 413 persists, send iGEM support the job/correlation IDs and size output. See STATIC-EXPORT.md.

**Image processing for a 1 GB VPS:** The server now uses bundled sharp/libvips in a separate process with a 64 MiB JavaScript heap, one native processing thread, and no operation cache. It reads through the final scanline without retaining full-size JavaScript pixel arrays, checks PNG chunk CRCs, and releases the native process after every image. Successful unchanged-file checks remain cached by content. Healthy under-limit files retain their original bytes. Converted export copies keep PNG transparency, apply JPEG orientation and have a maximum 4096-pixel edge.

The existing 448 MiB service memory limit is unchanged. Baseline JPEGs and PNGs keep the 40 megapixel limit; progressive JPEGs above 24 megapixels stop before allocating full-image coefficient buffers and ask for a baseline JPEG or smaller export copy. Decoder memory is still additional to the 64 MiB JS heap. The package includes pinned Linux x64/ARM64 native binaries and licences; installation checks the decoder before stopping the service. Install the complete package, save drafts and refresh the editor, then Prepare again. No RAM-limit increase or server-side npm install is needed.

**Faster image preparation:** Exports reuse a lightweight media worker and serialize heavy decoding to keep the server responsive. Successful checks of unchanged images are cached by their exact file contents for up to 30 days, including across server restarts. Changed files are checked again; failed checks and converted images are not cached. Connection timeouts now explain how to reconnect to the same background job with Prepare. Install this package and refresh the editor after saving drafts. The first export still needs to validate each new image.


Google Fonts in exports: Prepare now downloads referenced Google Fonts and their original licence notices automatically. The font files join the static asset ZIP, and the updated upload helper maps them to iGEM URLs. Publication rewrites stylesheet links and CSS imports, including custom HTML frames, from a frozen manifest without fetching Google during CI. Download the new helper and prepare fresh ZIPs after this server update. Unavailable fonts or licence downloads produce a page/layer error. Recording TODOs remain visible in the export panel and build log.

# Update the existing Ubuntu server

**Image integrity before upload:** Export preparation now decodes local JPEG and PNG files even when they are below 10 MB. Truncated JPEG scans/end markers and invalid PNG data/checksums stop preparation with the affected file and page/layer in the existing media-error panel. Re-export the original in an image editor and upload a fresh copy, then prepare again. Valid images below the limit keep their original bytes. This checks locally packaged files; existing remote iGEM URLs and other image formats do not receive this decoding check.

**Clipped D / Interact label beside logos:** Custom HTML interaction controls now live in the editor canvas toolbar, outside page content. Select the HTML layer and choose Interact with HTML; Done interacting returns to selection/resize mode. Switching selection exits interaction mode. Small logos no longer clip editor buttons into stray letters. Refresh editor tabs after installing; saved logo code and published content are unchanged.

**Editor usability update:** Selecting an image no longer changes its stacking order. Selection outlines stay above the canvas without raising the artwork. Zoom retains the selected element, and Fit selection frames it. Collapse either side panel using the toolbar controls; the formatting toolbar is compact and movable, with AI tools behind a button. Layers now has search, type filters and a clickable selection breadcrumb. Text can be edited on the canvas or in an expandable dialog. Preview opens at the selected/current section and distinguishes saved content from unsaved edits. Save drafts before installing and refresh all editor tabs afterwards.

**Text width conflict reproduced on the live Education page:** The width was saving correctly, but a more specific page CSS rule capped text at `78ch !important`. Manual selection controls now compile into a priority CSS layer so their saved values override authored styles, matching the inline drag preview. This applies to editor, Preview and export, including existing saved adjustments and standard MCP styling. Authored CSS stays intact; untouched elements retain their styles. Save drafts before installing, refresh editor tabs afterwards, and re-export to update published pages.

**Resize gesture reliability:** Canvas revisions refresh selection measurements without cancelling an active resize. Pointer release is tracked outside the resize handle, and handles stay available when text reflow moves their midpoint out of view. The final width is saved once; Escape still cancels. Verified with a simultaneous remote layout change, save/reload, and Undo/Redo.

**Image selection, resizing and overlap:** Selecting an image from Layers or the canvas now targets the picture itself. Its outline and resize handles follow its saved movement; side and corner handles resize it proportionally. Right-click the picture (or its Layers row) for Bring to front / Send to back. Layer order also appears in Layout. Add images uploads several independent image layers inside a text block or section, keeping existing writing and images; Replace this file replaces only the selected file. Standard MCP can insert image children into text, read exact image selectors and update zIndex. Save drafts before installing, refresh the editor and reconnect MCP. Re-export to update published rendering.

**Text box resizing:** Select a paragraph or heading and drag its own left/right edge handles. Text reflows live without changing font size or the containing section’s columns. Undo/Redo, layer locks and responsive scopes are preserved; Preview and export use the saved width. Refresh editor tabs after saving drafts and installing this package. Standard MCP `style_element` also supports exact text widths.

**Custom HTML positioning:** HTML frames no longer swallow editor drag gestures. Select and drag the whole block, nudge with arrow keys, or set Layout → Horizontal / Vertical offset; reset returns to its original layout position. Choose Interact to use embedded controls. Standard MCP `move_section` now accepts pixel `offset: {x, y}` and responsive `scope`, preserving code, sibling order and parent layout. Using free-placement coordinates on flow elements now explains the correct tool instead of silently doing nothing. Save drafts, install, refresh the editor and reconnect MCP.

**Links inside Custom HTML:** Clicked links now navigate the surrounding website through a validated link handler, while the custom frame remains isolated. Links to an ID inside the block scroll locally; other page anchors navigate the wiki. New-tab links preserve that behavior. Studio shows a reminder to use Preview so clicks cannot discard editor work. Export maps internal wiki routes to the team base path. Install, refresh editor tabs and re-export/redeploy to update published pages.

**Editor / Preview layout parity:** Fixed an editor-only 12-column override that pushed articles below their sidebar and ignored saved grid placement. Browser-width mobile rules no longer leak into wider editor artboards; the editor responsive stylesheet is generated from the same rules as Preview, with matching specificity. Nonempty blocks no longer acquire an editor-only minimum height. Save drafts and refresh editor tabs after installing. Existing saved page layouts and custom CSS are preserved.

**Header alignment in exports:** Native site headers now carry a stable `data-site-header` marker and span the sidebar and article columns. Existing saved CSS that identifies these headers by `padding-inline: 3px` is translated when rendering, so whitespace changes during export no longer break alignment. This also works for projects switched to Luca from another template. Save drafts and refresh editor tabs after installing. Re-export and deploy your wiki to update already-published pages.

**Images inside custom HTML:** In a Custom HTML block, use Upload & insert image to upload to media storage and insert a short image tag at the HTML cursor. The URL can be copied for use in CSS or other blocks. Image bytes stay outside component code, and export automatically collects these image references. Standard MCP can use the existing media upload tools and then insert the returned URL with `replace_section_text` or `update_section`; no separate image section is needed. Refresh editor tabs and reconnect MCP after installing.

**Resize, duplicate pages and shapes:** Selected elements now have working width, height and corner resize handles. Desktop/tablet/mobile sizing follows the selected editor canvas even in a narrow browser, and nested elements resize relative to their containing frame. In Pages, use the copy button to duplicate a page with its saved content, images, layout and custom CSS; edits to the copy are independent. Insert → Shape adds a rectangle, ellipse, triangle, diamond, line or arrow with editable fill, border and dimensions. Standard MCP links can use `duplicate_page`, add shapes with `add_section`, and resize with `update_section` (`span`, responsive spans, `minHeight`, and free-frame `x`, `y`, `freeWidth`, `freeHeight`). Layer locks and page scope still apply. Refresh the editor and reconnect MCP after installing.

**Videos in custom HTML:** HTML blocks now support iGEM Video Universe, YouTube and Vimeo iframe players and preserve their query settings. Normal Embed blocks also retain settings such as `title=0`, `warningTitle=0`, start time, loop and mute. Custom HTML runs in an isolated data document so nested players load correctly without giving custom code access to the editor. Fullscreen, autoplay and picture-in-picture permissions are delegated; include the matching `allow` attribute on your inner iframe. Browser autoplay and provider policies still apply. The export compiler accepts configured iGEM embed URLs and keeps settings and mapped assets. Install this release, refresh saved editor tabs and re-export/redeploy the published wiki. Existing saved URLs do not need to be re-entered.

**Reliable custom component uploads (128 KiB):** Reconnect MCP after installing to discover `get_section_code`, `get_section_code_upload_url` and `replace_section_text`. Read the component field/version/hash, review the production artifact for temporary tests, debug output and unnecessary placeholders, then upload the actual UTF-8 file bytes to the returned scoped URL. Maximum **131072 bytes per uploaded field**, including HTML, CSS or JavaScript. The agent must confirm its own review with `reviewedForUpload: true`; this is an agent checklist, not a new user approval gate. Required content, runtime code, licences and useful repository tests must be preserved. Small exact-match patches avoid resending unchanged encoded data. Uploads verify SHA-256, UTF-8, byte size, link/page permissions, locked layers and concurrent edits before saving. URLs expire after ten minutes or a server restart; identical retries return the original receipt. These tools edit existing sandboxed page components; they do not grant Developer source access or require local proxies. Full preview verification is still required. Layout JSON capacity is now 1,048,576 characters across save/import/export to accommodate larger components; MCP JSON requests allow 4 MiB including transport escaping. Page custom CSS remains outside the layout size cap. Existing saved code is not truncated. Apply the Nginx configuration update in step 2 as well to allow the larger JSON transport; the direct 128 KiB upload itself also fits the old 1 MiB proxy cap.

**Collapsible subsection elements:** Subsection titles and numbering now align consistently in Layers. Use the + beside a subsection, or Add image or element in its inspector, to insert images, text, PDFs, equations, videos or other elements inside it. The main Insert element menu also targets a selected subsection. Nested elements appear beneath the correct subsection, remain attached when subsections reorder, and render there in editor, preview and export. Removing a subsection removes its children together and supports Undo; locked children prevent removal. Existing titles, text and open-on-load settings are preserved. MCP add_section now accepts inside (accordion layer ID) plus insideItem (subsection item ID from get_page). Install this release, save drafts and refresh editor tabs; reconnect MCP to discover the new parameter.

**Export media diagnostics:** Export now checks all collected local media references before conversion and reports invalid or missing files together. The dialog shows each exact URL, page, layer name/ID and field, with Open page links and a downloadable error report. Fix the saved references and retry. Install this release and refresh the editor to enable both the server diagnostics and the updated dialog; existing page content is unchanged.

**Layers and collapsible editing:** After updating, refresh the editor. Selecting a canvas element automatically opens its ancestor groups and scrolls only the Layers list to its row. Expand/collapse-all controls help manage long pages. Collapsible elements now show their subsections as nested rows: click one to edit its title and text, or use Add subsection in Layers, the inspector, or Add subsection inside in the context menu. These actions update the existing collapsible, preserve its other items, support Undo and respect locked layers.

**Element insertion fix:** Install this release, then refresh open editor tabs after saving drafts. Adding content now preserves its parent's layout mode and every existing node's settings. Manual insertion and MCP share placement/order rules: flow sections stay in flow, selected-sibling insertion respects the content column, and free-positioned inserts go below occupied bounds rather than overlapping at 24-pixel offsets. The editor uses rendered heights when available; MCP uses saved dimensions, so agents should still verify the full page. AI proposals that switch a container to free positioning without placing its children are rejected before application. Previously saved overlapping layouts are not automatically rearranged; restore a known-good revision or undo the original insertion before continuing.

**Full-page MCP preview:** Reconnect your MCP client after updating. Startup instructions, the site overview and `get_preview_url` now tell agents to inspect the complete page, not only the first viewport. The preview response includes a checklist: scroll in overlapping steps to the real bottom, wait for lazy-loaded content, check inner scrolling areas separately, inspect desktop and mobile, and use full-page or overlapping screenshots. Agents must report partial coverage or unavailable browser access honestly. Reduced-motion captures do not substitute for testing animation/scroll fixes with normal motion. This is inspection guidance; the MCP server cannot take screenshots or prove an external agent followed it.

**Developer file locks:** Reconnect MCP after installing to discover `get_source_status`, `acquire_source_lock`, `renew_source_lock` and `release_source_lock`. Before editing source: acquire the file, read its latest contents, then pass `lockToken`, `ifVersion` and `ifBaseHash` to write/replace/restore. Locks default to 5 minutes; callers may request 30–900 seconds, capped at the connection’s expiry. Renew explicitly before expiry while working and release when done. Expired locks become available automatically; revoking a developer link releases its reservations. An expired or replaced token cannot save or release another reservation. Version checks remain mandatory and are checked inside the database transaction.

`get_source_status` shows reservations across the project, owners, expiry and latest saved revisions. `list_source_files` and `read_source_file` also show each file’s lock. The label identifies the declared task/agent; the connection name and approver identify its authorization. Use a separate named link for each developer. Status is fetched on request, not pushed, and a reservation does not prove someone is currently typing. Independent files can be edited concurrently; there is no multi-file transaction or automatic merge.

**Direct MCP only:** The server’s agent instructions and overview explicitly prohibit setting up local proxies, tunnels, relays or localhost bridges. Use the configured connector and built-in upload/source tools. If a client cannot connect, it should report the limitation and ask for direct connector configuration. These instructions cannot technically control software running on an external agent’s computer.

**MCP Developer mode:** In **Connect an AI → New link**, choose **Developer**, review the permissions, then **Confirm & create developer link**. Standard links retain their existing permissions. Developer links can read the website source and edit project-specific templates/components, with conflict checks and 20 previous revisions per file. They cannot change Studio controls, build scripts, dependencies, server files or credentials. Links expire and can be revoked from the same dialog.

Source edits are included in the next website-source ZIP and take effect when you build and deploy it. **The Studio canvas and its Preview still use the installed release.** The export dialog lists included source changes. Use `list_source_files`, `read_source_file`, `write_source_file` or `replace_source_text`; edits require `ifVersion` and `ifBaseHash` from the read. `get_source_history` lists revisions; `restore_source_file` with `targetVersion: 0` restores the installed version. New components belong under `app/project-components/` or `components/project/`. Reconnect with the newly confirmed developer link to discover these tools; an existing standard link cannot promote itself. Source overrides and history are stored in the project database and included in the normal server backup. After a server update, exports stop on conflicting source overrides until they are reconciled or restored.

**Page index after changing templates:** Blank projects restyled with Luca now receive the same collapsible section index in the editor, preview and export. Changing appearance keeps the original content structure; seeing `contentTemplate: Blank` does not mean Luca was not applied. MCP reports the selected design under `projectTemplate.appearance`. Read `get_page` and call `set_page_sidebar` with `page`, boolean `enabled` and its `ifVersion` to toggle the index. Existing content, images and custom CSS are preserved. After installing this update, refresh the editor and reconnect your AI link so it discovers the new tool.

The index aligns with the article on pages created in Blank. Editor zoom and panel resizing now recalculate its position immediately, so it stays inside the canvas instead of jumping to an old offset.

**Editor sidebar scroll fix:** In browsers supporting CSS scroll timelines (including current Chrome and Edge), sidebar pinning now runs with the browser's scrolling rather than updating a translation after each scroll event. It stays smooth inside the scaled editor canvas. Selection highlights no longer rebuild the index. Preview and published pages keep their native sticky behavior; older browsers retain the existing positioning fallback.

## Server update: start here

> [!IMPORTANT]
> **Updating GitHub does not deploy the running server.** Follow both steps below. Save open editor drafts before updating, then refresh every editor tab afterwards.

> [!WARNING]
> **Back up before installing.** Do not import a starter or migration snapshot during an ordinary update. The private backup contains credentials and drafts; keep it outside the website directory.

### 1. Back up and install the application

Upload the new `prion-server-ubuntu.tar.gz` to your home directory. Run the following in Bash on the server. It makes a private backup while the service is stopped and restarts the service if an intermediate command fails.

```sh
set -e
prion_release_dir=$(mktemp -d "$HOME/prion-update.XXXXXX")
tar -xzf "$HOME/prion-server-ubuntu.tar.gz" -C "$prion_release_dir"
prion_backup_dir="/root/prion-backup-$(date +%Y%m%d-%H%M%S)"
sudo install -d -m 700 "$prion_backup_dir"
trap 'sudo systemctl start prion' EXIT
sudo systemctl stop prion
sudo tar -czf "$prion_backup_dir/prion.tar.gz" -C / opt/prion etc/prion.env var/lib/prion
sudo bash "$prion_release_dir/prion-server/ops/install-ubuntu.sh"
trap - EXIT
sudo systemctl status prion --no-pager
```

### 2. Update and reload Nginx

> [!IMPORTANT]
> Installing the application does not update Nginx. Complete this separate step for the preview and PDF fixes, media upload changes, and longer AI requests. If you customised Nginx, merge the changes as described below.

Update the Nginx configuration installed by our HTTPS setup. This enables the same-site preview route, removes the old media size cap, and permits longer Codex requests. If you customised this file, merge the equivalent changes from `/opt/prion/ops/nginx-prion.conf` instead of replacing your customisations.

```sh
sudo cp -a /etc/nginx/conf.d/prion.conf /etc/nginx/conf.d/prion.conf.before-project-preview
sudo install -m 644 /opt/prion/ops/nginx-prion.conf /etc/nginx/conf.d/prion.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Refresh and check

Refresh every editor tab and check your existing pages and Preview. If the service fails, inspect `sudo journalctl -u prion -n 60 --no-pager`.

## Release notes

## Change a project's template style, preview and roll back

In **All projects & templates**, choose **Change template** beside the project. Save open editor drafts first. Pick a template and press **Preview template**. Review any saved page at desktop, tablet or mobile widths, then press **Apply previewed template**. Close the dialog to cancel without changing the project. Return to Change template and use **Roll back to …** to restore the previous style.

This is a content-preserving style change: all existing pages (including custom/deleted-page settings), text, media, logos, links, layouts and custom CSS remain unchanged. It does not replace your layout with the target template's sample layout or add sample pages. Existing custom CSS may override the new style. The original content template remains the structural source; the selected appearance is applied consistently in the editor, preview and export. Blank canvas is not offered as a replacement style because it would imply removing the existing structure.

Applying requires a fresh preview owned by the signed-in user. Any saved project changes after preview require another preview. Apply and rollback are transactional; rollback history survives restarts and restores only styling, keeping content edits made after the switch. Previews never create projects or change the shared default project. No Nginx change is needed for this feature if `/studio-preview` already works. Re-export after a style change to update a published static wiki.

## PDF preview fix

PDF dragging now moves the entire layer, including its selection box. Older editor-generated translations on the PDF container are applied to the layer when rendering, preserving the chosen offset in the editor, preview and export. Manually authored positioning CSS is not rewritten. No database migration is performed.

PDFs follow their editor layer dimensions in the editor, preview and export. Drag the corner handle to change width and height, or use Height (px) in the inspector. Free-placement PDFs use their existing width/height controls. The viewer shares the selected box with its caption and original-file link; mobile styles no longer force a different height. Unsized PDFs start at 600px and can be resized. This correction only requires the application update; retain the Nginx PDF framing fix described below.

PDF embeds now use the browser's native viewer without the iframe sandbox that blocked Chrome. The original PDF link remains available. Uploaded PDF routes allow same-site framing in Nginx; other editor routes remain protected. Install the application package **and apply/reload the supplied Nginx configuration using the update steps below**, then refresh the browser. Previously exported sites must be exported again to receive the corrected PDF embed. External hosts can still prohibit embedding their own PDFs; use the original link or upload the PDF to the project's media storage in that case.

## CSS size limits removed

Custom CSS no longer has a 20,000-character or 1,000-rule/declaration cap. Large stylesheets are accepted by the editor, server, AI CSS validation, snapshot import and static export. CSS is excluded from the separate layout structure size check. CSS syntax and page-scoping validation remain enabled. The general 1 MiB HTTP request limit still applies to requests as a whole.

## New template: Notebook White

The template picker now includes **reGELerate · Notebook White**: 20 editable notebook pages with a pure white (#FFFFFF) background, charcoal typography, monochrome controls, original Notebook illustration colours, and the purple transparent reGELerate logo. Scientific reporter colours are preserved. It includes the notebook interactions, section navigator and export fonts. Select it to create a new project; installing the update does not create projects automatically or change existing projects' themes.

## Saved-layout protection and update diagnosis

Deleting the open page now returns to the existing Home page before the deleted canvas is rendered. This also applies when a teammate or AI deletes it. The page controller handles navigation independently of the canvas, so deletion no longer gets stuck behind “Page layout was not received.” Existing pages with missing/invalid layouts still stop editing; no client fallback has been restored.

Layout defaults now come only from the server, and only when no saved row exists. The browser no longer creates an empty layout when a row is absent or injects default content at startup. Missing or invalid layouts stop that canvas from editing or autosaving; invalid saved JSON remains available for recovery. Both the self-hosted server and the alternative server-rendered routes supply missing-row defaults. A database read failure never substitutes a new page. Preview uses the same protection. No saved content is rewritten by this change.

Close editor tabs on all devices before updating, and reopen them after installation. An already open tab continues running its previous editor code until reloaded, even after the server restarts.

The current client stops editing when a saved layout fails validation. It offers the unchanged saved JSON for recovery instead of substituting an editable empty layout. This prevents a subsequent save from replacing rejected content and propagating empty header/footer styling to other pages. It does not recover content that was already overwritten.

The server also rejects layout saves and page-assistant requests from older editor tabs, with a message to reload. The 100-section cap remains removed. Before changing or deleting a saved page layout, SQLite now atomically preserves its previous value, version and author in `layout_history`, retaining the latest 20 previous revisions per project/page. This covers browser, AI and shared header/footer changes. History starts with this update and does not replace full server backups; it cannot recreate edits lost before installation.

If content disappeared after an update, preserve the existing backup and compare it with the live database before restoring. The standalone `ops/diagnose-layout-loss.mjs` can run without installing or restarting the server:

```sh
sudo /usr/local/bin/node /tmp/diagnose-layout-loss.mjs /root/prion-backup-YYYYMMDD-HHMMSS/prion.tar.gz
```

Upload that diagnostic file to `/tmp` first and substitute your actual backup path. It opens the live SQLite database read-only, extracts only SQLite files from the backup into a private temporary directory, and prints counts, hashes, versions and last writers. It does not print saved page text or environment secrets. It never restores or rewrites live content.

### Recovery for the confirmed 5 October layout reset

`ops/recover-notebook-layouts.mjs` is specific to the 24 layouts in project `778d6038-19b8-4175-b255-9c3ba692f512` from the supplied diagnostic. It restores Results' 97 saved layers and the other affected layouts' shared styling from the server backup. It verifies exact backup and current hashes/versions, refuses changed pages, advances versions, and updates only these layouts in one SQLite transaction. Text fields, uploaded media and other projects are untouched. It saves a complete pre-recovery database beside the live database in a private `layout-recovery-*` directory. Recovery is limited to the backup state; edits between the backup and the reset cannot be reconstructed from that backup.

Close all editor tabs on all devices and install this fixed release first. Upload the standalone recovery script to `/root/recover-notebook-layouts.mjs`. Preview without making changes:

```sh
node /root/recover-notebook-layouts.mjs /root/prion-backup-20261005-210255/prion.tar.gz
```

If it reports that the checks passed, restore while the service is stopped:

```sh
systemctl stop prion
node /root/recover-notebook-layouts.mjs /root/prion-backup-20261005-210255/prion.tar.gz --apply
systemctl start prion
```

The last command starts the service even if recovery reports an error; a failed recovery transaction changes no layouts. Reopen the editor only after the fixed release is installed. The script prints the safety-backup path and restored page counts. If it reports changed pages, rerun the read-only diagnostic instead of forcing a restore. Repeating recovery when all target layouts already match the backup makes no changes.

## Standard iGEM URLs

Install the full archive and refresh the editor. In **Export wiki → Award pages**, select the awards the team is entering. Missing medal or selected award pages now stop preparation and list the exact paths to add in Pages. The choices are saved in `publication/config.json`, so the GitLab build checks them again. ZIP 01 includes `publication/url-check.json`. These checks verify page existence; the team must still review the content.

Existing Safety content publishes at `/TEAM/safety-and-security/`. Internal links use that standard path, while `/TEAM/safety/` remains available for old bookmarks. Saved editor content and IDs are preserved. If a separate `safety-and-security` page already exists, it takes precedence and Safety stays separate. No empty award pages are generated. Re-export ZIP 01 after installing this update; previously downloaded ZIPs retain their old compiler.

## Previous update: editable sponsor logos and matching preview

Sponsor logos are now individual image layers, with names and thumbnails in the Layers sidebar. This works on Home and Sponsors in Notebook, Notebook Purple and Swiss Biotech. Expand the supporting/sponsors section to replace a logo, edit its website link, hide/delete it or duplicate it. Existing template images are preserved and gain controls without re-importing the project.

To add a sponsor, select the sponsors section (or one of its logos), choose **Insert element → In section → Image**, and upload the logo. Added images join the original responsive sponsor grid in the editor, Preview and exported wiki. Images previously added as free-positioned children of this section also join the grid, retaining their source. Drag business-logo rows in Layers to reorder; use Preview's tablet/mobile controls to check wrapping. Original template links and markup remain in place, and deleted template logos remain hidden after reopening. Explicit custom CSS can still override layout styles and should be reviewed if it deliberately repositions logos.

Install the full archive using the steps below and refresh the browser. Do not re-import a snapshot or create a replacement project. This update preserves the three-ZIP export workflow.

## Earlier update: three-ZIP export in the editor

Install the full prebuilt archive using the update steps below, then refresh the editor. **Export wiki → Prepare three ZIPs** now packages the selected project's saved pages as website source, images/files, and video/audio. The compact dialog shows each destination, file counts and download sizes. An empty recording bundle is explicitly labelled.

Exports use a single saved snapshot. Download links belong to the signed-in user and selected project, expire after 30 minutes, and are invalidated by a service restart. Prepare again for newer edits. Missing or changed local media is reported instead of silently omitting it. Files stream from disk as ZIP64 with no 150 MiB media cap; two downloads can run at once. No Python, npm install or build runs on the production server. The release includes the allowlisted publication source used by ZIP 01.

This adds downloads to the editor; it does not upload or publish to iGEM. Extract the ZIPs, upload media, fill the source's URL map and complete the team reviews. Keep the official GitLab repository LICENSE. Existing authentication, data, media, projects and AI settings are preserved. No new Nginx change is required if the previous proxy update is already installed.

## Earlier update: iGEM builds from source

The publication workflow now follows the supplied 2026 rules: do not commit compiled wiki output. Use the updated source kit and STATIC-EXPORT.md to configure a GitLab job that runs `npm ci` and `scripts/build-igem.mjs` on every main push. Audio, like video, must use Video Universe embeds. The compiler checks external HTML/CSS dependencies and supports replacing Google Fonts with iGEM-hosted font CSS. The team still reviews source privacy, licensing, inline credits, AI disclosure and scientific content; these are not checkbox gates or automated certification. New exports include a CC BY 4.0 root LICENSE for original team wiki work; third-party licences remain separate.

These changes affect the local/CI publication tools. Updating only the editor server does not publish an iGEM wiki or complete media uploads and team reviews. The server archive includes the corrected guide; the build scripts are in the source kit.

## Earlier update: transparent Notebook Purple logo

The header, homepage stamp and template card now use an alpha-transparent PNG instead of the white-backed JPEG. Install the full archive and refresh. Original logo assets are retained for compatibility; user-uploaded logos are not replaced.

## Previous update: Notebook Purple template

The workspace now includes **reGELerate · Notebook Purple**, a separate 20-page variant of Notebook with the supplied purple logo, plum text, lavender paper cards, hand-drawn icons, expandable notes and a Human Practices listening timeline. The Model page includes a keyboard-accessible conceptual network slider. Interview dates, participants and results remain editable prompts; no completed interviews or experimental outcomes are invented. Scientific reporter colours remain unchanged.

After installing the full server archive, refresh and choose **Notebook Purple** in the template library to create a project. Installing does not create projects, change existing projects or replace the shared default. All text is editable in Studio. The native disclosures and small network controller also work in static exports; final iGEM publication still requires your real content and asset mapping to iGEM hosting.

## Previous update: header menu in Pages, AI context, simpler Connect AI

**Header menu in Pages.** The Pages panel now shows the header menu itself: Home, each menu group in header order, and **Not in menu** for pages the header does not link (including new pages). Drag pages to reorder or move them between groups, or right-click a page for **Move to menu group**, **Move up/down** and **Remove from menu**. **Add menu group** creates a group; double-click (or select and press Enter) a group name to rename it; right-click a group to move or delete it (its pages stay, out of the menu). Changes apply at once to the header on every page, in Preview and in the static iGEM export. Until you change anything, the template's own menu is used unchanged. Empty groups are hidden in the header.

**AI assistants get context up front.** When an AI connects it is told to start with the new `get_site_overview` tool, which returns the project, the header menu, and every page's iGEM purpose and whether it still has untouched template text. `get_page` includes the page's purpose. New tools `move_page_in_menu` and `set_menu` edit the header menu; `create_page` accepts a menu group. Clients that support MCP prompts also get **improve_page**, **write_from_notes** and **review_wiki**. The AI is instructed not to invent data and to leave `[TODO]` notes instead.

**Read the project's current template through MCP.** `get_project_template` is read-only and reports the selected appearance (ID, name and version), the original content template, and whether they differ. This matters after Change template, which preserves the existing content. Pass `{"includeStyles":true}` to inspect the combined template CSS used by the renderer; use `get_page` for saved content and page CSS, and `get_preview_url` to see the current page. The project comes from the MCP link, including page-limited links; the tool cannot select another project or change templates. `get_site_overview.projectTemplate` includes the same metadata, while its existing `template` field remains the original content template for compatibility. Restart/update the server and reconnect the MCP client to refresh its tools.

**Read a page's styling in one call.** `get_page_styles({"page":"home"})` returns the deployed shared stylesheets, combined template/appearance CSS, and compiled page CSS in source order, plus the original editable `customCss`, layout version, section style settings and isolated HTML-block CSS. Use `{"page":"home","view":"editor"}` for canvas media-query/unit transformations, or `"includeShared":false` to omit the large shared bundle on subsequent reads. `get_page({"page":"home","includeStyles":true})` includes the same preview style information alongside the page content. These reads respect the MCP link's page scope and never change saved content or versions. The response is source CSS, not computed styles: specificity, `!important`, inline styles, iframe boundaries and viewport size still matter. Invalid saved CSS or unavailable shared styles produce explicit warnings. Use the preview to verify the visual result before and after styling.

**The AI sees each element before editing.** `get_page` now outlines every template section element by element: its role (heading level, paragraph, link, button, image…), its text, the text-field IDs to edit it, link targets and images, and the exact CSS selector the editor uses. The outline matches the rendered page, including your menu, rebuilt sidebars and team pages. Sections the team added list selectors for their heading and text. A new `style_element` tool restyles one element by selector (colour, font, size, alignment, spacing and similar) for all screens, tablet or mobile, in the same way as the editor's style toolbar, so the AI no longer has to rewrite the page CSS. Positions on screen still require `get_preview_url` and an AI with a browser.

**Select several things at once.** On the canvas, Shift-, Ctrl- or ⌘-click adds or removes individual elements (for example three headings in different sections); the quick-style dock then shows "N selected" and applies each change to all of them in one undo step, and Delete hides them all. In Layers, Ctrl/⌘-click toggles a layer and Shift-click selects a range. Drag on empty canvas space to draw a box that selects the sections fully inside it. Ctrl/⌘+A selects every section on the page and Esc clears the selection. The Design panel edits all selected layers together, as before; "Ask AI" with several elements selected asks the page Assistant about all of them.

**Fix: header and footer edits now apply to every page.** In template projects the header and footer appear on every page, but until now only their text was shared: layer settings (fill, spacing, visibility, link targets), elements placed inside them and styles applied to them were saved per page. Now any save that changes the header or footer (from Studio, the page Assistant or an AI link) copies them to every other page, and teammates' open editors update live. New and restored pages start with the current header and footer. CSS written in Advanced CSS is shared only when it targets the header or footer by the selectors Studio uses (`[data-layer-id="import-header-0"]…`); other page CSS stays per page. If pages already differ from before this update, right-click the header or footer layer and choose **Use this header & footer on every page**.

**New element: collapsible sections.** Insert → **Collapsible** adds FAQ-style sections. In Design → **Sections**, edit each section's title and text, choose which open when the page loads, reorder, delete or add sections (up to 30). Readers can open several sections at once; opening one never changes the page address or scrolls the page. They use the browser's own details/summary elements, so keyboards (Tab, Enter, Space) and screen readers work, and they work in the static iGEM export without JavaScript. Each section has a stable id, so a reader's open sections stay open when a teammate adds or reorders sections. In template projects they follow the template's own question-list style. AI links can create them with `add_section` kind `accordion` and `items`, and change them with `update_section` `items`; `get_page` lists selectors for each section's title and text.

**Who is editing, project-wide.** The top bar now shows everyone editing the project, whichever page they are on; people on other pages appear faded. Click a chip or **N editing** (a list with each person's page and selection) to jump to that page and scroll to their selection. Unsaved changes are resolved first as with any page switch.

**Connect AI: your links and the team's.** The dialog opens on **Your links**: each link you created has **Copy link** and setup steps (Claude, ChatGPT, Claude Code), so you can copy it again at any time. **New link** creates another. **Team** lists every active link in the project with its creator; other people's links cannot be copied, but anyone can revoke a link they do not trust. To allow copying again, each new link's key is stored encrypted (AES-256-GCM) with a server-only key file, `mcp-link.key` in the data directory (`/var/lib/prion`), created automatically; keep it with your backups and private. Links created before this update still work but cannot be copied again.

**Page sidebars and new-page layout follow the menu.** Each content page's left sidebar now lists the pages of its menu group (current page highlighted), and its heading eyebrow reads "GROUP / PAGE" unless the team edited that text. Moving a page between groups updates every sidebar at once. Pages the team creates now use the template's content-page layout: page heading, sidebar, a content column for their sections and the content-page footer. Pages created before this update are converted automatically the first time they are shown; their sections move into the content column and an opening title that repeated the page name is removed.

Install the complete archive. No Nginx or configuration change is needed beyond the previous update.

## Previous update: connect an AI, subsections and page deletion

**Connect AI (MCP link).** Studio's top bar has **Connect AI**. It creates a private link that an AI assistant (Claude, ChatGPT, Claude Code or any MCP client) adds as a remote MCP server. The AI can then list and read pages, edit template text, add/update/move/delete sections, set page CSS, and create or delete pages, all with the same validation as Studio. Its edits save immediately and appear live in open editors, where it shows as a peer named "<link name> (AI)". Links can cover the whole project or a single page, expire after 1, 7 or 30 days, and can be revoked at any time. Only a hash of each link's key is stored.

The link is served from your media hostname (`https://media-igem2026.gpupods.cloud/mcp?key=…`), because AI services cannot sign in through Cloudflare Access. **This release needs the Nginx update below** to add the `/mcp` route on that hostname. The key travels in the query string, which the Nginx access logs exclude. To serve links from a different hostname, set `MCP_ORIGIN=https://…` in `/etc/prion.env` and restart `prion`; that hostname must route `/mcp` to the app without Cloudflare Access (for example with an Access *Bypass* policy for that path).

**AI previews (screenshots).** The server does not take screenshots itself: a headless browser would need several hundred MB of memory on this 1 GB server. Instead, the MCP tool `get_preview_url` returns a private, read-only URL (`https://media-igem2026.gpupods.cloud/mcp/preview?page=…&key=…`) that renders the saved page exactly as visitors see it. An AI with a browser tool (Claude Code with Playwright or Chrome, ChatGPT agent mode, Claude in Chrome) opens it, takes its own screenshot and re-checks after each edit. AIs without a browser (for example a plain Claude.ai chat) can still edit but cannot see the page. The preview uses the same link key: page-limited links only receive that page's content, uploaded media is served through short-lived signed URLs, and revoking the link stops the preview. The updated Nginx configuration also serves the public site bundle (`/assets/`, `/templates/`) on the media hostname for this page.

**Cloudflare One / Access.** No change is needed. AI links use the media hostname, which must stay *DNS only* (grey cloud) and outside every Access application, exactly as in SELF-HOST.md. Do not add a Bypass policy for `/mcp` on the editor hostname unless you deliberately move links there with `MCP_ORIGIN`. Check with `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://media-igem2026.gpupods.cloud/mcp`: `401` means the route works and is waiting for a valid key; `404` means the Nginx update is missing; a Cloudflare login page means the hostname is proxied or covered by Access.

**Several AIs at once.** Each AI edit is applied in one uninterrupted read-check-save step and is version-checked, so parallel AIs and people cannot corrupt a page or crash the server. Section edits only change the properties sent, so they combine. The whole-value tools (`update_text`, `set_page_css`) accept `ifVersion` and refuse to overwrite a newer change. Sections locked in Studio cannot be edited by any AI.

**Right-click menus.** Right-click a layer in Layers for add section/subsection, hide, lock, duplicate and delete. Right-click empty space in Layers or on the canvas for **Add section** and, on pages your team created, **Delete this page…**. Right-click a page in Pages to open or delete it.

**Subsections.** Right-click any section for **Add section below** or **Add subsection below** (inside a frame: **Add subsection inside**). Subsections are H3 headings and are indented in Page settings → Page index. Design → Content → **Heading level** switches a text section between section and subsection.

**Delete pages.** In Pages, right-click a page or hover it and click the bin icon, then confirm. Any page except Home can be deleted. A page your team created is removed with its content. A template page is removed from this project only: its saved edits are discarded, it disappears from navigation, the template's menus, AI tools and the static export, and it can be brought back from **Pages → Deleted template pages → Restore** in its original template form. Links pointing to a deleted page are removed automatically, and editors who have it open are returned to Home. A new page cannot reuse a deleted template page's address.

Install the complete archive, then update Nginx as described under *Installation and existing preview configuration* (`sudo install -m 644 /opt/prion/ops/nginx-prion.conf /etc/nginx/conf.d/prion.conf`, then `sudo nginx -t` and `sudo systemctl reload nginx`). The AI-link table is created automatically.

## Previous update: live collaboration, page index and clearer Design panel

**Live collaboration.** Editors on the same page now see each other's selections as coloured, named outlines on the canvas, with matching markers in Layers and chips in the top bar. Layout edits save themselves about half a second after editing stops and reach teammates immediately; **Save now** forces a save. Changes to different properties merge automatically, and Undo reverts only your own edits. A new `/api/live` Server-Sent Events stream carries presence and save notifications. It is held in memory by the single Node process and sends a keep-alive every 20 seconds, so the existing Nginx settings (`proxy_buffering off`, 60 s read timeout) and Cloudflare work unchanged. If the stream is unavailable, the editor falls back to checking every 2.5 seconds.

**Add section and page index.** Layers has an **Add section** button that inserts a titled section after the selected one and lists it in the right-side page index. Design → **Page index** chooses the entry: its heading, a custom label, or hidden. Page settings lists the whole index.

**Design panel.** The inspector shows only what fits the selected element, with its main group open and the rest collapsed. Spacing is now a separate group.

Install the complete archive using the steps below and refresh open editor tabs. No configuration or database changes are needed.

## Previous update: delete Assistant chat history

Open the Assistant search icon to find **Clear all history**. Open a saved conversation to **Delete conversation**. Both actions ask for confirmation; Cancel or closing the dialog keeps the history. Clearing covers your chats across all projects, including the current conversation, without changing page edits or other users' chats.

The server enforces ownership using the verified Access identity. Deleted transcripts are removed from the live history table; identifier-only deletion markers prevent delayed saves from restoring them. Open tabs clear their local conversation state when notified. Existing server backups are unchanged.

Install the complete archive and refresh. The deletion-marker table is created automatically; no configuration changes are needed.

## Previous update: private searchable Assistant history

The Assistant header now has **New chat** and a search icon in place of the CSS shortcut. New chat keeps the previous conversation in private history. Search finds your messages across projects and opens saved transcripts for reading; it does not apply old proposals to the current selection. Advanced CSS remains accessible from the element context menu.

History is stored in SQLite and survives refreshes and service restarts. Every history search, read and write is scoped to the identity from the verified Cloudflare Access token, never a user ID supplied by the browser. It is excluded from website/static exports. Attachments are listed by name in transcripts; temporary media links are not stored. Each chat keeps up to 100 recent messages, search returns the 50 latest matches, and storage is capped at 500 chats per user. Chats cleared before this release cannot be recovered.

Install the full archive and refresh. The private history table is created automatically; no configuration changes are needed.

## Previous update: New chat in the Assistant

Click **New chat** at the top of the Assistant to start a fresh conversation for the current page or selected element. It clears that conversation's messages, input, attachments and unapplied proposal, ends its preview and cancels an in-flight request. Existing page edits and reasoning settings are kept. Late responses from the previous request cannot enter the new conversation or reset a newer request's loading state. The action is temporarily disabled while an attachment uploads or a proposal is being saved.

Install the complete archive and refresh the browser. No server configuration changes are needed.

## Previous update: GPT-6 Luna on the server

The server's Codex worker and direct CSS assistant now request `gpt-6-luna`. Reasoning remains Medium by default, with the existing High maximum unchanged. Server status and model-access errors now name the new model. No API key or authentication changes are required.

The composer and reasoning popup now display the model returned by `/api/ai/status`, replacing the old hard-coded GPT-5.6 Luna label. After installing, refresh the browser. If the label still reports GPT-5.6 Luna, run `sudo bash /opt/prion/ops/diagnose-ai.sh` to check the worker's model; a stale label alone does not indicate that Codex CLI needs updating.

Install the full archive using the update steps below. The installer restarts the main service and an already active Codex worker. If copying server files manually, restart both with `sudo systemctl restart prion-codex prion`. Local tests use mocked model responses; verify a real Assistant request after deployment to confirm your API project's model access.

## Previous update: smoother section navigation over SVG illustrations

The Notebook section rail now gets priority over decorative SVG drawing. Illustrations hold their current frame while you hover or focus the rail, then resume after its exit transition. The tick wave and preview card use isolated composited transforms and opacity; tooltip measurements are cached and rapid hover changes are coalesced into one frame. Reduced-motion settings disable the rail and card transitions. This shared behavior applies to the website, preview and newly generated static exports.

Install the complete archive and refresh. No server configuration changes are needed.

## Previous update: editor loading animation

The editor now opens with a small protein-inspired assembly animation: mint and gold units form a fibre over a dotted canvas. It appears before the app JavaScript finishes downloading, while workspace/project data loads, and while the editor module loads. It disappears as soon as the content is ready, with no artificial delay or invented progress percentage. Reduced-motion settings show the assembled illustration without movement. Animation uses only CSS transforms and opacity, with no JavaScript animation loop.

Install the complete archive and refresh. No server configuration changes are needed.

## Previous update: direct canvas movement

The floating **Move** handle is removed. Drag an object itself or its blue selection outline to reposition it, including imported text, images and SVG illustrations. The floating toolbar disappears during dragging. Click selects; double-click text opens its editor. With the canvas focused, arrow keys nudge 1 px and Shift + arrow nudges 10 px. Holding Shift during a drag constrains it to one axis; Escape cancels the drag. Each drag remains one Undo step, and locked layers stay protected.

Movement still previews directly on the selected box and saves one CSS offset at release. Saved offsets retain responsive scope and appear in preview and export. The previous Move popup is gone; existing free-layout X/Y fields remain in the inspector.

Install the complete archive and refresh. No server configuration changes are needed. Local checks cover direct text/image dragging, keyboard nudging, Undo, double-click editing, locked layers and saved preview.

## Previous update: easier movement, visual insertion and faster interactions

Select an element and drag **Move** in the floating toolbar to reposition it, including imported text and images. Click **Move** for precise X/Y offsets and reset. With the handle focused, arrow keys move 1 px; Shift + arrow moves 10 px. Shift while dragging constrains movement to one axis; Escape cancels the drag. Each drag is one undoable edit. Offsets respect the active responsive size and persist through Save layout, preview and static export. They visually offset the selected box while preserving its place in the responsive flow; use the layer list to reorder sections.

**Insert element** opens a compact icon grid for text, images, buttons, frames and media. Choose **On page** or **In section**, then click the element type. The new element is selected and brought into view automatically. Locked sections cannot receive new elements.

Movement previews update only the selected element once per animation frame and commit the layout at release. Canvas rendering uses indexed layer lookups and memoized template content instead of repeatedly cloning unchanged templates. The selection toolbar caches style and control measurements during scrolling. These changes reduce interaction work; no production-server timing benchmark was performed.

Install the full archive and refresh. No Nginx or service configuration changes are needed. Local checks cover drag, X/Y entry, keyboard nudging, Undo, both insertion destinations, automatic scrolling to inserted objects, saved preview, TypeScript, lint, editor regression tests and all three template exports.

## Previous update: compact rotation popup

The floating toolbar now has a single **Rotate** icon instead of the wide angle field. Click it for a compact popup with an orientation preview, precise angle input (including decimals), **−90° / +90°** shortcuts and a reset button. A blue indicator marks a rotated selection. Existing saved rotations and Undo still work.

Install the complete archive and refresh the browser. No server configuration changes are needed. TypeScript, lint and build pass; the popup, angle entry, shortcuts and reset were checked in the local browser.

## Previous update: rotation, selection history and AI isolation

Select text or an image and set **Rotation (degrees)** in its floating toolbar. Use positive or negative angles, or **0** to reset. Rotation respects the selected responsive size, supports Undo, and is saved with **Save layout** for preview and export. Inline text is made transformable without replacing existing CSS transforms.

The Contents sidebar switch now keeps its thumb inside the track in both states. The history panel shows **Changes to selection** for the selected element, or **Page changes this session** with no element selected. Reviewing an AI proposal still shows its complete diff.

Assistant conversations are separated by signed-in user, project, page and selected element. Switching context cancels the outgoing request and ignores late responses. Codex jobs already use fresh temporary workspaces and ephemeral sessions; regression checks now verify distinct workspaces, isolated prompts, cleanup and rejection of a second concurrent job. On the 1 GB server, only one Codex job runs at a time; another request receives a busy response. Saved page content remains shared with collaborators, and applying/saving a proposal is still an explicit action.

Install the complete archive and refresh the browser. No Nginx or authentication changes are needed. Use the updated source kit when compiling static exports. Local browser checks cover text/image rotation, save/reopen, selection-specific history and both switch positions; AI isolation checks use a mocked worker, not live model calls.

## Previous update: compact menu, element deletion and hover rail

Right-click offers **Text…**, **Link…** when applicable, **Ask AI**, **More**, and **Delete**. More contains CSS, properties and layer controls; unavailable duplication is omitted. **Delete** (or the Delete key) removes the selected nested element from the visible page without removing its containing section. Selecting a whole layer still removes a custom layer or hides an imported layer. Locked layers remain protected. **Undo** restores the change; use **Save layout** to persist it.

Nested imported elements are suppressed with a scoped, saved display rule, retaining the original template content. The rule is included in preview and static export. These are page layout edits, not deletion of shared media files or projects.

While hovering or focusing the Notebook rail, the current-section marker loses its separate extension and highlight. Only the interaction wave is shown. The current-section extension returns on leaving the rail.

Install the full archive and refresh. No Nginx changes are needed. Update the static source kit before recompiling exports.

## Previous update: direct text editing and useful right-click actions

Double-click text to open a focused text editor at a readable size, independent of canvas zoom. The selection dock also has **Edit text**. Right-click the actual text to use **Edit text**, or **Edit link** on a linked label; AI, CSS and layer actions remain available. Nested text fragments are selected individually, so a footer label can be changed without replacing its adjacent label or destination.

**Save text** or **Ctrl/Command + Enter** saves imported text; **Cancel** or the close button discards that text draft. Clicking outside retains the draft. Existing revision-conflict checks still apply. Custom text, headings and button labels use the same dialog; their edits join the layout draft and are published with **Save layout**. Locked layers remain protected.

Install the complete server archive and refresh the browser. No Nginx or authentication change is needed. Use the updated source kit for future static builds. Local checks cover double-click, dock and right-click editing, save/reload, cancel, nested footer text and the focused link destination.

## Previous update: animated section-rail hover

Hover over the Notebook rail to expand the pointed marker and progressively shorter neighboring markers, matching the reference. They ease back on exit; only the current section remains extended at rest. Keyboard focus provides the same effect. The rail stays transparent and uses the page text color, with reduced-motion support. This uses transform/opacity transitions and updates only when the pointed section changes, without adding a scroll animation loop.

Install the full archive and refresh the browser. Static exports need recompiling with the updated source kit. No Nginx change is needed.

## Previous update: existing projects and smoother scrolling

After updating, open **Your projects → Edit project**. Do not create another project from a template or import a snapshot as part of an ordinary update. The installer preserves the live database; restarting the server does not seed Notebook or Swiss projects.

Template cards now offer existing projects first, with new-project creation under **Create a separate project**. The server rejects active projects with the same name (including case, whitespace and Unicode-equivalent spellings), and the client prevents double submission. Use a distinct name for an intentional new copy. Existing similarly named projects are retained because they may contain different edits. Review their content before using **Delete**; deleted projects can be restored from Trash.

Illustration drawing now shares a maximum-30-fps scheduler and pauses while scrolling, when the document is hidden, or when the page is offscreen. Repeated SVG lookups and assembly calculations are cached, and expensive animated texture filters were removed while preserving the drawings. Reduced-motion story illustrations render once rather than redrawing on every frame. These changes apply to the website, preview and newly compiled static exports. Actual scrolling performance still depends on the browser and page content.

Install the full archive and refresh the browser. Update the source kit and recompile any static export. No new Nginx settings are needed. Tests cover repeated startup without additional projects, duplicate-name rejection, animation scheduling/pause/resume, production build and static publication. Local browser checks covered preview, section navigation, and reopening an existing project. This update has not been deployed to your server.

## Refined Notebook section rail

The rail now has a transparent background with compact, equally short markers. Only the current section stays extended at rest; hovering or focusing a marker now animates a graduated wave around it and shows its label. Marker colors follow the page’s text color, and tooltip cards use its paper color. Clicks jump immediately. Scroll tracking uses cached heading positions and updates only the previous/current marker, refreshing measurements after layout, image or font changes. Install the full archive and refresh the browser. For iGEM exports, use the updated source kit and recompile. No Nginx changes are needed.

## Faster preview and page navigation

Install the full archive and refresh editor tabs. Preview keeps its iframe ready after the first opening, loads editor tools separately, and avoids resending an unchanged draft. Unchanged collaboration polls preserve the canvas. The initial workspace load reuses its verified session and content instead of immediately requesting them again. Normal website page links switch within the loaded project, including browser Back/Forward. Save/Discard still protects editor page changes. Hidden animations and the offscreen Notebook assembly diagram pause their drawing work; hidden preview audio/video are paused too.

Scripts and template artwork now use private browser caching for ten minutes with ETag revalidation. API responses and HTML remain uncached. No new Nginx change is required for this update; keep the existing same-origin preview configuration.

**reGELerate · Notebook** now has a right-side section rail in website view, Preview and static exports. It follows visible page headings, highlights the current section, and shows a title and short excerpt on hover or keyboard focus. Click a marker to jump. It includes added sections with headings, supports reduced motion, and stays outside the editing canvas. Swiss Biotech is unchanged. Update your static-export source kit and recompile to include the rail in an iGEM upload.

## Project deletion

Open **All projects & templates** (or `/workspace`) and use **Delete** next to a project. The confirmation names the project and explains its effect on the shared website. If you delete the current default while other projects exist, choose a replacement first. Deleting the last active project returns the main URL to the selector. **Trash → Restore** recovers saved pages and edits; restoring does not replace an existing default. Retired archived projects can also be deleted and restored.

Deletion applies to everyone and blocks further saves/exports from stale tabs. It retains saved content and shared uploads for recovery, so it does not free disk space. This follows the existing shared-team permissions: any authenticated editor can delete or restore a project. Install the full archive and refresh browser tabs. The database adds its deletion marker automatically; no snapshot import or new Nginx change is needed.

## External links

Install the complete archive and refresh the editor: both frontend controls and server validation changed. Select an existing template link, then use **Design → Selected link URL → Set link** and **Save layout**. New buttons and sections accept external destinations through **Link destination**. HTTP/HTTPS, email and telephone links are supported alongside page links. Link changes are preserved in previews, snapshots and static exports. Update the source kit used for static compilation as well. This change requires no additional Nginx configuration.

## Template library

Install the complete archive, then open **https://igem2026.gpupods.cloud/workspace** and refresh all editor tabs. Login through `/auth/login` and the `/?studio=1` entry now open the project/template selection screen. Open an existing project under **Your projects**. Only when starting a new project, choose **reGELerate · Notebook**, **reGELerate · Swiss Biotech**, or **Blank canvas**, give the new project a distinct name, and open its editor. Both supplied designs include their 20 original pages, artwork, navigation and animations. Blank canvas starts with one empty Home page.

The old Prion starter is no longer available in the editor. On upgrade, projects created with that starter are archived without deleting their database rows or uploaded media. Their snapshots remain downloadable from **Archived previous work**. Until you create a new project, the main URL opens the selector. The first new project becomes the shared default; use **Set as default** to choose another project for the main URL. A direct project URL keeps its own selection. Projects remain shared among your existing authorized team.

Each template creates an independent copy. **All projects & templates** returns to the library and uses the existing Save/Discard guard. Export captures the open project only. Update your static-compilation source kit along with the server archive so it understands the new template IDs, text fields and assets. Do not re-import a snapshot during an ordinary update.

This update needs no new service, secrets, npm installation or build on the server. The existing Node 24/SQLite setup and Cloudflare Access remain in place. If you already installed the complete preview/Nginx update below, no additional Nginx change is required for templates.

## Installation and existing preview configuration

Install the full application archive and **update/reload Nginx using the commands below**. This release adds `/studio-preview`: it may be framed only by this same website. Other routes retain `frame-ancestors 'none'`. If you keep your existing Nginx configuration unchanged, the new preview will be blocked. The supplied configuration adds a URI map and uses it in the Content-Security-Policy header. Keep Cloudflare Access enabled on the entire editor hostname.

The default selection controls the self-hosted site. Export downloads the project currently open in that tab; the static compiler creates one standalone iGEM website from that snapshot. It does not publish other projects or add a project picker. Projects are shared with the existing authorized team, not separate access-control groups. Media storage and server AI quotas remain shared.

The inspector now uses compact collapsible groups, Insert opens beneath its trigger, and **Header & logo** is in **Pages**. Preview uses the complete publication renderer in a separate responsive viewport, including generated article headings, navigation, footer, nested content and current unsaved edits. Preview does not save or apply a draft.


This is a prebuilt release for the existing Node 24 installation. No npm install, frontend build or database re-import is needed on the 1 GB server. Keep the media hostname DNS-only. This release also needs the Nginx configuration update below. The installer preserves `/etc/prion.env`, `/var/lib/prion` and certificates.

See [Server update: start here](#server-update-start-here).

Only reload if `nginx -t` succeeds. On failure, restore the saved configuration and test again. If your active config is installed elsewhere, update that active file instead; do not add a second duplicate server block.

Open `https://igem2026.gpupods.cloud/?studio=1` and refresh. MP4, WebM and GLB uploads now have no fixed per-file cap through `media-igem2026.gpupods.cloud`; files stream to disk. Other formats and the fallback editor upload route retain 25 MiB limits. Defaults reserve 256 MiB of free media-disk space and allow 30 minutes per upload. Optional settings in `/etc/prion.env` are `MEDIA_LARGE_MAX_MIB=0`, `MEDIA_MIN_FREE_MIB=256` and `MEDIA_UPLOAD_TIMEOUT_SECONDS=1800`. A positive large-file limit sets your own cap. Restart `prion` after changing settings. If extending the timeout, also adjust Nginx media proxy timeouts. Disk, bandwidth and browser/model-viewer capacity still apply.

Test one video or GLB over 25 MiB, then download it and verify playback or model rendering. For publication, use **Export wiki → Prepare three ZIPs**. Large files stream directly to your download folder; see STATIC-EXPORT.md for the upload steps.

To enable the new page-content/layer/styling Assistant, follow CODEX-SERVER.md. Codex is optional and requires installing its worker and setting a fresh server-only key. Normal updates preserve AI configuration. The installer refreshes and restarts an already active Codex service; it does not enable a new worker automatically. This release contains no API key.

Do not import the supplied migration snapshot during an update: your live database already contains the team's current work. The backup includes private credentials and drafts; keep it outside the website directory.

If the service reports an error, inspect `sudo journalctl -u prion -n 60 --no-pager`. The previous application is in the private backup above. To restore its code, stop the service, extract only `opt/prion` from that archive into `/`, then start the service. Keep `/var/lib/prion` and `/etc/prion.env` in place so newer content and current settings remain intact.

This template release was checked with a production build, TypeScript, editor state/render tests, template project/API/migration tests, signed direct-media tests, and static export/restore for all three starters. Local browser checks covered selection, creation, text saving, preview and page navigation. Deployment on your server was not performed.

## Fix: AI received an HTML page instead of JSON

This release checks AI response types before parsing, retains failed requests in the input, and reports the endpoint and HTTP status. It also applies the AI proxy configuration to all `/api/ai/` endpoints and returns JSON for Nginx-generated AI errors. Install the complete release and update/reload Nginx using the steps above, then refresh your browser to load the new client.

An immediate `Unexpected token '<'` means the browser received HTML, but does not identify which service returned it. It may be a login/security response, missing API route, or proxy error. The patch makes the cause visible; it cannot fix an unknown live Access rule or stopped service remotely.

After reproducing once, run this read-only command and share its output together with the new AI message:

```sh
sudo bash /opt/prion/ops/diagnose-ai.sh
```

The command reports service state, a local API status check, Codex configuration status and recent AI HTTP status codes. It does not print API keys, environment files, signed URLs or request bodies. A local HTTP 401 is expected because this diagnostic deliberately does not supply an Access token. If the failed request never reaches Nginx, inspect Cloudflare security/Access events and confirm the editor URL. Keep Access enabled.

## Conversational Assistant and live activity

The startup fix is merged into the full release. Deploy the full package for this update: the worker, backend and frontend now share a chat/proposal response format. Do not use the older worker-only patch for this feature update.

After updating, refresh your browser. Say “hello” or ask a question: Codex should answer conversationally without offering an unsolicited layout change. Explicit edit requests still produce a proposal requiring preview and approval. Questions and brainstorming use the existing chat history as context.

Progress is streamed as Codex reports it: starting, thinking, writing the response, and checking proposed changes. The activity row has an animated spinner, dots and elapsed time; completed replies fade in. Tool rows appear only for actual reported tool events. Shell execution and web search remain disabled under the page-editing scope, so a normal conversation may have no tool rows. Reasoning text and raw tool arguments/output are not exposed. Reduced-motion preferences disable decorative animation.

The shipped Nginx AI route already disables response buffering. Reapply the Nginx step above only if your active config is older or customised and missing that setting. The full installer restarts an already active Codex service. The startup fix and safe diagnostic failure categories are retained.

Local tests verify no page writes for chat, progress arriving before completion, Unicode across split stream chunks, cancellation and worker cleanup, and no raw reasoning/key/prompt leakage. Browser animation and live Codex event delivery need verification after deployment.

## Fix: styling a selected element was rejected as a layout change

Nested DOM selections now use a CSS response schema. The server combines the validated CSS with the existing layout, so a request to increase font size or change colour cannot accidentally regenerate the containing section. Layer and whole-page selections retain their layout proposal format. Layout comparisons now ignore object property order while preserving array order and actual values.

Your existing selection is valid for styling. Update the main package (which restarts the worker and website service), then repeat the request and preview it. No new Nginx or Cloudflare change is required for this fix. If an AI response actually attempts an out-of-scope change, the error now explains that the proposal was wrong rather than implying your selection was wrong.

Regression tests cover nested font-size/colour proposals through generation and save, reordered JSON properties, locked layers and rejection of unrelated styles or structural changes. Live AI output and browser appearance still require checking after deployment.

## Assistant composer position

The Assistant now fills the inspector height, with the chat composer anchored at the bottom. Conversation, proposal details, Advanced CSS and draft actions scroll above it. The duplicate Luna label in the inspector header is removed; the model/effort control remains in the composer. Install the updated full package and refresh the browser. This interface update needs no new Nginx, Cloudflare or AI settings.


The current release also includes the dedicated CSS view, persistent change diff and Assistant image attachments. Install the full archive so `server/ai-images.mjs` is present alongside the updated worker. The normal installer restarts an already active `prion-codex` service. Refresh the editor after updating, attach a small PNG and ask what it shows; verify its thumbnail and reply. No environment-file changes are required for these features on an already working Codex setup.


### Assistant upload session messages

This update removes the “Start with an idea” line. Upload authorization now detects an expired Cloudflare Access session before following a redirect to the login provider. It asks you to refresh and sign in again instead of displaying a generic “Failed to fetch” message. Direct media routing and authentication are unchanged; this fix requires no new Nginx or Cloudflare settings.


### Media caching and clearer save dialog

This release permits private browser caching of signed media for up to ten minutes and reuses per-user read links during that window. It adds ETag validation while preserving ticket checks, Access-protected redirects, range downloads and streaming to limit server RAM use. No new Nginx or environment settings are needed. Browsers control storage and may evict large files. Cached downloaded bytes can remain locally readable during their freshness window; this is not persistent offline storage. Restarting the server clears its small signed-link reuse map.

The unsaved-page dialog now displays the destination with Save changes, Discard changes and Keep editing actions.


### Nested objects, buttons, and site header

Install the full release for the new section/button node types and parent/position fields. Existing layouts need no database migration. Refresh every open editor tab after updating so all teammates use the new schema. Header & logo edits are shared across the selected project; their uploads are included in static snapshots. Newly added child objects can use free placement inside sections or responsive flow. Desktop free-placement content stacks on mobile. Update the source kit used for static compilation as well as the running server.

## Judging and team-page attributions

Template navigation now labels the former Attributions page Judging. Existing page IDs, saved content and custom names are preserved. Attributions is no longer a required wiki export route and the official embed URL is optional. The upload helper no longer creates an embed URL automatically. Submit the official attribution form through your iGEM team page. Install the updated application package and refresh editor tabs; no new Nginx change is needed for this update.

## Progressive PDF publication

Install this release, refresh the editor, and prepare fresh three-ZIP exports. Large local PDFs are split below 9 MB and uploaded as ordinary document files; the published page loads parts progressively and offers Download complete PDF. Existing exports must be prepared again. No new Nginx change is required. Original saved PDFs and page positioning remain unchanged. See STATIC-EXPORT.md for reading-copy limitations.

## Image upload size checks

This release automatically compresses oversized local JPEG/PNG images during export and reports named errors for files it cannot process. Install the archive, refresh the editor and prepare fresh three-ZIP exports. Download the updated helper to receive the consistent 10 MB pre-upload check. Original images remain unchanged; no Nginx change is required.

## Upload helper 1.0.15: complete compiler publishing

The previous helper omitted new PDF/image modules, the PDF parts manifest and processing licences from GitLab uploads. Use helper 1.0.15 and send the source again; retrying the old pipeline alone cannot restore missing files. Existing uploaded media URLs can be reused. Older source exports without the matching dependency lockfile are rejected before publishing with instructions to prepare fresh three ZIPs.

## PDF reader layout

Partitioned PDFs now have a contained toolbar, fit-page opening mode, Fit page and Full screen controls. The viewer stays inside its saved layer and prevents internal PDF content from stretching the webpage. Install this package and prepare fresh exports; use helper 1.0.16 to publish the matching compiler. Native PDF toolbar support varies by browser.

## Unified PDF reader

Editor, Preview and published PDFs now share the same Edge-style reader: continuous pages, thumbnails, page-number navigation, zoom, fit-page, rotation, fullscreen and complete download. Only nearby pages are drawn; split documents load their files as needed. Install this release, refresh editor tabs and prepare fresh exports with helper 1.0.17. Browser-native search/annotation menus are not part of this custom reader. No Nginx change is needed.

### PDF layout isolation fix

The PDF reader now isolates its toolbar and pages from saved page CSS. This prevents notebook styles from hiding the toolbar, shifting pages or creating a second horizontal scrollbar. The download action is inside the reader; the detached original-file link is removed. Install the updated archive and refresh editor tabs. Generate a fresh export to update an already published wiki; helper 1.0.17 remains compatible.

## Custom HTML element

This release adds **Insert element → Custom HTML** with HTML/CSS/JavaScript tabs, live sandboxed preview, a working animation starter, runtime errors and adjustable dimensions. The server validates and saves the three code fields, and the assistant can create/edit these elements. Install the package and refresh editor tabs before creating them. Fresh exports preserve the same animation frame. Use upload helper 1.0.18 so its bundled compiler also collects explicit custom-code media references.

## Manual Video Universe embeds

Exports now contain two ZIPs: website source and static assets. Download the updated upload helper (1.0.20) after updating the server. Existing Video Universe iframe settings remain intact. Raw video/audio frames become visible TODOs in the exported website and recordings are excluded from upload processing. Add embeds in the editor and re-export to resolve them. Saved project content is unchanged. Older helper jobs can still be resumed.

## Export timeout fix

Install this complete server release, then reload the editor. Export preparation now starts a background job and the editor polls its progress using short requests. PDF splitting and large-image compression run in workers, keeping progress and editing requests responsive. You do not need to increase Nginx's 60-second timeout for preparation.

The old “export server is unavailable” message could actually be an HTML 504/524 timeout response after about a minute. Updated editors distinguish proxy timeouts, sign-in failures and backend outages. The server retains job status for up to 30 minutes (older jobs are replaced by newer preparations); after a server restart, prepare a fresh export. Existing saved content is unchanged.

## Template logos in export

Full template asset URLs on the configured editor and media domains are now packaged from the server's bundled files, just like relative template paths. The original URLs remain the media-map keys. Other external sites are not fetched or substituted. Install this package, reload the editor, and prepare fresh ZIPs to include the missing logos. Download upload helper 1.0.21: missing originals are now labelled “Missing file” instead of “Ready to upload.” Old ZIPs do not acquire the missing files automatically.
