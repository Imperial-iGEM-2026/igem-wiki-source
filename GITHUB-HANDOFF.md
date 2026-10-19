# Development handoff — 19 October 2026

## What is included

This is the current full development source, not the small website-only iGEM export. It includes:

- `app/`, `components/`, `hooks/`, `lib/`: editor, preview and reusable interface components.
- `server/`, `db/`, `drizzle/`: server, storage and database code.
- `public/`, `template-sources/`: bundled media, fonts, original designs and template artwork.
- `scripts/`: builds, template generation, static export and regression tests.
- `upload-helper/`: standalone automated publishing helper, with its own package files.
- `ops/`: Ubuntu services, Nginx examples, recovery and maintenance tools.
- `publication/`: example publication configuration and third-party/export license notices.
- npm lockfile, TypeScript/Vite configuration, documentation and a GitHub Actions build workflow.

Recent functionality includes template preview/apply/rollback, compact project actions, independent homepage and sponsor sections, image replacement controls, LaTeX blocks and inline math, and references with clickable citations and highlighting.

## Move to GitHub

Extract the ZIP. Open the `website-studio` directory; its `package.json` should be at your repository root. Create an empty GitHub repository, then run:

```sh
git init
git add .
git commit -m "Import Website Studio source"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

The archive contains the current files, not previous Git commit history. It does not create a repository or push anything automatically. Start private if the included team assets/designs should not yet be public.

## Build and check

Install Node.js 24 and npm, then:

```sh
npm ci
npm run build
node scripts/test-studio.mjs
```

`npm run build` produces `selfhost-dist/`. Build locally or in CI rather than on a low-memory server. GitHub Actions runs these same build/check commands on pushes and pull requests, and attaches a `server-build` artifact; it does not deploy or publish automatically.

For UI development, `npm run dev` starts the legacy Vite/Vinext development adapter. Use the built self-hosted server when checking real authentication, uploads, collaboration or AI. See SELF-HOST.md for its required environment configuration; `npm start` launches it after building. The upload helper has a separate `upload-helper/package.json`; see its included README and run its own dependency installation when developing that application.

Some historical test scripts target retired fixtures. `scripts/test-studio.mjs` is the current editor/render regression suite. Test output goes in ignored `work/`. Avoid including generated test fixtures in a whole-repository TypeScript check.

## Runtime data is separate

The ZIP deliberately excludes live databases, uploaded user files, project snapshots, credentials, browser sign-in sessions, node_modules, temporary work directories, generated builds and machine-specific hosting metadata.

Moving source to GitHub does **not** move your saved projects. Before migrating servers, take a consistent backup of the actual running server's DATA_DIR (database and uploaded media) using the backup instructions in UPDATE-SERVER.md. Transfer `/etc/prion.env` separately through a private channel. Never commit it. Stop writes or use a SQLite-consistent backup; do not copy only a live `.sqlite` file while ignoring its WAL. Restore the runtime data to the new server before starting the application. The existing server remains unchanged by this ZIP.

## Configuration and deployment

`ops/prion.env.example` contains placeholders only in this archive. Replace them with your actual Cloudflare Access identity settings, origins, storage location and optional AI configuration. Other deployment examples and guides may contain the existing team's hostnames and paths; review those for your destination. Do not run recovery scripts as an ordinary deployment step.

Keep secrets in the server environment, never in client code or Git. Follow SELF-HOST.md for installation and UPDATE-SERVER.md for updates. GitHub Actions only builds; production deployment remains explicit.

## GitHub source versus iGEM publication

This GitHub repository is the editor application's development repository. Your official iGEM team GitLab repository remains a separate publication destination. Use the editor's export/upload flow and STATIC-EXPORT.md to generate its website source. Do not upload this full editor repository to the team wiki repository.

Exported wiki content uses the included CC BY 4.0 publication license. That does not assign a new license to all application code or third-party assets. Preserve third-party notices, including the KaTeX notice and bundled font licenses.

## Verify the archive

`FILE-SHA256.json` lists the SHA-256 hash of every packaged file except itself. An external `.sha256` file verifies the ZIP. This handoff was assembled from the current working source, including uncommitted changes.
