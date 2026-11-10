# Lightsail production deployment

This is a separate production target for the existing app. It uses the $5/month, 1 GB IPv6-only Lightsail bundle, a CloudFront standard distribution, and one PostgreSQL server with separate tax and licensing databases. It does not alter or remove the existing EC2 deployment.

## Services and cost

- Lightsail runs Nginx/frontend, the tax API, the licensing API, PostgreSQL, and Caddy. Container memory limits and JVM heap limits are set for the 1 GB host; a 1 GB swap file is configured as a safety buffer. Application images are built in GitHub Actions, never on Lightsail.
- CloudFront accepts IPv4 and IPv6 viewers and connects to the origin over IPv6 and HTTPS. The origin hostname has its own AAAA record and a Caddy-managed Let's Encrypt certificate. A secret origin header prevents direct requests from bypassing CloudFront.
- The CloudFront Free plan currently includes 100 GB data transfer and 1 million requests monthly. The Lightsail instance includes 2 TB transfer. Review both meters and configure an AWS Budget alert; overages and snapshots can add cost.
- Cognito and Lemon Squeezy stay external. The app fetches exchange rates from NBRM over IPv6.

## Before provisioning

1. The current URL is an AWS-generated CloudFront hostname, so it has no customer-managed DNS records and cannot be moved to another distribution. We can preserve it by updating that existing distribution's origin to Lightsail at cutover. Use an `origin` subdomain of the newly purchased domain for Lightsail, for example `origin-tax.example.com`; this provides the IPv6 DNS name and TLS certificate needed between CloudFront and the instance. Test the new service on its own CloudFront default HTTPS hostname, then update the existing distribution only after tests pass. Keep the old EC2 host available for rollback.
2. Confirm the AWS account has no conflicting `taxcalculator-prod` Lightsail instance or CloudFormation stack. Keep the old EC2 instance and its volumes running throughout migration.
3. In GitHub Actions variables, add the public frontend settings: `PROD_COGNITO_ISSUER_URI`, `PROD_COGNITO_HOSTED_UI_AUTHORITY`, `PROD_COGNITO_APP_CLIENT_ID`, `PROD_COGNITO_REDIRECT_URI`, `PROD_COGNITO_LOGOUT_REDIRECT_URI`, and `PROD_SUPPORT_EMAIL`. For staging, set callback/logout URLs to the new distribution's default `cloudfront.net` hostname and add those URLs to the Cognito app client's allowed callback/logout lists. Before cutover, rebuild with the current `d5oyr4xeljvji.cloudfront.net` hostname; the existing Cognito URLs then remain valid. When the purchased domain is ready, change them again and rebuild.
4. The publish workflow creates three GitHub Container Registry packages. After the first successful workflow, make those packages public in GitHub's package settings so the Lightsail host can pull images without storing a registry credential. The repository is already public; package visibility is separate.

## Create the new host

Run the AWS steps from AWS CloudShell or an authenticated AWS CLI session in the same account. The local workspace currently has no AWS CLI or AWS credentials. Do not paste AWS access keys into chat or commit secrets.

From AWS CloudShell, clone the deployment branch and run its bootstrap command:

```bash
git clone --branch lightsail-production https://github.com/jovanjakimovski/TaxCalculator.git
cd TaxCalculator
bash scripts/lightsail-aws.sh create
```

The first stack stage creates the Ubuntu 24.04 IPv6-only instance, turns on automatic snapshots, installs Docker and Compose, and enables the deploy timer. It prints the instance IPv6 address. Create an `AAAA` DNS record for the origin hostname pointing to that address, then wait for DNS to resolve.

Create the initial CloudFront distribution using its default HTTPS hostname:

```bash
bash scripts/lightsail-aws.sh publish --origin origin-tax.example.com
```

The script asks for the CloudFront origin token without echoing it. Use that same random hex value in the Lightsail `/opt/taxcalculator/.env` file as `CLOUDFRONT_ORIGIN_TOKEN`. Enable the CloudFront Free plan for the distribution in the CloudFront console if it is offered during distribution setup; CloudFormation creates a standard distribution and does not select the plan tier.

After app and data checks pass, the existing generated CloudFront hostname can keep serving the app by updating that distribution's origin and origin header to the Lightsail origin and its token. The generated hostname itself cannot be attached to the new distribution. If you later want the purchased domain on the new distribution, request and validate a free ACM certificate for that app hostname in `us-east-1`, then attach it:

```bash
bash scripts/lightsail-aws.sh publish \
  --origin origin-tax.example.com \
  --app NEW_APP_HOSTNAME \
  --certificate-arn arn:aws:acm:us-east-1:ACCOUNT:certificate/CERTIFICATE_ID
```

For the existing generated hostname, keep its current DNS unchanged; update its existing distribution origin in CloudFront. For a future purchased app domain, create a DNS alias/CNAME to the new CloudFront domain returned by the stack. Keep the old host running through the rollback window.

## Configure and migrate app data

In the Lightsail browser SSH terminal, edit `/opt/taxcalculator/.env` using `.env.lightsail.example` as a guide. Set all DB passwords to distinct random values; copy the Cognito issuer/client ID and Lemon Squeezy credentials from the existing production configuration. Keep license test mode and payment test mode disabled.

Before moving the domain, back up both existing databases. Restore the tax database into `taxcalculator` and the licensing database into `license` on the new PostgreSQL server. The new profile keeps those databases distinct but consolidates them into one PostgreSQL container. Preserve the old DB volumes and backups through cutover.

If the app hostname changes, add the new callback and logout URLs to the existing Cognito app client and update the Lemon Squeezy webhook to `https://APP_DOMAIN/api/license/lemonsqueezy/webhook`. If the hostname stays the same, the existing public URLs continue to work after DNS cutover.

The updater checks GitHub's `main` commit every five minutes. Images are published only after the repository's `verify.yml` workflow succeeds. It retains the current release if images are unavailable and restores the prior app release if health checks fail. Database migrations are not rolled back with app code; keep a database backup before schema changes.

## Cut over and retire the old deployment

Test the new stack on the temporary CloudFront domain first: health endpoints, Cognito sign-in and callback, report generation, report-credit consumption, checkout, and webhook delivery. Then update the existing `d5oyr4xeljvji.cloudfront.net` distribution's origin and origin header to the Lightsail origin, and confirm the same URL works. Watch container memory, disk, CloudFront usage, and AWS billing.

Keep the old EC2 host and both database volumes intact during the rollback window. After confirming the new host has current credits/payment metadata and the app is stable, stop the old app, retain a final database backup, and then remove its EC2 resources and unused AWS resources intentionally. Do not delete database volumes as part of a code rollback.

## Operating limits

One 1 GB host is a low-cost single point of failure. Swap and memory caps reduce startup and traffic spikes but do not add capacity. If Docker reports OOM kills or sustained swap use, move to the 2 GB IPv6-only bundle before adding more services. Automatic snapshots are crash-consistent host backups; test a restore before relying on them as the only recovery path.
