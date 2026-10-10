#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run this patch with sudo bash'; exit 1; }
patch_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
worker_source="$patch_dir/server/codex-worker.mjs"
if [ ! -f "$worker_source" ]; then worker_source="$patch_dir/../server/codex-worker.mjs"; fi
test -f "$worker_source"
test -f /opt/prion/server/codex-worker.mjs
/usr/local/bin/node --check "$worker_source"
backup_dir=$(mktemp -d /root/prion-codex-backup.XXXXXX)
cp -a /opt/prion/server/codex-worker.mjs "$backup_dir/codex-worker.mjs"
rollback() {
  install -m 644 "$backup_dir/codex-worker.mjs" /opt/prion/server/codex-worker.mjs
  systemctl restart prion-codex || true
  echo "Patch failed; restored previous worker from $backup_dir" >&2
}
trap rollback ERR
systemctl stop prion-codex
install -m 644 "$worker_source" /opt/prion/server/codex-worker.mjs
systemctl start prion-codex
systemctl is-active --quiet prion-codex
trap - ERR
echo "Worker patch installed. Previous code saved in $backup_dir"
echo 'Send one AI message. If it fails, run: sudo bash /opt/prion/ops/diagnose-ai.sh'
systemctl status prion-codex --no-pager
