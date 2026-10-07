# Free development workspace on AWS

This implements a separate CloudFormation-managed development environment in **eu-central-1 (Frankfurt)**. Your existing EC2 application is left alone. The explicit `dev` frontend build generates complete reports without Cognito, licensing, payments, access codes, or placeholder provider variables. The normal production build keeps those features. Missing configuration never switches a production build into free mode.

## Try it locally

With Docker Desktop running:

```powershell
.\tax.ps1 dev
```

This builds the three-service dev stack, waits for the tax API, and opens http://localhost:8080. Upload a supported IBKR CSV, review the acknowledgement, select **Generate report**, then download Excel or reopen it under **My reports**. Stop with `.\tax.ps1 dev-down`. If another stack uses port 8080, set `$env:DEV_PORT='8090'` first.

On Linux/macOS:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

No `.env` file is needed. `DEV_*` overrides are optional. Dev uses its own Postgres volume, separate from the licensing/test stack. Reports and statements remain in browser storage; the database stores exchange-rate cache entries.

## Architecture and rollout plan

1. CloudFormation creates a dedicated VPC, public subnet, one `t3.small` Amazon Linux 2023 EC2 instance, encrypted 20 GB gp3 disk, stable Elastic IP, and Systems Manager instance role. Docker runs nginx/frontend, the Java tax API, and Postgres. Only nginx has a host port; no SSH is open.
2. CloudFront provides the HTTPS app URL and default certificate without requiring a domain. HTTPS enables browser cryptography used by report generation. The EC2 security group permits HTTP from the AWS CloudFront origin-facing prefix list only; nginx also requires the distribution's origin header. CloudFront-to-EC2 traffic is HTTP for this dev setup. CSVs and generated reports stay in the browser; only exchange-rate date ranges reach the tax API.
3. Two ECR repositories hold immutable frontend/backend image tags, with deployment by SHA-256 digest. A private encrypted S3 bucket stores versioned release bundles. EC2 builds no application images.
4. GitHub Actions verifies production and dev browser flows, Java tests, containers, CloudFormation, and shell syntax before deployment. GitHub OIDC supplies short-lived AWS credentials through a role scoped to these repositories, release bucket, and dev instance. No long-lived AWS keys are required in GitHub.
5. Systems Manager pulls a release, preserves a generated database password and persistent volume, starts containers, and checks health. Failed activation restores the previous release when available. Stop/start and manual rollback are included. Releases briefly interrupt service; this single-instance dev stack has no high-availability guarantee.

Infrastructure changes are applied explicitly with `bootstrap`; application changes deploy after successful CI on `main`. This keeps an application push from unexpectedly replacing the instance or disk. CloudFormation stores infrastructure in `infra/dev-stack.yaml`; release scripts are in `scripts/`.

## Create the AWS infrastructure once

In an authenticated **AWS CloudShell** session in Frankfurt, clone this repository (or upload its checkout if repository access requires authentication), then run:

```bash
git clone https://github.com/jovanjakimovski/TaxCalculator.git
cd TaxCalculator
bash scripts/aws-dev.sh bootstrap --region eu-central-1
```

CloudShell already supplies AWS credentials, AWS CLI, Git, and jq. The signed-in AWS identity needs permission to create the CloudFormation resources, including IAM roles/OIDC, EC2/VPC, ECR, S3, and CloudFront. Bootstrap can take several minutes, especially CloudFront. It prints your actual role ARN, stack name, region, and HTTPS URL. The URL starts working after the first application release.

Bootstrap detects an existing GitHub OIDC provider and reuses it. If this stack created the provider, a subsequent bootstrap preserves that ownership rather than removing its resource.

In GitHub repository settings:

1. Create an environment named **dev** and restrict its deployment branches to **main**.
2. Under **Secrets and variables → Actions → Variables**, add the three repository variables printed by bootstrap: `AWS_DEV_ROLE_ARN`, `AWS_DEV_REGION`, `AWS_DEV_STACK_NAME`. These values are identifiers, not passwords.
3. Under **Actions → Deploy development app → Run workflow**, select **main** and run it. Later pushes to main deploy automatically after checks pass. Without the role variable, CI runs and the AWS deploy job skips.

The trust policy expects GitHub's standard subject `repo:jovanjakimovski/TaxCalculator:environment:dev`. If your organization enabled a custom or immutable OIDC subject, adapt that policy to your repository's actual token subject before deployment. Never broaden it to all repositories.

The public development URL intentionally requires no application login. Anyone with its URL can use the free workspace. Keep this environment for testing and avoid advertising it as the paid production service.

## Updates, rollback and operating cost

Routine application update: push to `main`. The workflow uses a unique SHA/run/attempt release tag, checks images by digest, and reports the URL. A deploy failure is visible in Actions and SSM; cloud-init setup errors are in `/var/log/cloud-init-output.log` on the instance, accessible through Session Manager.

From CloudShell inside the checkout:

```bash
bash scripts/aws-dev.sh status
bash scripts/aws-dev.sh rollback
bash scripts/aws-dev.sh stop
bash scripts/aws-dev.sh start
```

Rollback requires one earlier successful release. Database schema changes are not automatically rolled back; inspect migration compatibility before changing persistence. Stop suspends EC2 compute billing; disk, Elastic IP, image/release storage, and usage charges remain. Start resumes containers at the same CloudFront URL. Application deployment requires a running instance; start it first.

The budget-conscious choice here is one small instance and no NAT gateway, ALB, RDS, paid identity provider, or custom domain. Exact Frankfurt costs depend on runtime and AWS account pricing/credits. Check [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS pricing](https://aws.amazon.com/ebs/pricing/), [public IPv4 pricing](https://aws.amazon.com/vpc/pricing/), and [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) before rollout. T3 CPU credits use standard mode to prevent surplus-credit charges; sustained load may throttle. Container logs rotate; ECR keeps 20 images per repository. Local image and rollback artifacts are retained on disk and may need cleanup as releases accumulate. Keep the current and previous releases when cleaning up.

To remove the dev environment, delete **taxcalculator-dev** in CloudFormation after saving anything you need. The EC2 disk/dev rate cache and ECR repositories are deleted. The S3 release bucket and any stack-created GitHub OIDC provider are retained intentionally; inspect and remove the retained bucket separately if no longer needed. A shared OIDC provider must remain for other workflows.

## Verification

```bash
cd frontend
npm ci
npm test
E2E_APP_PROFILE=dev npm run test:e2e
npm run test:e2e
```

To exercise a running dev container stack against actual exchange rates:

```bash
E2E_APP_PROFILE=dev E2E_APP_URL=http://127.0.0.1:8080 E2E_LIVE_RATES=true npm run test:e2e
```

The dev browser suite covers desktop/mobile generation, a four-sheet Excel download, saved-report reopening, zero license requests even with an unavailable license endpoint, and rejection of unsupported currency. Production browser tests still exercise account/credit behavior separately. AWS provisioning itself requires an authenticated AWS identity and must be verified in the target account.
