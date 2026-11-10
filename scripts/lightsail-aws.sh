#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
region="${AWS_REGION:-eu-central-1}"
stack_name="${LIGHTSAIL_STACK_NAME:-taxcalculator-prod}"
git_ref="${LIGHTSAIL_GIT_REF:-lightsail-production}"
token_file="${LIGHTSAIL_TOKEN_FILE:-$HOME/.taxcalculator-cloudfront-origin-token}"
action="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi
origin=""
app_domain=""
certificate_arn=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) origin="${2:?Missing origin DNS name}"; shift 2 ;;
    --app) app_domain="${2:?Missing app hostname}"; shift 2 ;;
    --certificate-arn) certificate_arn="${2:?Missing ACM certificate ARN}"; shift 2 ;;
    --region) region="${2:?Missing AWS region}"; shift 2 ;;
    --stack) stack_name="${2:?Missing CloudFormation stack name}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ "$action" == help || "$action" == --help ]]; then
  cat <<'HELP'
Usage:
  bash scripts/lightsail-aws.sh create
  bash scripts/lightsail-aws.sh publish --origin origin.example.com
  bash scripts/lightsail-aws.sh publish --origin origin.example.com --app app.example.com --certificate-arn arn:aws:acm:us-east-1:...:certificate/...

Run from an authenticated AWS CLI session or AWS CloudShell. Region defaults to eu-central-1.
The script writes the CloudFront origin token to a user-only file so it can be copied to
/opt/taxcalculator/.env on the Lightsail host. Do not commit or share that token publicly.
HELP
  exit 0
fi

[[ "$region" == eu-central-1 ]] || { echo "The current template is configured for eu-central-1; use that region or update the template first." >&2; exit 2; }
[[ "$stack_name" =~ ^[a-z][a-z0-9-]{0,60}$ ]] || { echo "Invalid CloudFormation stack name." >&2; exit 2; }
command -v aws >/dev/null || { echo "Install AWS CLI or run this from AWS CloudShell." >&2; exit 1; }
aws sts get-caller-identity --query Arn --output text >/dev/null

if [[ ! -s "$token_file" ]]; then
  umask 077
  openssl rand -hex 32 > "$token_file"
fi
origin_token="$(tr -d '\r\n' < "$token_file")"
[[ "$origin_token" =~ ^[A-Fa-f0-9]{64,128}$ ]] || { echo "Token file must contain 32-64 bytes of hex." >&2; exit 1; }

case "$action" in
  create)
    aws cloudformation deploy \
      --template-file infra/lightsail-production.yaml \
      --stack-name "$stack_name" \
      --region "$region" \
      --no-fail-on-empty-changeset \
      --parameter-overrides \
        "InstanceName=taxcalculator-prod" \
        "RepositoryUrl=https://github.com/jovanjakimovski/TaxCalculator.git" \
        "GitRef=$git_ref" \
        "OriginDomainName=" \
        "AppDomainName=" \
        "CloudFrontCertificateArn=" \
        "CloudFrontOriginToken=$origin_token"
    ;;
  publish)
    [[ "$origin" =~ ^[a-z0-9.-]+$ ]] || { echo "Provide --origin with a valid lowercase DNS hostname." >&2; exit 2; }
    if [[ -n "$app_domain" || -n "$certificate_arn" ]]; then
      [[ "$app_domain" =~ ^[a-z0-9.-]+$ ]] || { echo "Provide --app with a valid lowercase DNS hostname." >&2; exit 2; }
      [[ "$certificate_arn" =~ ^arn:aws(-us-gov|-cn)?:acm:us-east-1:[0-9]{12}:certificate/[A-Fa-f0-9-]+$ ]] || {
        echo "Provide --certificate-arn with a validated ACM certificate ARN from us-east-1." >&2; exit 2;
      }
    fi
    aws cloudformation deploy \
      --template-file infra/lightsail-production.yaml \
      --stack-name "$stack_name" \
      --region "$region" \
      --no-fail-on-empty-changeset \
      --parameter-overrides \
        "InstanceName=taxcalculator-prod" \
        "RepositoryUrl=https://github.com/jovanjakimovski/TaxCalculator.git" \
        "GitRef=$git_ref" \
        "OriginDomainName=$origin" \
        "AppDomainName=$app_domain" \
        "CloudFrontCertificateArn=$certificate_arn" \
        "CloudFrontOriginToken=$origin_token"
    ;;
  *) echo "Unknown action: $action" >&2; exit 2 ;;
esac

aws cloudformation describe-stacks --stack-name "$stack_name" --region "$region" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
printf '\nOrigin token saved at: %s\nCopy it to /opt/taxcalculator/.env as CLOUDFRONT_ORIGIN_TOKEN.\n' "$token_file"
