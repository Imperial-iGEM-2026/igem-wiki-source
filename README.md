# Website Studio

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
