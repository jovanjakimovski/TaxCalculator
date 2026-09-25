TaxCalculator
=============


## Quick Start (Local)

Requires Docker Desktop. Node.js and npm are needed for workbook generation; the launcher installs project dependencies if missing. No database password or `.env` file is needed for local use.

Open the app:

```powershell
.\tax.ps1 ui
```

Generate a workbook directly from an IBKR CSV:

```powershell
.\tax.ps1 workbook "C:\path\to\activity.csv"
```

The workbook is saved beside the CSV. The local database is bound to localhost and uses a local-only default password.

For test data that contains no personal account information, use the synthetic statements in `test-data/`. They cover gains/losses and interest, optional Forex, and a statement without interest. Upload any of them in the UI or pass one to the workbook command.

Stop the local stack while keeping its database volume:

```powershell
.\tax.ps1 down
```

For AWS testing, `docker-compose.aws.yml` also runs without `.env` and uses the test-only password `automark-test-only`. Replace it with a strong secret before exposing any deployment outside a trusted test environment. To override it, set `POSTGRES_PASSWORD` in `.env` or the shell, then run `docker compose -f docker-compose.aws.yml up -d --build`.

## Report Output

The generated report is an Excel workbook with the following sheets:

| Sheet | Contents |
|---|---|
| **Activity Statement** | Original IBKR Activity Statement |
| **Conversion Rates** | Official USD–MKD rates for every day in the statement period |
| **Calculation** | Securities/options and interest transactions; Forex when enabled |
| **Dividends** | One row per payment, including gross, withholding, net, exchange rate, and estimated tax |
| **Summary** | Monthly realized P/L including net dividends, and estimated tax |

### Notes on tax calculation
- Losses are deducted from profits **only within the same month** — tax can currently only be reduced on a monthly basis, not carried forward or applied against other months.
- **Interest losses are excluded** from deduction entirely.




----------------

TaxCalculator is a Java/Spring Boot and React application for preparing a North Macedonia tax workpaper from an Interactive Brokers (IBKR) Activity Statement CSV.

The application is an estimate and review tool. It is not an electronic tax filing system and does not replace confirmation from UJP or a tax professional.

What it supports
----------------

The calculator reads these IBKR sections:

* Trades: realized stock transactions and IBKR-provided Realized P/L values.
* Dividends: gross dividend payments, including payment-in-lieu entries.
* Withholding Tax: foreign withholding related to dividend payments.
* Interest: positive interest income and negative margin/debit interest charges.

The result is organized into collapsible categories:

* Stocks: USD result, NBRNM rate, MKD result, estimated tax per row, and totals.
* Dividends: gross paid, withholding, net received, estimated tax per payment, and totals.
* Interest income / charges: signed USD and MKD amounts, positive-interest tax, and totals.

Tax calculation behavior
------------------------

* The configured tax rate is currently 10% for stocks, dividends, and positive interest income.
* Negative interest charges receive zero tax and do not offset another category.
* The headline tax total reconciles with the row-level tax values shown in the tables.
* The existing stock tax-base and loss-treatment assumptions are intentionally unchanged and should be confirmed against the current applicable UJP rules.
* Foreign withholding is displayed separately. It is not automatically treated as a foreign-tax credit.
* IBKR's Realized P/L and basis values are used; the application does not independently recalculate FIFO cost basis.

Exchange rates
--------------

The application uses official NBRNM USD exchange rates.

Supported settings:

* Trade date (T)
* Previous day (T-1)

Rates are shared between users through PostgreSQL. The backend:

* Reuses cached dates instead of requesting NBRNM again.
* Stores weekend and holiday fallback results.
* Fetches only dates that are not already cached.
* Uses a PostgreSQL upsert so simultaneous users can safely populate the same cache.

Input validation and review
---------------------------

* Only CSV files are accepted by the UI.
* The backend rejects files without an IBKR Trades section.
* The result shows stock rows found, excluded non-stock rows, excluded loss rows, and incomplete rows skipped.
* Trades are displayed chronologically.
* Stock results can be filtered by all, gains, or losses and searched by symbol/date.
* The UI and CLI use the same five-sheet workbook generator: `Activity Statement`, `Conversion Rates`, `Calculation`, `Dividends`, and `Summary`.
* By default, the Calculation sheet includes securities/options and interest; Forex can be included from the UI or CLI. Dividend payments appear on their own `Dividends` sheet.
* Dividend tax is calculated on gross dividends. Withholding is subtracted from gross when adding net dividends to Summary realized P/L, but is not credited against estimated local tax.
* Negative interest is visible but never reduces securities or monthly tax. Summary tax applies positive securities and positive interest amounts separately within each month.

User interface
--------------

The React interface includes:

* Drag-and-drop IBKR CSV upload.
* An in-app guide explaining how to download an Activity Statement.
* Separate disabled tax fields for Stocks, Dividends, and Other income, currently fixed at 10%.
* Unified calculation results with collapsible income categories.
* Responsive layout for desktop and mobile screens.
* Clear per-row tax values and section totals.

Running locally
---------------

Requirements:

* Java 21
* Maven Wrapper
* Node.js and npm
* Docker Desktop

Start only PostgreSQL when running the backend and frontend from source:

    docker compose up -d postgres

Start the backend in a terminal:

    cd backend
    .\mvnw.cmd spring-boot:run

Start the frontend in another terminal:

    cd frontend
    npm run dev -- --host localhost

Open:

    http://localhost:5173/

The backend API runs on:

    http://localhost:8080

Generate a workbook without the web app
----------------------------------------

The launcher starts the Docker stack, waits for the API, and runs the shared CLI workbook generator:

    .\tax.ps1 workbook "C:\path\to\activity.csv"

The command writes a `-tax-workpaper.xlsx` file next to the CSV. For advanced options, run `npm --prefix frontend run generate-workbook -- --help` after installing dependencies with `npm ci --prefix frontend`.

Verification commands
---------------------

Backend tests:

    cd backend
    .\mvnw.cmd clean test

Frontend production build:

    cd frontend
    npm run build

Database
--------

PostgreSQL is configured through Docker Compose with these local defaults:

* Database: automark
* User: automark
* Password: automark
* Port: 5432

Flyway applies the schema migrations, including the shared NBRNM exchange-rate cache.

Known limitations
-----------------

* Tax treatment for positive interest income is currently configured as 10% but should be confirmed legally.
* Negative interest is displayed and included in the calculation view, but does not reduce tax.
* Foreign withholding is not automatically credited against the local estimate.
* Options, FX activity, stock awards, deposits, and unrealized gains are not included in the tax estimate.
* The application relies on IBKR's realized P/L values rather than independently rebuilding every lot match.
* NBRNM availability and response format remain external dependencies.
