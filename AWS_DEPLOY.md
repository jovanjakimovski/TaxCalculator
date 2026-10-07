# AWS deployment

This setup runs the frontend, tax API, licensing API, and two separate PostgreSQL databases on one EC2 instance. Only the frontend port is public.

## EC2 test stage: run without provider setup

For your current test stage, use the separate sandbox profile. It requires Docker Compose, but no Cognito, Lemon Squeezy, Secrets Manager, domain, or placeholder configuration. From the existing app checkout on EC2:

```bash
git pull --ff-only origin main
docker compose -f docker-compose.ec2-test.yml up -d --build
docker compose -f docker-compose.ec2-test.yml ps
```

Open `http://YOUR_EC2_PUBLIC_IP/` (or your existing app URL). The default frontend port is `80`; an existing `APP_PORT` setting still applies. Allow that port in your EC2 security group from your testers' IPs, or use your existing load balancer/reverse proxy. Neither database nor API has a published host port.

The sample, calculation guide, CSV preview, exchange rates, report generation, Excel download, and browser-local saved reports work without configuring external services. Enter `LOCAL-TEST-CODE` in the upload preview or My reports to receive three test report credits per browser license key. Optional `EC2_TEST_CODE` and `EC2_TEST_CREDITS` overrides are available, but are not required. Redeeming the same code again does not refill a used balance.

All sign-in, account-credit, checkout, and webhook implementations remain in the app. The sandbox uses browser license keys and shows sign-in as unconfigured; it does not simulate real Cognito accounts or payment processing. It explicitly ignores provider settings and production authentication flags from `.env`, so copied placeholders do not prevent sandbox startup. Use the production profile below when you are ready to connect real accounts and payments.

Keep the existing checkout directory and Compose project name to reuse your current database volumes. The tax database defaults to the previous AWS test password; if you previously set a custom database password, keep that actual password in `POSTGRES_PASSWORD`. Existing licensing databases likewise require their actual `LICENSE_DB_PASSWORD`. PostgreSQL does not change an initialized database password when a Compose variable changes. Do not overwrite `.env` or delete database volumes.

This profile enables free test credits and uses fallback database passwords. Restrict access to testers and switch to the production setup before accepting real customers.

## 1. Create the EC2 instance

1. In AWS EC2, launch an Ubuntu instance eligible for your Free Tier.
2. Create or select a key pair.
3. Put an HTTPS Application Load Balancer in front of the EC2 instance and attach an ACM certificate to the public listener. In security groups, allow:
   - SSH `22` to EC2 from your IP only
   - HTTP `80` to EC2 from the ALB security group only
   - HTTPS `443` to the ALB from intended users
4. Do not expose the EC2 HTTP port directly to the internet. Do not open ports `5432`, `5433`, `8080`, or `8081`.

## 2. Install Docker

SSH into the instance and run:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git awscli jq
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
exit
```

Reconnect over SSH after the `exit` so the Docker group takes effect.

## 3. Prepare deployment settings

```bash
git clone YOUR_REPOSITORY_URL tax-calculator
cd tax-calculator
cp .env.example .env
nano .env
```

Provide `POSTGRES_PASSWORD` and `LICENSE_DB_PASSWORD` as different long random secrets through Secrets Manager. Use `.env` for public configuration only. Do not start the stack until HTTPS, Cognito, and Lemon Squeezy settings are ready.

## 4. Configure account sign-in

First configure HTTPS for the public app domain using an Application Load Balancer with an ACM certificate or a TLS reverse proxy. Register the exact Cognito callback and logout URLs at that HTTPS domain.

Deploy the included user-pool template (choose a globally unique hosted-UI domain prefix):

```bash
aws cloudformation deploy \
   --template-file infra/cognito-user-pool.yaml \
   --stack-name taxcalculator-auth \
   --parameter-overrides \
      UserPoolDomainPrefix=YOUR_UNIQUE_PREFIX \
      CallbackUrls=https://YOUR_DOMAIN/auth/callback \
      LogoutUrls=https://YOUR_DOMAIN/
```

Get the values from the stack:

```bash
aws cloudformation describe-stacks --stack-name taxcalculator-auth \
   --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output table
```

Copy the `IssuerUri`, `AppClientId`, and `HostedUiAuthority` outputs into `.env` as `COGNITO_ISSUER_URI`, `COGNITO_APP_CLIENT_ID`, and `COGNITO_HOSTED_UI_AUTHORITY`. Also set `COGNITO_REDIRECT_URI=https://YOUR_DOMAIN/auth/callback`, `COGNITO_LOGOUT_REDIRECT_URI=https://YOUR_DOMAIN/`, and `APP_PUBLIC_URL=https://YOUR_DOMAIN`. The Compose build passes the public OIDC values to the frontend; the licensing API verifies the issuer, client ID, and access-token type.

The template enables self-service email accounts and password recovery. Before public launch, configure production email delivery (for example, a verified SES identity) and your preferred MFA/account-recovery policies. Keep `LICENSE_TEST_MODE=false` and `LICENSE_ALLOW_ANONYMOUS_CHECKOUT=false` in `.env`. The AWS Compose profile requires the Cognito issuer and app client ID; the licensing service fails closed if they are missing.

The app leaves the sample, calculation guide, and CSV preview open to everyone. Buying and unlocking a real report require an account in production. The account screen continues to Cognito's hosted page for email sign-in, signup, email verification, and Forgot password recovery; the app does not collect or store passwords. The CSV draft and selected package survive that redirect on the same browser. Credits belong to the account and are available across devices; full report files stay in the browser that generated them, so users should download their Excel and filing summary.

New pools use case-insensitive email usernames, so changing email capitalization does not create another account. [Cognito cannot change case sensitivity on an existing pool](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-case-sensitivity.html). If you already deployed a case-sensitive pool, preserve its existing setting when updating this template; migration to a different pool requires a separate account and credit migration plan. Account identity is based on issuer plus immutable subject, not email.

## 5. Configure payments

Create a Lemon Squeezy product with three distinct one-time variants for 1, 2, and 3 report credits. Suggested introductory EUR prices are 9.90, 17.90, and 23.90; set final checkout prices in its dashboard. Disable customer-editable quantities; each variant is sold as one package. Use its test mode first, then create a live API key and webhook signing secret for production. Subscribe the webhook to `order_created` and `order_refunded` at `https://YOUR_DOMAIN/api/license/lemonsqueezy/webhook`. Set `LEMON_SQUEEZY_STORE_ID`, `LEMON_SQUEEZY_VARIANT_ID`, `LEMON_SQUEEZY_VARIANT_TWO_ID`, `LEMON_SQUEEZY_VARIANT_THREE_ID`, and `PAYMENT_TEST_MODE=false` in `.env`; never expose the API key or webhook secret as `VITE_*` values. The service grants a credit only for a signed, paid order matching the configured store and variant.

Lemon Squeezy currently lists North Macedonia as supported for bank payouts and acts as merchant of record. Confirm your store's activation and payout eligibility directly before launch. Full refunds revoke only unused credits; partial refunds are ignored pending a business policy.

Store `POSTGRES_PASSWORD`, `LICENSE_DB_PASSWORD`, `LEMON_SQUEEZY_API_KEY`, and `LEMON_SQUEEZY_WEBHOOK_SECRET` in an AWS Secrets Manager JSON secret. Give the EC2 instance role `secretsmanager:GetSecretValue` for that secret (and `kms:Decrypt` only if using a customer-managed key). The deploy script reads the values into its process environment without writing a secret file. Keep `.env` restricted to non-secret configuration such as Cognito URLs, Lemon Squeezy store/variant IDs, and `TAXCALCULATOR_SECRET_ID`.

The secret JSON must use these keys:

```json
{
   "POSTGRES_PASSWORD": "...",
   "LICENSE_DB_PASSWORD": "...",
   "LEMON_SQUEEZY_API_KEY": "...",
   "LEMON_SQUEEZY_WEBHOOK_SECRET": "..."
}
```

Set the Cognito region-specific `COGNITO_IDP_ORIGIN`, for example `https://cognito-idp.eu-west-1.amazonaws.com`. The CSP allows only that IdP origin and the Cognito hosted UI, not arbitrary external connections. The example Compose stack intentionally does not publish either database or API port.

The deployment keeps test-code mode disabled. Sign-in is available after Cognito is configured; checkout appears after Lemon Squeezy is configured. Do not enable test-code, payment test mode, or anonymous checkout on a public deployment.

## 6. Start the application

Do not commit `.env`. Once the settings above and the instance role are ready, build and start the stack using the Secrets Manager launcher:

```bash
TAXCALCULATOR_SECRET_ID=YOUR_SECRET_NAME bash scripts/deploy-aws-compose.sh
```

Open the site through its HTTPS domain:

```text
https://YOUR_DOMAIN/
```

## Update an existing EC2 installation

This release adds Cognito sign-in, paid report credits, and a separate licensing database. Complete sections 3–5 before rebuilding an older installation. The launcher requires all four Secrets Manager values and validates the public configuration before starting containers.

1. Back up the existing databases and record the current commit (`git rev-parse HEAD`). Keep the existing checkout directory and Compose project name so the update reuses the existing database volumes.
2. Preserve your existing `.env`; compare it with the new `.env.example` and add the missing public settings. Keep `APP_PORT` set to the port your load balancer or reverse proxy already targets (normally `80` for the ALB setup above; `.env.example` uses `8080` for local use).
3. Put the existing database's actual password in Secrets Manager as `POSTGRES_PASSWORD`. Changing this variable does not change the password inside an initialized PostgreSQL volume. If the old database still uses a weak testing password, rotate it in PostgreSQL and update Secrets Manager together before using the production launcher. Use a different strong password for the new licensing database.
4. Install AWS CLI, `jq`, and Python 3 if missing. Attach the secret-reading instance role described above and use the AWS region containing the secret.

SSH into your instance, then run these commands in the existing app checkout. Replace the directory, region, and secret name with your actual values:

```bash
cd /path/to/your/existing/TaxCalculator
git status --short
git pull --ff-only origin main
nano .env
AWS_DEFAULT_REGION=YOUR_AWS_REGION \
  TAXCALCULATOR_SECRET_ID=YOUR_SECRET_NAME \
  bash scripts/deploy-aws-compose.sh
```

If `git status` shows server-side source edits, preserve and reconcile them before pulling. Do not overwrite `.env` with the example file. The script rebuilds the images and recreates changed services; it can briefly interrupt requests.

Check the running containers without needing to re-export the Secrets Manager values:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl --fail https://YOUR_DOMAIN/api/tax/health
curl --fail https://YOUR_DOMAIN/api/license/health
```

Allow startup to finish before checking the endpoints. If a service fails, use `docker logs --tail 100 CONTAINER_NAME` with its name from `docker ps`. Finally, verify sign-in, CSV preview, and report download in the browser. Keep the database backups available for rollback; reverting code alone does not reverse database migrations.

## Useful commands

```bash
# View service status
docker compose -f docker-compose.aws.yml ps

# View logs
docker compose -f docker-compose.aws.yml logs -f

# Update after a code change
git pull
TAXCALCULATOR_SECRET_ID=YOUR_SECRET_NAME bash scripts/deploy-aws-compose.sh
```

Tax-rate data and license/payment metadata are stored in separate `postgres_data` and `license_data` Docker volumes and survive container rebuilds. Back up both volumes. Do not run `docker compose down -v` unless you intentionally want to delete the databases.

Also create an AWS Budget alert so accidental usage cannot surprise you. Lemon Squeezy acts as merchant of record for customer transactions; account for your own business income and confirm payout eligibility before accepting live payments.

Before live sales, verify sign-in, cross-device credit recovery, old-key migration, checkout, duplicate webhooks, credit consumption, full refunds, database backups, and account recovery in staging. Partial refunds and disputes need a separate policy and implementation.

## Public launch checks

Set a working `SUPPORT_EMAIL`, the exact public HTTPS URLs, and `TRUSTED_PROXY_CIDR` for the ALB's VPC subnet. Restrict instance ingress to the ALB security group: forwarded client IPs are trusted only from that subnet. Configuration validation runs before the deploy script starts containers. The frontend values are build-time settings; rebuild after changing Cognito URLs or support email. Use the user-pool issuer for OIDC discovery and the hosted UI URL only for Cognito logout.

Before opening to users:

- Register, verify email, sign in, refresh the page, reset a password, and log out through Cognito on the real HTTPS domain. Confirm credits remain attached to the same account after signing back in.
- In an isolated payment sandbox, buy each package and confirm exactly 1/2/3 credits arrive from signed webhooks. Repeat webhook delivery; confirm no additional credits. Test full refunds before and after using a credit. Partial refunds require your support policy and do not revoke credits automatically.
- Switch to the live merchant account, disable all test/anonymous modes, and verify a small live purchase/refund under your account. Browser return URLs do not grant credits.
- Download the unchanged Excel in both languages and open it in your supported Excel version. Review cached values and formula recalculation against the on-screen figures before relying on workbook recalculation in a filing workflow.
- Create scheduled encrypted backups for both databases, verify restoration in a separate environment, and configure health/error monitoring. Preserve test evidence and rollback to the previous images if validation fails.
- Publish your operator identity, support/refund contact, and retention policy for account/payment records, based on your actual business. App copy already explains local CSV processing, estimate limitations, and user filing responsibility.

`docker-compose.aws.yml` publishes only the frontend. Local Compose defaults are testing-only. No deployment, domain registration, Cognito provisioning, merchant onboarding, or live charge is performed by the local verification workflow.

Provider implementation references: [Cognito logout](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html), [Lemon Squeezy signed webhooks](https://docs.lemonsqueezy.com/guides/developer-guide/webhooks), [checkout currencies](https://docs.lemonsqueezy.com/help/payments/currencies), and [Spring Boot 3.5 reference](https://docs.spring.io/spring-boot/3.5/reference/index.html).
