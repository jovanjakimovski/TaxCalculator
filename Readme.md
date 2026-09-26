TaxCalculator
=============

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

The workbook is saved beside the CSV. The local database is bound to localhost and uses a test-only default password.

PII-free test statements are available in `test-data/`. They cover gains/losses and interest, optional Forex, and a statement without interest.

Stop the local stack while keeping its database volume:

```powershell
.\tax.ps1 down
```

### Existing database volume

If you created the PostgreSQL volume before the TaxCalculator database rename, preserve the volume and migrate its database and role once before starting the new configuration.

Stop the backend, but leave PostgreSQL running:

```powershell
docker compose stop backend
docker compose exec postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d postgres'
```

At the `psql` prompt, run:

```sql
ALTER DATABASE automark RENAME TO taxcalculator;
ALTER ROLE automark RENAME TO taxcalculator;
ALTER ROLE taxcalculator WITH PASSWORD 'taxcalculator';
\q
```

Then run `.\tax.ps1 up`. Do not use `docker compose down -v`; that deletes the database volume. For an existing AWS volume, use `docker compose -f docker-compose.aws.yml` in place of `docker compose` in the commands above. Keep a custom `.env` password unchanged and omit the `ALTER ROLE ... WITH PASSWORD` line. If the previous AWS test-only fallback was used, change the role password to `taxcalculator-test-only` instead.

For new AWS testing, `docker-compose.aws.yml` runs without `.env` and uses the test-only password `taxcalculator-test-only`. Replace it with a strong secret before exposing the deployment outside a trusted test environment. Set `POSTGRES_PASSWORD` in `.env` or the shell to override it.

## Report Output

The UI and CLI use the same CSV-only workbook generator and produce the same five-sheet Excel workbook. UI tax settings do not affect the export. Apart from the official exchange-rate endpoint, workbook contents are derived from the uploaded CSV and fixed assumptions:

| Sheet | Contents |
|---|---|
| **Activity Statement** | Original IBKR Activity Statement |
| **Conversion Rates** | One transaction-date column and the official USD-MKD rate for that date |
| **Calculation** | Securities/options and interest transactions, with formulas referencing the original statement and exchange-rate sheet |
| **Dividends** | One row per payment with gross, withholding evidence, exchange rate, taxable amount, and estimated tax |
| **Summary** | Formula-driven monthly realized P/L including gross dividends, and estimated tax |

## Tax Calculation Notes

- Positive gains use the full gain as the taxable base regardless of holding period.
- Dividend tax and Summary P/L use gross dividends only. Foreign withholding appears as evidence on the Dividends sheet but is excluded from the taxable amount and Summary.
- Securities/options losses offset gains only within the same month. Losses are not carried forward or applied against dividends or interest.
- Positive interest is taxed separately. Negative interest charges are shown but do not reduce other categories.
- The estimates and loss-treatment assumptions should be confirmed against current UJP rules. This tool is not a filing system or legal/tax advice.
- IBKR realized P/L and basis values are used; the app does not independently rebuild FIFO cost basis.

Exchange Rates
--------------

The application uses official NBRNM USD exchange rates. Supported settings are trade date (T) and previous day (T-1). Rates are cached in PostgreSQL, including weekend and holiday fallback results.

Running locally from source
---------------------------

Requirements: Java 21, Maven Wrapper, Node.js/npm, and Docker Desktop.

To run the frontend and backend from source, start PostgreSQL only:

```powershell
docker compose up -d postgres
```

Start the backend in a terminal:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Start the frontend in another terminal:

```powershell
cd frontend
npm run dev -- --host localhost
```

Open `http://localhost:5173/`. The API runs at `http://localhost:8080`.

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

Flyway applies the schema migrations, including the NBRNM exchange-rate cache.

Known limitations
-----------------

- The tax treatment for positive interest income and the category/loss treatment assumptions should be confirmed legally.
- Foreign withholding is not used as a tax credit in this estimate.
- Options, Forex, stock awards, deposits, and unrealized gains have limited or no tax treatment in the estimate; confirm their local classification.
- NBRNM availability and response format are external dependencies.
