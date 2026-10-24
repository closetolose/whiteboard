#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04 VPS as root or with sudo.
# Usage: bash deploy/setup-vps.sh board.example.ru

set -euo pipefail

DOMAIN="${1:-}"
APP_USER="${APP_USER:-deploy}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/whiteboard}"
REPO_URL="${REPO_URL:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash deploy/setup-vps.sh board.example.ru"
  exit 1
fi
if [[ ${#DOMAIN} -gt 253 || ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || "$DOMAIN" != *.* || "$DOMAIN" == *..* ]]; then
  echo 'Pass a hostname such as board.example.ru (without scheme, path or port)'
  exit 1
fi

echo "==> Install packages"
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
fi

if [[ ! -f /swapfile ]]; then
  echo "==> Create 512MB swap"
  fallocate -l 512M /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Clone or update app"
sudo -u "$APP_USER" bash -lc "
  if [[ -d '$APP_DIR/.git' ]]; then
    cd '$APP_DIR' && git pull
  else
    if [[ -z '$REPO_URL' ]]; then
      echo 'Set REPO_URL to your git remote'
      exit 1
    fi
    git clone '$REPO_URL' '$APP_DIR'
  fi
  cd '$APP_DIR'
  npm ci --include=dev
"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "==> Create .env from template"
  install -o "$APP_USER" -g "$APP_USER" -m 600 "$APP_DIR/deploy/.env.example" "$APP_DIR/.env"
  echo "Edit $APP_DIR/.env: set ADMIN_PASSWORD_HASH and SESSION_SECRET"
  echo "  node scripts/hash-admin-password.mjs"
  exit 0
fi
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run build"

echo "==> nginx"
sed "s/board\\.example\\.ru/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf.example" > /etc/nginx/sites-available/whiteboard
grep -Fq "server_name $DOMAIN;" /etc/nginx/sites-available/whiteboard
ln -sf /etc/nginx/sites-available/whiteboard /etc/nginx/sites-enabled/whiteboard
nginx -t
systemctl reload nginx

echo "==> TLS"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN"

echo "==> pm2 (optional)"
if ! command -v pm2 >/dev/null; then
  npm install -g pm2
fi
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pm2 start deploy/ecosystem.config.cjs && pm2 save"
sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

echo "Done. Open https://$DOMAIN and https://$DOMAIN/admin"
