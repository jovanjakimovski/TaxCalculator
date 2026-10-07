#!/usr/bin/env bash
set -euo pipefail

if ! command -v aws >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "Install AWS CLI and jq before deploying." >&2
  exit 1
fi

: "${TAXCALCULATOR_SECRET_ID:?Set TAXCALCULATOR_SECRET_ID to the Secrets Manager secret name or ARN}"
secret_payload="$(aws secretsmanager get-secret-value \
  --secret-id "$TAXCALCULATOR_SECRET_ID" \
  --query SecretString \
  --output text)"

for secret_name in POSTGRES_PASSWORD LICENSE_DB_PASSWORD LEMON_SQUEEZY_API_KEY LEMON_SQUEEZY_WEBHOOK_SECRET; do
  secret_value="$(jq -er --arg name "$secret_name" '.[$name] | select(type == "string" and length > 0)' <<< "$secret_payload")"
  export "$secret_name=$secret_value"
  unset secret_value
done
unset secret_payload

python3 scripts/check-deployment.py .env

exec docker compose -f docker-compose.aws.yml up -d --build
