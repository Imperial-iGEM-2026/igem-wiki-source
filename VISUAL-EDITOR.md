# Prion Studio

**Sponsor lists:** Home and Our sponsors are independent. Edit each page's own logo layers; changing or deleting a homepage sponsor section no longer replaces the Sponsors page's content. Select the section in Layers and choose **Delete section** to remove it, including its logos. If a child layer is locked, the editor names it so you can unlock it before deleting. **Undo** restores the section during the editing session. Deleted template sections stay removed after saving and reopening; the eye icon still hides a section without deleting it.

**Website tab icon:** Projects use a compact reGELerate logo in the browser tab. A custom logo saved in **Header & logo** also becomes the tab icon. Three-ZIP exports include the icon in the media upload list and use its hosted URL in the published pages; re-export with the updated server and upload helper 1.0.19 or later.

**Rename a project:** Open **All projects & templates → ⋯ → Rename project**, or use **Rename project** beneath the editor's project selector. Enter a name and choose **Save name**. The new name is saved for the team; pages, images, website branding and URLs are preserved. Projects are grouped under their currently applied template, including after a template change or rollback.

**Header menu:** Pages shows the header menu: Home, the menu groups in order, and **Not in menu**. Drag pages between groups, or right-click a page to move it, reorder it or remove it from the menu. Add, rename (double-click the name), reorder and delete groups. The header and the "GROUP / PAGE" heading label update everywhere immediately. The left sidebar lists sections within the current page; use the header to navigate between pages. New pages start in **Not in menu** and use the same layout as template pages: heading, sidebar, and a content column where **Add section** places new sections.

**Connect an AI:** Click **Connect AI** in the top bar. **Your links** shows the links you created: use **Copy link** or open a link's setup steps for Claude, ChatGPT or Claude Code, then ask the AI to edit the wiki. **New link** creates one: name it (the name is shown to teammates while the AI edits), choose the whole project or only the current page, and pick an expiry. **Team** lists everyone's links; only their creators can copy them, but anyone can revoke a link. The AI reads each page element by element and its changes save at once and appear live, with a purple "(AI)" outline where it is working. Anyone holding a link can edit until it expires, so share it only with tools you trust.

**Selecting several items:** Shift-, Ctrl- or ⌘-click elements on the canvas to style them together with the quick-style dock (it shows "N selected"). In Layers, Ctrl/⌘-click toggles a layer and Shift-click selects a range. Drag on empty canvas space to box-select sections, press Ctrl/⌘+A to select all sections and Esc to clear. Delete removes or hides everything selected; one Undo restores it.

**Collapsible sections:** Insert → **Collapsible** adds a list of sections readers can open and close, several at once, without the page jumping. Edit titles and text in Design → **Sections**, tick **Open when the page loads** for any that should start open, and use the arrows to reorder. Keyboard and screen-reader users can use them as normal.

**Right-click menus:** Right-click a layer in Layers (or a section on the canvas) to add a section or subsection below it, hide, lock, duplicate or delete it. Right-click empty space for page actions, including **Delete this page…** on pages your team created. Right-click a page in Pages to open or delete it.

**Let the AI see its work:** Ask the AI to use `get_preview_url` and open it in its browser tool to take a screenshot. This works in AIs that have a browser (for example Claude Code with a Playwright or Chrome tool, or ChatGPT agent mode). The preview shows the saved page as visitors see it.

**Several AIs at once:** Multiple AI links (and people) can edit together. Each change is saved as one checked step, so edits to different sections or properties all land. Lock a layer in Studio to keep every AI away from it.

**Subsections and page management:** Right-click a section for **Add section below** or **Add subsection below**. Subsections use an H3 heading and appear indented in the page index; change it in Design → Content → Heading level. In Pages, click **New page** to add one. To delete any page except Home, right-click it or click its bin icon. Deleting a template page removes it from this project and discards its edits; restore the original from **Deleted template pages** at the bottom of Pages.

**Add a section and index it:** In Layers, click **Add section**. It inserts a heading + text section directly after the selected layer (or at the end of the page) and lists it in the page indexes automatically. Rename the heading in Design → Content, then **Save layout**. To change the marker text, open Design → **Page index** and choose **Custom label**; choose **Hide from index** to leave a section out. Frames have no heading of their own, so give them a Custom label to index them. **Page settings → Page index** lists every entry in order; click one to select that section.

**Design tab:** The inspector shows only what fits the selected element. A short note at the top names the element type, and its main group (Content, Media or Button link) opens first. Page index, Layout, Spacing, Appearance and Typography stay collapsed until you need them.

**Section navigation:** Content pages combine the section list and compact marker rail in one left sidebar. Hide the list to use the markers; hover or focus a marker to read its title and excerpt. Click to jump to the section. Notebook homepages without a left sidebar retain their right-edge markers.

**Faster preview:** Reopening Preview reuses the current frame and viewport. Changes to your draft still refresh the preview; unchanged collaboration polls do not rebuild the canvas. Website page navigation keeps the current project loaded and supports browser Back/Forward.

**Delete a project:** Open **All projects & templates**, then click **Delete** on the project row. Confirm its name in the dialog. If this is the main website, select a replacement when other projects exist. **Trash → Restore** recovers the project; saved content and shared uploads are retained. Deletion affects the whole team, and old editor tabs cannot save into a deleted project. The last project can be deleted too: the main URL then shows the selector.

**External links:** Select a link, button or linked logo inside an imported template. In Design, enter its destination in **Selected link URL**, click **Set link**, then **Save layout**. For a new button or section, use **Link destination** and optionally set its button label. Enter a full `https://` or `http://` URL, `mailto:team@example.org`, `tel:+442012345678`, or choose an existing website page. Internal page fragments and `#fragment` are also supported. Preview follows the saved or draft link, and static export preserves external URLs. Imported link overrides apply to the page being edited.

Start at `/workspace`: open your saved project under **Your projects**. Updates preserve it; you do not need to create another copy. Template cards also offer existing projects first. To intentionally create a new project, select a template or Blank canvas, expand **Create a separate project**, and use a distinct name. Both imported templates contain 20 pages; Blank canvas has one empty Home page. Use Pages to create more. The shared default project is shown at the main website URL.

Double-click imported text to edit it in a readable dialog at any canvas zoom, or use the floating **Edit text** button. Right-click text for **Edit text**, **Edit link** (when linked), AI/CSS and layer actions. **Ctrl/Command + Enter** saves; Cancel or Close discards the text draft. Custom text and button labels also open this dialog, then remain in the layout draft until **Save layout**. Select individual elements for quick typography/color styling, use layers for section layout, and insert additional text, buttons or media. The imported Header and Footer are canvas layers. The header and footer are shared by every page: their text, settings, elements inside them and styles applied to them update everywhere when saved. Other section layout and CSS edits are per page. If pages drifted apart earlier, right-click the header or footer layer and choose **Use this header & footer on every page**. Imported scientific SVG illustrations are preserved as artwork, rather than individual diagram objects. Return via All projects & templates; unsaved edits use the Save/Discard dialog.

The previous Prion starter is retired from the editor. Its saved projects are retained under Archived previous work as downloadable snapshots.


Open **Pages** to manage the workspace. The **Project** picker switches between independent projects; the plus icon creates a project with the iGEM starter pages. **Display at main URL** chooses the one shared, saved project shown at the website’s main URL. All authorized teammates can work in these projects. Switching projects prompts Save/Discard when necessary, and each browser tab stays bound to its chosen project. Project URLs can be bookmarked. Export always uses the currently selected project.

**Header & logo** lives in Pages and applies to every page of that project. The Design inspector has compact collapsible sections; expand Typography, Media or page links when needed. Insert menus open beneath their control and stay within the viewport.

**Preview** opens the complete website with its actual navigation, generated article header/sidebar, page content and footer. It includes the current page’s unsaved edits and AI preview, and lets you follow links without leaving preview. Desktop, tablet and mobile controls set the preview viewport width, up to the available window width; scroll inside the preview to see the entire page. **Back to editor** retains your draft. The server and Nginx update described in UPDATE-SERVER.md is required for this view.


**Latest update:** Click a heading, paragraph, image or other element to select it. A floating dock appears beneath the selection at a readable size independent of canvas zoom. Text controls include font family, exact font size, bold, italic, colour and alignment. Images offer fill, corner radius and fit; containers offer fill, corner radius and padding. Type into the dock’s chat input and press Enter or the send arrow to open Assistant and submit a request for the selected element. If AI is unavailable, the message stays in the Assistant composer. Open Advanced CSS in Assistant for manual styling. The arrow selects the containing section.

The dock follows scroll, zoom and panel resizing. It moves above the selection when there is insufficient room below, stays inside the visible canvas, and hides when the selection is offscreen. Click empty canvas space or press Escape to clear selection. Shift-click still selects multiple sections for the inspector. Locked layers disable quick style controls. Double-click text to edit its content; the dock hides while a text edit, drag, context menu or AI preview is active.

Desktop dock changes apply to **All sizes**. In Tablet view, changes apply at widths up to 1000 px; in Mobile view, at widths up to 760 px. The dock shows the active scope. A later desktop change preserves existing tablet/mobile overrides. Quick styles use page-scoped CSS, work with Undo/Redo and are shared with **Save layout**. They are included in the static iGEM export. Their explicit values override ordinary inline inspector styles; the dock reads the actual displayed value. Fix invalid manual CSS in Advanced CSS before applying quick styles.

Studio stays full-screen with resizable Layers, canvas and inspector panels. Drag their dividers to adjust the workspace; widths are saved in your browser. Enter a custom canvas width or zoom and press Enter; **Fit** follows the available space. The shell uses neutral panels, a dotted canvas and blue selection accents.

Choose **Pages** on the left to search the wiki or click **New page**. Give it a title and a unique lowercase address. The server creates a saved page with a starter text section; add content and media through the usual layer controls. Up to 50 custom pages can be added alongside the 30 core pages. Custom pages have real URLs, appear in team navigation, and travel with snapshots and static export. They are shared with other authenticated team members.

Select a section and open **Design → Connect to a page**. Choose a destination and button label, then save. This adds a visible link button to that section. Use **Preview** to follow it. Static export rewrites these links for the registered iGEM team path.

When you switch pages with unsaved layout or text edits, choose **Save and continue**, **Discard and continue**, or **Stay** in the dialog. Failed saves keep the dialog and remaining drafts in place. Unapplied AI previews are discarded when leaving. Open pages appear as tabs above the canvas; close inactive tabs with ×. Creating a page also resolves any current draft first.

Right-click a content element to open **Edit with AI**, **Edit CSS…** or **Layer properties**. The menu also offers visibility, locking and duplication of custom sections. A blue outline identifies the chosen element; an AI request targets that element’s selector. The inspector’s **Assistant** tab also opens the AI workspace for the selected layer, or the whole page when nothing is selected. **Layer properties** still controls the containing section. Double-click text to edit its content.

The AI panel separates your requests and Luna’s replies in chat bubbles. Send a request, review the response and proposal, then preview or apply it. Follow-ups include recent conversation context. Chat history is kept in memory while the workspace tab is open; it is not a shared or permanent chat archive. Drag the reasoning slider through None, Low, Medium and High; Medium is the default and High is the maximum. Each level has a visible dot; the thumb and fill animate between levels, with hover and drag feedback. System reduced-motion preferences disable transitions. **CSS** in the Assistant header opens a dedicated stylesheet view. **Assistant** in that header returns to the conversation without losing the input or proposal. **Add targeted rule** inserts a rule for the selected element and focuses its declaration area. GPT-5.6 Luna uses Medium reasoning by default, capped at High. A fresh server-only key is required; see [AI-CSS-SETUP.md](AI-CSS-SETUP.md). Saved CSS is included in static export. Element selectors depend on the structure within a section; review them if you later change its media type or internal markup.

After installing the updated server release, sign in and choose **Edit this page**. You can also open a page with `?studio=1` to enter Studio immediately, for example `https://igem2026.gpupods.cloud/?studio=1`.

The left panel contains section layers. Select one to see its properties on the right. Shift-click to select several. Drag a layer grip to reorder it; the same grip appears above a selected section on the canvas. Eye and lock buttons control visibility and editing. Hidden sections remain available in Studio and are excluded from the published page.

Select Desktop, Tablet, or Mobile above the canvas. Drag the blue handle on the right edge of a selected section to change its width in whole columns, or enter a column count in the inspector. Desktop uses the main column width; tablet inherits it until overridden, and mobile defaults to 12 columns. Tablet overrides apply at widths up to 1000 px; mobile overrides apply up to 760 px. The published page uses the same rules. Clear an optional column override to restore its default.

The inspector provides spacing, minimum height, fill, text and border colours, border width, corner radius, opacity, shadow, alignment, font family, body and heading sizes, font weight, line height and letter spacing. Blank optional numeric values use the original design. Colour controls in the dock and inspector open a hex popover with a palette and editable #RRGGBB code. Three-digit shorthand such as #FFF is accepted; press Enter or the checkmark, or leave the field, to apply a valid colour. Invalid codes are rejected. The reset arrow restores a default colour. Multi-selection applies changes to every selected unlocked layer.

Use **Add section** for text, images, video, audio, PDF, self-contained GLB models, or supported video embeds. Choose a file or enter an HTTPS URL under Media. MP4, WebM and GLB use the direct media hostname without a fixed application size cap; other formats retain a 25 MiB cap. Existing signed direct uploads and Cloudflare Access protection remain in place. Supply alt text, captions and transcripts where appropriate.

Double-click existing text on the canvas to open its Save/Cancel controls. New text sections have heading and body inputs in the inspector. Text is saved separately from layout.

**Live collaboration:** The top bar shows everyone editing the project, on any page (people on other pages appear faded). Click a person's chip, or **N editing** for the full list with each person's page, to jump to their page and scroll to what they have selected. On the same page, a teammate's selected element has a coloured outline with their name and a matching initial beside that layer in Layers. Layout edits sync automatically: about half a second after you stop typing or dragging, the change is saved and pushed to teammates at once (the top bar reads Syncing… then Live · all changes saved). **Save now** forces an immediate save. Changes to different properties merge automatically. If two people change the same property at the same moment, Studio keeps your value and asks whether to discard it or keep it. Text in the Edit text dialog and header settings is shared when you save that dialog. This is live sync of saved changes, not character-by-character co-typing. If the live connection drops, Studio falls back to checking every 2.5 seconds and reconnects automatically.

Undo and redo keep up to 50 layout steps in the current editing session. Typing into one property or dragging a resize handle groups changes into one step. Teammates' live changes are folded into your history, so Undo reverts only your own edits and never removes their work. Edits that are still syncing are not durable across a browser crash.

| Shortcut | Action |
| --- | --- |
| Ctrl/⌘ Z | Undo layout |
| Ctrl/⌘ Shift Z or Ctrl/⌘ Y | Redo layout |
| Ctrl/⌘ D | Duplicate selected custom sections |
| Delete | Delete selected layers or the selected canvas element |
| Alt ↑ / ↓ | Reorder selected layers |
| Left / Right on the resize handle | Change width by one column |
| Escape | Clear selection |
| Ctrl/⌘ S outside a text input | Save layout |

This release edits responsive **section layers**. Existing template sections keep their internal structure and shared text references; they can be reordered, resized, styled, hidden and restored, but cannot be independently duplicated. It does not include arbitrary nested frames, vector drawing, or Figma file import. Add custom sections when independent copies are needed. Use a desktop browser for the three-panel workspace; the canvas can preview narrower screens.

To publish to iGEM, save your changes, leave Studio and use **Export wiki** to download a fresh snapshot. Follow STATIC-EXPORT.md on your computer. The compiler renders the saved styles and responsive widths into static pages, with no login or editor runtime in the publication. Review the generated iGEM preflight report before uploading.

The production build, Studio state/merge tests, server authentication and media checks, custom-page creation and restoration, save/discard gating, and 30/32-route static-export checks pass locally. Browser interaction testing and installation on your Ubuntu server have not been performed for this release.

Design reference: [Figma / FigJam contextual text controls](https://help.figma.com/hc/en-us/articles/1500004291281-Create-text-and-links-in-FigJam). The new controls use that selection-first pattern with responsive webpage styling.

Colour fixes: editor fields and menus have explicit light-theme text colours. Text wrappers inherit the chosen heading/paragraph colour, so a section-level colour no longer masks it. The dock swatch shows the actual selected colour.

The dock now fits the width of its tools, with the chat row aligned to the same edges. Chat, font size and font family fields share one background surface. The font button opens a searchable menu below its left edge (flipping above when space is limited). Search 29 device-font stacks by name or style, such as serif or monospace. Arrow keys and Enter select a result; Escape closes the menu. Named fonts use the visitor's installed fonts, with explicit fallback families; no external font requests are added. Preview the export on the intended devices when typography must match precisely.

The Assistant composer uses one rounded input card with controls along the bottom. **+** opens prompt ideas and adds the selected idea to your draft. Click **GPT-5.6 Luna · Medium** to open the reasoning popover above the card; drag the dotted slider from None to High or reset to Medium. Press Enter or the circular arrow to send; Shift+Enter inserts a newline. While a request runs, the arrow becomes Stop. The text area grows with the draft, and the conversation stays above it. AI data/balance information is under **About AI proposals**. Manual CSS stays collapsed below.

The reasoning popover is compact (232 px wide), retaining all four level markers and reset. Prompt ideas have distinct typography, spacing and colour icons. Connection status and draft-retention information appear together immediately under the composer, instead of duplicate warnings above and below it. The page-search input shares its wrapper background.

## Optional Codex and large media

CODEX-SERVER.md explains how to enable Codex proposals for page text, layers and styling. Preview a proposal before **Apply and save page**, which saves its layout and text together with version checks. UPDATE-SERVER.md includes the Nginx change for MP4/WebM/GLB uploads above 25 MiB through the direct media hostname. STATIC-EXPORT.md explains how to export large media from disk using `--media-dir`.


The Assistant composer stays at the bottom while messages scroll above it. The old About AI proposals disclosure and Discard layout draft footer have been removed. Above the input, a compact Git-style unified diff shows layer, text and CSS changes since the page was opened, including saved edits; a pending AI proposal shows its own diff against the current draft. Expand/collapse the diff or download the complete patch. Long previews are shortened to 200 lines. Save, Undo/Redo, and the Save/Discard/Stay dialog when leaving a page remain available.

With the Codex worker connected, use **+ → Attach images**, paste a screenshot, or drop images into the composer. Thumbnails can be removed before sending and remain with the sent message. PNG, JPEG and WebP are supported: up to four images, 5 MiB per image and 10 MiB combined per request. These bounds apply only to AI references, not video/3D uploads. Include a request to describe how to use the reference; sending only images asks the assistant what it notices. If sending fails, the text and attachments return to the input. Attachments are sent with that message; reattach them when a later request needs the visual reference. Chat images are uploaded to private team media, not automatically inserted into the page or static export.


The plus menu contains Attach images and the individual suggestions without a “Start with an idea” heading. If your Cloudflare Access session expires, upload authorization asks you to sign in again. Direct media uploads continue using the configured media hostname.


The unsaved-page dialog shows the destination and offers **Save changes**, **Discard changes**, and **Keep editing**. Keep editing cancels navigation and keeps your draft. Escape or clicking outside also returns to the editor; navigation remains blocked if a save fails.

Private media responses now permit automatic browser caching for the remaining lifetime of their signed link (up to ten minutes). Repeat visits reuse the same per-user signed URL while it has more than a minute remaining. The browser may reuse downloaded bytes for videos, models and other media without fetching them again. This is browser-managed caching, not an offline download feature: browser storage limits, range-request behavior and eviction determine actual reuse. The authenticated editor redirect remains uncached. Fresh uploads have unique URLs, so replacements do not reuse old media.


## Header, frames and nested objects

Choose **Header & logo** in Pages, or click the header preview above the canvas. Upload a PNG/JPEG/WebP logo, change the site name, logo/name sizes, header height, colours and navigation visibility. **Save header** shares the settings across every page in the selected project. Header drafts participate in the existing unsaved-changes dialog and header saves use version conflict checks. Logos are included in snapshot/static export.

Choose **Section / frame** in Insert to create a free-placement container. Select that section and leave **Insert inside section** checked, then add **Text**, **Image**, **Button**, or another media element. Existing template sections can also contain new child layers; their original built-in content remains intact. Child layers appear indented and can be collapsed with their section. To move an object between sections, select it and change **Containing section**; choose Page (top level) to return it to the page flow.

A section's **Children layout** switches between **Free placement** and **Responsive flow**. In free placement, drag text/images directly or use the object's grip, and drag the resize handle to change width/height. X and width are percentages of the container, Y and height are pixels. The inspector also provides exact X/Y/width/height controls. Mobile previews and published mobile pages stack free-placement children in layer order for readability. Flow sections use the existing responsive column system. This retains responsive website behavior rather than making the whole site a fixed slide.

Buttons have a label, a destination chosen from the site's pages, and fill/text/font/corner styling. They work in static export. Section duplication copies its descendants and remaps parent IDs; deleting a custom section removes its descendants. Hiding a section hides its children in publication; locking a section prevents child edits. Layers can nest up to five ancestor levels, with the existing 100-layer page cap. Existing saved flat layouts remain compatible.


## Header controls and smaller editor fixes

The separate **Edit page & site text** field browser is removed. Select text directly in the canvas to edit it. The save/discard dialog now has just Save changes and Discard changes, with a top-right **×** to dismiss it and keep editing. Closing never saves or discards the draft; closing is disabled during a save.

In **Pages → Header & logo**, customize the site name, name/logo visibility, logo description and destination, font family and sizes, alignment, padding, height, colours and bottom border. Navigation supports editable labels, page destinations, menu groups, ordering, visibility, adding and removing links. A blank menu group creates a top-level link. Links are restricted to pages in this project. Default navigation restores the generated page menus. Save header stays visible at the top while you scroll. Click the header navigation on the canvas to jump to these controls. Header links also work in Preview and are rewritten for the static export path.

Logo selection now uses Choose logo or Replace logo with a thumbnail, rather than the browser's native file-input text. Layer hide/lock buttons use the editor's blue/neutral state colours. The contents-sidebar switch has an explicitly sized track and thumb, with reduced-motion support.


### Compact context menu and deletion

Right-click a selected element for Text…, Link… (when applicable), Ask AI, More and Delete. CSS and layer controls live under More. Delete or the Delete key removes the selected nested element from the visible page; it does not delete its containing section. Undo restores it. Save layout persists the deletion. Imported elements use a scoped CSS display rule so the original template is retained and the change travels with preview/static export. Use **Delete entire section** on the canvas, or **Delete section** in Layers, to remove the containing section and its children. Deleted template sections disappear from Layers and stay removed after saving; the eye button is for temporary hiding. A locked child blocks section deletion with an explanation. Undo restores deleted sections.

## Custom HTML animations

Choose **Insert element → Custom HTML**. The starting example animates three dots and changes speed when clicked. Select the element in Layers to open its **HTML**, **CSS** and **JavaScript** tabs. Preview refreshes shortly after typing stops; save the page to persist the code. Use Layout to set columns and height, or drag its resize handle. Use the layer handle or sidebar to select/move it; clicks inside the animation remain interactive.

The same sandboxed frame is used in the editor, Preview and exported wiki. HTML fragments, inline SVG, CSS keyframes and ordinary JavaScript work. Runtime errors appear below the preview. Scripts cannot access the surrounding page, account storage, fetch APIs, external script libraries, forms, popups or top-level navigation. For visuals, use inline SVG/data images or public HTTPS images. Respect `prefers-reduced-motion` in your animations; the starter already does.

Explicit `/api/media/...` and `/templates/...` references in code participate in export asset collection and URL mapping. Dynamically constructed paths cannot be discovered automatically. Use the updated upload helper 1.0.18 for these exports.


**Left page index:** Template content pages have a numbered **On this page** sidebar built from visible headings and custom index labels. Subheadings are indented and the current section is highlighted as you scroll. **Hide** folds the names into a compact, clickable marker rail and gives the content more space. Hover or focus a marker for its title and excerpt; **Index ›** restores the list. There is no separate right rail on these pages. The preference lasts for the current browser tab. On narrow screens the index sits above the content, with a horizontal strip of markers when collapsed. The same navigation works in the editor, Preview and static export. These controls are navigation, not editable content.
