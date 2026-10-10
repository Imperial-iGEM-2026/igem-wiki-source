# Ubuntu deployment without Tunnel

After installation, open `/workspace` to choose reGELerate Notebook, reGELerate Swiss Biotech, or Blank canvas. No template is silently assigned on a fresh server. Creating the first project makes it the shared main website; the library lets you choose a different default. See UPDATE-SERVER.md for archival of old starter projects during upgrades.


This release uses your Ubuntu 26.04 server (1 GB RAM, 1 core), Node.js 24, SQLite, local disk media and Nginx. Build on your computer; copy the prebuilt release to the server. No Docker, OpenAI runtime, Cloudflare Tunnel, D1 or R2 is needed.

## How traffic flows

- **Editor:** browser → Cloudflare Access → HTTPS/Nginx → Node on 127.0.0.1:3000.
- **Media:** browser → direct HTTPS/Nginx → Node, with a short-lived, file-specific signed permission.

Only page/API traffic and small permission requests use Cloudflare's proxy. Uploaded files, video playback and media downloads travel directly between your server and the browser. No media bytes are sent through the Cloudflare proxy: the editor's media route returns a redirect after authentication. This follows Cloudflare's documented DNS-only media option: https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/

## 1. Set DNS and Access

Create the following A records pointing to **your server's public IPv4 address**. Add AAAA records only if IPv6 also reaches your configured Nginx and firewall.

| Host | Cloudflare proxy |
|---|---|
| igem2026.gpupods.cloud | Proxied / orange cloud |
| media-igem2026.gpupods.cloud | DNS only / grey cloud |

Keep an Access self-hosted application covering the entire editor hostname, with an Allow policy for the team's individual emails/identity provider. Enable MFA at your identity provider if available. Do not add an Everyone or Bypass policy for the editor. Do not proxy the media hostname or add it to the Access application; its file-specific authorization is implemented by the app.

Set Cloudflare SSL/TLS mode to **Full (strict)**. Turn off caching for editor APIs (the app also sends private/no-store). The environment example already contains your team domain, AUD, editor hostname and approved media hostname. No OpenAI TXT/CNAME records are required.

## 2. Install the app

Extract prion-server-ubuntu.tar.gz on Ubuntu, enter the prion-server folder, then run:

```sh
sudo bash ops/install-ubuntu.sh
```

This installs the official Node 24 LTS binary after checking its published SHA-256 checksum, creates the prion service user, copies the release to /opt/prion, and starts the app on loopback. It does not expose port 3000. Existing /etc/prion.env and /var/lib/prion are preserved.

If upgrading from the earlier package, add this line to /etc/prion.env:

```text
MEDIA_ORIGIN=https://media-igem2026.gpupods.cloud
```

## 3. Obtain automatically renewed HTTPS certificates

Because Access protects the editor hostname, the setup uses a DNS challenge so certificate renewal does not need to bypass login. Create a Cloudflare API token with **Zone → DNS → Edit**, restricted to **gpupods.cloud only**, following https://certbot-dns-cloudflare.readthedocs.io/en/stable/ . Do not use your global API key or paste the token into chat.

Create a root-only file on the server:

```sh
sudo install -d -m 700 /etc/letsencrypt
sudo install -m 600 /dev/null /etc/letsencrypt/cloudflare.ini
sudo nano /etc/letsencrypt/cloudflare.ini
```

Enter this line in the editor, substituting the token:

```ini
dns_cloudflare_api_token = YOUR_ZONE_SCOPED_TOKEN
```

If that credentials file already exists, edit it instead of running the install command that creates it. Then, from the extracted release directory:

```sh
sudo bash ops/setup-https.sh YOUR_EMAIL_ADDRESS
```

The script installs Nginx, Certbot, the Cloudflare DNS plugin and UFW. It obtains a certificate for both names, configures renewal, sets request/connection limits, and allows the editor origin to receive traffic only from Cloudflare networks. A weekly systemd timer updates that network list. It reads the configured SSH port before enabling the firewall, preserves that port, and allows HTTP/HTTPS. It leaves existing UFW rules in place. Check and remove obsolete broad allow rules yourself if this is an existing server. No SSH authentication settings are silently changed.

The scripts are prepared for a fresh Ubuntu server. They were syntax-checked here; DNS, real certificates, Nginx and UFW must be verified on your server. The installer does not configure your Cloudflare dashboard automatically.

## 4. Import your current saved content

The provided prion-migration-snapshot.json contains the saved content captured from your previous site. Transfer it privately to a location readable by the prion user. Import only into an empty database, with the service stopped:

```sh
sudo systemctl stop prion
sudo -u prion env DATA_DIR=/var/lib/prion /usr/local/bin/node /opt/prion/server/import-snapshot.mjs /path/to/prion-migration-snapshot.json
sudo systemctl start prion
```

Import refuses to overwrite existing saved fields. Future edits record individual Access identities. Snapshots include hidden drafts; do not publish them. New snapshots can be downloaded from Export wiki in the editor.

## Security behavior and checks

- The editor verifies each Access JWT's signature, issuer, AUD, expiry and individual identity. Spoofing an email/header is insufficient.
- Direct media exposes only /file/ and /upload/. It cannot serve the editor, database or arbitrary server files. Missing/tampered/expired permissions are rejected.
- Download links expire after 10 minutes. Anyone possessing a still-valid link can use it until expiry; do not share it. Reload the editor to obtain a new link if a long playback/seek needs renewal. Revoking Access does not invalidate an already issued media link before its expiry.
- Upload permissions expire after 2 minutes, authorize one destination/size/type, and are single-use even across a server restart. The upload must begin before expiry and finish within the server's request timeout. Uploads require the editor Origin; CORS allows only the editor. Files are streamed to disk with at most two concurrent uploads. MP4/WebM/GLB have no fixed size cap on the direct media route; other formats remain limited to 25 MiB. Available disk space is checked at authorisation and upload start, reserving 256 MiB by default. Uploads have a 30-minute default timeout. See UPDATE-SERVER.md for Nginx and optional capacity settings.
- Nginx access logs omit query strings containing signed permissions. Treat remaining server logs and backups as private. A signing key is generated as /var/lib/prion/media-signing.key with owner-only permissions; keep it with your database/media backup.
- Node runs unprivileged with a 256 MB JS heap limit and a 448 MB process memory cap. Nginx limits direct media to eight active requests per client IP and 32 overall. Users behind one shared NAT share the per-IP limits; adjust carefully if necessary.

After setup, verify all of these:

```sh
sudo nginx -t
sudo systemctl status prion nginx
sudo ufw status verbose
sudo certbot renew --dry-run
sudo systemctl list-timers certbot.timer prion-cloudflare-ips.timer
```

In a private browser window, confirm the editor requires Access login. A bare media URL without a ticket must fail. As a team member, upload and play media, seek within a video/audio file, preview a PDF/GLB, and export a snapshot. Verify another team account can edit and conflicting saves preserve the draft. Confirm port 3000 is not publicly reachable.

The direct media hostname necessarily reveals your origin IP and uses your server's bandwidth. Application authentication, TLS and rate limits do not stop an attack that saturates your network connection. Use hosting-provider network/DDoS protection and monitor disk/network use. This is not a claim of unlimited capacity or a security audit certification.

## Backups, maintenance and updates

Keep Ubuntu security updates and Node 24 security releases current. The installer preserves an existing Node 24 binary, so update that runtime deliberately when a new security release is issued. Back up /etc/prion.env and the entire /var/lib/prion directory while the service is stopped, then restart it. Keep those backups outside the public website. Certificate/DNS credentials belong only in root-protected storage.

To deploy a new release, stop prion, replace /opt/prion/client, /opt/prion/server and /opt/prion/ops, then restart. Preserve /etc/prion.env, /etc/letsencrypt and /var/lib/prion. Review changes to Nginx and rerun setup only when needed. Logs: sudo journalctl -u prion -n 100. Normal traffic and security controls were tested locally; the 1 GB server has not been load-tested.

Follow STATIC-EXPORT.md to compile the separate iGEM publication on your computer. It has no server/login dependency.

## Optional Codex assistant

Follow CODEX-SERVER.md to install a separate, constrained Codex CLI worker for page content, layer and styling proposals with preview before applying. Normal editing and the static wiki work without it. Its memory budget and target-server verification requirements are documented there.
