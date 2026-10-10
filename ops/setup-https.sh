#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 1 ]; then echo 'Usage: sudo bash ops/setup-https.sh YOUR_EMAIL'; exit 1; fi
test -f /etc/prion.env
if ! grep -qx 'MEDIA_ORIGIN=https://media-igem2026.gpupods.cloud' /etc/prion.env; then echo 'Set MEDIA_ORIGIN=https://media-igem2026.gpupods.cloud in /etc/prion.env first.'; exit 1; fi
if [ ! -s /etc/letsencrypt/cloudflare.ini ]; then
  echo 'First create /etc/letsencrypt/cloudflare.ini with dns_cloudflare_api_token = YOUR_ZONE_SCOPED_DNS_TOKEN. See SELF-HOST.md.'
  exit 1
fi
chmod 600 /etc/letsencrypt/cloudflare.ini
apt-get update
apt-get install -y --no-install-recommends nginx certbot python3-certbot-dns-cloudflare ufw curl ca-certificates
certbot certonly --non-interactive --agree-tos --email "$1" --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --dns-cloudflare-propagation-seconds 60 --cert-name prion -d igem2026.gpupods.cloud -d media-igem2026.gpupods.cloud
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' 'nginx -t && systemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/prion-nginx.sh
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/prion-nginx.sh
bash /opt/prion/ops/update-cloudflare-ips.sh
install -m 644 /opt/prion/ops/nginx-prion.conf /etc/nginx/conf.d/prion.conf
nginx -t
systemctl enable --now nginx certbot.timer
systemctl reload nginx
systemctl restart prion
install -m 644 /opt/prion/ops/prion-cloudflare-ips.service /etc/systemd/system/prion-cloudflare-ips.service
install -m 644 /opt/prion/ops/prion-cloudflare-ips.timer /etc/systemd/system/prion-cloudflare-ips.timer
systemctl daemon-reload
systemctl enable --now prion-cloudflare-ips.timer
# Include sshd configuration, active listeners, socket activation and the current
# connection when available. Ubuntu can use ssh.socket with a different port.
ssh_ports="$(
  {
    /usr/sbin/sshd -T | awk '$1 == "port" {print $2}'
    ss -H -ltnp | awk '/"sshd"/ {n=split($4,a,":"); print a[n]}'
    systemctl show ssh.socket -p Listen --value 2>/dev/null | python3 -c 'import re,sys; print("\n".join(re.findall(r"(?:^|\s|:)([0-9]+)\s+\(Stream\)",sys.stdin.read())))' || true
    if [ -n "${SSH_CONNECTION:-}" ]; then printf '%s\n' "$SSH_CONNECTION" | awk '{print $4}'; fi
  } | sed '/^$/d' | sort -nu
)"
if [ -z "$ssh_ports" ]; then echo 'Could not determine SSH port. Firewall unchanged; configure it manually.'; exit 1; fi
for ssh_port in $ssh_ports; do
  if [[ ! "$ssh_port" =~ ^[0-9]+$ ]] || [ "$ssh_port" -lt 1 ] || [ "$ssh_port" -gt 65535 ]; then echo 'Invalid SSH port; firewall unchanged.'; exit 1; fi
done
for ssh_port in $ssh_ports; do ufw allow "$ssh_port/tcp" comment 'Preserve configured SSH access'; done
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
echo 'HTTPS and firewall configured. Verify editor login, media authorization, and certificate renewal using SELF-HOST.md.'
