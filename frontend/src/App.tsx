import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  consumeReportCredit,
  createCheckout,
  Entitlement,
  getEntitlement,
  getLicenseCredential,
  redeemTestCode,
  saveLicenseCredential,
  clearLicenseCredential,
  linkLegacyLicense,
} from "./licenseClient";
import {
  CognitoSession,
  cognitoConfigured,
  completeCognitoSignIn,
  loadCognitoSession,
  signInWithCognito,
  signOutOfCognito,
  subscribeToCognitoSession,
} from "./cognitoAuth";

const API = import.meta.env.VITE_API_URL ?? "/api";
type Row = {
  assetCategory: string;
  symbol: string;
  date: string;
  rateDate: string;
  usdResult: number;
  mkdRate: number;
  mkdResult: number;
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
};
type Interest = {
  date: string;
  rateDate: string;
  usdAmount: number;
  mkdRate: number;
  mkdAmount: number;
};
type MonthlySummary = {
  month: string;
  stocksMkd: number;
  optionsMkd: number;
  dividendsMkd: number;
  interestMkd: number;
  taxablePnlMkd: number;
  taxMkd: number;
};
type Result = {
  fileName: string;
  transactionCount: number;
  realizedUsd: number;
  realizedMkd: number;
  estimatedTaxMkd: number;
  taxableIncomeMkd: number;
  monthlySummary: MonthlySummary[];
  dividendGrossUsd: number;
  dividendWithholdingUsd: number;
  dividendNetUsd: number;
  dividendGrossMkd: number;
  dividendWithholdingMkd: number;
  dividendNetMkd: number;
  interestPaidUsd: number;
  interestPaidMkd: number;
  interestIncomeUsd: number;
  interestIncomeMkd: number;
  interestChargesUsd: number;
  interestChargesMkd: number;
  rows: Row[];
  dividends: Dividend[];
  interest: Interest[];
};
type Filter = "all" | "gains" | "losses";
type WorkbookLanguage = "en" | "mk";
type ExchangeRate = { requestedDate: string; effectiveDate: string; mkdPerUsd: number };
type WorkbookArtifact = {
  file: File;
  language: WorkbookLanguage;
  workbook: ArrayBuffer;
  exchangeRates: ExchangeRate[];
};
type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
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
const moneyWhole = (value: number | null | undefined, currency: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value)
    : "-";
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const [result, setResult] = useState<Result>();
  const [workbookArtifact, setWorkbookArtifact] = useState<WorkbookArtifact>();
  const [licenseCredential, setLicenseCredential] = useState(() => cognitoConfigured ? "" : getLicenseCredential());
  const [authSession, setAuthSession] = useState<CognitoSession>();
  const [authReady, setAuthReady] = useState(!cognitoConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [legacyKeyToLink, setLegacyKeyToLink] = useState("");
  const [entitlement, setEntitlement] = useState<Entitlement>({
    credits: 0,
    testCodeEnabled: false,
    checkoutEnabled: false,
    accountMode: cognitoConfigured,
  });
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseError, setLicenseError] = useState("");
  const [testCode, setTestCode] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [restoreKey, setRestoreKey] = useState("");
  const [licenseKeyNotice, setLicenseKeyNotice] = useState("");
  const [reportRequestId, setReportRequestId] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [workbookLanguage, setWorkbookLanguage] = useState<WorkbookLanguage>("en");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showGuide, setShowGuide] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [securityPage, setSecurityPage] = useState(0);
  const [dividendPage, setDividendPage] = useState(0);
  const [interestPage, setInterestPage] = useState(0);

  useEffect(() => {
    if (!cognitoConfigured) return;
    let active = true;
    const unsubscribe = subscribeToCognitoSession((session) => {
      if (active) setAuthSession(session);
    });
    const initializeAuth = async () => {
      try {
        const session = window.location.pathname === "/auth/callback"
          ? await completeCognitoSignIn()
          : await loadCognitoSession();
        if (window.location.pathname === "/auth/callback") {
          window.history.replaceState({}, document.title, "/");
        }
        if (active) setAuthSession(session);
      } catch (e) {
        if (active) setLicenseError(e instanceof Error ? e.message : "Sign-in could not be completed.");
      } finally {
        if (active) setAuthReady(true);
      }
    };
    void initializeAuth();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (cognitoConfigured && !authReady) return;
    if (cognitoConfigured && !authSession) {
      setEntitlement({ credits: 0, testCodeEnabled: false, checkoutEnabled: false, accountMode: true });
      setLicenseLoading(false);
      return;
    }
    let active = true;
    getEntitlement(authSession?.accessToken ?? licenseCredential)
      .then((current) => {
        if (active) setEntitlement(current);
      })
      .catch((e: unknown) => {
        if (active) setLicenseError(e instanceof Error ? e.message : "Could not check report credits.");
      })
      .finally(() => {
        if (active) setLicenseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authReady, authSession, licenseCredential]);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "success") {
      setPaymentNotice("Payment received. Refresh your balance after the payment provider confirms it.");
    } else if (payment === "cancelled") {
      setPaymentNotice("Checkout was cancelled; no credit was used.");
    }
    if (payment) window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  async function refreshEntitlement() {
    if (cognitoConfigured && !authSession) {
      setLicenseError("Sign in to view your account credits.");
      return;
    }
    setLicenseLoading(true);
    setLicenseError("");
    try {
      setEntitlement(await getEntitlement(authSession?.accessToken ?? licenseCredential));
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Could not check report credits.");
    } finally {
      setLicenseLoading(false);
    }
  }

  async function activateTestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testCode.trim() || licenseBusy) return;
    setLicenseBusy(true);
    setLicenseError("");
    try {
      setEntitlement(await redeemTestCode(authSession?.accessToken ?? licenseCredential, testCode.trim()));
      setTestCode("");
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "The test code could not be redeemed.");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function buyReportCredit() {
    if (licenseBusy) return;
    setLicenseBusy(true);
    setLicenseError("");
    try {
      const checkout = await createCheckout(authSession?.accessToken ?? licenseCredential);
      window.location.assign(checkout.url);
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Checkout could not be started.");
      setLicenseBusy(false);
    }
  }

  async function startSignIn() {
    if (authBusy) return;
    setAuthBusy(true);
    setLicenseError("");
    try {
      await signInWithCognito();
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Sign-in could not be started.");
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      await signOutOfCognito();
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Sign-out could not be completed.");
      setAuthBusy(false);
    }
  }

  async function migrateLegacyKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession || !legacyKeyToLink.trim() || licenseBusy) return;
    setLicenseBusy(true);
    setLicenseError("");
    try {
      const updated = await linkLegacyLicense(authSession.accessToken, legacyKeyToLink.trim());
      setEntitlement(updated);
      setLegacyKeyToLink("");
      clearLicenseCredential();
      setLicenseKeyNotice("Credits linked to your account. They’re now available when you sign in on another device.");
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "The old license key could not be linked.");
    } finally {
      setLicenseBusy(false);
    }
  }

  async function copyLicenseKey() {
    setLicenseKeyNotice("");
    try {
      await navigator.clipboard.writeText(licenseCredential);
      setLicenseKeyNotice("License key copied. Keep it private; it controls your credits.");
    } catch {
      setLicenseKeyNotice("Clipboard access is unavailable. Reveal the key to copy it manually.");
      setShowLicenseKey(true);
    }
  }

  function restoreLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLicenseError("");
    try {
      const restoredCredential = saveLicenseCredential(restoreKey);
      setLicenseCredential(restoredCredential);
      setEntitlement({ credits: 0, testCodeEnabled: false, checkoutEnabled: false, accountMode: cognitoConfigured });
      setRestoreKey("");
      setLicenseKeyNotice("License key restored. Refresh the balance to load its credits.");
    } catch (e) {
      setLicenseError(e instanceof Error ? e.message : "Could not restore that license key.");
    }
  }

  async function calculate(nextFile = file, billable = true): Promise<ArrayBuffer | undefined> {
    if (!nextFile) {
      setError("Choose an IBKR Activity Statement CSV first.");
      return undefined;
    }
    const existingArtifact = workbookArtifact?.file === nextFile;
    const needsCredit = billable && !existingArtifact;
    if (needsCredit && entitlement.credits < 1) {
      setError("A report credit is required. Redeem a test code or purchase a credit first.");
      return undefined;
    }
    setError("");
    setLoading(true);
    try {
      const { calculateTaxWorkbook } = await import("./taxWorkbook.mjs");
      const generated = await calculateTaxWorkbook({
        csvText: await nextFile.text(),
        exchangeRatesApi: `${API}/tax/exchange-rates`,
        language: workbookLanguage,
      });
      if (needsCredit) {
        const requestId = reportRequestId ?? window.crypto.randomUUID();
        if (!reportRequestId) setReportRequestId(requestId);
        setEntitlement(await consumeReportCredit(authSession?.accessToken ?? licenseCredential, requestId));
      }
      setResult({ ...generated.calculationResult, fileName: nextFile.name });
      setWorkbookArtifact({
        file: nextFile,
        language: workbookLanguage,
        workbook: generated.workbook,
        exchangeRates: generated.exchangeRates,
      });
      if (needsCredit) setReportRequestId(undefined);
      setQuery("");
      setFilter("all");
      setSecurityPage(0);
      setDividendPage(0);
      setInterestPage(0);
      return generated.workbook;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
      return undefined;
    } finally {
      setLoading(false);
    }
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
      setReportRequestId(undefined);
      await calculate(sampleFile, false);
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
    setWorkbookArtifact(undefined);
    setReportRequestId(undefined);
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

  async function download() {
    if (!file || exporting) return;
    setError("");
    setExporting(true);
    try {
      let workbook = workbookArtifact?.file === file && workbookArtifact.language === workbookLanguage
        ? workbookArtifact.workbook
        : undefined;
      if (!workbook) {
        workbook = await calculate(file, !workbookArtifact || workbookArtifact.file !== file);
        if (!workbook) return;
      }
      const url = URL.createObjectURL(
        new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.csv$/i, "")}-tax-workpaper.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workbook export failed");
    } finally {
      setExporting(false);
    }
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-icon" aria-hidden="true">T<span>/</span>C</span>
          <span>
            <strong>TaxCalculator</strong>
            <small>MK tax workpaper</small>
          </span>
        </div>
        <div className="topbar-actions">
          {!cognitoConfigured ? (
            <div className="topbar-meta">
              <span className="status-dot" />
              <span>Private workspace</span>
            </div>
          ) : authSession ? (
            <div className="account-session">
              <span className="status-dot" />
              <span>{authSession.email ?? "Signed in"}</span>
              <button type="button" onClick={signOut} disabled={authBusy}>Sign out</button>
            </div>
          ) : (
            <button type="button" className="sign-in-button" onClick={startSignIn} disabled={!authReady || authBusy}>
              {authBusy ? "Opening sign-in..." : "Sign in"}
            </button>
          )}
          <div className="wallet-pill" aria-live="polite">
            <span className="wallet-mark" aria-hidden="true">R</span>
            <span>{licenseLoading ? "Checking" : `${entitlement.credits} credits`}</span>
          </div>
          <button className="guide-button" onClick={() => setShowGuide(true)} aria-label="Open product guide">
            <span aria-hidden="true">?</span> Guide
          </button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PERSONAL FINANCE / NORTH MACEDONIA</p>
          <h1>Investment tax workpaper</h1>
          <p className="hero-lede">
            Turn an IBKR activity statement into a clear, reviewable estimate in MKD.
          </p>
        </div>
        <div className="hero-meta">
          <span className="hero-meta-mark" aria-hidden="true">01</span>
          <div><strong>Local by design</strong><span>CSV and calculations stay in this browser.</span></div>
        </div>
      </section>
      <section className="workbench">
        <aside className="setup-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">START HERE</p>
              <h2>Build your report</h2>
            </div>
            <span className="step-badge">01</span>
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
            <span className="upload-symbol" aria-hidden="true">↑</span>
            <strong>{file ? file.name : "Choose an IBKR statement"}</strong>
            <span>
              {file
                ? `${fileSize(file.size)} · ready on this device`
                : "Drop a CSV here or browse your files"}
            </span>
          </label>
          <button
            type="button"
            className="sample-button"
            onClick={runSampleCalculation}
            disabled={loading}
          >
              {loading ? "Preparing sample..." : "Preview with sample statement"}
          </button>
          {file && (
            <div className="export-controls">
              <label className="export-language">
                <span>{workbookLanguage === "mk" ? "Јазик на работната книга" : "Report language"}</span>
                <select
                  value={workbookLanguage}
                  onChange={(event) => setWorkbookLanguage(event.target.value as WorkbookLanguage)}
                >
                  <option value="en">English</option>
                  <option value="mk">Македонски</option>
                </select>
              </label>
              <button
                type="button"
                className="sample-button"
                onClick={() => void download()}
                disabled={exporting}
              >
                {exporting ? "Preparing workbook..." : "Download Excel workpaper"}
              </button>
            </div>
          )}
          <section className="license-panel" aria-label="Report access">
            <div className="license-panel-heading">
              <div>
                <p className="eyebrow">YOUR BALANCE</p>
                <strong>{licenseLoading ? "Checking balance..." : `${entitlement.credits} report credits`}</strong>
              </div>
              <button type="button" className="license-refresh" onClick={refreshEntitlement} disabled={licenseLoading} title="Refresh report credits">
                Refresh
              </button>
            </div>
            {cognitoConfigured && !authSession && (
              <div className="account-signin-prompt">
                <p>Sign in to view your report credits and access them on any device.</p>
                <button type="button" className="license-buy" onClick={startSignIn} disabled={!authReady || authBusy}>
                  {authBusy ? "Opening sign-in..." : "Sign in to your account"}
                </button>
              </div>
            )}
            {entitlement.testCodeEnabled && (
              <form className="license-code-form" onSubmit={activateTestCode}>
                <label htmlFor="test-access-code">Redeem a test code</label>
                <div>
                  <input
                    id="test-access-code"
                    value={testCode}
                    onChange={(event) => setTestCode(event.target.value)}
                    autoComplete="off"
                    maxLength={120}
                    placeholder="Enter code"
                  />
                  <button type="submit" disabled={licenseBusy || !testCode.trim()}>
                    {licenseBusy ? "Working..." : "Redeem"}
                  </button>
                </div>
              </form>
            )}
            {entitlement.checkoutEnabled && (
              <button type="button" className="license-buy" onClick={buyReportCredit} disabled={licenseBusy}>
                {licenseBusy ? "Opening checkout..." : "Purchase one report · 1 credit"}
              </button>
            )}
            {cognitoConfigured && authSession && (
              <details className="license-key-manager">
                <summary>Move credits from an old key</summary>
                <p>Link a license key from this browser or another device. Its unused credits will move to your account.</p>
                <form className="license-key-restore" onSubmit={migrateLegacyKey}>
                  <label htmlFor="legacy-license-key">Old license key</label>
                  <input
                    id="legacy-license-key"
                    type="password"
                    value={legacyKeyToLink}
                    onChange={(event) => setLegacyKeyToLink(event.target.value)}
                    autoComplete="off"
                    maxLength={256}
                    placeholder="Paste old license key"
                  />
                  <button type="submit" disabled={licenseBusy || !legacyKeyToLink.trim()}>
                    {licenseBusy ? "Linking..." : "Link credits to account"}
                  </button>
                </form>
              </details>
            )}
            {!cognitoConfigured && <details className="license-key-manager">
              <summary>Manage license key</summary>
              <p>Back up this private key to recover credits in another browser.</p>
              <div className="license-key-current">
                <input
                  aria-label="Current license key"
                  type={showLicenseKey ? "text" : "password"}
                  value={licenseCredential}
                  readOnly
                />
                <button type="button" onClick={() => setShowLicenseKey(!showLicenseKey)}>
                  {showLicenseKey ? "Hide" : "Show"}
                </button>
                <button type="button" onClick={copyLicenseKey}>Copy</button>
              </div>
              <form className="license-key-restore" onSubmit={restoreLicense}>
                <label htmlFor="restore-license-key">Restore saved key</label>
                <input
                  id="restore-license-key"
                  value={restoreKey}
                  onChange={(event) => setRestoreKey(event.target.value)}
                  autoComplete="off"
                  maxLength={256}
                  placeholder="Paste license key"
                />
                <button type="submit" disabled={!restoreKey.trim()}>Use saved key</button>
              </form>
            </details>}
            {!licenseError && !licenseLoading && !entitlement.checkoutEnabled && !entitlement.testCodeEnabled &&
              (!cognitoConfigured || (authSession && entitlement.accountMode)) && (
              <p className="license-unavailable">Purchases aren’t available in this environment.</p>
            )}
            {paymentNotice && <p className="license-notice" role="status">{paymentNotice}</p>}
            {licenseKeyNotice && <p className="license-notice" role="status">{licenseKeyNotice}</p>}
            {licenseError && <p className="error" role="alert">{licenseError}</p>}
          </section>
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
                  setWorkbookArtifact(undefined);
                }}
              >
                x
              </button>
            </div>
          )}
          <details className="assumptions">
            <summary><span>Calculation assumptions</span><span aria-hidden="true">+</span></summary>
            <div className="assumptions-content">
              <div className="assumption-row"><span>Exchange rate</span><strong>Previous working day</strong></div>
              <div className="assumption-row"><span>Estimated rate</span><strong>10%</strong></div>
              <p>Monthly same-symbol offsets for stocks, options, and dividends. Positive net interest is included; Forex is excluded.</p>
            </div>
          </details>
          <button
            className="primary-action"
            onClick={() => calculate()}
            disabled={loading || licenseLoading || !file || entitlement.credits < 1}
          >
            <span>{loading ? "Building report..." : "Generate report"}</span>
            <span className="action-price">1 CREDIT</span>
          </button>
          {error && <p className="error">{error}</p>}
          <p className="privacy-note" role="note">
            <span aria-hidden="true">●</span> CSV and tax results stay on your device. Only rate dates and license requests leave it.
          </p>
        </aside>
        <div className="results-panel">
          {!result ? (
            <div className="empty-state">
              <div className="empty-topline">
                <span>REPORT PREVIEW</span><span>WAITING FOR STATEMENT</span>
              </div>
              <div className="empty-content">
                <div className="empty-copy">
                  <p className="eyebrow">YOUR REPORT, AT A GLANCE</p>
                  <h2>Clarity before filing.</h2>
                  <p>Upload an activity statement to review realized trades, dividend income, interest, and an estimated tax summary.</p>
                  <button className="guide-link" onClick={() => setShowGuide(true)}>See what’s included <span aria-hidden="true">↗</span></button>
                </div>
                <div className="report-skeleton" aria-hidden="true">
                  <div className="skeleton-heading"><span>MONTHLY SUMMARY</span><span>MKD</span></div>
                  <div className="skeleton-chart"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                  <div className="skeleton-lines"><i /><i /><i /></div>
                </div>
              </div>
              <div className="empty-footer">
                <span><b>01</b> Upload statement</span><i /><span><b>02</b> Generate report</span><i /><span><b>03</b> Review & export</span>
              </div>
            </div>
          ) : (
            <>
              <div className="results-heading">
                <div>
                  <p className="eyebrow">GENERATED WORKPAPER</p>
                  <h2>{result.fileName}</h2>
                  <p className="muted">
                    {result.transactionCount} closed trades <span>·</span> NBRNM exchange rates <span>·</span> T-1 conversion
                  </p>
                </div>
                <button
                  type="button"
                  className="download-button"
                  onClick={() => void download()}
                  disabled={exporting}
                >
                  <span className="download-icon" aria-hidden="true">↓</span>
                  {exporting ? "Preparing…" : "Download workpaper"}
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
                    <strong>{moneyWhole(result.estimatedTaxMkd, "MKD")}</strong>
                    <small>Rounded up to whole MKD under workpaper rules</small>
                  </div>
                  <div className="metric">
                    <span>Total taxable income</span>
                    <strong>{money(result.taxableIncomeMkd, "MKD")}</strong>
                    <small>After monthly, same-symbol offsets</small>
                  </div>
                  <div className="metric">
                    <span>Realized P/L</span>
                    <strong>{money(result.realizedUsd, "USD")}</strong>
                    <small>Closed stock and option trades</small>
                  </div>
                  <div className="metric">
                    <span>Converted P/L</span>
                    <strong>{money(result.realizedMkd, "MKD")}</strong>
                    <small>Converted at NBRNM previous-working-day rates</small>
                  </div>
                </section>
                <section className="category-section">
                  <div className="calculation-heading">
                    <div>
                      <p className="eyebrow">Monthly workpaper summary</p>
                      <h3>Taxable income and tax</h3>
                    </div>
                    <span>MKD · matches the exported Summary</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th className="number">Stocks P/L</th>
                          <th className="number">Options P/L</th>
                          <th className="number">Dividends</th>
                          <th className="number">Net interest</th>
                          <th className="number">Total taxable P/L</th>
                          <th className="number">Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.monthlySummary.map((month) => (
                          <tr key={month.month}>
                            <td>{month.month}</td>
                            <td className="number">{money(month.stocksMkd, "MKD")}</td>
                            <td className="number">{money(month.optionsMkd, "MKD")}</td>
                            <td className="number">{money(month.dividendsMkd, "MKD")}</td>
                            <td className="number">{money(month.interestMkd, "MKD")}</td>
                            <td className="number">{money(month.taxablePnlMkd, "MKD")}</td>
                            <td className="number tax-value">{money(month.taxMkd, "MKD")}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>Total</th>
                          <td colSpan={5}></td>
                          <th className="number tax-value">{moneyWhole(result.estimatedTaxMkd, "MKD")}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
                <details className="category-section" open>
                  <summary>
                    <span className="category-title">
                      <span className="category-icon stocks-icon">S</span>
                      <span>
                        <strong>Stocks and options</strong>
                        <small>
                          {result.transactionCount} closed transactions
                        </small>
                      </span>
                    </span>
                    <span className="category-total">
                      Realized P/L {money(result.realizedMkd, "MKD")} {" "}
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
                          <th>Asset class</th>
                          <th>Symbol</th>
                          <th>Trade date</th>
                          <th>Rate date</th>
                          <th className="number">USD result</th>
                          <th className="number">MKD / USD</th>
                          <th className="number">MKD result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row, index) => (
                          <tr key={`${row.symbol}-${row.date}-${activeSecurityPage}-${index}`}>
                            <td>{row.assetCategory === "Equity and Index Options" ? "Options" : "Stocks"}</td>
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
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={4}>Total</th>
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
                    <span>Same-symbol monthly offsets are shown in the Summary.</span>
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
                        Gross dividends {money(result.dividendGrossMkd, "MKD")} {" "}
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
                          Gross dividends are shown separately; tax appears in the monthly Summary
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
                          <small>{result.interest.length} interest entries</small>
                        </span>
                      </span>
                      <span className="category-total interest-total">
                        Net interest {money(result.interestPaidMkd, "MKD")} {" "}
                        <span className="chevron">v</span>
                      </span>
                    </summary>
                    <section className="interest-panel">
                      <div className="interest-notice">
                        <strong>Included in calculation</strong>
                        <span>
                          Positive monthly net interest is included in taxable income. Negative monthly net interest contributes zero.
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
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th colSpan={2}>Net interest</th>
                              <th className="number interest-value">
                                {money(result.interestPaidUsd, "USD")}
                              </th>
                              <th></th>
                              <th className="number interest-value">
                                {money(result.interestPaidMkd, "MKD")}
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
                    Stocks, options, and dividends offset by symbol and month.
                    Positive monthly net interest is included; Forex is excluded.
                  </p>
                </div>
              </article>
              <article className="guide-card">
                <span className="guide-number">02</span>
                <div>
                  <h3>Official MKD conversion</h3>
                  <p>
                    USD amounts are converted to MKD using official NBRM middle
                    rates using the previous working day (T-1) as the rate date.
                  </p>
                </div>
              </article>
              <article className="guide-card">
                <span className="guide-number">03</span>
                <div>
                  <h3>Review and adjust</h3>
                  <p>
                    Upload your own CSV or try the sample file. Review the
                    schedules and monthly Summary; Calculate and Export use the
                    same browser-side workpaper rules.
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
