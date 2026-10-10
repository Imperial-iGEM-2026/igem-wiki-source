#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run with sudo bash ops/install-codex.sh'; exit 1; }
test -f /opt/prion/server/codex-worker.mjs
id prion >/dev/null
id prion-codex >/dev/null 2>&1 || useradd --system --home /var/lib/prion-codex --gid prion --shell /usr/sbin/nologin prion-codex
install -d -o prion-codex -g prion -m 700 /var/lib/prion-codex
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates
# Use OpenAI's standalone installer under the isolated worker account.
installer=$(mktemp)
curl --fail --silent --show-error --location https://chatgpt.com/codex/install.sh -o "$installer"
chmod 644 "$installer"
runuser -u prion-codex -- env HOME=/var/lib/prion-codex sh "$installer"
test -x /var/lib/prion-codex/.local/bin/codex
/var/lib/prion-codex/.local/bin/codex --version
if [ ! -f /etc/prion-codex.env ]; then
  install -m 600 /dev/null /etc/prion-codex.env
  printf '%s\n' '# Add OPENAI_API_KEY= with a fresh server-only key here.' > /etc/prion-codex.env
fi
install -m 644 /opt/prion/ops/prion-codex.service /etc/systemd/system/prion-codex.service
systemctl daemon-reload
systemctl enable --now prion-codex
echo 'Next: sudoedit /etc/prion-codex.env and configure its OPENAI_API_KEY.'
echo 'Add CODEX_SOCKET=/run/prion-codex/worker.sock to /etc/prion.env.'
echo 'Then restart prion-codex and prion. See CODEX-SERVER.md for verification.'
