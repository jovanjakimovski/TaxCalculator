# TaxCalculator

## Free development profile

Run `.\tax.ps1 dev` to build and open the app without login, licensing, payment settings, or access codes. Generate complete reports and Excel files directly. Production account/payment features remain in the normal build.

For a separate, inexpensive CloudFormation-managed AWS dev instance in Frankfurt with HTTPS and automatic deployments, follow [DEV_DEPLOY.md](DEV_DEPLOY.md).

## Quick Start (Local)

Requires Docker Desktop. Node.js and npm are needed for workbook generation; the launcher installs project dependencies if missing. No `.env` file or user-configured database password is needed for local use.

Open the app:

```powershell
.\tax.ps1 ui
```

Generate a workbook from an IBKR CSV:

```powershell
.\tax.ps1 workbook "C:\path\to\activity.csv"
```

The workbook is saved beside the CSV. The tax-rate database and licensing database are separate. Both are bound to localhost and use local-only default passwords. Local test access is enabled with the code `LOCAL-TEST-CODE`; it grants three report credits to the current browser license key.

PII-free test statements are available in `test-data/`. They cover gains/losses and interest, optional Forex, and a statement without interest.

Stop the local stack while keeping its database volume:

```powershell
.\tax.ps1 down
```

For the current EC2 test stage, run `docker compose -f docker-compose.ec2-test.yml up -d --build`. It starts without Cognito, payment, or Secrets Manager settings, keeps both databases private, and enables `LOCAL-TEST-CODE` for report testing. Real sign-in and payment processing remain available in the code but need their providers configured. See the sandbox instructions in `AWS_DEPLOY.md`, including how to preserve an existing database password.

Production AWS deployment requires strong database secrets, Cognito accounts, real payment configuration, and HTTPS. It has no default database passwords. Use the Secrets Manager deployment script and configuration check described in `AWS_DEPLOY.md`. Never expose the local Compose profile publicly.

## Report Access and Payment Testing

### Local test code

Run `.\tax.ps1 ui` and enter `LOCAL-TEST-CODE` under My reports or the upload preview. The code grants three credits once per browser license key; re-entering it does not add credits again. The public sample statement remains free to try. A real report credit is consumed only after local calculation and workbook generation succeed.

Without Cognito configuration, local testing uses a random browser license key. Hosted accounts use Cognito instead: credits are tied to the Cognito issuer and immutable subject, not browser storage or email. The licensing database stores account and payment metadata only, never tax data.

The local code is only for testing. It is enabled by the local Compose configuration and should never be enabled for a public production deployment. To run a hosted sandbox, set `LICENSE_TEST_MODE=true`, `LICENSE_TEST_CODE` to a long random value, and `LICENSE_TEST_CREDITS` in the deployment environment. Share that code only with testers, then disable test mode before production.

### Cognito accounts and credit recovery

Hosted sign-in uses AWS Cognito's hosted UI with authorization code and PKCE. The browser stores its OIDC session in session storage; the licensing API validates Cognito access tokens and associates credits with the Cognito issuer and immutable `sub`, not the email address. Tax data is not sent to Cognito or the licensing API.

Deploy `infra/cognito-user-pool.yaml` after deciding the exact HTTPS app URL. Set the callback to `https://your-domain/auth/callback` and logout URL to `https://your-domain/`; Cognito requires exact URL matches. Configure these values in the deployment environment:

```text
COGNITO_ISSUER_URI=https://cognito-idp.REGION.amazonaws.com/USER_POOL_ID
COGNITO_APP_CLIENT_ID=APP_CLIENT_ID
COGNITO_HOSTED_UI_AUTHORITY=https://DOMAIN_PREFIX.auth.REGION.amazoncognito.com
COGNITO_IDP_ORIGIN=https://cognito-idp.REGION.amazonaws.com
COGNITO_REDIRECT_URI=https://your-domain/auth/callback
COGNITO_LOGOUT_REDIRECT_URI=https://your-domain/
```

An existing anonymous license key can be linked once from **Link an existing license key** in My account after sign-in. Its remaining balance stays in the licensing database but becomes attached to the account, and the old key stops working. Account balances aggregate credits across linked keys and future purchases.

For local Compose, leave the Cognito variables blank; the local random-key and `LOCAL-TEST-CODE` flow remains available. For Cognito sign-in during local frontend development, configure the pool's callback and logout URLs for `http://localhost:5173/auth/callback` and `http://localhost:5173/`, then supply the corresponding `VITE_COGNITO_*` variables to Vite.

### Lemon Squeezy checkout

Lemon Squeezy is the selected payment provider because it acts as merchant of record and currently lists North Macedonia for seller payouts. Confirm your onboarding and payout eligibility in its dashboard before launch. Create one product with three distinct one-time variants granting 1, 2, and 3 report credits. Suggested introductory prices: EUR 9.90, 17.90, and 23.90. Set final prices in Lemon Squeezy; the checkout is the authority for price, currency, and taxes.

Configure the licensing service using server-side values:

```text
LEMON_SQUEEZY_API_KEY=...
LEMON_SQUEEZY_STORE_ID=...
LEMON_SQUEEZY_VARIANT_ID=...
LEMON_SQUEEZY_VARIANT_TWO_ID=...
LEMON_SQUEEZY_VARIANT_THREE_ID=...
LEMON_SQUEEZY_WEBHOOK_SECRET=...
PAYMENT_TEST_MODE=true
APP_PUBLIC_URL=https://your-test-host.example
```

To test the real hosted checkout, enable Lemon Squeezy test mode in its dashboard, publish a test-mode product, create a test-mode API key, and subscribe a webhook to `order_created` and `order_refunded`. For local development, set `PAYMENT_TEST_MODE=true` and `LICENSE_ALLOW_ANONYMOUS_CHECKOUT=true`, configure the test store/variant/key and webhook secret, and expose the local app through an HTTPS tunnel so Lemon Squeezy can deliver webhooks to:

```text
https://YOUR-TUNNEL/api/license/lemonsqueezy/webhook
```

The payment button appears only when Cognito and all Lemon Squeezy settings are configured. Anonymous checkout is allowed only in explicit payment test mode. A signature-verified `order_created` event grants the configured variant's 1, 2, or 3 credits; browser redirects alone never grant credits. The webhook is idempotent by order ID. A verified full `order_refunded` event revokes that order's unused credits; already-spent credits are not restored or deducted from other purchases. Partial refunds are ignored and require an explicit policy.

The Lemon Squeezy variant controls the amount, currency, and MoR checkout. The API key and webhook signing secret stay server-side and must never be placed in `VITE_*` variables or frontend files. For production, switch to the live store/API key and set `PAYMENT_TEST_MODE=false`.

### Data boundary

The CSV, parsed rows, tax figures, and generated workbook stay in the browser. The tax backend accepts exchange-rate date ranges only; it no longer exposes a CSV upload route. Date ranges are sent to the tax backend and cached there, so they are metadata that leaves the browser. Hosted license requests contain a Cognito access token and an idempotency request ID; local test requests use the anonymous license credential and optional test code. Lemon Squeezy receives standard checkout information and a random license-row ID to associate the payment, but no email is copied to the licensing DB, and no CSV or tax results leave the browser.

The UI paywall is an honest-user access control, not tamper-proof DRM. Browser code and the local CLI can be modified or bypassed by someone with the source. The CLI workbook command remains a local developer utility and does not consume report credits.

## Report Output

The UI and CLI use the same CSV-only workbook generator and produce the same four-sheet Excel workbook. UI tax settings do not affect the export. Apart from the official exchange-rate endpoint, workbook contents are derived from the uploaded CSV and fixed assumptions:

Choose English or Macedonian in the header. If an existing report was built in the other language, use its language preparation button before downloading (free; retained rates are reused). The CLI also accepts `--language mk`. Generated sheet names, headings, and asset-class labels are translated; the original IBKR Activity Statement rows remain unchanged.

| Sheet | Contents |
|---|---|
| **Activity Statement** | Original IBKR Activity Statement |
| **Conversion Rates** | One transaction-date column and the official USD-MKD rate for that date |
| **Calculation** | Securities/options, interest, and gross dividends, with formulas referencing the original statement and exchange-rate sheet; dividend amounts use the existing Realized P/L columns, and option contract symbols remain visible |
| **Summary** | Monthly realized P/L by asset class, total taxable P/L after same-symbol stock/options/dividend offsets, and estimated tax |

## Tax Calculation Notes

- Positive gains use the full gain as the taxable base regardless of holding period.
- Dividend tax and Summary P/L use gross dividends only. Foreign withholding is excluded from the taxable amount and Summary.
- Summary asset-class columns show unoffset monthly realized P/L, including losses. Total taxable P/L combines stock, options, and dividend results only when they share the same underlying symbol and month. IBKR option symbols such as `HIMS 16JAN26 60 C` and `HIMS  260116C00060000` are matched to underlying symbol `HIMS`; losses are not carried forward or applied against interest.
- Gross dividends are included separately. Interest is netted within each month and only positive monthly interest is taxable; negative interest does not reduce other categories.
- The estimates and loss-treatment assumptions should be confirmed against current UJP rules. This tool is not a filing system or legal/tax advice.
- IBKR realized P/L and basis values are used; the app does not independently rebuild FIFO cost basis.

Exchange Rates
--------------

The application uses official NBRNM USD exchange rates. Supported settings are trade date (T) and previous day (T-1). Rates are cached in PostgreSQL, including weekend and holiday fallback results.

Running locally from source
---------------------------

Requirements: Java 21, Maven Wrapper, Node.js/npm, and Docker Desktop.

To run the frontend and both APIs from source, start both isolated PostgreSQL databases:

```powershell
docker compose up -d postgres license-postgres
```

Start the tax backend in a terminal:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Start the licensing service in another terminal:

```powershell
cd licensing
$env:LICENSE_DATABASE_URL = "jdbc:postgresql://localhost:5433/license"
$env:LICENSE_DATABASE_USERNAME = "license"
$env:LICENSE_DATABASE_PASSWORD = "license-local-only"
$env:LICENSE_TEST_MODE = "true"
$env:LICENSE_TEST_CODE = "LOCAL-TEST-CODE"
..\backend\mvnw.cmd spring-boot:run
```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev -- --host localhost
```

Open `http://localhost:5173/`. The tax API runs at `http://localhost:8080`, the licensing API at `http://localhost:8081`. Vite proxies `/api/tax` and `/api/license` so browser requests stay same-origin. To exercise Cognito, add the exact localhost callback/logout URLs to the pool and set `VITE_COGNITO_AUTHORITY` to the user-pool issuer and `VITE_COGNITO_HOSTED_UI_URL` to the hosted UI, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback`, and `VITE_COGNITO_LOGOUT_REDIRECT_URI=http://localhost:5173/`; the licensing service also needs its issuer URI and app client ID.

CLI workbook generation
-----------------------

The root launcher starts the local stack, waits for the API, and runs the shared generator:

```powershell
.\tax.ps1 workbook "C:\path\to\activity.csv"
```

The workbook is written beside the CSV. The export uses fixed assumptions (T-1 conversion, 10% category tax rates, no Forex) and the exchange-rate endpoint. To use a different endpoint, set `TAX_RATES_API_URL` or pass `--rates-api` to the generator. Run `npm --prefix frontend run generate-workbook -- --help` for CLI usage.

Database
--------

New local Compose volumes use:

- Database: `taxcalculator`
- User: `taxcalculator`
- Local-only test password: `taxcalculator`
- Port: 5432 bound to localhost
- Licensing database: separate `license` database and `license_data` volume; local port 5433

Flyway applies the schema migrations, including the NBRNM exchange-rate cache.

Known limitations
-----------------

- Calculation rules are fixed to the user-confirmed model. This is a filing aid and estimate; users review the results and are responsible for their return.
- Foreign withholding is not used as a tax credit in this estimate.
- USD stocks and options, dividends, and interest are supported. Non-USD securities/income, short positions, withholding reversals, unsupported column layouts, multiline fields, and oversized Excel formulas are rejected before charging. Forex, grants, deposits, and unrealized gains are excluded. Review broker basis after corporate actions.
- NBRNM availability and response format are external dependencies.

## New app flow and local storage

The responsive landing page and report navigation take inspiration from the supplied carVertical example, with original branding and UI. Upload a standard IBKR Activity Statement CSV to see the period, sales/income counts, and warnings before purchasing. Sign in, buy a 1/2/3-credit package or redeem the local test code, acknowledge the estimate, and unlock the report.

The site is designed for Macedonian investors with USD portfolios on Interactive Brokers. The platform selector currently enables only IBKR; other formats are explicitly unavailable. Export help links to the official IBKR instructions and explains the English Activity Statement CSV requirements. The journey shows what is free, what one report credit includes, and how the downloaded report supports UJP preparation. Partial-year inputs remain supported and are clearly labelled.

The dedicated Log in page explains verified email accounts, recovery, credits, and browser-local report files. Visitors can use samples, calculation guidance and CSV previews without signing in; hosted account mode requires sign-in before purchase or unlocking. Cognito's hosted page handles signup, verification and forgotten passwords. The selected 1/2/3-report package is retained locally across redirects, and safe OIDC return state restores the preview or account page. Expired sessions renew with an existing refresh token; without one, users sign in again. The visible local test workspace is separate from signed-in accounts and remains available for `LOCAL-TEST-CODE` testing. Real login needs the Cognito values in `.env.example` and the setup in `AWS_DEPLOY.md`; the UI clearly explains when the provider is not connected.

Reports include summary cards, monthly tax chart/table, searchable sales ledger, dividends, interest, rate evidence, and a filing checklist. **Print / Save PDF** prints the summary, monthly table, and checklist; the complete ledger stays in the Excel download. The existing Excel generator, workbook structure, offsets, rates convention, and CLI export are unchanged.

The calculation guide is free to read before purchase and also appears in each report. English/Macedonian explanations cover broker-reported realized USD results, T-1 conversion, month-and-underlying-symbol offsets, gross dividends and foreign withholding, separate positive monthly net interest, and upward rounding of the final tax total. Interactive synthetic examples compare an option loss in the same group, another symbol, and another month. The monthly drilldown explains saved figures by symbol; it does not supply figures to or modify the original generator. Expanded guidance and drilldowns are omitted from the compact printable summary.

The full workbook and its random debit request ID are committed to IndexedDB before spending a credit. A lost debit response leaves a pending report: open My reports and select Resume, even with zero remaining credits. Cross-tab Web Locks, atomic local storage, and server transactions prevent duplicate debits. Completed reports and language changes on the same browser are free. A selected CSV survives sign-in/checkout redirects locally for up to 24 hours. Reports are retained locally until deleted; credits follow the account, but files do not synchronize across devices. Download and keep copies.

The public sample uses synthetic data and clearly marked illustrative exchange rates. Private statements and saved carVertical source files are ignored by Git and excluded from deployment images. The previous private Markdown summary is preserved locally under `Excel/private-original-tax-summary.md`; only a sanitized explanation remains in the versioned file.

## Verification

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
Push-Location backend
.\mvnw.cmd clean verify
Pop-Location
Push-Location licensing
..\backend\mvnw.cmd clean verify -Pintegration
Pop-Location
```

PostgreSQL integration tests require Docker. They cover bundles, duplicate payment delivery, full refunds, concurrent debit requests, refund/debit races, and legacy-key ownership. Browser tests serve the production bundle and cover desktop/mobile sample reports, language/export, local privacy, unsupported inputs, durable downloads, temporary balance outages, lost-response recovery, and concurrent tabs without Web Locks. Set `E2E_DEV=true` to run the same tests against the development server. CI repeats build, unit, browser, database, and container checks.

To verify a private CSV locally without committing it, set `PRIVATE_STATEMENT_PATH` and optionally `PRIVATE_RATE_API` and `PRIVATE_EXPORT_PATH`, then run the frontend test command. The opt-in test logs neither statement contents nor account figures.

For a complete browser check against the running local Docker app, set `PRIVATE_STATEMENT_PATH` and run `npm --prefix frontend run test:smoke`. It uses `http://localhost:8188` and `LOCAL-TEST-CODE` by default; override with `SMOKE_APP_URL` and `SMOKE_TEST_CODE` for an isolated test stack. It verifies real exchange rates, one credit debit, the unchanged workbook cells, reload/re-download, and that API requests contain no CSV contents. It writes private exports under the ignored `Excel/` folder. Never point this test at live paid accounts.

Before a public release run `python scripts/check-deployment.py .env` with production secrets available in the environment, then complete the live sign-in/payment/refund and backup-restore checks in `AWS_DEPLOY.md`. Local tests cannot establish that unconfigured external merchant/auth accounts work.
