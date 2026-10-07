#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
action="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-central-1}}"
stack_name="${AWS_DEV_STACK_NAME:-taxcalculator-dev}"
instance_type=t3.small
release_id=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region) region="${2:?Missing region}"; shift 2 ;;
    --stack) stack_name="${2:?Missing stack name}"; shift 2 ;;
    --instance-type) instance_type="${2:?Missing instance type}"; shift 2 ;;
    --release) release_id="${2:?Missing release ID}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
if [[ "$action" == help || "$action" == --help ]]; then
  cat <<'HELP'
Usage: bash scripts/aws-dev.sh ACTION [--region eu-central-1] [--stack taxcalculator-dev]
  bootstrap  Create/update the CloudFormation dev infrastructure (no Docker needed).
  release    Build, publish and deploy a verified dev release (Docker required).
  rollback   Restore the previous release on the instance.
  status     Show stack outputs and the HTTPS app URL.
  stop       Stop dev compute; EBS, the reserved IPv4 address and artifacts still bill.
  start      Start dev compute again at the same HTTPS URL.
Optional: --instance-type t3.small for bootstrap; --release UNIQUE_ID for release.
AWS authentication is required. No Cognito, licensing, payment or application settings.
HELP
  exit 0
fi
[[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] || { echo "Invalid AWS region" >&2; exit 2; }
[[ "$stack_name" =~ ^[a-z][a-z0-9-]{0,60}$ ]] || { echo "Use a lowercase stack name up to 61 characters" >&2; exit 2; }
for tool in aws jq; do command -v "$tool" >/dev/null || { echo "Install $tool or run bootstrap in AWS CloudShell." >&2; exit 1; }; done
export AWS_REGION="$region" AWS_DEFAULT_REGION="$region" AWS_PAGER=""
aws sts get-caller-identity --query Arn --output text >/dev/null
output() { jq -er --arg key "$1" '.Stacks[0].Outputs[] | select(.OutputKey == $key) | .OutputValue' <<< "$stack_json"; }
load_stack() { stack_json="$(aws cloudformation describe-stacks --stack-name "$stack_name")"; }
wait_command() {
  local command_id="$1" instance_id="$2" status
  for ((attempt=0; attempt<180; attempt++)); do
    status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" --query Status --output text 2>/dev/null || true)"
    case "$status" in
      Success) aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" --query StandardOutputContent --output text; return ;;
      Failed|Cancelled|TimedOut|Cancelling)
        aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance_id" --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' --output json
        return 1 ;;
    esac
    sleep 5
  done
  echo "Command $command_id is still running; inspect it in Systems Manager." >&2
  return 1
}
send_command() {
  local instance_id="$1" command="$2" parameters command_id
  parameters="$(jq -cn --arg command "$command" '{commands:[$command],executionTimeout:["900"]}')"
  command_id="$(aws ssm send-command --instance-ids "$instance_id" --document-name AWS-RunShellScript --parameters "$parameters" --timeout-seconds 600 --query Command.CommandId --output text)"
  wait_command "$command_id" "$instance_id"
}
case "$action" in
  bootstrap)
    prefix_list="$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query 'PrefixLists[0].PrefixListId' --output text)"
    [[ "$prefix_list" =~ ^pl-[a-f0-9]+$ ]] || { echo "CloudFront origin prefix list is unavailable in $region" >&2; exit 1; }
    provider_arn="$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?ends_with(Arn, 'oidc-provider/token.actions.githubusercontent.com')].Arn | [0]" --output text)"
    [[ "$provider_arn" == None ]] && provider_arn=""
    # Keep a provider created by this stack inside the template on later updates.
    existing_stack="$(aws cloudformation describe-stacks --stack-name "$stack_name" 2>/dev/null || true)"
    if [[ -n "$existing_stack" ]]; then
      provider_arn="$(jq -r '.Stacks[0].Parameters[] | select(.ParameterKey == "ExistingGitHubOidcProviderArn") | .ParameterValue' <<< "$existing_stack")"
    fi
    aws cloudformation deploy --template-file infra/dev-stack.yaml --stack-name "$stack_name" \
      --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
      --parameter-overrides "CloudFrontPrefixListId=$prefix_list" "ExistingGitHubOidcProviderArn=$provider_arn" "InstanceType=$instance_type" \
      --tags Environment=dev Application=TaxCalculator
    load_stack
    role_arn="$(output GitHubDeployRoleArn)"
    printf 'Dev infrastructure is ready. The first release must be deployed before the app URL works.\n'
    printf 'Set these GitHub repository variables (Settings > Secrets and variables > Actions > Variables):\nAWS_DEV_ROLE_ARN=%s\nAWS_DEV_REGION=%s\nAWS_DEV_STACK_NAME=%s\n' "$role_arn" "$region" "$stack_name"
    printf 'Create a GitHub environment named dev, restrict it to main, then run Deploy development app.\n'
    printf 'App URL: %s\n' "$(output AppUrl)"
    ;;
  status)
    load_stack
    jq '.Stacks[0] | {StackStatus,Outputs}' <<< "$stack_json"
    ;;
  release)
    command -v docker >/dev/null || { echo 'Release builds need Docker. Use the GitHub workflow if you are in CloudShell.' >&2; exit 1; }
    load_stack
    release_id="${release_id:-$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"
    [[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$ ]] || { echo "Invalid release ID" >&2; exit 2; }
    backend_repo="$(output BackendRepositoryUri)"
    frontend_repo="$(output FrontendRepositoryUri)"
    registry="${backend_repo%%/*}"
    aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
    docker build --platform linux/amd64 -t "$backend_repo:$release_id" backend
    docker build --platform linux/amd64 --build-arg APP_PROFILE=dev -t "$frontend_repo:$release_id" frontend
    docker push "$backend_repo:$release_id"
    docker push "$frontend_repo:$release_id"
    backend_digest="$(aws ecr describe-images --repository-name "${backend_repo#*/}" --image-ids "imageTag=$release_id" --query 'imageDetails[0].imageDigest' --output text)"
    frontend_digest="$(aws ecr describe-images --repository-name "${frontend_repo#*/}" --image-ids "imageTag=$release_id" --query 'imageDetails[0].imageDigest' --output text)"
    [[ "$backend_digest" =~ ^sha256:[a-f0-9]{64}$ && "$frontend_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Cannot resolve release image digests' >&2; exit 1; }
    bundle="$(mktemp -d)"
    trap 'rm -rf -- "$bundle"' EXIT
    cp docker-compose.dev.yml "$bundle/compose.yml"
    cp scripts/activate-dev-release.sh "$bundle/activate.sh"
    jq -n --arg id "$release_id" --arg backend "$backend_repo@$backend_digest" --arg frontend "$frontend_repo@$frontend_digest" \
      '{release:$id,profile:"dev",backend:$backend,frontend:$frontend}' > "$bundle/manifest.json"
    tar -czf "$bundle/release.tgz" -C "$bundle" compose.yml activate.sh manifest.json
    bucket="$(output ReleaseBucket)"
    aws s3 cp "$bundle/release.tgz" "s3://$bucket/releases/$release_id/release.tgz" --only-show-errors
    instance_id="$(output InstanceId)"
    stack_id="$(jq -r '.Stacks[0].StackId' <<< "$stack_json")"
    origin_token="${stack_id##*/}"
    for ((attempt=0; attempt<90; attempt++)); do
      online="$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$instance_id" --query 'InstanceInformationList[0].PingStatus' --output text)"
      [[ "$online" == Online ]] && break
      sleep 5
    done
    [[ "$online" == Online ]] || { echo 'The instance is not ready in Systems Manager yet.' >&2; exit 1; }
    # Values are template-derived or validated above, and passed as quoted arguments.
    remote="set -eu; mkdir -p /opt/taxcalculator-dev/releases/$release_id; aws s3 cp 's3://$bucket/releases/$release_id/release.tgz' '/opt/taxcalculator-dev/releases/$release_id/release.tgz' --region '$region'; tar -xzf '/opt/taxcalculator-dev/releases/$release_id/release.tgz' -C '/opt/taxcalculator-dev/releases/$release_id'; bash '/opt/taxcalculator-dev/releases/$release_id/activate.sh' '$release_id' '$region' '$origin_token'"
    send_command "$instance_id" "$remote"
    app_url="$(output AppUrl)"
    curl --fail --silent --show-error --retry 6 --retry-delay 5 "${app_url}api/tax/health"
    printf '\nDeployed %s\n' "$app_url"
    ;;
  rollback)
    load_stack
    send_command "$(output InstanceId)" 'set -eu; test -f /opt/taxcalculator-dev/previous; previous=$(cat /opt/taxcalculator-dev/previous); bash "/opt/taxcalculator-dev/releases/$previous/activate.sh" "$previous" rollback'
    ;;
  stop|start)
    load_stack
    instance_id="$(output InstanceId)"
    if [[ "$action" == stop ]]; then aws ec2 stop-instances --instance-ids "$instance_id" --query 'StoppingInstances[].CurrentState.Name' --output text
    else aws ec2 start-instances --instance-ids "$instance_id" --query 'StartingInstances[].CurrentState.Name' --output text; fi
    printf 'HTTPS URL (available while running): %s\n' "$(output AppUrl)"
    ;;
  *) echo 'Unknown action. Use help.' >&2; exit 2 ;;
esac
