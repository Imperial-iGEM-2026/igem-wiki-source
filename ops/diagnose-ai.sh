#!/usr/bin/env bash
# Read-only diagnostics. Does not print environment files, API keys or request bodies.
set -u
if [ "$(id -u)" -ne 0 ]; then echo 'Run: sudo bash /opt/prion/ops/diagnose-ai.sh'; exit 1; fi
printf '\nService state\n'
systemctl is-active prion prion-codex || true
systemctl show prion prion-codex -p Id -p Result -p MemoryCurrent -p MemoryPeak --no-pager
printf '\nLocal API routing (401 is expected without an Access token)\n'
curl --silent --show-error --max-time 3 --output /dev/null --write-out 'HTTP %{http_code}, content-type %{content_type}\n' --header 'Host: igem2026.gpupods.cloud' http://127.0.0.1:3000/api/ai/status || true
printf '\nCodex worker configuration status\n'
if [ -S /run/prion-codex/worker.sock ]; then
  runuser -u prion -- curl --silent --show-error --max-time 3 --unix-socket /run/prion-codex/worker.sock http://localhost/status || true
  printf '\n'
else
  echo 'No Codex socket. This is normal when using the CSS-only API backend.'
fi
printf '\nRecent AI requests reaching Nginx (time, method, path, status only)\n'
if [ -f /var/log/nginx/prion-editor-access.log ]; then
  awk '$5 ~ /^\/api\/ai\// { print $2, $4, $5, "HTTP", $7 }' /var/log/nginx/prion-editor-access.log | tail -n 12
else
  echo 'No standard prion editor access log found.'
fi
printf '\nIf the failed request is absent here, inspect Cloudflare Access/security events or confirm the browser uses this server. Do not disable Access to test.\n'
