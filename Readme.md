# TaxCalculator

Upload an IBKR Activity Statement CSV, select **Calculate**, review the monthly results in MKD, and select **Export Excel**. The app is free and has no login, credits, checkout, acknowledgement step, or advanced mode.

The interface supports Macedonian and English. The **Excel document language** picker controls the exported workbook independently of the interface language. Changing the export language reuses the same exchange rates and calculation rules.

## Run locally

Requires Docker Desktop. The launcher installs frontend dependencies when needed.

```powershell
.\tax.ps1 dev
```

This starts only the frontend, exchange-rate API and PostgreSQL rate cache. The standard `.\tax.ps1 ui` launcher also serves the free Beginner UI; its legacy licensing service is unused by the frontend.

For frontend development, run the exchange-rate backend and then:

```powershell
cd frontend
npm install
npm run dev -- --host localhost
```

Vite proxies `/api` to the tax backend at `http://localhost:8080`. The frontend sends only statement dates to the exchange-rate endpoint; it does not upload the CSV or tax results.

## Excel export

The browser and CLI use the same generator and produce five sheets:

1. **Original Statement / Оригинален Извештај** preserves the original CSV rows, including other currencies.
2. **Exchange Rate List / Курсна Листа** lists dates and official USD/MKD rates.
3. **Realized Transactions / Реализирани трансакции** lists USD realized securities/options, gross dividends and interest. The first three columns show purchase date, sale date and T-1 exchange-rate date with matching styling in YYYY-MM-DD format and widths set to 12.5. Missing purchase dates are displayed as `/`. For an aggregate sale with multiple purchase dates, only the latest acquisition date is displayed; the full purchase history remains available to the calculation. Purchase dates replace the former holding-days column, so the report still has 13 columns. Formulas reference the original statement and exchange-rate sheet. Stocks held longer than two calendar years are excluded from tax in Calculation, while every realized sale and its original result remain visible.
4. **Calculation / Пресметка** has month, underlying symbol, and realized profit or loss in MKD. The amount header includes a smaller italic formula description. Interest appears only in months containing actual interest events, after the month's securities groups.
5. **Summary / Резиме** has **Month / Месец**, **Total / Вкупно**, and **Tax / Данок**, with the rounded final tax total below.

For a local command-line export:

```powershell
.\tax.ps1 workbook "C:\path\to\activity.csv"
```

The workbook is written beside the source CSV. To select the workbook language or a different exchange-rate endpoint, use the shared generator:

```powershell
npm --prefix frontend run generate-workbook -- "C:\path\to\activity.csv" --language mk --rates-api http://localhost:8080/api/tax/exchange-rates
```

## Calculation rules

- Only USD stocks, options, dividends and interest enter calculations. Mixed-currency statements are accepted; other currencies remain in the original sheet.
- Securities use IBKR's reported realized P/L and cost basis. FIFO lots and corporate actions are not independently reconstructed.
- Only stocks receive the requested holding-period exemption. A sale must occur after the two-year purchase anniversary, using calendar years rather than a fixed 730-day count. Options, dividends and interest keep their existing treatment.
- IBKR ClosedLot rows supply the actual purchase dates and realized results of sold stock and option lots, including purchases before the statement period. Lot quantities, cost basis and realized P/L must reconcile to their sale Order; Trade execution rows are not counted again. Both standard Trades headers and headers containing Exchange are supported, as are ISO and US-format ClosedLot dates. Each stock lot's two-year eligibility is checked separately, so a sale containing older and newer shares excludes only the eligible lots' results. Option purchase dates are shown for reference and do not provide a holding-period exemption.
- Without ClosedLot details, stock purchase dates are populated from buy orders only when the statement verifies a zero opening position and reconciles the position history. Multiple possible purchase dates are retained internally without assuming FIFO, while the workbook displays only the latest date; partial sales retain all possible dates until the position is fully closed. Validated stock splits preserve purchase dates. A compatible Order row with an explicit appended Open Date, Acquisition Date or Purchase Date also supplies the date directly. Unknown opening positions or unsupported position changes remain taxable and display `/` in the purchase-date column. Holding periods remain internal to the tax calculation. No manual date entry or historical-file upload is required.
- Each event is converted to MKD using the official NBRNM USD middle rate for the previous day (T-1), with the latest available prior rate used for weekends and holidays.
- Stocks, options and gross dividends are netted by underlying symbol within the same month. Negative groups contribute zero; losses do not carry across symbols or months.
- Interest is netted separately within each month and floored at zero. Negative interest does not reduce securities or dividend income.
- Foreign withholding, including signed refunds, is retained in the original statement and is not deducted from this calculation. Review figures net refunds against amounts withheld.
- Tax is 10% of the resulting monthly amount. The final sum is rounded upward to a whole denar.

These are the user-confirmed calculation rules. The app is an estimate and export aid, rather than a filing system.

## File handling

The selected CSV, calculated figures and workbook stay in browser memory. Reloading clears the current report, so download Excel to keep a copy. Only the interface language preference is stored locally.

Malformed CSVs, unsupported trade column layouts, short positions, invalid dates/amounts, unreconciled stock lots and Excel formulas exceeding the supported length are rejected before generating a report. Forex, deposits, grants and unrealized gains are outside the calculation.

Private statements, generated workbooks and audit outputs are ignored by Git and excluded from deployment images. Public fixtures use synthetic data only.

## Verification

```powershell
cd frontend
npm run build
npm test
npm run test:e2e
```

Browser checks cover the free upload/calculation/export flow, both export languages, error recovery, mixed currencies, responsive layouts, stale calculations and the absence of licensing requests. Unit checks cover the shared calculation and statement parsing rules. Optional private-statement checks are enabled with `PRIVATE_STATEMENT_PATH` and `PRIVATE_RATE_API`; private CSV contents must never be committed as fixtures.

`scripts/verify-excel.ps1` opens a generated workbook read-only in a separate hidden Microsoft Excel instance and compares recalculated numeric formulas with expected values.

## Deployment

The existing AWS development workflow verifies a push to `main` and then deploys the free app. See [DEV_DEPLOY.md](DEV_DEPLOY.md) for the independent development stack and [AWS_DEPLOY.md](AWS_DEPLOY.md) for existing infrastructure details. The legacy account/payment services remain in the repository but are not part of the current frontend flow.

The exchange-rate backend requires Java 21, PostgreSQL and Maven. Flyway maintains the NBRNM exchange-rate cache. Historical rate data is fetched from the [official NBRNM service](https://www.nbrm.mk/KLServiceNOV/EN/GetExchangeRate).
