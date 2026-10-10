# Update the existing Ubuntu server

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
