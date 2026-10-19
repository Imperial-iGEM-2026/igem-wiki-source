# Website Studio

## Latest update — 19 October 2026

This release includes Luca templates, editor selection/resizing and layout fixes, stronger scoped MCP editing, low-memory image validation, and smaller static exports. Upload helper **1.0.23** shares one folder allowlist across import and browser upload, including `assets/runtime/`. PDF partitions omit export-time timestamps so unchanged PDFs produce stable hashes and reuse uploaded parts. Install the updated server for repeatable PDF exports; replace the local helper while preserving its `jobs` folder.

Static exports deduplicate CSS/component resources and can upload the PDF reader worker to iGEM static hosting. The helper verifies the hosted worker's MIME type, CORS and exact bytes. CI reports the archive estimate and applies a configurable budget; actual iGEM upload limits remain server-controlled. See [UPDATE-SERVER.md](UPDATE-SERVER.md) for installation and [STATIC-EXPORT.md](STATIC-EXPORT.md) for the export workflow.

Collaborative wiki editor and self-hosted Node server, with reusable templates and an iGEM static export/upload workflow.

Start with [GITHUB-HANDOFF.md](GITHUB-HANDOFF.md) for development, deployment and transfer instructions.

> [!IMPORTANT]
> **Updating an existing server?** Follow [Server update: start here](UPDATE-SERVER.md#server-update-start-here). Pushing to GitHub does not deploy the server. Back up first, install the application archive, and complete the separate Nginx step.

## Build

Use Node.js 24 and npm (package-lock.json is included).

```sh
npm ci
npm run build
node scripts/test-studio.mjs
```

The build creates `selfhost-dist/`, including the bundled server and browser client. Configure authentication and storage using [SELF-HOST.md](SELF-HOST.md), then run `npm start`. AI is optional; see [CODEX-SERVER.md](CODEX-SERVER.md) and [AI-CSS-SETUP.md](AI-CSS-SETUP.md).

## Guides

- [Visual editor](VISUAL-EDITOR.md)
- [Server installation](SELF-HOST.md)
- [Safe server updates](UPDATE-SERVER.md)
- [Static wiki export](STATIC-EXPORT.md)
- [Development handoff](GITHUB-HANDOFF.md)

Project content, accounts, uploads and secrets are runtime data and are not included in this repository.
