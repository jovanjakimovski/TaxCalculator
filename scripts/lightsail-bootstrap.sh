#!/usr/bin/env bash
set -euo pipefail

repo_url="${1:-https://github.com/jovanjakimovski/TaxCalculator.git}"
repo_ref="${2:-main}"
app_dir=/opt/taxcalculator

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 git curl jq openssl
systemctl enable --now docker

if [[ ! -d "$app_dir/.git" ]]; then
  git clone --depth 1 --branch "$repo_ref" "$repo_url" "$app_dir"
else
  git -C "$app_dir" fetch --depth 1 origin "$repo_ref"
  git -C "$app_dir" checkout --force FETCH_HEAD
fi

if [[ ! -e /swapfile ]]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
swapon /swapfile || true
sysctl -w vm.swappiness=10
printf 'vm.swappiness=10\n' > /etc/sysctl.d/90-taxcalculator.conf

install -m 0644 "$app_dir/infra/taxcalculator-lightsail-update.service" /etc/systemd/system/
install -m 0644 "$app_dir/infra/taxcalculator-lightsail-update.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now taxcalculator-lightsail-update.timer

if [[ ! -f "$app_dir/.env" ]]; then
  install -m 0600 "$app_dir/.env.lightsail.example" "$app_dir/.env"
  echo "Created $app_dir/.env from the example. Configure it before the first release check." >&2
fi

install -d -m 0700 "$app_dir/backups"
echo 'Lightsail host bootstrap complete.'
