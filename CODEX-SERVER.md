Image authoring guidance: both the built-in assistant and MCP Standard/Developer instructions require newly inserted images to use existing Studio media/template assets or uploaded original files. Agents should not hotlink third-party image URLs in image elements, custom HTML, CSS or photo arrays. If the original is unavailable, ask the user to upload it. Do not invent media bytes or create proxies. Existing working media is preserved unless a change is requested, and Video Universe recording embeds remain supported. Reconnect MCP after a server update to load the revised instructions.

# Codex-powered page assistant on Ubuntu

This optional worker extends Assistant from CSS proposals to page content, layers, links and responsive styling. It runs Codex CLI on your server and uses OpenAI for inference. The browser has no API key. The existing Cloudflare Access login still protects generation and saves; no Tunnel is required.

## Install after updating the website

First follow UPDATE-SERVER.md, including its Nginx update. Run:

```sh
sudo bash /opt/prion/ops/install-codex.sh
sudoedit /etc/prion-codex.env
```

Inside the private environment file, set `OPENAI_API_KEY=YOUR_FRESH_KEY`. Replace the example inside the server editor, not a shell command or chat message. Revoke the key previously pasted into chat. It is not included in this release.

The installer downloads the [official standalone Codex CLI](https://learn.chatgpt.com/docs/codex/cli), installs it under a separate `prion-codex` account and verifies `/var/lib/prion-codex/.local/bin/codex` exists. It stops if installation fails. It installs a systemd worker; no npm install or frontend compilation is needed on the server.

Edit the existing site configuration, preserving its Access and media settings:

```sh
sudoedit /etc/prion.env
```

Add `CODEX_SOCKET=/run/prion-codex/worker.sock`. Then:

```sh
sudo chown root:root /etc/prion-codex.env /etc/prion.env
sudo chmod 600 /etc/prion-codex.env /etc/prion.env
sudo systemctl restart prion-codex prion
sudo systemctl status prion-codex prion --no-pager
```

When switching entirely to Codex, remove the old `OPENAI_API_KEY` entry from `/etc/prion.env`; the worker reads its own file. Keep a fresh key only in `/etc/prion-codex.env`. Both files are read by systemd before privileges are dropped. Do not put them in a public repository, snapshot or static export.

## Use and verify

Refresh the editor, select a layer or element and open Assistant. Its model control shows **Codex · Luna**. Clear the selection for changes to the whole page. Request a small change, review the explanation, click **Preview proposal**, then **Apply and save page**. Applying is disabled until preview is active. Generation and preview do not write to the shared database. Applying saves text and layout in one transaction; a version conflict requires a fresh proposal. Applying also saves the current layout draft carried into the request.

The model is fixed to `gpt-6-luna`; the worker offers Low, Medium and High, defaulting to Medium. Your OpenAI account must support that model and have quota. An enabled status means the executable and key are configured; it does not prove model access. Installation and a real request must be verified on your Ubuntu server.

The [non-interactive Codex interface](https://learn.chatgpt.com/docs/non-interactive-mode) runs with structured output, ephemeral sessions and a read-only sandbox. Shell execution and web search are disabled. A job receives the current page layout, selected editable text, page destinations, prompt and recent chat. Media bytes and Access credentials are not sent. Generated media URLs must already exist in the page context. Proposals preserve template sections and locked layer properties; page CSS remains restricted to the page canvas. Codex cannot deploy, install packages, change the website source or administer your server through this integration.

## Capacity and troubleshooting

Only one Codex job runs at a time. The worker has a 384 MiB systemd memory ceiling, a 70% CPU quota and an 85-second job timeout. The website retains its 448 MiB process ceiling. These are upper limits, not measured requirements or a guarantee that Codex fits alongside everything else on a 1 GB machine. Keep builds and static compilation on your computer. Monitor a real request with `systemctl status prion-codex` and `free -h`; if the worker runs out of memory, use the existing CSS-only API backend or a larger server rather than blindly raising its cap.

There are five requests per user per minute and a default shared allowance of 100 per UTC day. `AI_DAILY_REQUEST_LIMIT` in `/etc/prion.env` controls that daily allowance (1–1000). Cancelled and failed attempts count and may incur API usage. These are request limits, not a guaranteed spending cap.

```sh
sudo journalctl -u prion-codex -u prion -n 60 --no-pager
sudo systemctl show prion-codex -p MemoryCurrent -p MemoryPeak -p Result
```

Errors returned to the browser are sanitised. The worker does not expose raw CLI stderr, credentials or job context in HTTP responses. Temporary job directories are removed after each completed attempt. After an abrupt worker crash, private stale directories may remain under `/var/lib/prion-codex/jobs`; review these during maintenance. Keep logs and backups private.

To return to the original CSS-only API assistant, remove `CODEX_SOCKET` from `/etc/prion.env`, configure its server-side API key as described in AI-CSS-SETUP.md, stop/disable `prion-codex`, and restart `prion`. Normal page editing does not require either AI backend.

Local automated tests used a simulated Codex worker to verify authorisation, proposal validation, preview rendering, atomic saves and conflicts. No live Codex API request, browser interaction test, Linux service execution or target-server load test was performed.

## Immediate CLI startup failure fixed

The earlier worker assigned a per-job `CODEX_HOME` without creating it. An explicitly configured directory must already exist according to the [official Codex environment-variable documentation](https://learn.chatgpt.com/docs/config-file/environment-variables). This release creates that private directory before spawning the CLI.

The worker now reports `running` and `lastFailure` in its local status response. Failure details contain only fixed diagnostic categories, exit code, signal and time; raw stderr, prompts and credentials are never logged or returned. `enabled: true` still means installation/key configuration, not a successful model request. Run the diagnostic immediately after one failure to see the category. The last failure clears after a successful proposal or service restart.

A local regression test exercises the actual worker HTTP handler and a real subprocess standing in for Codex, including the directory precondition, structured output, failure handling, private cleanup and recovery. The target Ubuntu service and real Codex/API execution must still be verified on your server.

## Chat and live activity

The Assistant accepts normal conversation as well as editing requests. Chat replies cannot carry page changes into the preview/apply path. For explicit edits it returns a separate proposal, which must still be previewed and approved.

The worker uses [Codex JSON event output](https://learn.chatgpt.com/docs/non-interactive-mode) and reads the final structured answer from a separate output file. Safe activity labels stream through the existing authenticated AI endpoint. “Thinking” is an activity indicator, not a transcript of private reasoning. Tool rows reflect reported calls only; this integration does not enable shell or web tools. The browser animates the waiting indicator and final reply appearance, and honours reduced-motion preferences. Final reply text appears when its structured response is complete; token-by-token text streaming is not implemented.

Use the full server package to update this feature together with its frontend. The previous directory-creation fix is included.

## Selected-element styling

A nested element uses a CSS-only proposal contract; the server preserves the containing layout and validates that other selectors are unchanged. Font-size/colour changes belong in scoped CSS. Selecting a complete layer or the whole page enables the corresponding layout proposal format. JSON object property order no longer causes false layout/lock conflicts. Selected text fields can still be proposed when supplied in the selection context. Preview and version-checked approval remain required.


## Reference images

This release passes uploaded reference images to Codex using the official CLI [`--image` input](https://learn.chatgpt.com/docs/developer-commands?surface=cli). The authenticated API accepts only uploaded media IDs and verifies the image format, count and size. It reads at most 10 MiB of images per job. No browser-supplied filesystem paths or remote URLs are fetched. The worker receives bounded image bytes over its private Unix socket and writes numbered reference files into the job directory, which is removed when the job completes or is cancelled. API keys remain server-only. Uploaded originals remain in private team media. Attachments are not automatically published; chat history remains browser-memory only.

Update both the website and worker from the full release archive; the worker now also imports `server/ai-images.mjs`. Do not replace `codex-worker.mjs` alone. No additional package installation is needed. Existing Access, service isolation and one-job concurrency limits remain enforced.
