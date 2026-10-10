#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0
stage="$(mktemp -d)"
curl --fail --silent --show-error https://www.cloudflare.com/ips-v4 -o "$stage/v4"
curl --fail --silent --show-error https://www.cloudflare.com/ips-v6 -o "$stage/v6"
python3 - "$stage" <<'PY'
import ipaddress, pathlib, sys
p=pathlib.Path(sys.argv[1]); lines=[]
for name,version in [('v4',4),('v6',6)]:
    nets=[ipaddress.ip_network(s.strip()) for s in (p/name).read_text().splitlines() if s.strip()]
    if not nets or any(n.version!=version or n.prefixlen==0 for n in nets): raise SystemExit('Invalid Cloudflare address list')
    lines.extend('allow '+str(n)+';' for n in nets)
(p/'allow.conf').write_text('\n'.join(lines)+'\n')
PY
target=/etc/nginx/snippets/prion-cloudflare-allow.conf
install -d /etc/nginx/snippets
if [ -f "$target" ]; then cp "$target" "$stage/previous.conf"; fi
install -m 644 "$stage/allow.conf" "$target"
if ! nginx -t; then
  if [ -f "$stage/previous.conf" ]; then install -m 644 "$stage/previous.conf" "$target"; fi
  exit 1
fi
if systemctl is-active --quiet nginx; then systemctl reload nginx; fi
echo "Updated Cloudflare network allowlist; validation files retained in $stage"
