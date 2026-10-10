# reGELerate website

This is the editable static website, exported from the current design.

## Deploy

Extract this ZIP. Upload the contents of this folder to your static web host, keeping index.html at the web root and preserving all subfolders. No build step, Node.js, database, or API key is needed.

For a host that asks for a publish/output directory, select the extracted folder containing index.html. Leave the build command empty.

## Preview locally

From the extracted folder run:

    python -m http.server 8000

Then open http://localhost:8000 in your browser. Stop the server with Ctrl+C.

## Editing

- index.html: homepage text, sections, and small SVG illustrations
- style.css: shared layout, colours, typography, and responsive styles
- script.js: main protein assembly animation
- story-animations.js: smaller explanatory animations
- navigation.js: wiki menus
- Other HTML files: individual wiki pages
- sponsor-logos/: sponsor artwork

Most inner wiki pages still need your team's final content. The animations illustrate design ideas, not experimental results.

## Assets and portability

Images and scripts are included locally. Typography currently loads Caveat, DM Sans, and Libre Caslon Display from Google Fonts; fallback fonts are provided if that service is unavailable. Sponsor links open external websites.

This is a portable static export, not an iGEM GitLab template integration. If publishing through your team's iGEM repository, adapt its existing build/output configuration and asset paths as needed. No hosting credentials or private hosting configuration are included.

Source revision: d5f9066e8cb0edd99575c03c94af04b228ddd2d9
