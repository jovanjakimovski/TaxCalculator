TaxCalculator
=============

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
* The detailed export includes stock, dividend, and interest sections.

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

Start PostgreSQL from the project root:

    docker compose up -d

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
