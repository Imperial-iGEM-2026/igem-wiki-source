#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo 'Run with sudo bash ops/install-ubuntu.sh'; exit 1; fi
release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test -f "$release_dir/server/start.mjs"
test -f "$release_dir/client/index.html"
case "$(uname -m)" in x86_64) node_arch=x64;; aarch64|arm64) node_arch=arm64;; *) echo 'Supported architectures: x86_64 and arm64'; exit 1;; esac
if ! /usr/local/bin/node --version 2>/dev/null | grep -q '^v24\.'; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl xz-utils
  node_stage="$(mktemp -d)"
  # Download only official Node 24 LTS builds; verify the archive before extraction.
  curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$node_stage/SHASUMS256.txt"
  node_archive="$(awk -v arch="$node_arch" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' "$node_stage/SHASUMS256.txt")"
  if [[ ! "$node_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]]; then echo 'Could not identify the official Node 24 archive'; exit 1; fi
  curl --fail --silent --show-error --location "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$node_stage/$node_archive"
  (cd "$node_stage" && awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | sha256sum --check --strict)
  tar -xJf "$node_stage/$node_archive" -C "$node_stage"
  install -m 755 "$node_stage/${node_archive%.tar.xz}/bin/node" /usr/local/bin/node
  echo "Node download retained in $node_stage"
fi
# Validate the bundled native decoder for this CPU before stopping the service.
/usr/local/bin/node "$release_dir/server/image-native.mjs"
id prion >/dev/null 2>&1 || useradd --system --home /var/lib/prion --shell /usr/sbin/nologin prion
install -d -o prion -g prion -m 700 /var/lib/prion
systemctl stop prion 2>/dev/null || true
install -d -m 755 /opt/prion
if [ "$release_dir" != /opt/prion ]; then
  cp -a "$release_dir/client" "$release_dir/server" "$release_dir/ops" /opt/prion/
fi
if [ ! -f /etc/prion.env ]; then install -m 600 "$release_dir/ops/prion.env.example" /etc/prion.env; fi
install -m 644 "$release_dir/ops/prion.service" /etc/systemd/system/prion.service
if [ -f /etc/systemd/system/prion-codex.service ]; then
  install -m 644 "$release_dir/ops/prion-codex.service" /etc/systemd/system/prion-codex.service
fi
systemctl daemon-reload
if systemctl is-active --quiet prion-codex; then systemctl restart prion-codex; fi
systemctl enable --now prion
echo 'Installed on loopback only. Next: follow SELF-HOST.md to configure DNS, HTTPS with nginx, Cloudflare Access, and direct signed media. No Tunnel is used.'
echo 'Existing configuration and /var/lib/prion data were preserved.'
systemctl --no-pager status prion
