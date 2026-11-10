#!/usr/bin/env bash
set -euo pipefail

app_dir="${TAXCALCULATOR_DIR:-/opt/taxcalculator}"
compose_file="$app_dir/docker-compose.lightsail.yml"
release_file="$app_dir/release.env"
state_file="$app_dir/.deployed-sha"
repo="jovanjakimovski/TaxCalculator"

cd "$app_dir"
latest_sha="$(curl --fail --silent --show-error \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/$repo/commits/main" | jq -er '.sha')"
[[ "$latest_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'GitHub returned an invalid main commit SHA.' >&2; exit 1; }

current_sha="$(cat "$state_file" 2>/dev/null || true)"
[[ "$latest_sha" != "$current_sha" ]] || exit 0

previous_tag="$(sed -n 's/^RELEASE_TAG=//p' "$release_file" 2>/dev/null | tail -n 1)"
printf 'RELEASE_TAG=%s\n' "$latest_sha" > "$release_file.next"
mv "$release_file.next" "$release_file"

compose=(docker compose --env-file .env --env-file release.env -f "$compose_file")
if ! "${compose[@]}" pull; then
  echo "Images for $latest_sha are not published yet; keeping the current release." >&2
  if [[ -n "$previous_tag" ]]; then
    printf 'RELEASE_TAG=%s\n' "$previous_tag" > "$release_file"
  fi
  exit 1
fi

"${compose[@]}" up -d --remove-orphans

healthy=false
for attempt in {1..60}; do
  if curl --fail --silent --show-error \
    --resolve "${ORIGIN_HOSTNAME}:443:127.0.0.1" \
    -H "X-TaxCalculator-Origin: ${CLOUDFRONT_ORIGIN_TOKEN}" \
    "https://${ORIGIN_HOSTNAME}/api/tax/health" >/dev/null \
    && curl --fail --silent --show-error \
    --resolve "${ORIGIN_HOSTNAME}:443:127.0.0.1" \
    -H "X-TaxCalculator-Origin: ${CLOUDFRONT_ORIGIN_TOKEN}" \
    "https://${ORIGIN_HOSTNAME}/api/license/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done

if [[ "$healthy" != true ]]; then
  echo "Health checks failed for $latest_sha; restoring the prior release." >&2
  if [[ -n "$previous_tag" ]]; then
    printf 'RELEASE_TAG=%s\n' "$previous_tag" > "$release_file"
    "${compose[@]}" pull || true
    "${compose[@]}" up -d --remove-orphans || true
  fi
  exit 1
fi

printf '%s\n' "$latest_sha" > "$state_file"
echo "Deployed $latest_sha successfully."
