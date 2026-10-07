#!/usr/bin/env bash
# Runs through SSM as root. No source builds and no provider secrets on EC2.
set -euo pipefail
release_id="${1:?Missing release ID}"
[[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$ ]] || exit 2
root=/opt/taxcalculator-dev
release_dir="$root/releases/$release_id"
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is already running.' >&2; exit 1; }
for ((attempt=0; attempt<120; attempt++)); do
  [[ -f "$root/bootstrap-ready" ]] && break
  sleep 2
done
[[ -f "$root/bootstrap-ready" ]] || { echo 'EC2 bootstrap did not finish. Inspect /var/log/cloud-init-output.log.' >&2; exit 1; }
if [[ ! -f "$root/.env" ]]; then
  region="${2:?Missing region}"
  token="${3:?Missing origin guard}"
  [[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ && "$token" =~ ^[a-f0-9-]{36}$ ]] || exit 2
  umask 077
  printf 'DEV_DB_PASSWORD=%s\nDEV_BIND_ADDRESS=0.0.0.0\nDEV_PORT=80\nDEV_ORIGIN_TOKEN=%s\nAWS_DEFAULT_REGION=%s\n' "$(openssl rand -hex 32)" "$token" "$region" > "$root/.env"
fi
set -a
source "$root/.env"
set +a
test "$(jq -r .profile "$release_dir/manifest.json")" = dev
export DEV_BACKEND_IMAGE="$(jq -er .backend "$release_dir/manifest.json")"
export DEV_FRONTEND_IMAGE="$(jq -er .frontend "$release_dir/manifest.json")"
registry="${DEV_BACKEND_IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$registry"
compose() { docker compose -p taxcalculator-dev --env-file "$root/.env" -f "$release_dir/compose.yml" "$@"; }
previous=""
[[ ! -f "$root/current" ]] || previous="$(cat "$root/current")"
compose pull
restore_previous() {
  if [[ -n "$previous" && "$previous" != "$release_id" ]]; then
    export DEV_BACKEND_IMAGE="$(jq -er .backend "$root/releases/$previous/manifest.json")"
    export DEV_FRONTEND_IMAGE="$(jq -er .frontend "$root/releases/$previous/manifest.json")"
    docker compose -p taxcalculator-dev --env-file "$root/.env" -f "$root/releases/$previous/compose.yml" up -d --no-build --force-recreate backend frontend
  fi
}
# Recreate nginx even if its image is unchanged so backend DNS is resolved again.
if ! compose up -d --no-build --force-recreate backend frontend; then restore_previous; exit 1; fi
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if curl --fail --silent --max-time 3 -H "X-TaxCalculator-Origin: $DEV_ORIGIN_TOKEN" http://127.0.0.1/api/tax/health >/dev/null; then ready=true; break; fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  compose logs --tail 80 backend frontend
  restore_previous
  echo 'Release failed its health check; the previous release was restored when available.' >&2
  exit 1
fi
if [[ -n "$previous" && "$previous" != "$release_id" ]]; then printf '%s\n' "$previous" > "$root/previous"; fi
printf '%s\n' "$release_id" > "$root/current.tmp"
mv "$root/current.tmp" "$root/current"
compose ps
echo "Dev release $release_id is healthy."
