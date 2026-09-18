# IBKR 2025 Tax Data Summary

Prepared from `U16047828_2025_2025 - Copy.csv`.

## Scope and important limitation

This is a data-extraction and reconciliation summary, not a tax return or legal opinion. It assumes the taxpayer was a tax resident of North Macedonia during 2025. The final filing treatment should be confirmed with a North Macedonian tax adviser, especially for foreign securities, options, FX, stock awards, and foreign tax credits.

The broker statement is in USD, while a North Macedonia filing normally requires reporting in MKD. Each income and disposal item should be converted using the applicable official exchange rate for its relevant date, using one documented method consistently.

## Account and period

- Broker: Interactive Brokers LLC
- Account: U16047828
- Account type: Individual, margin
- Statement period: January 1, 2025 to December 31, 2025
- Base currency: USD
- Ending net asset value: **$35,880.5757**
- Ending cash: **-$21,472.1943**
- Ending stock value: **$57,446.33**
- Ending open-position unrealized P/L: **$10,144.2973**

## Primary 2025 income/disposal figures in USD

These are the figures most likely to be relevant for an annual tax workpaper. They are not automatically the amounts to enter in a form.

| Category | Gross / gain | Loss / deduction | Net | Treatment candidate |
|---|---:|---:|---:|---|
| Realized stock P/L | 253.1571 | -0.5052 | **252.6519** | Realized securities disposal result |
| Realized option P/L | 0 | -435.0628 | **-435.0628** | Realized derivative result; confirm local treatment |
| Realized EUR/USD P/L | 114.0820 | -27.0495 | **87.0325** | Realized FX result; confirm whether separately reportable |
| All realized assets | 367.2391 | -462.6175 | **-95.3784** | Broker realized total |
| Dividends and payment-in-lieu | **18.8300** | 0 | **18.8300 gross** | Foreign dividend-type income candidate |
| US withholding tax | 0 | -5.6700 | -5.6700 | Potential foreign-tax-credit evidence, subject to eligibility |
| Net dividends after broker withholding | 13.1600 | 0 | **13.1600** | Cash received after withholding |
| Interest paid | 0 | -222.4500 | **-222.4500** | Financing expense; do not net against income without local authority |

## USD-first filing worksheet

Use this as the starting worksheet before any MKD conversion. Keep the categories separate; the totals below are not a proposed tax base.

| Worksheet line | USD amount | Source section | Notes |
|---|---:|---|---|
| Realized stock gains | 253.1571 | Realized & Unrealized Performance Summary | Gross realized stock profits |
| Realized stock losses | -0.5052 | Realized & Unrealized Performance Summary | Realized stock losses |
| **Net realized stock result** | **252.6519** | Realized & Unrealized Performance Summary | Broker net result |
| Realized option gains | 0.0000 | Realized & Unrealized Performance Summary | None reported |
| Realized option losses | -435.0628 | Realized & Unrealized Performance Summary | HIMS call option |
| **Net realized option result** | **-435.0628** | Realized & Unrealized Performance Summary | Separate derivative line |
| Realized FX gains | 114.0820 | Realized & Unrealized Performance Summary | EUR/USD |
| Realized FX losses | -27.0495 | Realized & Unrealized Performance Summary | EUR/USD |
| **Net realized FX result** | **87.0325** | Realized & Unrealized Performance Summary | Broker net result |
| **Total realized result, all assets** | **-95.3784** | Realized & Unrealized Performance Summary | Arithmetic sum of stocks, options, and FX |
| Gross ordinary dividends | 17.8800 | Dividends / Cash Report | Before US withholding |
| Payment in lieu of dividends | 0.9500 | Dividends / Cash Report | Keep separate for classification review |
| **Gross dividend-type receipts** | **18.8300** | Dividends | Before US withholding |
| US withholding tax | -5.6700 | Withholding Tax | Potential foreign-tax-credit evidence |
| **Net dividend-type cash received** | **13.1600** | Dividends and Withholding Tax | Gross less withholding |
| 2025 stock-award vesting value | 56.5129 | Grant Activity | Gross vesting entries only |
| 2025 stock-award share withholding | -16.9500 | Grant Activity | Shares withheld; reconcile to payroll |
| Debit interest paid | -222.4500 | Interest / Cash Report | Margin financing cost |
| Commissions and fees | -111.8864 | Cash Report | Already reflected in broker P/L calculations |
| Deposits | 22,106.9850 | Deposits & Withdrawals | Cash transfers, not income |
| Year-end open-position unrealized P/L | 10,144.2973 | Open Positions | Not realized |

### Basic USD subtotals

- Realized securities/FX result before any local tax classification: **-$95.3784**.
- Gross dividend-type receipts: **$18.8300**.
- Reported US withholding: **$5.6700**.
- Provisional 2025 vesting gross value: **$56.5129**.
- Cash deposits converted by IBKR to USD: **$22,106.9850**.

Do not combine the realized result, dividends, and stock-award value into one number yet. They may belong to different income categories and may have different rules for deductions, exemptions, withholding credits, and reporting.

## 10% USD estimate scenarios

These are arithmetic estimates only, using the assumed 10% rate. They are not a determination of the legally correct tax base.

### Scenario A: 10% on all net realized broker P/L

The broker's combined realized result is **-$95.3784** after stocks, the option loss, and FX. Since this is negative, the estimated tax is:

- Taxable gain: **$0.00**
- 10% estimate: **$0.00**

This assumes all three categories can be netted and losses can fully offset gains.

### Scenario B: 10% on net realized stock gains only

- Net realized stock gain: **$252.6519**
- 10% estimate before foreign-tax credit: **$25.27**
- Less US withholding, only if fully creditable: **$5.67**
- Possible balance after full credit: **$19.60**

This excludes the option loss, FX result, dividends, and stock-award vesting from the capital-gain calculation.

### Scenario C: stocks plus gross dividends plus 2025 stock-award vesting

If all of these were taxable at 10% but kept positive and separate:

- Stock gain: $252.6519
- Gross dividend-type receipts: $18.8300
- 2025 vesting value: $56.5129
- Combined positive amount: **$327.9948**
- 10% estimate before any credit: **$32.80**
- Possible balance after applying the full $5.67 withholding credit: **$27.13**

This scenario is only a rough upper-style estimate because dividends, employment/stock compensation, capital gains, foreign tax credits, and deductible losses may be governed by different rules.

### Do not include as 2025 realized income

- Open-position unrealized P/L: **$10,144.2973**.
- Mark-to-market total shown by IBKR: **$10,025.11797**. This includes open-position movement and is not the same as realized P/L.
- Deposits: **EUR 19,590**, shown by IBKR as **$22,106.985**. These are transfers of the taxpayer's own funds, not income.
- Purchases, sales proceeds, commissions, and margin cash movements are not themselves income. They support the calculation of gains and ownership/cash-flow records.

## Realized stock disposals

The statement identifies the following realized stock results:

| Symbol | Realized P/L USD |
|---|---:|
| AAPL | 7.9931 |
| DDOG | 240.3079 |
| INTC | 4.3509 |
| **Total stocks** | **252.6519** |

The stock total includes commissions in the broker's basis/proceeds calculation. The detailed `Trades` section is the source record for disposal date, quantity, proceeds, commission, cost basis, and realized P/L. The CSV contains 2025 stock orders for AAPL, DDOG, INTC, and many purchases that remained open at year-end.

## Realized option disposal

- Contract: HIMS 16JAN26 60 C
- Opened: October 28, 2025, one contract at total proceeds **-$446.00**, commission **-$1.0459**
- Closed: December 17, 2025, one contract at proceeds **$13.00**, commission **-$1.01689**
- Realized result: **-$435.06279**

This is a realized loss, not an open-position loss. Its deductibility or classification in North Macedonia needs confirmation.

## Dividends and payment-in-lieu amounts

- Total broker dividend section: **$18.83 gross**.
- Ordinary cash dividends excluding payment-in-lieu entries: **$17.88**.
- Payment in lieu of dividends: **$0.95**.
- US withholding tax: **$5.67**.
- Net credited after withholding: **$13.16**.

The statement has the individual payment dates, issuer descriptions, gross amounts, and withholding amounts. Retain those rows as the supporting schedule. Do not assume that payment-in-lieu amounts receive exactly the same treatment as ordinary dividends without local confirmation.

## Interest and financing

IBKR reports debit interest of **$222.45**:

- September 4: $6.15 for August
- October 3: $26.27 for September
- November 5: $87.60 for October
- December 3: $102.43 for November

The statement also reports **$93.56** ending interest accruals and **$316.01** interest accrued before a **$222.45** accrual reversal. These are statement mechanics; the cash interest paid figure is the cleanest 2025 cash-flow figure. Whether margin interest is deductible depends on the local income category and use of the borrowing.

## Stock grants and vesting

The Grant Activity section reports total activity of **$234.1529** and net quantity **2.4585** IBKR shares. It contains both future/unvested grants and 2025 vesting events.

2025 vesting entries identified in the statement:

- October 29 vesting: **$19.8437**; withholding: **-$5.95**
- November 21 vesting: **$23.3211**; withholding: **-$7.00**
- December 9 vesting: **$13.3481**; withholding: **-$4.00**
- 2025 vesting gross value: **$56.5129**
- 2025 share-withholding value: **-$16.95**

There are also grants with future vesting dates reported in 2025: January 6, March 19, April 1, May 29, September 19, and October 16. Those should not automatically be treated as 2025 earned income merely because they appear in the statement. Stock compensation is a separate issue from investment gains and should be reconciled to the employer/payroll records and any tax already withheld.

## Year-end foreign assets and positions

The statement reports open stocks with total cost basis **$47,302.0327**, market value **$57,446.33**, and unrealized P/L **$10,144.2973**. The largest year-end positions by market value are:

- SOFI: $14,137.20
- RBRK: $10,477.76
- PLTR: $6,221.25
- RKLB: $4,883.20
- TSLA: $4,946.92
- HIMS: $2,337.84
- NVDA: $2,797.50
- HOOD: $2,714.40

These are useful for foreign-asset disclosure and wealth/ownership records if required. They are not realized 2025 gains.

## Cash flows and reconciliation

- Deposits: **EUR 19,590**, equivalent in the statement to **$22,106.985**.
- Stock purchases: **-$66,711.1865**.
- Stock sales: **$23,350.9000**.
- Commissions: **-$111.8864**.
- Cash FX translation gain/loss: **$95.0108**.
- Ending settled cash: **-$21,472.1943**.

The negative cash balance indicates margin borrowing. It is not taxable income, but it explains the debit interest and should be retained in the supporting records.

## Suggested annual filing workpaper

Prepare the final filing schedule with these separate lines, converted to MKD by transaction/income date:

1. Realized stock disposals: **$252.6519 broker net result**.
2. Realized option disposal: **-$435.0628**.
3. Realized FX result: **$87.0325**.
4. Gross dividends and payment-in-lieu: **$18.8300**.
5. Foreign tax withheld: **$5.6700**, supported by the IBKR statement.
6. Stock compensation/vesting: provisional gross 2025 vesting value **$56.5129**, reconciled to employer documents before filing.
7. Foreign account/asset information: deposits, year-end holdings, cost basis, market value, and account identifier, if required by the filing process.

Do not calculate a final tax amount by simply applying a rate to the broker's total P/L. The North Macedonia classification, deductibility of losses, treatment of options/FX, treatment of stock awards, exchange-rate method, filing deadline, and foreign-tax-credit rules must be confirmed under the rules applicable to the taxpayer.

## Records to retain

- Original IBKR Activity Statement CSV.
- IBKR realized/unrealized performance report and detailed trade report.
- Dividend and withholding rows, including issuer and payment date.
- Proof of deposits and transfers from the bank.
- Employer/payroll documents for stock awards and tax withholding.
- Exchange-rate source and calculation for every converted amount.
- A copy of the submitted annual return and any foreign-income/asset schedules.