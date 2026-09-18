import { useState } from "react";

type ForexRow = {
  symbol: string;
  date: string;
  rateDate: string;
  usdResult: number;
  mkdRate: number;
  mkdResult: number;
  estimatedTaxMkd: number;
};

type ForexSectionProps = {
  rows: ForexRow[];
  taxRate: string;
  forexUsd: number;
  forexMkd: number;
  forexTaxMkd: number;
  money: (value: number, currency: string) => string;
};

export default function ForexSection({
  rows,
  taxRate,
  forexUsd,
  forexMkd,
  forexTaxMkd,
  money,
}: ForexSectionProps) {
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const paginatedRows = rows.slice(
    activePage * pageSize,
    (activePage + 1) * pageSize,
  );

  return (
    <details className="category-section forex-section" open>
      <summary>
        <span className="category-title">
          <span className="category-icon forex-icon">F</span>
          <span>
            <strong>Forex</strong>
            <small>{rows.length} foreign-exchange activity rows</small>
          </span>
        </span>
        <span className="category-total forex-total">
          Estimated tax if included {money(forexTaxMkd, "MKD")}{" "}
          <span className="chevron">v</span>
        </span>
      </summary>
      <section className="forex-panel">
        <div className="interest-summary">
          <div>
            <span>MTM result</span>
            <strong>{money(forexUsd, "USD")}</strong>
            <small>{money(forexMkd, "MKD")}</small>
          </div>
          <div>
            <span>Forex trades</span>
            <strong>{rows.length}</strong>
            <small>Mark-to-market values shown below</small>
          </div>
          <div>
            <span>Forex tax</span>
            <strong className="tax-value">{money(forexTaxMkd, "MKD")}</strong>
            <small>Positive MTM values taxed at {taxRate}% if included</small>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Trade date</th>
                <th>Rate date</th>
                <th className="number">MTM P/L USD</th>
                <th className="number">MKD / USD</th>
                <th className="number">MTM P/L MKD</th>
                <th className="number">{taxRate}% tax due</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="not-taxable-empty">
                    No Forex rows were found in this statement.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr
                    className={
                      row.estimatedTaxMkd === 0 && row.usdResult < 0
                        ? "not-taxable-row"
                        : ""
                    }
                    key={`${row.symbol}-${row.date}-${activePage}-${index}`}
                  >
                    <td>
                      <strong>{row.symbol}</strong>
                    </td>
                    <td>{row.date}</td>
                    <td>{row.rateDate}</td>
                    <td
                      className={`number ${row.usdResult >= 0 ? "positive" : "negative"}`}
                    >
                      {money(row.usdResult, "USD")}
                    </td>
                    <td className="number rate-value">
                      {row.mkdRate.toFixed(4)}
                    </td>
                    <td
                      className={`number ${row.mkdResult >= 0 ? "positive" : "negative"}`}
                    >
                      {money(row.mkdResult, "MKD")}
                    </td>
                    <td className="number tax-value">
                      {money(row.estimatedTaxMkd, "MKD")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Total</th>
                <th className="number">
                  {money(
                    rows.reduce((total, row) => total + row.usdResult, 0),
                    "USD",
                  )}
                </th>
                <th></th>
                <th className="number">{money(forexMkd, "MKD")}</th>
                <th className="number tax-value">
                  {money(forexTaxMkd, "MKD")}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="table-footer">
          <span>
            Showing {paginatedRows.length} of {rows.length} rows
          </span>
          <nav className="pagination" aria-label="Forex table pages">
            <button
              type="button"
              onClick={() => setPage(activePage - 1)}
              disabled={activePage === 0}
            >
              Previous
            </button>
            <span>
              Page {activePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(activePage + 1)}
              disabled={activePage === pageCount - 1}
            >
              Next
            </button>
          </nav>
        </div>
      </section>
    </details>
  );
}
