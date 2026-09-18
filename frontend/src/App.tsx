import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import ForexSection from "./ForexSection";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8080/api";
type Row = {
  assetCategory: string;
  symbol: string;
  date: string;
  rateDate: string;
  usdResult: number;
  mkdRate: number;
  mkdResult: number;
  estimatedTaxMkd: number;
  holdingDays?: number;
};
type Dividend = {
  date: string;
  rateDate: string;
  symbol: string;
  description: string;
  grossUsd: number;
  withholdingUsd: number;
  netUsd: number;
  mkdRate: number;
  grossMkd: number;
  withholdingMkd: number;
  netMkd: number;
  estimatedTaxMkd: number;
};
type Interest = {
  date: string;
  rateDate: string;
  usdAmount: number;
  mkdRate: number;
  mkdAmount: number;
  estimatedTaxMkd: number;
};
type Result = {
  fileName: string;
  transactionCount: number;
  realizedUsd: number;
  realizedMkd: number;
  estimatedTaxMkd: number;
  taxableIncomeMkd: number;
  securitiesTaxMkd: number;
  forexUsd: number;
  forexMkd: number;
  forexTaxMkd: number;
  rateOffsetDays: number;
  stockTradeRows: number;
  excludedNonStockRows: number;
  excludedLossRows: number;
  skippedRows: number;
  dividendGrossUsd: number;
  dividendWithholdingUsd: number;
  dividendNetUsd: number;
  dividendGrossMkd: number;
  dividendWithholdingMkd: number;
  dividendNetMkd: number;
  dividendTaxMkd: number;
  interestPaidUsd: number;
  interestPaidMkd: number;
  interestIncomeUsd: number;
  interestIncomeMkd: number;
  interestChargesUsd: number;
  interestChargesMkd: number;
  interestTaxMkd: number;
  rows: Row[];
  forexRows: Row[];
  dividends: Dividend[];
  interest: Interest[];
};
type Filter = "all" | "gains" | "losses";
type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};
type CalculationOverrides = {
  offsetSecuritiesLosses?: boolean;
  offsetForexLosses?: boolean;
  offsetAcrossSections?: boolean;
};

const money = (value: number | null | undefined, currency: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : "-";
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Table pages">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount - 1}
      >
        Next
      </button>
    </nav>
  );
}

export default function App() {
  const [file, setFile] = useState<File>();
  const [offset, setOffset] = useState("1");
  const [securitiesTaxRate, setSecuritiesTaxRate] = useState("10");
  const [dividendTaxRate, setDividendTaxRate] = useState("10");
  const [forexTaxRate, setForexTaxRate] = useState("10");
  const [interestTaxRate, setInterestTaxRate] = useState("10");
  const [offsetSecuritiesLosses, setOffsetSecuritiesLosses] = useState(false);
  const [offsetForexLosses, setOffsetForexLosses] = useState(false);
  const [offsetAcrossSections, setOffsetAcrossSections] = useState(false);
  const [includeSecurities, setIncludeSecurities] = useState(true);
  const [includeDividends, setIncludeDividends] = useState(true);
  const [includeForex, setIncludeForex] = useState(false);
  const [includeInterest, setIncludeInterest] = useState(true);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [securityPage, setSecurityPage] = useState(0);
  const [dividendPage, setDividendPage] = useState(0);
  const [interestPage, setInterestPage] = useState(0);

  async function calculate(
    nextFile = file,
    overrides: CalculationOverrides = {},
  ) {
    if (!nextFile) {
      setError("Choose an IBKR Activity Statement CSV first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", nextFile);
      body.append("rateOffsetDays", offset);
      body.append("securitiesTaxRate", securitiesTaxRate);
      body.append("dividendTaxRate", dividendTaxRate);
      body.append("forexTaxRate", forexTaxRate);
      body.append("interestTaxRate", interestTaxRate);
      body.append(
        "offsetSecuritiesLosses",
        String(overrides.offsetSecuritiesLosses ?? offsetSecuritiesLosses),
      );
      body.append(
        "offsetForexLosses",
        String(overrides.offsetForexLosses ?? offsetForexLosses),
      );
      body.append(
        "offsetAcrossSections",
        String(overrides.offsetAcrossSections ?? offsetAcrossSections),
      );
      body.append("includeSecurities", String(includeSecurities));
      body.append("includeDividends", String(includeDividends));
      body.append("includeForex", String(includeForex));
      body.append("includeInterest", String(includeInterest));
      const response = await fetch(`${API}/tax/realized-gains`, {
        method: "POST",
        body,
      });
      if (!response.ok)
        throw new Error(
          (
            await response
              .json()
              .catch(() => ({ message: response.statusText }))
          ).message,
        );
      setResult(await response.json());
      setQuery("");
      setFilter("all");
      setSecurityPage(0);
      setDividendPage(0);
      setInterestPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  function recalculateWith(overrides: CalculationOverrides) {
    if (file) void calculate(file, overrides);
  }

  async function runSampleCalculation() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/sample-ibkr.csv");
      if (!response.ok) throw new Error("Sample CSV could not be loaded");
      const sampleFile = new File([await response.blob()], "sample-ibkr.csv", {
        type: "text/csv",
      });
      setFile(sampleFile);
      await calculate(sampleFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sample calculation failed");
      setLoading(false);
    }
  }

  function acceptFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose the original IBKR CSV statement.");
      return;
    }
    setFile(nextFile);
    setResult(undefined);
    setError("");
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
  }
  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  function download() {
    if (!result) return;
    const header = [
      "Asset category",
      "Symbol",
      "Trade date",
      "Rate date",
      "USD realized result",
      "MKD per USD",
      "MKD realized result",
      "Estimated tax MKD",
    ]
      .map(csvCell)
      .join(",");
    const body = result.rows
      .map((row) =>
        [
          row.assetCategory,
          row.symbol,
          row.date,
          row.rateDate,
          row.usdResult,
          row.mkdRate,
          row.mkdResult,
          row.estimatedTaxMkd,
        ]
          .map(csvCell)
          .join(","),
      )
      .join("\n");
    const dividendHeader = [
      "Dividend income",
      "Security",
      "Description",
      "Payment date",
      "Rate date",
      "Gross USD",
      "Withholding USD",
      "Net USD",
      "MKD per USD",
      "Gross MKD",
      "Withholding MKD",
      "Net MKD",
      "Estimated tax MKD",
    ]
      .map(csvCell)
      .join(",");
    const dividendBody = result.dividends
      .map((dividend) =>
        [
          "Dividend",
          dividend.symbol,
          dividend.description,
          dividend.date,
          dividend.rateDate,
          dividend.grossUsd,
          dividend.withholdingUsd,
          dividend.netUsd,
          dividend.mkdRate,
          dividend.grossMkd,
          dividend.withholdingMkd,
          dividend.netMkd,
          dividend.estimatedTaxMkd,
        ]
          .map(csvCell)
          .join(","),
      )
      .join("\n");
    const interestHeader = [
      "Interest",
      "Payment date",
      "Rate date",
      "USD amount",
      "MKD per USD",
      "MKD amount",
      "Estimated tax MKD",
    ]
      .map(csvCell)
      .join(",");
    const interestBody = result.interest
      .map((item) =>
        [
          "Interest",
          item.date,
          item.rateDate,
          item.usdAmount,
          item.mkdRate,
          item.mkdAmount,
          item.estimatedTaxMkd,
        ]
          .map(csvCell)
          .join(","),
      )
      .join("\n");
    const sections = `${header}\n${body}${result.dividends.length > 0 ? `\n\n${dividendHeader}\n${dividendBody}` : ""}${result.interest.length > 0 ? `\n\n${interestHeader}\n${interestBody}` : ""}`;
    const url = URL.createObjectURL(
      new Blob([sections], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "realized-gains-mkd.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const visibleRows = useMemo(
    () =>
      result?.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
          const matchesQuery =
            !query ||
            `${row.symbol} ${row.date}`
              .toLowerCase()
              .includes(query.toLowerCase());
          const matchesFilter =
            filter === "all" ||
            (filter === "gains" && row.usdResult > 0) ||
            (filter === "losses" && row.usdResult < 0);
          return matchesQuery && matchesFilter;
        })
        .sort(
          (left, right) =>
            left.row.date.localeCompare(right.row.date) ||
            left.row.symbol.localeCompare(right.row.symbol) ||
            left.index - right.index,
        )
        .map(({ row }) => row) ?? [],
    [result, query, filter],
  );
  const securityPageSize = 25;
  const securityPageCount = Math.max(
    1,
    Math.ceil(visibleRows.length / securityPageSize),
  );
  const activeSecurityPage = Math.min(securityPage, securityPageCount - 1);
  const paginatedRows = visibleRows.slice(
    activeSecurityPage * securityPageSize,
    (activeSecurityPage + 1) * securityPageSize,
  );
  const dividendPageSize = 25;
  const dividendPageCount = Math.max(
    1,
    Math.ceil((result?.dividends.length ?? 0) / dividendPageSize),
  );
  const activeDividendPage = Math.min(dividendPage, dividendPageCount - 1);
  const paginatedDividends =
    result?.dividends.slice(
      activeDividendPage * dividendPageSize,
      (activeDividendPage + 1) * dividendPageSize,
    ) ?? [];
  const interestPageSize = 25;
  const interestPageCount = Math.max(
    1,
    Math.ceil((result?.interest.length ?? 0) / interestPageSize),
  );
  const activeInterestPage = Math.min(interestPage, interestPageCount - 1);
  const paginatedInterest =
    result?.interest.slice(
      activeInterestPage * interestPageSize,
      (activeInterestPage + 1) * interestPageSize,
    ) ?? [];

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-icon">TC</span>
          <span>
            <strong>TaxCalculator</strong>
            <small>Personal tax workpaper</small>
          </span>
        </div>
        <div className="topbar-actions">
          <div className="topbar-meta">
            <span className="status-dot" /> Local calculation workspace{" "}
            <span className="version">v0.1</span>
          </div>
          <button className="guide-button" onClick={() => setShowGuide(true)}>
            <span>?</span> How it works
          </button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">IBKR / NBRNM / UJP</p>
          <h1>Upload your IBKR statement.</h1>
          <p className="hero-lede">
            Get a clear MKD estimate from your realized stock trades and
            dividends. Start with the CSV and review the result before you
            export it.
          </p>
          <button className="guide-link" onClick={() => setShowGuide(true)}>
            Not sure where to start? Open the guide <span>-&gt;</span>
          </button>
        </div>
        <div className="hero-note">
          <span className="note-icon">i</span>
          <div>
            <strong>What this calculates</strong>
            <p>
              Realized stock P/L and dividend income. Options, FX, awards, and
              unrealized gains are excluded.
            </p>
          </div>
        </div>
      </section>
      <section className="workbench">
        <aside className="setup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>Upload statement</h2>
            </div>
            <span className="step-badge">1 / 2</span>
          </div>
          <label
            className={`upload-zone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            <span className="upload-symbol">+</span>
            <strong>{file ? file.name : "Drop your IBKR CSV here"}</strong>
            <span>
              {file
                ? `${fileSize(file.size)} ready to process`
                : "or click to browse"}
            </span>
          </label>
          <button
            type="button"
            className="sample-button"
            onClick={runSampleCalculation}
            disabled={loading}
          >
            {loading ? "Loading sample..." : "Try with sample CSV"}
          </button>
          {file && (
            <div className="file-chip">
              <span className="file-type">CSV</span>
              <span>{file.name}</span>
              <button
                type="button"
                aria-label="Remove selected file"
                onClick={() => {
                  setFile(undefined);
                  setResult(undefined);
                }}
              >
                x
              </button>
            </div>
          )}
          <div className="settings-divider">
            <span>Calculation assumptions</span>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowSettings(!showSettings)}
            >
              {showSettings ? "Hide" : "Edit"}
            </button>
          </div>
          <div className={`settings ${showSettings ? "settings-open" : ""}`}>
            <label>
              Exchange-rate date
              <select
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
              >
                <option value="0">Trade date (T)</option>
                <option value="1">Previous working day (T-1)</option>
              </select>
              <small>Uses the official NBRNM middle rate.</small>
            </label>
            <div className="tax-fields">
              <label>
                Securities
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={securitiesTaxRate}
                    onChange={(e) => setSecuritiesTaxRate(e.target.value)}
                    aria-label="Securities tax rate"
                  />
                  <span>%</span>
                </div>
              </label>
              <label>
                Dividends
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={dividendTaxRate}
                    onChange={(e) => setDividendTaxRate(e.target.value)}
                    aria-label="Dividends tax rate"
                  />
                  <span>%</span>
                </div>
              </label>
              <label>
                Forex
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={forexTaxRate}
                    onChange={(e) => setForexTaxRate(e.target.value)}
                    aria-label="Forex tax rate"
                  />
                  <span>%</span>
                </div>
              </label>
              <label>
                Interest
                <div className="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={interestTaxRate}
                    onChange={(e) => setInterestTaxRate(e.target.value)}
                    aria-label="Interest tax rate"
                  />
                  <span>%</span>
                </div>
              </label>
              <small>Set each section rate independently.</small>
            </div>
            <div className="offset-settings">
              <strong>Included in total</strong>
              <label>
                <input
                  type="checkbox"
                  checked={includeSecurities}
                  onChange={(e) => setIncludeSecurities(e.target.checked)}
                />{" "}
                Securities
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeDividends}
                  onChange={(e) => setIncludeDividends(e.target.checked)}
                />{" "}
                Dividends
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeForex}
                  onChange={(e) => setIncludeForex(e.target.checked)}
                />{" "}
                Forex
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeInterest}
                  onChange={(e) => setIncludeInterest(e.target.checked)}
                />{" "}
                Interest
              </label>
              <strong>Loss offset rules</strong>
              <label>
                <input
                  type="checkbox"
                  checked={offsetSecuritiesLosses}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOffsetSecuritiesLosses(checked);
                    recalculateWith({ offsetSecuritiesLosses: checked });
                  }}
                />{" "}
                Securities losses offset gains
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={offsetForexLosses}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOffsetForexLosses(checked);
                    recalculateWith({ offsetForexLosses: checked });
                  }}
                />{" "}
                Forex losses offset gains
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={offsetAcrossSections}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOffsetAcrossSections(checked);
                    recalculateWith({ offsetAcrossSections: checked });
                  }}
                />{" "}
                Allow losses across all sections
              </label>
              <small>
                Default: sections stay separate. Dividends have no loss offset.
              </small>
            </div>
          </div>
          <div className="assumption-row">
            <span>Tax rates</span>
            <strong>
              {securitiesTaxRate}% / {dividendTaxRate}% / {forexTaxRate}% /{" "}
              {interestTaxRate}%
            </strong>
          </div>
          <div className="assumption-row">
            <span>FX basis</span>
            <strong>{offset === "0" ? "Trade date" : "T-1"}</strong>
          </div>
          <button
            className="primary-action"
            onClick={() => calculate()}
            disabled={loading || !file}
          >
            <span>{loading ? "Calculating..." : "Calculate my estimate"}</span>
            <span className="action-arrow">-&gt;</span>
          </button>
          {error && <p className="error">{error}</p>}
          <p className="privacy-note">
            <span>Lock</span> Your statement stays in this local workspace.
          </p>
        </aside>
        <div className="results-panel">
          {!result ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <span>1</span>
                <span>2</span>
                <span>3</span>
              </div>
              <p className="eyebrow">Step 2</p>
              <h2>Review your estimate</h2>
              <p>
                After you upload the statement, your converted trades, official
                rates, and estimated tax will appear here.
              </p>
              <div className="empty-rule">
                <span />
                Your result will appear here
                <span />
              </div>
            </div>
          ) : (
            <>
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Step 2 / Review</p>
                  <h2>{result.fileName}</h2>
                  <p className="muted">
                    {result.transactionCount} closed stock events calculated
                    with NBRNM rates.
                  </p>
                </div>
                <button className="download-button" onClick={download}>
                  <span className="download-icon">v</span> Export CSV
                </button>
              </div>
              <section className="calculation-panel">
                <div className="calculation-heading">
                  <div>
                    <p className="eyebrow">Complete calculation</p>
                    <h3>Income categories</h3>
                  </div>
                  <span>Review each section before exporting</span>
                </div>
                <section className="metrics">
                  <div className="metric metric-primary">
                    <span>Estimated tax</span>
                    <strong>{money(result.estimatedTaxMkd, "MKD")}</strong>
                    <small>Tax due under selected rules</small>
                  </div>
                  <div className="metric">
                    <span>Total taxable income</span>
                    <strong>{money(result.taxableIncomeMkd, "MKD")}</strong>
                    <small>Income base after selected offsets</small>
                  </div>
                  <div className="metric">
                    <span>Realized P/L</span>
                    <strong>{money(result.realizedUsd, "USD")}</strong>
                    <small>Actual trading result before tax rules</small>
                  </div>
                  <div className="metric">
                    <span>Converted P/L</span>
                    <strong>{money(result.realizedMkd, "MKD")}</strong>
                    <small>
                      Combined stock-trade result converted to MKD at NBRNM
                      rates
                    </small>
                  </div>
                </section>
                <details className="category-section" open>
                  <summary>
                    <span className="category-title">
                      <span className="category-icon stocks-icon">S</span>
                      <span>
                        <strong>Securities</strong>
                        <small>
                          {result.transactionCount} realized security events
                        </small>
                      </span>
                    </span>
                    <span className="category-total">
                      Total tax {money(result.securitiesTaxMkd, "MKD")}{" "}
                      <span className="chevron">v</span>
                    </span>
                  </summary>
                  <div className="table-toolbar">
                    <div className="filter-tabs">
                      <button
                        className={filter === "all" ? "active" : ""}
                        onClick={() => {
                          setFilter("all");
                          setSecurityPage(0);
                        }}
                      >
                        All <span>{result.rows.length}</span>
                      </button>
                      <button
                        className={filter === "gains" ? "active" : ""}
                        onClick={() => {
                          setFilter("gains");
                          setSecurityPage(0);
                        }}
                      >
                        Gains
                      </button>
                      <button
                        className={filter === "losses" ? "active" : ""}
                        onClick={() => {
                          setFilter("losses");
                          setSecurityPage(0);
                        }}
                      >
                        Losses
                      </button>
                    </div>
                    <label className="search">
                      <span>/</span>
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setSecurityPage(0);
                        }}
                        placeholder="Search symbol or date"
                      />
                    </label>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Trade date</th>
                          <th>Rate date</th>
                          <th className="number">USD result</th>
                          <th className="number">MKD / USD</th>
                          <th className="number">MKD result</th>
                          <th className="number">10% tax due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row, index) => (
                          <tr
                            className={
                              row.estimatedTaxMkd === 0 && row.usdResult < 0
                                ? "not-taxable-row"
                                : ""
                            }
                            key={`${row.symbol}-${row.date}-${activeSecurityPage}-${index}`}
                          >
                            <td>
                              <span className="symbol-pill">
                                {row.symbol.slice(0, 1)}
                              </span>
                              <strong>{row.symbol}</strong>
                            </td>
                            <td>{row.date}</td>
                            <td>
                              <span className="rate-date">{row.rateDate}</span>
                            </td>
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
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={3}>Total</th>
                          <th className="number">
                            {money(
                              visibleRows.reduce(
                                (total, row) => total + row.usdResult,
                                0,
                              ),
                              "USD",
                            )}
                          </th>
                          <th></th>
                          <th className="number">
                            {money(
                              visibleRows.reduce(
                                (total, row) => total + row.mkdResult,
                                0,
                              ),
                              "MKD",
                            )}
                          </th>
                          <th className="number tax-value">
                            {money(
                              visibleRows.reduce(
                                (total, row) => total + row.estimatedTaxMkd,
                                0,
                              ),
                              "MKD",
                            )}
                          </th>
                        </tr>
                      </tfoot>
                    </table>
                    {visibleRows.length === 0 && (
                      <div className="no-results">No rows match this view.</div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      Showing {paginatedRows.length} of {visibleRows.length}{" "}
                      filtered rows
                    </span>
                    <span>Tax due is an estimate at {securitiesTaxRate}%</span>
                    <Pagination
                      page={activeSecurityPage}
                      pageCount={securityPageCount}
                      onPageChange={setSecurityPage}
                    />
                  </div>
                </details>
                {result.dividends.length > 0 && (
                  <details className="category-section" open>
                    <summary>
                      <span className="category-title">
                        <span className="category-icon dividends-icon">D</span>
                        <span>
                          <strong>Dividends</strong>
                          <small>{result.dividends.length} payment dates</small>
                        </span>
                      </span>
                      <span className="category-total">
                        Total tax {money(result.dividendTaxMkd, "MKD")}{" "}
                        <span className="chevron">v</span>
                      </span>
                    </summary>
                    <section className="dividend-panel">
                      <div className="dividend-heading">
                        <div>
                          <p className="eyebrow">Dividend income</p>
                          <h3>Payments and withholding</h3>
                        </div>
                        <span>
                          Gross amount is taxed; withholding is shown separately
                        </span>
                      </div>
                      <div className="dividend-summary">
                        <div>
                          <span>Gross paid</span>
                          <strong>
                            {money(result.dividendGrossUsd, "USD")}
                          </strong>
                          <small>{money(result.dividendGrossMkd, "MKD")}</small>
                        </div>
                        <div>
                          <span>Withholding</span>
                          <strong className="withholding">
                            -{money(result.dividendWithholdingUsd, "USD")}
                          </strong>
                          <small>
                            {money(result.dividendWithholdingMkd, "MKD")}{" "}
                            withheld
                          </small>
                        </div>
                        <div>
                          <span>Net received</span>
                          <strong>{money(result.dividendNetUsd, "USD")}</strong>
                          <small>{money(result.dividendNetMkd, "MKD")}</small>
                        </div>
                        <div>
                          <span>Dividend tax</span>
                          <strong>{money(result.dividendTaxMkd, "MKD")}</strong>
                          <small>10% of gross paid</small>
                        </div>
                      </div>
                      <div className="dividend-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Security</th>
                              <th>Description</th>
                              <th>Payment date</th>
                              <th>Rate date</th>
                              <th className="number">Gross USD</th>
                              <th className="number">Withholding</th>
                              <th className="number">Net USD</th>
                              <th className="number">10% tax due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedDividends.map((dividend) => (
                              <tr
                                key={`${dividend.date}-${dividend.symbol}-${dividend.description}`}
                              >
                                <td>
                                  <strong>{dividend.symbol}</strong>
                                </td>
                                <td>{dividend.description}</td>
                                <td>{dividend.date}</td>
                                <td>{dividend.rateDate}</td>
                                <td className="number positive">
                                  {money(dividend.grossUsd, "USD")}
                                </td>
                                <td className="number withholding">
                                  -{money(dividend.withholdingUsd, "USD")}
                                </td>
                                <td className="number">
                                  {money(dividend.netUsd, "USD")}
                                </td>
                                <td className="number tax-value">
                                  {money(dividend.estimatedTaxMkd, "MKD")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th colSpan={4}>Total</th>
                              <th className="number">
                                {money(result.dividendGrossUsd, "USD")}
                              </th>
                              <th className="number withholding">
                                -{money(result.dividendWithholdingUsd, "USD")}
                              </th>
                              <th className="number">
                                {money(result.dividendNetUsd, "USD")}
                              </th>
                              <th className="number tax-value">
                                {money(result.dividendTaxMkd, "MKD")}
                              </th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="table-footer">
                        <span>
                          Showing {paginatedDividends.length} of{" "}
                          {result.dividends.length} rows
                        </span>
                        <Pagination
                          page={activeDividendPage}
                          pageCount={dividendPageCount}
                          onPageChange={setDividendPage}
                        />
                      </div>
                    </section>
                  </details>
                )}
                {result.interest.length > 0 && (
                  <details className="category-section interest-section" open>
                    <summary>
                      <span className="category-title">
                        <span className="category-icon interest-icon">I</span>
                        <span>
                          <strong>Interest income / charges</strong>
                          <small>
                            {result.interest.length} interest entries, positive
                            income taxed at {interestTaxRate}%
                          </small>
                        </span>
                      </span>
                      <span className="category-total interest-total">
                        Total tax {money(result.interestTaxMkd, "MKD")}{" "}
                        <span className="chevron">v</span>
                      </span>
                    </summary>
                    <section className="interest-panel">
                      <div className="interest-notice">
                        <strong>Included in calculation</strong>
                        <span>
                          Positive interest income is taxed at {interestTaxRate}
                          %. Negative margin interest is included for visibility
                          but has 0 tax and does not offset another category.
                        </span>
                      </div>
                      <div className="interest-summary">
                        <div>
                          <span>Interest income</span>
                          <strong className="positive">
                            {money(result.interestIncomeUsd, "USD")}
                          </strong>
                          <small>
                            {money(result.interestIncomeMkd, "MKD")}
                          </small>
                        </div>
                        <div>
                          <span>Interest charges</span>
                          <strong className="interest-value">
                            {money(result.interestChargesUsd, "USD")}
                          </strong>
                          <small>
                            {money(result.interestChargesMkd, "MKD")}
                          </small>
                        </div>
                        <div>
                          <span>Interest tax</span>
                          <strong className="tax-value">
                            {money(result.interestTaxMkd, "MKD")}
                          </strong>
                          <small>{interestTaxRate}% of positive income</small>
                        </div>
                      </div>
                      <div className="interest-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Payment date</th>
                              <th>Rate date</th>
                              <th className="number">USD amount</th>
                              <th className="number">MKD / USD</th>
                              <th className="number">MKD amount</th>
                              <th className="number">10% tax due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedInterest.map((item) => (
                              <tr key={item.date}>
                                <td>{item.date}</td>
                                <td>{item.rateDate}</td>
                                <td
                                  className={`number ${item.usdAmount >= 0 ? "positive" : "interest-value"}`}
                                >
                                  {money(item.usdAmount, "USD")}
                                </td>
                                <td className="number rate-value">
                                  {item.mkdRate.toFixed(4)}
                                </td>
                                <td
                                  className={`number ${item.mkdAmount >= 0 ? "positive" : "interest-value"}`}
                                >
                                  {money(item.mkdAmount, "MKD")}
                                </td>
                                <td className="number tax-value">
                                  {money(item.estimatedTaxMkd, "MKD")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th colSpan={2}>Net interest / total tax</th>
                              <th className="number interest-value">
                                {money(result.interestPaidUsd, "USD")}
                              </th>
                              <th></th>
                              <th className="number interest-value">
                                {money(result.interestPaidMkd, "MKD")}
                              </th>
                              <th className="number tax-value">
                                {money(result.interestTaxMkd, "MKD")}
                              </th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="table-footer">
                        <span>
                          Showing {paginatedInterest.length} of{" "}
                          {result.interest.length} rows
                        </span>
                        <Pagination
                          page={activeInterestPage}
                          pageCount={interestPageCount}
                          onPageChange={setInterestPage}
                        />
                      </div>
                    </section>
                  </details>
                )}
                <ForexSection
                  rows={result.forexRows}
                  taxRate={forexTaxRate}
                  forexUsd={result.forexUsd}
                  forexMkd={result.forexMkd}
                  forexTaxMkd={result.forexTaxMkd}
                  money={money}
                />
              </section>
            </>
          )}
        </div>
      </section>
      <footer>
        <span>TaxCalculator</span>
        <span>Prepared for review, not a filing submission.</span>
        <button className="footer-guide" onClick={() => setShowGuide(true)}>
          Open guide
        </button>
      </footer>
      {showGuide && (
        <div
          className="guide-backdrop"
          role="presentation"
          onClick={() => setShowGuide(false)}
        >
          <section
            className="guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="guide-modal-head">
              <div>
                <p className="eyebrow">Quick overview</p>
                <h2 id="guide-title">Your calculation, at a glance.</h2>
                <p>
                  Upload an IBKR Activity Statement CSV to review your taxable
                  income and estimated tax in MKD.
                </p>
              </div>
              <button
                className="close-guide"
                aria-label="Close guide"
                onClick={() => setShowGuide(false)}
              >
                x
              </button>
            </div>
            <div className="guide-grid">
              <article className="guide-card guide-card-featured">
                <span className="guide-number">01</span>
                <div>
                  <h3>What it calculates</h3>
                  <p>
                    The workpaper covers realized securities gains and losses,
                    dividend income, withholding, interest income or charges,
                    and estimated tax.
                  </p>
                  <p>
                    Forex activity is shown separately and excluded from the
                    total by default.
                  </p>
                </div>
              </article>
              <article className="guide-card">
                <span className="guide-number">02</span>
                <div>
                  <h3>Official MKD conversion</h3>
                  <p>
                    USD amounts are converted to MKD using official NBRM middle
                    rates. You can choose the transaction date or the previous
                    working day as the rate date.
                  </p>
                </div>
              </article>
              <article className="guide-card">
                <span className="guide-number">03</span>
                <div>
                  <h3>Review and adjust</h3>
                  <p>
                    Upload your own CSV or try the sample file. Review the
                    paginated schedules, tax rates, included sections, and
                    loss-offset rules before exporting.
                  </p>
                  <div className="guide-callout">
                    <strong>Important scope</strong>
                    <span>
                      This is an estimate and review schedule, not a filing or
                      tax advice. Foreign withholding is shown separately.
                    </span>
                  </div>
                </div>
              </article>
            </div>
            <div className="guide-footer">
              <span>Ready to begin?</span>
              <button
                className="primary-action guide-start"
                onClick={() => setShowGuide(false)}
              >
                Upload a statement <span className="action-arrow">-&gt;</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
