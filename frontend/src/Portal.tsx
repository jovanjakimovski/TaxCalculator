import { useEffect, useRef, useState } from "react";
import {
  consumeReportCredit,
  createCheckout,
  getEntitlement,
  getLicenseConfig,
  getLicenseCredential,
  redeemTestCode,
  linkLegacyLicense,
} from "./licenseClient";
import type { Entitlement, LicenseConfig } from "./licenseClient";
import {
  cognitoConfigured,
  completeCognitoSignIn,
  currentAccessToken,
  loadCognitoSession,
  signInWithCognito,
  signOutOfCognito,
  subscribeToCognitoSession,
  takeCognitoReturnIntent,
} from "./cognitoAuth";
import type { CognitoSession } from "./cognitoAuth";
import { inspectStatement, fingerprint, MAX_FILE_BYTES } from "./statement";
import type { StatementPreview } from "./statement";
import { statementMessage } from "./statementMessages";
import { buildReport } from "./buildReport";
import {
  clearDraft,
  forgetReport,
  getReport,
  listReports,
  loadDraft,
  reportId,
  saveDraft,
  saveReport,
  saveReportIfAbsent,
} from "./reportStore";
import type { Language, SavedReport } from "./reportStore";
import { ReportView } from "./ReportView";
import { CalculationGuide } from "./CalculationGuide";
import { SignInView } from "./SignInView";
import {
  InvestorLanding,
  JourneyProgress,
  ExportInstructions,
} from "./InvestorLanding";

const API = import.meta.env.VITE_API_URL ?? "/api";
type Upload = { file: File; preview: StatementPreview; hash: string };
type View = "home" | "preview" | "report" | "account" | "guide" | "signin";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";

export default function Portal() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem("taxcalculator.language") === "mk" ? "mk" : "en",
  );
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<CognitoSession>();
  const [config, setConfig] = useState<LicenseConfig>();
  const [entitlement, setEntitlement] = useState<Entitlement>();
  const [owner, setOwner] = useState("");
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [upload, setUpload] = useState<Upload>();
  const [report, setReport] = useState<SavedReport>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [legacyKey, setLegacyKey] = useState("");
  const [pack, setPack] = useState(() => {
    const saved = Number(localStorage.getItem("taxcalculator.reportPackage"));
    return [1, 2, 3].includes(saved) ? saved : 1;
  });
  const [dialog, setDialog] = useState<"help" | "privacy" | "terms">();
  const modal = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const booted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const guideReturn = useRef<View>("home");
  const signInReturn = useRef<View>("home");
  const credits = entitlement?.credits ?? 0;
  const canUseAccount = Boolean(config && (!config.accountMode || session));
  const localTesting = Boolean(
    config && !config.accountMode && config.testCodeEnabled,
  );
  const existingUpload =
    upload && history.find((item) => item.fingerprint === upload.hash);

  function openCalculations() {
    if (view !== "guide") guideReturn.current = view;
    setView("guide");
  }
  function openSignIn() {
    if (view !== "signin") signInReturn.current = view;
    setView("signin");
  }
  function returnFromSignIn() {
    const previous = signInReturn.current;
    setView(
      (previous === "preview" && !upload) ||
        (previous === "report" && !report) ||
        (previous === "account" && !canUseAccount)
        ? "home"
        : previous,
    );
  }
  function returnFromCalculations() {
    const previous = guideReturn.current;
    setView(
      (previous === "preview" && !upload) ||
        (previous === "report" && !report) ||
        (previous === "account" && !canUseAccount)
        ? "home"
        : previous,
    );
  }

  async function run(label: string, task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  async function credential() {
    return config?.accountMode ? currentAccessToken() : getLicenseCredential();
  }
  async function refreshCredits() {
    setEntitlement(await getEntitlement(await credential()));
    if (owner) setHistory(await listReports(owner));
  }
  async function selectFile(file: File, persist = true) {
    if (!file.name.toLowerCase().endsWith(".csv"))
      throw new Error(
        tr(
          "Choose an original IBKR CSV file.",
          "Изберете оригинална IBKR CSV датотека.",
        ),
      );
    if (!file.size || file.size > MAX_FILE_BYTES)
      throw new Error(
        tr(
          "Choose a non-empty CSV up to 10 MB.",
          "Изберете CSV до 10 MB кој не е празен.",
        ),
      );
    const preview = inspectStatement(await file.text());
    const hash = await fingerprint(file);
    if (persist) await saveDraft(file);
    setUpload({ file, preview, hash });
    if (owner) setHistory(await listReports(owner));
    setAccepted(false);
    setView("preview");
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        const cfg = await getLicenseConfig();
        setConfig(cfg);
        let signedIn: CognitoSession | undefined;
        let returnTo: "preview" | "account" | "home" | undefined;
        if (location.pathname === "/auth/callback") {
          try {
            signedIn = await completeCognitoSignIn();
            returnTo = takeCognitoReturnIntent();
          } finally {
            window.history.replaceState({}, "", "/");
          }
        } else signedIn = await loadCognitoSession();
        setSession(signedIn);
        const draft = await loadDraft();
        if (draft) await selectFile(draft, false);
        if (signedIn && returnTo)
          setView(returnTo === "preview" && !draft ? "account" : returnTo);
        if (new URLSearchParams(location.search).get("payment") === "success") {
          setNotice(
            tr(
              "Returned from checkout. Refresh your balance when payment processing completes.",
              "Вратени сте од плаќање. Освежете го салдото по обработката.",
            ),
          );
          window.history.replaceState({}, "", "/");
        }
      } catch (e) {
        setError(message(e));
      }
    })();
  }, []);
  useEffect(() => subscribeToCognitoSession(setSession), []);
  useEffect(() => {
    let live = true;
    setOwner("");
    setHistory([]);
    setEntitlement(undefined);
    setReport((current) => (current?.owner === "sample" ? current : undefined));
    setView((current) =>
      current === "report" && report?.owner !== "sample" ? "home" : current,
    );
    if (!config) return;
    if (config.accountMode && !session) {
      setView((v) =>
        v === "account" || (v === "report" && report?.owner !== "sample")
          ? "home"
          : v,
      );
      return;
    }
    void (async () => {
      try {
        const identity = config.accountMode
          ? `account:${session!.issuer}|${session!.subject}`
          : `local:${await fingerprint(new Blob([getLicenseCredential()]))}`;
        const saved = await listReports(identity);
        if (live) {
          setOwner(identity);
          setHistory(saved);
        }
        const balance = await getEntitlement(
          config.accountMode
            ? await currentAccessToken()
            : getLicenseCredential(),
        );
        if (live) {
          setEntitlement(balance);
        }
      } catch (e) {
        if (live) setError(message(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [config, session?.issuer, session?.subject]);
  useEffect(() => {
    localStorage.setItem("taxcalculator.language", language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    localStorage.setItem("taxcalculator.reportPackage", String(pack));
  }, [pack]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    titleRef.current?.focus();
  }, [view]);
  useEffect(() => {
    if (dialog) modal.current?.showModal();
    else modal.current?.close();
  }, [dialog]);

  async function generate(existing?: SavedReport) {
    if (!owner || !canUseAccount)
      throw new Error(
        tr(
          "Sign in to unlock your report.",
          "Најавете се за да го отклучите извештајот.",
        ),
      );
    if (!upload && !existing) return;
    const current = existing
      ? {
          file: existing.file,
          preview: existing.preview,
          hash: existing.fingerprint,
        }
      : upload!;
    const id = reportId(owner, current.hash);
    const operation = async () => {
      let saved = await getReport(id);
      if (saved?.status === "ready") {
        setReport(saved);
        setView("report");
        return;
      }
      // Durable artifact + request ID BEFORE billing. Retrying pending records
      // must work even when a previous successful debit left zero credits.
      if (!saved) {
        if (!entitlement || credits < 1)
          throw new Error(
            tr(
              "You need one report credit. Buy a package or redeem a test code.",
              "Потребен е еден кредит. Купете пакет или внесете тест код.",
            ),
          );
        if (current.preview.errors.length)
          throw new Error(
            "This CSV needs attention before a report can be created.",
          );
        const output = await buildReport({
          csvText: (await current.file.text()).replace(/^\uFEFF/, ""),
          exchangeRatesApi: `${API}/tax/exchange-rates`,
          language,
        });
        saved = {
          id,
          owner,
          fingerprint: current.hash,
          requestId: crypto.randomUUID(),
          file: current.file,
          language,
          workbook: output.workbook,
          result: output.calculationResult,
          exchangeRates: output.exchangeRates,
          preview: current.preview,
          created: Date.now(),
          status: "pending",
        };
        saved = await saveReportIfAbsent(saved);
        setHistory(await listReports(owner));
      }
      setBusy(tr("Unlocking your report…", "Отклучување на извештајот…"));
      const token = await credential();
      if (config?.accountMode) {
        const signedIn = await loadCognitoSession();
        if (
          !signedIn ||
          `account:${signedIn.issuer}|${signedIn.subject}` !== owner
        )
          throw new Error(
            "Your account changed. Sign in to the original account to resume this report.",
          );
      }
      setEntitlement(await consumeReportCredit(token, saved.requestId));
      saved.status = "ready";
      await saveReport(saved);
      setReport(saved);
      setHistory(await listReports(owner));
      setView("report");
      await clearDraft();
    };
    if (navigator.locks)
      await navigator.locks.request(`taxcalculator:${id}`, operation);
    else await operation();
  }
  async function sample() {
    const response = await fetch("/sample-ibkr.csv");
    if (!response.ok) throw new Error("Sample is unavailable.");
    const file = new File([await response.text()], "sample-ibkr.csv", {
      type: "text/csv",
    });
    const preview = inspectStatement(await file.text());
    const rates = [];
    for (
      let day = new Date(`${preview.start}T00:00:00Z`);
      day.toISOString().slice(0, 10) <= preview.end;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const effective = new Date(day);
      effective.setUTCDate(day.getUTCDate() - 1);
      rates.push({
        requestedDate: day.toISOString().slice(0, 10),
        effectiveDate: effective.toISOString().slice(0, 10),
        mkdPerUsd: 60,
      });
    }
    const output = await buildReport({
      csvText: await file.text(),
      language,
      exchangeRates: rates,
      exchangeRatesApi: `${API}/tax/exchange-rates`,
    });
    setReport({
      id: "sample",
      owner: "sample",
      fingerprint: "sample",
      requestId: "sample",
      file,
      language,
      workbook: output.workbook,
      result: output.calculationResult,
      exchangeRates: rates,
      preview,
      created: Date.now(),
      status: "ready",
    });
    setView("report");
  }
  async function changeReportLanguage() {
    if (!report) return;
    const output = await buildReport({
      csvText: (await report.file.text()).replace(/^\uFEFF/, ""),
      exchangeRates: report.exchangeRates,
      exchangeRatesApi: `${API}/tax/exchange-rates`,
      language,
    });
    const updated = {
      ...report,
      language,
      workbook: output.workbook,
      result: output.calculationResult,
    };
    if (updated.owner !== "sample") await saveReport(updated);
    setReport(updated);
  }
  function download() {
    if (!report || report.status !== "ready") return;
    const url = URL.createObjectURL(
      new Blob([report.workbook], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.owner === "sample" ? "SAMPLE_" : ""}Tax_Report_${report.preview.start}_${report.preview.end}_${report.language}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  const packages = (
    <section className="purchase-card" aria-labelledby="purchase-title">
      <span className="eyebrow">
        {tr("YOUR REPORT, YOUR NUMBERS", "ВАШ ИЗВЕШТАЈ, ВАШИ ПОДАТОЦИ")}
      </span>
      <h2 id="purchase-title">
        {tr("Choose your report package", "Изберете пакет извештаи")}
      </h2>
      <p>
        {tr(
          "Get a detailed IBKR calculation, monthly MKD estimates, and a printable summary to help prepare your UJP filing.",
          "Добијте детална IBKR пресметка, месечни MKD проценки и резиме за подготовка на пријавата за УЈП.",
        )}
      </p>
      {canUseAccount && (
        <div className="balance">
          <span>
            <strong>{credits}</strong>{" "}
            {tr("report credits available", "достапни кредити")}
          </span>
          <button
            className="text-button"
            disabled={!!busy || !owner}
            onClick={() =>
              void run(
                tr("Refreshing balance…", "Освежување салдо…"),
                refreshCredits,
              )
            }
          >
            {tr("Refresh credits", "Освежи кредити")}
          </button>
        </div>
      )}
      <div
        className="package-options"
        role="group"
        aria-label={tr("Report packages", "Пакети извештаи")}
      >
        {[1, 2, 3].map((count) => (
          <button
            key={count}
            className={pack === count ? "package selected" : "package"}
            onClick={() => setPack(count)}
            disabled={!!busy || (!!config && !config.packages.includes(count))}
            aria-pressed={pack === count}
          >
            <span>
              {count}{" "}
              {tr(
                count === 1 ? "report" : "reports",
                count === 1 ? "извештај" : "извештаи",
              )}
            </span>
            <small>
              {tr("One credit per statement", "Еден кредит по извод")}
            </small>
          </button>
        ))}
      </div>
      <p className="credit-explainer">
        {tr(
          "1 credit = 1 unique CSV statement. Each package includes the full report and Excel; choose more credits for separate statements or years. Files stay on this browser.",
          "1 кредит = 1 уникатен CSV извод. Секој пакет вклучува целосен извештај и Excel; повеќе кредити се за одделни изводи или години. Датотеките остануваат во овој прелистувач.",
        )}
      </p>
      <p className="fine">
        {tr(
          "Price, currency, and applicable taxes are shown in secure checkout before you pay.",
          "Цената, валутата и применливите даноци се прикажуваат пред плаќањето.",
        )}
      </p>
      {config?.accountMode && !session ? (
        <button
          className="button primary full"
          disabled={!!busy}
          onClick={openSignIn}
        >
          {tr("Sign in to continue", "Најавете се за да продолжите")} →
        </button>
      ) : (
        <button
          className="button primary full"
          disabled={
            !!busy ||
            !owner ||
            !config?.checkoutEnabled ||
            !config.packages.includes(pack)
          }
          onClick={() =>
            void run(
              tr("Opening secure checkout…", "Отворање на плаќање…"),
              async () => {
                const checkout = await createCheckout(await credential(), pack);
                const url = new URL(checkout.url);
                if (
                  url.protocol !== "https:" ||
                  !url.hostname.endsWith(".lemonsqueezy.com")
                )
                  throw new Error("Invalid checkout destination.");
                window.location.assign(url.href);
              },
            )
          }
        >
          {tr(
            `Buy ${pack} ${pack === 1 ? "report" : "reports"}`,
            `Купи ${pack} ${pack === 1 ? "извештај" : "извештаи"}`,
          )}{" "}
          →
        </button>
      )}
      {config && !config.checkoutEnabled && (
        <p className="fine">
          {tr(
            "Purchases are not currently available.",
            "Купувањето моментално не е достапно.",
          )}
        </p>
      )}
      <ul className="checklist">
        <li>
          {tr(
            "Review your upload before using a credit",
            "Преглед пред користење кредит",
          )}
        </li>
        <li>
          {tr(
            "Free repeat downloads on this browser",
            "Бесплатно повторно преземање",
          )}
        </li>
        <li>
          {tr(
            "CSV processed on your device",
            "CSV се обработува на вашиот уред",
          )}
        </li>
      </ul>
      <button
        className="text-button"
        disabled={!!busy}
        onClick={() =>
          void run(tr("Preparing sample…", "Подготовка на пример…"), sample)
        }
      >
        {tr("See a sample report", "Погледнете пример извештај")} ↗
      </button>
      {config?.testCodeEnabled && canUseAccount && (
        <form
          className="test-code"
          onSubmit={(e) => {
            e.preventDefault();
            void run(tr("Redeeming code…", "Активирање код…"), async () => {
              setEntitlement(
                await redeemTestCode(await credential(), code.trim()),
              );
              setCode("");
              setNotice(
                config?.accountMode
                  ? tr(
                      "Test credits are available. Each code can be redeemed once per account.",
                      "Тест кредитите се достапни. Кодот се користи еднаш по сметка.",
                    )
                  : tr(
                      "Test credits are available in this browser’s local workspace.",
                      "Тест кредитите се достапни во локалното тестирање во овој прелистувач.",
                    ),
              );
            });
          }}
        >
          <label htmlFor="test-code">
            {tr("Have a test access code?", "Имате тест код?")}
          </label>
          <div className="inline-form">
            <input
              id="test-code"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={256}
              required
              disabled={!!busy}
            />
            <button className="button secondary" disabled={!!busy || !owner}>
              {tr("Redeem", "Активирај")}
            </button>
          </div>
        </form>
      )}
    </section>
  );

  return (
    <>
      <a className="skip-link" href="#main">
        {tr("Skip to content", "Кон содржината")}
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <button
            className="brand"
            aria-label="TaxCalculator home"
            disabled={!!busy}
            onClick={() => setView("home")}
          >
            <span className="brand-icon">
              t<span>✓</span>
            </span>
            tax<span>calculator</span>
            <sup>MK</sup>
          </button>
          <nav aria-label={tr("Main navigation", "Главна навигација")}>
            <button
              className="nav-link"
              disabled={!!busy}
              onClick={() =>
                void run(
                  tr("Preparing sample…", "Подготовка на пример…"),
                  sample,
                )
              }
            >
              {tr("Sample report", "Пример извештај")}
            </button>
            <button
              className="nav-link"
              disabled={!!busy}
              onClick={openCalculations}
            >
              {tr("How we calculate", "Како пресметуваме")}
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => setLanguage(language === "en" ? "mk" : "en")}
              disabled={!!busy}
              aria-label={tr("Switch to Macedonian", "Промени на англиски")}
            >
              {language === "en" ? "МК" : "EN"}
            </button>
            {session && config?.accountMode ? (
              <button
                className="button secondary small"
                disabled={!!busy}
                onClick={() => setView("account")}
              >
                {tr("My account", "Моја сметка")}{" "}
                <span className="credit-badge">{credits}</span>
              </button>
            ) : (
              <button
                className="button secondary small"
                disabled={!!busy}
                onClick={openSignIn}
              >
                {tr("Log in", "Најави се")}
              </button>
            )}
          </div>
        </div>
      </header>
      {localTesting && (
        <aside className="local-test-strip" role="note">
          <div className="container">
            <p>
              <strong>{tr("Local test workspace", "Локално тестирање")}</strong>
              <span>
                {tr(
                  "Test credits are separate from signed-in accounts.",
                  "Тест кредитите се одделни од најавени сметки.",
                )}
              </span>
            </p>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() => setView("account")}
            >
              {tr("My reports", "Мои извештаи")}
              <span className="credit-badge">{credits}</span>
            </button>
          </div>
        </aside>
      )}
      <main id="main" aria-busy={!!busy}>
        {(error || notice || busy) && (
          <div className="container status-stack">
            {error && (
              <div className="alert error" role="alert">
                <span>{statementMessage(error, language)}</span>
                <button
                  aria-label={tr("Dismiss error", "Затвори грешка")}
                  onClick={() => setError("")}
                >
                  ×
                </button>
              </div>
            )}
            {notice && (
              <div className="alert info" role="status">
                {notice}
              </div>
            )}
            {busy && (
              <div className="alert info" role="status">
                <span className="spinner" />
                {busy}
              </div>
            )}
            {!config && !busy && (
              <button
                className="text-button"
                onClick={() => window.location.reload()}
              >
                {tr("Retry connection", "Обиди се повторно")}
              </button>
            )}
          </div>
        )}
        {view === "signin" && (
          <SignInView
            language={language}
            busy={!!busy}
            configured={cognitoConfigured && Boolean(config?.accountMode)}
            hasPreview={signInReturn.current === "preview" && Boolean(upload)}
            localTesting={localTesting}
            headingRef={titleRef}
            onBack={returnFromSignIn}
            onTestWorkspace={() => setView("account")}
            onContinue={() =>
              void run(
                tr("Opening secure sign-in…", "Отворање безбедна најава…"),
                () =>
                  signInWithCognito(
                    signInReturn.current === "preview" && upload
                      ? "preview"
                      : "account",
                  ),
              )
            }
          />
        )}
        {view === "home" && (
          <InvestorLanding
            language={language}
            busy={!!busy}
            headingRef={titleRef}
            onChoose={() => fileInput.current?.click()}
            onFile={(file) =>
              void run(tr("Checking statement…", "Проверка на изводот…"), () =>
                selectFile(file),
              )
            }
            onSample={() =>
              void run(tr("Preparing sample…", "Подготовка на пример…"), sample)
            }
            onExportHelp={() => setDialog("help")}
            onCalculations={openCalculations}
          />
        )}
        {view === "guide" && (
          <section className="guide-page">
            <div className="container">
              <button
                className="text-button back"
                disabled={!!busy}
                onClick={returnFromCalculations}
              >
                {guideReturn.current === "preview"
                  ? tr("← Back to your preview", "← Назад кон прегледот")
                  : guideReturn.current === "report"
                    ? tr("← Back to your report", "← Назад кон извештајот")
                    : guideReturn.current === "account"
                      ? tr("← Back to your reports", "← Назад кон извештаите")
                      : tr("← Back to start", "← Назад кон почеток")}
              </button>
              <header className="guide-page-header">
                <span className="eyebrow">
                  {tr(
                    "MADE FOR IBKR INVESTORS IN MACEDONIA",
                    "ЗА IBKR ИНВЕСТИТОРИ ВО МАКЕДОНИЈА",
                  )}
                </span>
                <h1 ref={titleRef} tabIndex={-1}>
                  {tr(
                    "Understand your investment tax report.",
                    "Разберете го инвестицискиот даночен извештај.",
                  )}
                </h1>
                <p>
                  {tr(
                    "Follow the method before you buy. Your report applies the same calculation to your own statement, with the monthly breakdown and evidence you can review.",
                    "Погледнете го методот пред купување. Извештајот ја применува истата пресметка на вашиот извод, со месечни износи и докази за проверка.",
                  )}
                </p>
              </header>
              <CalculationGuide language={language} />
              <div className="guide-next-step">
                <div>
                  <h2>
                    {tr(
                      "See the method in a complete report.",
                      "Погледнете го методот во целосен извештај.",
                    )}
                  </h2>
                  <p>
                    {tr(
                      "Explore the free sample, or add your own IBKR CSV for a free preview.",
                      "Погледнете го бесплатниот пример или додајте IBKR CSV за бесплатен преглед.",
                    )}
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      tr("Preparing sample…", "Подготовка на пример…"),
                      sample,
                    )
                  }
                >
                  {tr("See a sample report", "Погледнете пример извештај")} →
                </button>
              </div>
            </div>
          </section>
        )}
        {view === "preview" && upload && (
          <section className="pale-page">
            <div className="container">
              <JourneyProgress language={language} current={2} />
              <button
                className="text-button back"
                disabled={!!busy}
                onClick={() => {
                  setView("home");
                  void clearDraft();
                }}
              >
                {tr("← Change statement", "← Промени извод")}
              </button>
              <div className="preview-grid">
                <div>
                  <span className="eyebrow">
                    {tr("STATEMENT PREVIEW", "ПРЕГЛЕД НА ИЗВОД")}
                  </span>
                  <h1 ref={titleRef} tabIndex={-1}>
                    {upload.preview.errors.length
                      ? tr(
                          "Your statement needs attention.",
                          "Изводот бара проверка.",
                        )
                      : tr(
                          "Your records are ready to review.",
                          "Вашите записи се подготвени.",
                        )}
                  </h1>
                  <p className="preview-intro">
                    {tr(
                      "This is your free statement check. Confirm the period and supported records, then unlock the full calculation when you’re ready.",
                      "Ова е бесплатна проверка на изводот. Потврдете ги периодот и поддржаните записи, па отклучете ја целосната пресметка кога ќе сте подготвени.",
                    )}
                  </p>
                  <p className="file-name">{upload.file.name}</p>
                  <div className="preview-platform">
                    <span className="tag">Interactive Brokers · USD</span>
                    <span className="tag">
                      {upload.preview.start} — {upload.preview.end}
                    </span>
                  </div>
                  {upload.preview.start &&
                    upload.preview.end &&
                    (upload.preview.start.slice(5) !== "01-01" ||
                      upload.preview.end.slice(5) !== "12-31") && (
                      <p className="fine">
                        {tr(
                          "This statement covers part of a year. The report will estimate only this period; export the full calendar year if you want a full-year overview.",
                          "Овој извод покрива дел од годината. Проценката е само за овој период; извезете цела календарска година за годишен преглед.",
                        )}
                      </p>
                    )}
                  <div className="record-grid">
                    {[
                      [
                        upload.preview.stocks,
                        tr("Stock sales", "Продажби на акции"),
                      ],
                      [
                        upload.preview.options,
                        tr("Option sales", "Продажби на опции"),
                      ],
                      [
                        upload.preview.dividends,
                        tr("Dividend records", "Дивиденди"),
                      ],
                      [
                        upload.preview.interest,
                        tr("Interest records", "Камата"),
                      ],
                    ].map(([value, label]) => (
                      <div className="record-card" key={label}>
                        <strong>{value}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <section className="panel review-notes">
                    <h2>{tr("What to review", "Што да проверите")}</h2>
                    {upload.preview.errors.length > 0 && (
                      <div className="alert error">
                        <ul>
                          {upload.preview.errors.map((e) => (
                            <li key={e}>{statementMessage(e, language)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <ul className="warning-list">
                      {upload.preview.warnings.map((w) => (
                        <li key={w}>{statementMessage(w, language)}</li>
                      ))}
                    </ul>
                    <p className="fine">
                      {tr(
                        "Review excluded data separately. This estimate supports preparation; it is not an official UJP return or automatic filing.",
                        "Проверете ги исклучените податоци одделно. Ова е проценка за подготовка, а не официјална пријава или автоматско поднесување.",
                      )}
                    </p>
                  </section>
                  <section className="unlock-explainer">
                    <h2>
                      {tr(
                        "What you’ll receive after unlocking",
                        "Што добивате со отклучување",
                      )}
                    </h2>
                    <p>
                      {tr(
                        "A monthly MKD tax breakdown, stock and option results, dividend and interest records, NBRNM rate evidence, the full Excel workpaper, and a printable filing summary.",
                        "Месечна MKD даночна пресметка, резултати од акции и опции, дивиденди и камата, курсеви од НБРСМ, целосен Excel и резиме за печатење.",
                      )}
                    </p>
                    <button className="text-button" onClick={openCalculations}>
                      {tr(
                        "Understand the calculation first",
                        "Прво разберете ја пресметката",
                      )}{" "}
                      →
                    </button>
                  </section>
                  {!upload.preview.errors.length && (
                    <div className="unlock">
                      <p className="unlock-guidance">
                        {existingUpload
                          ? tr(
                              "This statement already has a saved report. Open it or resume the interrupted unlock using the same credit request.",
                              "Овој извод веќе има зачуван извештај. Отворете го или продолжете го прекинот со истото барање за кредит.",
                            )
                          : !canUseAccount
                            ? tr(
                                "Sign in using the package card, then buy a report credit to continue. Your CSV stays here while you sign in.",
                                "Најавете се преку картичката за пакети, па купете кредит. CSV останува тука за време на најавата.",
                              )
                            : credits < 1
                              ? tr(
                                  "Choose a package to add credits, then unlock this statement. You can review everything here before paying.",
                                  "Изберете пакет за кредити, па отклучете го изводот. Прво можете да ги проверите сите податоци тука.",
                                )
                              : tr(
                                  "You have a report credit available. Check the acknowledgement below to unlock your calculation.",
                                  "Имате достапен кредит. Потврдете ја изјавата подолу за да ја отклучите пресметката.",
                                )}
                      </p>
                      <label className="acknowledgement">
                        <input
                          type="checkbox"
                          checked={accepted}
                          disabled={!!busy}
                          onChange={(e) => setAccepted(e.target.checked)}
                        />
                        <span>
                          {tr(
                            "I reviewed the warnings. I understand this is an estimate and I am responsible for checking the report and filing correctly.",
                            "Ги проверив предупредувањата. Разбирам дека ова е проценка и јас сум одговорен за проверката и правилното поднесување.",
                          )}
                        </span>
                      </label>
                      <button
                        className="button primary"
                        disabled={
                          !!busy ||
                          !accepted ||
                          !owner ||
                          (credits < 1 && !existingUpload)
                        }
                        onClick={() =>
                          void run(
                            tr(
                              "Preparing your report…",
                              "Подготовка на извештајот…",
                            ),
                            () => generate(),
                          )
                        }
                      >
                        {existingUpload
                          ? existingUpload.status === "ready"
                            ? tr(
                                "Open saved report · free",
                                "Отвори зачуван извештај · бесплатно",
                              )
                            : tr("Resume report unlock", "Продолжи отклучување")
                          : tr(
                              "Unlock report · 1 credit",
                              "Отклучи извештај · 1 кредит",
                            )}{" "}
                        →
                      </button>
                      <p className="fine">
                        {tr(
                          "One credit is used only after your calculation succeeds. Reopening this report and downloading it again on this browser are free.",
                          "Еден кредит се користи само по успешна пресметка. Повторното отворање и преземање во овој прелистувач се бесплатни.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
                {packages}
              </div>
            </div>
          </section>
        )}
        {view === "report" && report && (
          <ReportView
            report={report}
            language={language}
            busy={!!busy}
            onDownload={download}
            onPrint={() => window.print()}
            onLanguage={() =>
              void run(
                tr("Preparing workbook language…", "Подготовка на јазикот…"),
                changeReportLanguage,
              )
            }
            onNew={() => setView("home")}
          />
        )}
        {view === "account" && (
          <section className="pale-page">
            <div className="container account-grid">
              <div>
                <span className="eyebrow">
                  {session
                    ? tr("YOUR ACCOUNT", "ВАША СМЕТКА")
                    : tr(
                        "LOCAL REPORT WORKSPACE",
                        "ЛОКАЛНО ТЕСТИРАЊЕ НА ИЗВЕШТАИ",
                      )}
                </span>
                <h1 ref={titleRef} tabIndex={-1}>
                  {tr(
                    "Your reports, at a glance.",
                    "Вашите извештаи на едно место.",
                  )}
                </h1>
                <p>
                  {session?.email ??
                    tr("Local testing workspace", "Локално тестирање")}
                </p>
                <div className="account-summary panel">
                  <div>
                    <strong>{credits}</strong>
                    <span>
                      {tr("available report credits", "достапни кредити")}
                    </span>
                  </div>
                  <button
                    className="button secondary"
                    disabled={!!busy || !canUseAccount}
                    onClick={() =>
                      void run(
                        tr("Refreshing balance…", "Освежување салдо…"),
                        refreshCredits,
                      )
                    }
                  >
                    {tr("Refresh balance", "Освежи салдо")}
                  </button>
                </div>
                <h2>
                  {tr(
                    "Reports saved on this browser",
                    "Извештаи зачувани во овој прелистувач",
                  )}
                </h2>
                <p className="fine">
                  {tr(
                    "Credits follow your account. Report files stay on this device. Download a copy; clearing browser storage removes local reports.",
                    "Кредитите се поврзани со сметката. Датотеките остануваат на уредот. Преземете копија; бришењето на податоците од прелистувачот ги отстранува извештаите.",
                  )}
                </p>
                {!history.length && (
                  <div className="empty panel">
                    <span>↥</span>
                    <h3>
                      {tr(
                        "Your first report starts with a CSV.",
                        "Првиот извештај започнува со CSV.",
                      )}
                    </h3>
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => setView("home")}
                    >
                      {tr("Upload statement", "Додај извод")}
                    </button>
                  </div>
                )}
                <div className="report-history">
                  {history.map((item) => (
                    <article className="panel history-item" key={item.id}>
                      <div>
                        <h3>{item.file.name}</h3>
                        <p>
                          {item.preview.start} — {item.preview.end}
                        </p>
                        <small>
                          {item.status === "pending"
                            ? tr(
                                "Unlock interrupted · safe to retry",
                                "Прекинато отклучување · повторете",
                              )
                            : tr(
                                "Ready · free repeat downloads",
                                "Подготвен · бесплатно повторно преземање",
                              )}
                        </small>
                      </div>
                      <div>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            void run(
                              tr("Opening report…", "Отворање извештај…"),
                              async () => {
                                if (item.status === "pending")
                                  await generate(item);
                                else {
                                  setReport(item);
                                  setView("report");
                                }
                              },
                            )
                          }
                        >
                          {item.status === "pending"
                            ? tr("Resume", "Продолжи")
                            : tr("Open", "Отвори")}
                        </button>
                        <button
                          className="text-button danger"
                          disabled={!!busy || item.status === "pending"}
                          onClick={() => {
                            if (
                              window.confirm(
                                tr(
                                  "Delete this local report? Credits are not restored. Keep a downloaded copy first.",
                                  "Избриши локален извештај? Кредитите не се враќаат. Преземете копија претходно.",
                                ),
                              )
                            )
                              void run(
                                tr(
                                  "Removing report…",
                                  "Отстранување извештај…",
                                ),
                                async () => {
                                  await forgetReport(item.id);
                                  setHistory(await listReports(owner));
                                },
                              );
                          }}
                        >
                          {tr("Delete", "Избриши")}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {session && (
                  <details className="panel legacy">
                    <summary>
                      {tr(
                        "Link an existing license key",
                        "Поврзи постоечки клуч",
                      )}
                    </summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(
                          tr("Linking license…", "Поврзување клуч…"),
                          async () => {
                            setEntitlement(
                              await linkLegacyLicense(
                                await credential(),
                                legacyKey,
                              ),
                            );
                            setLegacyKey("");
                            setNotice(
                              tr(
                                "License credits linked to your account.",
                                "Кредитите се поврзани со сметката.",
                              ),
                            );
                          },
                        );
                      }}
                    >
                      <label htmlFor="legacy-key">
                        {tr("License key", "Клуч")}
                      </label>
                      <div className="inline-form">
                        <input
                          id="legacy-key"
                          type="password"
                          autoComplete="off"
                          value={legacyKey}
                          onChange={(e) => setLegacyKey(e.target.value)}
                          required
                          maxLength={256}
                          disabled={!!busy}
                        />
                        <button className="button secondary" disabled={!!busy}>
                          {tr("Link", "Поврзи")}
                        </button>
                      </div>
                    </form>
                  </details>
                )}
                {session && (
                  <button
                    className="text-button logout"
                    disabled={!!busy}
                    onClick={() =>
                      void run(tr("Signing out…", "Одјавување…"), async () => {
                        await clearDraft();
                        await signOutOfCognito();
                        setView("home");
                      })
                    }
                  >
                    {tr("Log out", "Одјави се")}
                  </button>
                )}
              </div>
              {packages}
            </div>
          </section>
        )}
      </main>
      <input
        ref={fileInput}
        className="visually-hidden"
        aria-label={tr("IBKR statement CSV", "IBKR CSV извод")}
        type="file"
        accept=".csv,text/csv"
        disabled={!!busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void run(tr("Checking statement…", "Проверка на изводот…"), () =>
              selectFile(file),
            );
        }}
      />
      <footer className="container site-footer">
        <p>© {new Date().getFullYear()} TaxCalculator MK</p>
        <p>
          {tr(
            "An estimate for your review. You are responsible for your filing.",
            "Проценка за ваша проверка. Вие сте одговорни за пријавата.",
          )}
        </p>
        <div>
          <button className="text-button" onClick={() => setDialog("privacy")}>
            {tr("Privacy", "Приватност")}
          </button>
          <button className="text-button" onClick={() => setDialog("terms")}>
            {tr("Terms", "Услови")}
          </button>
          <button className="text-button" onClick={() => setDialog("help")}>
            {tr("Help", "Помош")}
          </button>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={openCalculations}
          >
            {tr("Calculations", "Пресметки")}
          </button>
        </div>
      </footer>
      <dialog
        ref={modal}
        onCancel={() => setDialog(undefined)}
        onClick={(e) => {
          if (e.target === modal.current) setDialog(undefined);
        }}
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          aria-label={tr("Close dialog", "Затвори")}
          onClick={() => setDialog(undefined)}
        >
          ×
        </button>
        <h2 id="dialog-title">
          {dialog === "help"
            ? tr("Export your IBKR statement", "Извезете го вашиот IBKR извод")
            : dialog === "privacy"
              ? tr("Your data and privacy", "Вашите податоци и приватност")
              : tr("Using your estimate", "Користење на проценката")}
        </h2>
        {dialog === "help" ? (
          <ExportInstructions language={language} />
        ) : dialog === "privacy" ? (
          <>
            <p>
              {tr(
                "Your CSV, calculations, and files are processed and saved in your browser. Our services receive exchange-rate dates and account/credit requests, not your trades or balances. Sign-in uses Amazon Cognito; payments use Lemon Squeezy hosted checkout.",
                "CSV, пресметките и датотеките се обработуваат и зачувуваат во прелистувачот. Сервисите добиваат датуми за курсеви и барања за сметка/кредити, а не трансакции и состојби. Најавата е преку Amazon Cognito, плаќањето преку Lemon Squeezy.",
              )}
            </p>
            <p>
              {tr(
                "Selected CSVs stay locally for up to 24 hours to survive redirects. Reports remain until deleted or browser storage is cleared. Use your own device. Account/payment records are held by the service and providers. Access logs may record IP addresses and requested URLs.",
                "Избраниот CSV останува локално до 24 часа за пренасочувања. Извештаите остануваат до бришење или чистење на прелистувачот. Користете сопствен уред. Сервисот и провајдерите чуваат записи за сметки/плаќања. Логовите може да чуваат IP адреси и URL адреси.",
              )}
            </p>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() =>
                void run(
                  tr("Clearing selected CSV…", "Бришење избран CSV…"),
                  async () => {
                    await clearDraft();
                    setUpload(undefined);
                    setDialog(undefined);
                    setView("home");
                  },
                )
              }
            >
              {tr("Clear selected CSV from this browser", "Избриши избран CSV")}
            </button>
          </>
        ) : (
          <>
            <p>
              {tr(
                "This report helps prepare your UJP filing. It is not an official return, personalized tax advice, or a guarantee of acceptance. Check the statement, rates, exclusions, tax treatment, and final amounts. You are responsible for filing correct information.",
                "Извештајот помага при подготовка за УЈП. Не е официјална пријава, персонализиран совет или гаранција за прифаќање. Проверете извод, курсеви, исклучувања, даночен третман и износи. Вие сте одговорни за точните податоци.",
              )}
            </p>
            <p>
              {tr(
                "One credit unlocks one unique CSV on this browser. Repeat downloads and language changes are free. Keep downloaded copies. Full purchase refunds remove unused credits from that purchase. Checkout provides the final purchase terms and payment support.",
                "Еден кредит отклучува еден уникатен CSV во овој прелистувач. Повторно преземање и промена на јазик се бесплатни. Чувајте копии. Целосното враќање на плаќање ги отстранува неискористените кредити. Условите и поддршката се прикажуваат при плаќање.",
              )}
            </p>
          </>
        )}
        {import.meta.env.VITE_SUPPORT_EMAIL && (
          <p>
            <a href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL}`}>
              {import.meta.env.VITE_SUPPORT_EMAIL}
            </a>
          </p>
        )}
      </dialog>
    </>
  );
}
