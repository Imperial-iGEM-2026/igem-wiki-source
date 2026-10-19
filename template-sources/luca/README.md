# Luca

Reusable template adapted from the team's “reGELerate Luca Template” design, read through its authorized MCP connection on 16 October 2026.

The editable source is `app/luca-template.json`: 15 page definitions, each with a native editor layout, text, cards, links and sandboxed HTML animations. `app/luca-theme.css` supplies the shared appearance; `scripts/build-luca-template.mjs` scopes it and generates `app/luca-styles.json` during the server build.

New projects receive independent copies of these layouts on the server. Existing project content is never replaced by template defaults. Selecting Luca through Change template changes appearance only; it does not import its sample page content into an existing project.

The source design's molecular animations and draft wording are retained. Draft labels and TODOs are illustrative content, not verified scientific results. Sponsor walls use editable image layers with bundled assets and a reduced-motion fallback, so they need no private source-server access. One uploaded project video is represented by an empty, replaceable video element. Upload the appropriate video for each new project.

Sponsor rows retain the reference design's 80 px cards (64 px on phones), 48 px maximum logo height (38 px on phones), 12 px spacing and opposing 96/82/90-second continuous loops. A presentation-only duplicate completes each full row; only the original 20 logo layers are saved and editable. Reduced motion shows all sponsors without animation. Local SVG previews use the image/svg+xml MIME type.

No MCP key, private preview URL, project database or server media permission is included. The source project was read only and was not changed.

Content pages include the compact page index adapted from the team's Notebook (Main) reference. The header and intro sit above the article grid, and the footer sits below it. Folding the index releases its column width; phone layouts stack it above the article. The index respects the page's sidebar setting and stops before the footer. The compact footer contains only team identity and contact information.
