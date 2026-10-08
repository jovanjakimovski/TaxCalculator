import { Icon } from "./Icon";
import { statementMessage } from "./statementMessages";
import { useEffect, useRef, useState } from "react";
import type { Language, SavedReport } from "./reportStore";
import { CalculationGuide } from "./CalculationGuide";
import { explainMonthlyGroups } from "./reportGroups";
const money = (value: number, currency = "MKD", language: Language = "en") =>
  new Intl.NumberFormat(language === "mk" ? "mk-MK" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
const amount = (value: number, language: Language) =>
  new Intl.NumberFormat(language === "mk" ? "mk-MK" : "en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);

type Props = {
  report: SavedReport;
  language: Language;
  busy: boolean;
  onDownload: () => void;
  onPrint: () => void;
  onLanguage: () => void;
  onNew: () => void;
};
export function ReportView({
  report,
  language,
  busy,
  onDownload,
  onPrint,
  onLanguage,
  onNew,
}: Props) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const r = report.result;
  const [tab, setTab] = useState("overview");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [auditMonth, setAuditMonth] = useState(
    r.monthlySummary.find((month) => month.taxMkd > 0)?.month ??
      r.monthlySummary[0]?.month ??
      "",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const sectionNav = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setTab("overview");
    setQuery("");
    setFilter("all");
    setAuditMonth(
      report.result.monthlySummary.find((month) => month.taxMkd > 0)?.month ??
        report.result.monthlySummary[0]?.month ??
        "",
    );
  }, [report.id]);
  useEffect(() => {
    setPage(0);
  }, [query, filter, report.id]);
  useEffect(() => {
    const sections = [
      "overview",
      "monthly",
      "trades",
      "income",
      "rates",
      "methodology",
      "notes",
    ]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    let frame = 0;
    const update = () => {
      frame = 0;
      const threshold =
        (sectionNav.current?.parentElement?.getBoundingClientRect().height ??
          70) + 32;
      let current = sections[0]?.id ?? "overview";
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= threshold)
          current = section.id;
      }
      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
      ) {
        current = sections.at(-1)?.id ?? current;
      }
      setTab(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [report.id]);
  useEffect(() => {
    const nav = sectionNav.current;
    const active = nav?.querySelector<HTMLButtonElement>(
      '[aria-current="location"]',
    );
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left + 12 || item.right > bounds.right - 12) {
      nav.scrollTo({
        left:
          nav.scrollLeft +
          item.left -
          bounds.left -
          (bounds.width - item.width) / 2,
        behavior: "auto",
      });
    }
  }, [tab, language]);
  const filtered = r.rows.filter(
    (row) =>
      (!query || row.symbol.toLowerCase().includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "gains" ? row.usdResult > 0 : row.usdResult < 0)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const tabs = [
    ["overview", tr("Overview", "Преглед")],
    ["monthly", tr("Monthly breakdown", "Месечна пресметка")],
    ["trades", tr("Trades", "Трансакции")],
    ["income", tr("Dividends & interest", "Дивиденди и камата")],
    ["rates", tr("Exchange rates", "Курсеви")],
    ["methodology", tr("How it is calculated", "Како се пресметува")],
    ["notes", tr("Before you file", "Пред пријавување")],
  ];
  const symbolGroups = explainMonthlyGroups(r, auditMonth);
  const auditedMonth = r.monthlySummary.find(
    (month) => month.month === auditMonth,
  );
  const unroundedTax = r.monthlySummary.reduce(
    (sum, month) => sum + month.taxMkd,
    0,
  );
  const maximum = Math.max(1, ...r.monthlySummary.map((m) => m.taxMkd));
  const usedDates = new Set(
    [...r.rows, ...r.dividends, ...r.interest].map((row) => row.date),
  );
  const dateLabel = (month: string) =>
    language === "mk"
      ? `${["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"][Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
      : new Intl.DateTimeFormat("en-GB", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T00:00:00Z`));
  function table(
    headers: string[],
    rows: (string | number)[][],
    caption: string,
  ) {
    return (
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length}>
                  {tr(
                    "No records in this section.",
                    "Нема записи во овој дел.",
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <section className="report-page">
      <nav
        className="report-tabs"
        aria-label={tr("Report sections", "Делови на извештајот")}
      >
        <div className="container" ref={sectionNav}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "location" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                document.getElementById(id)?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "auto"
                    : "smooth",
                  block: "start",
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <div className="container report-content">
        {report.owner === "sample" && (
          <div className="alert sample-alert">
            {tr(
              "SAMPLE REPORT — Synthetic transactions and illustrative 60 MKD/USD rates. Do not use this sample for filing.",
              "ПРИМЕР ИЗВЕШТАЈ — Синтетички трансакции и илустративен курс 60 MKD/USD. Не користете за пријавување.",
            )}
          </div>
        )}
        <header className="panel report-header">
          <div className="report-cover" aria-hidden="true">
            <Icon name="file" />
            <p>{tr("STATEMENT YEAR", "ГОДИНА НА ИЗВОД")}</p>
            <strong>{report.preview.start.slice(0, 4)}</strong>
            <span>IBKR → MKD</span>
          </div>
          <div className="report-title">
            <span className="eyebrow">
              {tr(
                "INVESTMENT TAX WORKPAPER",
                "ПРЕСМЕТКА ЗА ИНВЕСТИЦИСКИ ДАНОК",
              )}
            </span>
            <h1 ref={heading} tabIndex={-1}>
              {tr(
                "Your investment tax report",
                "Ваш инвестициски даночен извештај",
              )}
            </h1>
            <p className="report-context">
              {tr(
                "Your IBKR statement, organised in MKD for review.",
                "Вашиот IBKR извод, организиран во MKD за проверка.",
              )}
            </p>
            <p className="file-name">{report.file.name}</p>
            <div className="tags">
              <span className="tag">
                {report.preview.start} — {report.preview.end}
              </span>
              <span className="tag">IBKR · USD → MKD</span>
              <span className="tag">{tr("Estimate", "Проценка")}</span>
            </div>
            <p className="fine">
              {tr("Prepared", "Подготвен")}{" "}
              <time
                dateTime={new Date(report.created).toISOString()}
                title={new Date(report.created).toLocaleString(
                  language === "mk" ? "mk-MK" : "en-GB",
                )}
              >
                {new Date(report.created).toLocaleDateString(
                  language === "mk" ? "mk-MK" : "en-GB",
                )}
              </time>{" "}
              · {tr("Saved on this browser", "Зачуван во овој прелистувач")}
            </p>
            <div className="report-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={onDownload}
              >
                <Icon name="download" />
                {tr("Download Excel", "Преземи Excel")}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={onPrint}
              >
                {tr("Print / Save PDF", "Печати / Зачувај PDF")}
              </button>
              {report.language !== language && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={onLanguage}
                >
                  {tr("Prepare English Excel", "Подготви македонски Excel")}
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={onNew}>
                {tr("New statement", "Нов извод")} →
              </button>
            </div>
            <details className="fine report-export-help">
              <summary>
                {tr(
                  "What’s included in your downloads?",
                  "Што содржат преземањата?",
                )}
              </summary>
              <p>
                {tr(
                  "Excel includes all transaction records and formulas. Print / Save PDF creates the summary, monthly table, and filing checklist. Re-downloads of this saved report do not use another credit.",
                  "Excel ги вклучува сите трансакции и формули. „Печати / Зачувај PDF“ создава резиме, месечна табела и листа за проверка пред пријавување. Повторното преземање на зачуваниот извештај не троши нов кредит.",
                )}
              </p>
            </details>
          </div>
        </header>
        <section className="panel report-section" id="overview">
          <div className="section-heading">
            <h2>{tr("Report summary", "Резиме на извештајот")}</h2>
            <span className="status-label warning">
              {tr("Review required", "Потребна проверка")}
            </span>
          </div>
          <p className="report-context">
            {tr(
              "Start with the estimated tax, then check the monthly breakdown and the records behind it. Trading profit or loss, dividends, and interest show your activity; the taxable base applies the month-and-symbol grouping rules.",
              "Почнете со проценетиот данок, па проверете ги месечната пресметка и записите зад неа. Добивката или загубата од тргување, дивидендите и каматата ја прикажуваат вашата активност; даночната основица ги применува правилата за групирање по месец и симбол.",
            )}
          </p>
          {(report.preview.start.slice(5) !== "01-01" ||
            report.preview.end.slice(5) !== "12-31") && (
            <p className="fine report-period-note">
              {tr(
                `This report covers ${report.preview.start} to ${report.preview.end}, not the full calendar year. It includes only activity in this statement; check the rest of the year and other accounts before filing.`,
                `Овој извештај го опфаќа периодот ${report.preview.start} до ${report.preview.end}, а не целата календарска година. Вклучена е само активноста во овој извод; проверете го остатокот од годината и другите сметки пред пријавување.`,
              )}
            </p>
          )}
          <div className="summary-grid">
            <article className="metric featured">
              <span>{tr("Estimated tax", "Проценет данок")}</span>
              <strong>{money(r.estimatedTaxMkd, "MKD", language)}</strong>
              <small>
                {tr(
                  "10% of the monthly taxable bases",
                  "10% од месечните даночни основици",
                )}
              </small>
            </article>
            <article className="metric">
              <span>{tr("Taxable income", "Оданочлив приход")}</span>
              <strong>{money(r.taxableIncomeMkd, "MKD", language)}</strong>
              <small>
                {tr(
                  "Positive monthly symbol groups + positive monthly net interest",
                  "Позитивни месечни групи по симбол + позитивна месечна нето камата",
                )}
              </small>
            </article>
            <article className="metric">
              <span>
                {tr("Realized trading result", "Реализирана добивка/загуба")}
              </span>
              <strong>{money(r.realizedMkd, "MKD", language)}</strong>
              <small>
                {money(r.realizedUsd, "USD", language)} · {r.transactionCount}{" "}
                {tr("sales", "продажби")}
                <br />
                {tr(
                  "All trade gains and losses; not the taxable base",
                  "Сите добивки и загуби од тргување; не е даночната основица",
                )}
              </small>
            </article>
            <article className="metric">
              <span>{tr("Gross dividends", "Бруто дивиденди")}</span>
              <strong>{money(r.dividendGrossMkd, "MKD", language)}</strong>
              <small>
                {tr(
                  "Before foreign withholding; included in symbol groups",
                  "Пред странскиот задржан данок; вклучени во групите по симбол",
                )}
              </small>
            </article>
            <article className="metric">
              <span>{tr("Interest income", "Приход од камата")}</span>
              <strong>{money(r.interestIncomeMkd, "MKD", language)}</strong>
              <small>
                {tr(
                  "Tax uses positive monthly net interest",
                  "Се оданочува позитивната месечна нето камата",
                )}
              </small>
            </article>
            <article className="metric">
              <span>
                {tr("Withholding for review", "Задржан данок за проверка")}
              </span>
              <strong>
                {money(r.dividendWithholdingMkd, "MKD", language)}
              </strong>
              <small>
                {tr(
                  "Not deducted from this estimate",
                  "Не е одземен од проценката",
                )}
              </small>
            </article>
          </div>
          <div
            className="report-total-explainer"
            aria-label={tr(
              "How the estimated total is reached",
              "Како е добиен проценетиот вкупен износ",
            )}
          >
            <div>
              <span>
                {tr(
                  "Monthly taxable bases added together",
                  "Збир на месечните даночни основици",
                )}
              </span>
              <strong>{money(r.taxableIncomeMkd, "MKD", language)}</strong>
            </div>
            <b aria-hidden="true">× 10% →</b>
            <div>
              <span>
                {tr(
                  "Sum of monthly tax, before final rounding",
                  "Збир на месечниот данок, пред конечно заокружување",
                )}
              </span>
              <strong>{money(unroundedTax, "MKD", language)}</strong>
            </div>
            <b aria-hidden="true">→</b>
            <div>
              <span>
                {tr(
                  "Final total, rounded up to whole MKD",
                  "Конечен збир, заокружен нагоре во цели MKD",
                )}
              </span>
              <strong>{money(r.estimatedTaxMkd, "MKD", language)}</strong>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setTab("methodology");
                document
                  .getElementById("methodology")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {tr("Explain this calculation", "Објасни ја пресметката")} →
            </button>
          </div>
          <p className="report-disclaimer">
            {tr(
              "This is an estimate to help prepare your UJP filing. Review the source data and tax treatment. You are responsible for correctness and submitting the return.",
              "Ова е проценка за подготовка на пријавата за УЈП. Проверете ги податоците и даночниот третман. Вие сте одговорни за точноста и поднесувањето.",
            )}
          </p>
        </section>
        <section className="panel report-section" id="monthly">
          <div className="section-heading">
            <h2>{tr("Monthly breakdown", "Месечна пресметка")}</h2>
            <span className="tag">MKD</span>
          </div>
          <p className="report-context">
            {tr(
              "The first four amount columns show the month’s net activity in each category. The taxable base is calculated separately: positive results for each underlying-symbol group, plus positive net interest. This means the taxable base may differ from the simple sum of the displayed categories.",
              "Првите четири колони со износи ја прикажуваат нето активноста во месецот по категорија. Даночната основица се пресметува одделно: позитивните резултати за секоја група на основен симбол, плус позитивната нето камата. Затоа основицата може да се разликува од обичниот збир на прикажаните категории.",
            )}
          </p>
          <div
            className="monthly-chart"
            role="img"
            aria-label={tr(
              "Estimated tax by month; exact values in the following table",
              "Проценет данок по месец; точни износи во табелата",
            )}
          >
            {r.monthlySummary.map((m) => (
              <div className="chart-column" key={m.month}>
                <span>{amount(m.taxMkd, language)}</span>
                <div className="bar-track">
                  <i
                    style={{
                      height: `${Math.max(1, (m.taxMkd / maximum) * 100)}%`,
                    }}
                  />
                </div>
                <small>{dateLabel(m.month)}</small>
              </div>
            ))}
          </div>
          {table(
            [
              tr("Month", "Месец"),
              tr("Stock P/L", "Акции: добивка/загуба"),
              tr("Option P/L", "Опции: добивка/загуба"),
              tr("Gross dividends", "Бруто дивиденди"),
              tr("Net interest", "Нето камата"),
              tr("Taxable base", "Даночна основица"),
              tr("Tax (10%)", "Данок (10%)"),
            ],
            r.monthlySummary.map((m) => [
              dateLabel(m.month),
              ...[
                m.stocksMkd,
                m.optionsMkd,
                m.dividendsMkd,
                m.interestMkd,
                m.taxablePnlMkd,
                m.taxMkd,
              ].map((n) => amount(n, language)),
            ]),
            tr("Monthly amounts in MKD", "Месечни износи во MKD"),
          )}
          <p className="fine">
            {tr(
              "Offsets apply within each month and underlying symbol. Annual trading losses do not cancel unrelated monthly tax bases. The estimated total is rounded up to whole MKD, matching Excel.",
              "Пребивањето важи по месец и основен симбол. Годишните загуби не ги поништуваат неповрзаните месечни основици. Вкупната проценка се заокружува нагоре во цели MKD, како во Excel.",
            )}
          </p>
          <details className="monthly-audit">
            <summary>
              {tr(
                "See how monthly offsets work in your report",
                "Видете како работи месечното пребивање во вашиот извештај",
              )}
            </summary>
            <div className="monthly-audit-body">
              <p>
                {tr(
                  "Each row is one underlying-symbol group. Stocks, options, and gross dividends combine only inside that row and month. A negative combined result contributes zero to the taxable base.",
                  "Секој ред е една група на основен симбол. Акции, опции и бруто дивиденди се собираат само во тој ред и месец. Негативен збир придонесува со нула во даночната основица.",
                )}
              </p>
              <label>
                {tr("Inspect a month", "Проверете месец")}
                <select
                  value={auditMonth}
                  onChange={(event) => setAuditMonth(event.target.value)}
                >
                  {r.monthlySummary.map((month) => (
                    <option key={month.month} value={month.month}>
                      {dateLabel(month.month)}
                    </option>
                  ))}
                </select>
              </label>
              {table(
                [
                  tr("Underlying symbol", "Основен симбол"),
                  tr("Stock P/L", "Акции: добивка/загуба"),
                  tr("Option P/L", "Опции: добивка/загуба"),
                  tr("Gross dividends", "Бруто дивиденди"),
                  tr("Combined result", "Збирен резултат"),
                  tr("Taxable base", "Даночна основица"),
                  tr("Tax (10%)", "Данок (10%)"),
                ],
                symbolGroups.map((group) => [
                  group.symbol,
                  ...[
                    group.stocksMkd,
                    group.optionsMkd,
                    group.dividendsMkd,
                    group.netMkd,
                    group.taxableMkd,
                    group.taxMkd,
                  ].map((value) => amount(value, language)),
                ]),
                tr(
                  "Monthly underlying-symbol groups in MKD",
                  "Месечни групи на основни симболи во MKD",
                ),
              )}
              <div className="monthly-audit-total">
                <span>
                  {tr(
                    "Positive symbol-group bases",
                    "Позитивни основици по симбол",
                  )}
                  :{" "}
                  <strong>
                    {money(
                      symbolGroups.reduce(
                        (sum, group) => sum + group.taxableMkd,
                        0,
                      ),
                      "MKD",
                      language,
                    )}
                  </strong>
                </span>
                <span>
                  {tr(
                    "Positive monthly net interest",
                    "Позитивна месечна нето камата",
                  )}
                  :{" "}
                  <strong>
                    {money(
                      Math.max(auditedMonth?.interestMkd ?? 0, 0),
                      "MKD",
                      language,
                    )}
                  </strong>
                </span>
                <span>
                  {tr("Monthly taxable base", "Месечна даночна основица")}:{" "}
                  <strong>
                    {money(auditedMonth?.taxablePnlMkd ?? 0, "MKD", language)}
                  </strong>
                </span>
              </div>
              <p>
                {tr(
                  "Interest is a separate monthly group. The columns show amounts to two decimals; calculation uses the original precision. Groups here explain the saved workbook without changing it.",
                  "Каматата е посебна месечна група. Колоните прикажуваат две децимали; пресметката ја користи изворната прецизност. Групите го објаснуваат зачуваниот Excel без да го менуваат.",
                )}
              </p>
            </div>
          </details>
        </section>
        <section className="panel report-section" id="trades">
          <div className="section-heading">
            <h2>{tr("Realized trades", "Реализирани трансакции")}</h2>
            <span className="tag">
              {r.rows.length} {tr("records", "записи")}
            </span>
          </div>
          <p className="report-context">
            {tr(
              "These are the supported sales reported by IBKR, not your current portfolio value. Profit/loss (P/L) is the realized USD result supplied by the broker. Each row’s MKD result is that amount multiplied by its sale-date exchange rate. The annual net trading result alone is not used as the taxable base.",
              "Ова се поддржаните продажби пријавени од IBKR, а не тековната вредност на вашето портфолио. Добивката/загубата (P/L) е реализираниот USD резултат од брокерот. MKD резултатот за секој ред е тој износ помножен со курсот за датумот на продажба. Годишниот нето резултат од тргување сам по себе не е даночната основица.",
            )}
          </p>
          <div className="table-controls">
            <label>
              {tr("Find a symbol", "Најди симбол")}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="AAPL, MSFT…"
              />
            </label>
            <label>
              {tr("Result", "Резултат")}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">
                  {tr("All trades", "Сите трансакции")}
                </option>
                <option value="gains">{tr("Gains", "Добивки")}</option>
                <option value="losses">{tr("Losses", "Загуби")}</option>
              </select>
            </label>
          </div>
          {table(
            [
              tr("Date", "Датум"),
              tr("Symbol", "Симбол"),
              tr("Asset", "Средство"),
              "P/L USD",
              tr("Rate date", "Датум на курс"),
              "USD/MKD",
              "P/L MKD",
            ],
            filtered
              .slice(page * 20, page * 20 + 20)
              .map((row) => [
                row.date,
                row.symbol,
                row.assetCategory === "Equity and Index Options"
                  ? tr("Options", "Опции")
                  : tr("Stocks", "Акции"),
                amount(row.usdResult, language),
                row.rateDate,
                row.mkdRate.toFixed(6),
                amount(row.mkdResult, language),
              ]),
            tr("Realized trades", "Реализирани трансакции"),
          )}
          <div className="pagination">
            <span>
              {tr("Page", "Страница")} {page + 1} / {pages} · {filtered.length}{" "}
              {tr("records", "записи")}
            </span>
            <div>
              <button
                className="button secondary small"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                {tr("Previous", "Претходна")}
              </button>
              <button
                className="button secondary small"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
              >
                {tr("Next", "Следна")}
              </button>
            </div>
          </div>
          <p className="fine">
            {tr(
              "The Excel export contains the complete ledger, regardless of the filters above.",
              "Excel го содржи целиот дневник, без оглед на филтрите.",
            )}
          </p>
        </section>
        <section className="panel report-section" id="income">
          <h2>{tr("Dividends & interest", "Дивиденди и камата")}</h2>
          <p className="report-context">
            {tr(
              "Dividends use their gross amount before foreign withholding and join their underlying-symbol group in the payment month. Interest is calculated separately: the month’s income and charges are netted, and only a positive net amount is taxable.",
              "Дивидендите го користат бруто износот пред странскиот задржан данок и се вклучуваат во групата на основниот симбол во месецот на исплата. Каматата се пресметува одделно: месечниот приход и трошоците се пребиваат и само позитивниот нето износ е оданочлив.",
            )}
          </p>
          <h3>{tr("Dividends", "Дивиденди")}</h3>
          {table(
            [
              tr("Date", "Датум"),
              tr("Symbol", "Симбол"),
              tr("Gross USD", "Бруто USD"),
              tr("Withheld USD", "Задржан USD"),
              tr("Net USD", "Нето USD"),
              tr("Gross MKD", "Бруто MKD"),
              tr("Withheld MKD", "Задржан MKD"),
              tr("Net MKD", "Нето MKD"),
            ],
            r.dividends.map((d) => [
              d.date,
              d.symbol,
              ...[
                d.grossUsd,
                d.withholdingUsd,
                d.netUsd,
                d.grossMkd,
                d.withholdingMkd,
                d.netMkd,
              ].map((n) => amount(n, language)),
            ]),
            tr("Dividend ledger", "Дневник на дивиденди"),
          )}
          <p className="fine">
            {tr(
              "Net cash = gross dividend − withholding. Foreign withholding is retained for your review; this estimate does not deduct it from the dividend base or from the tax due. Confirm any applicable foreign-tax-credit treatment before filing.",
              "Нето исплата = бруто дивиденда − задржан данок. Странскиот задржан данок се чува за проверка; оваа проценка не го одзема од основицата на дивидендата или од данокот. Потврдете го применливиот третман на странскиот данок пред пријавување.",
            )}
          </p>
          <h3>{tr("Interest", "Камата")}</h3>
          {table(
            [
              tr("Date", "Датум"),
              tr("Entry", "Запис"),
              "USD",
              "USD/MKD",
              "MKD",
            ],
            r.interest.map((i) => [
              i.date,
              i.usdAmount < 0
                ? tr("Interest charge", "Трошок за камата")
                : tr("Interest income", "Приход од камата"),
              amount(i.usdAmount, language),
              i.mkdRate.toFixed(6),
              amount(i.mkdAmount, language),
            ]),
            tr("Interest ledger", "Дневник на камата"),
          )}
          <p className="fine">
            {tr("Interest charges", "Трошоци за камата")}:{" "}
            {money(r.interestChargesMkd, "MKD", language)} ·{" "}
            {tr(
              "Included in monthly net interest; kept separate from securities.",
              "Вклучени во месечната нето камата, одделно од хартиите од вредност.",
            )}
          </p>
        </section>
        <section className="panel report-section" id="rates">
          <div className="section-heading">
            <h2>{tr("Exchange-rate evidence", "Податоци за курсеви")}</h2>
            <span className="status-label good">
              {report.owner === "sample"
                ? tr("Illustrative rates", "Илустративни курсеви")
                : "NBRNM · USD/MKD"}
            </span>
          </div>
          <p>
            {tr(
              "One unit of USD is multiplied by the listed MKD-per-USD rate. The workbook uses the previous-day (T−1) rate. On non-working days, the latest available earlier rate is used. The transaction date and effective rate date may therefore differ. Each used rate is retained in the Excel export; re-downloads use the saved rates.",
              "Една единица USD се множи со наведениот курс MKD за USD. Excel го користи курсот од претходниот ден (Т−1). За неработни денови се користи последниот претходен достапен курс. Затоа датумот на трансакцијата и ефективниот датум на курсот може да се разликуваат. Секој употребен курс се чува во Excel; повторните преземања ги користат зачуваните курсеви.",
            )}
          </p>
          {table(
            [
              tr("Transaction date", "Датум на трансакција"),
              tr("Effective rate date", "Датум на курс"),
              "USD/MKD",
            ],
            report.exchangeRates
              .filter((rate) => usedDates.has(rate.requestedDate))
              .map((rate) => [
                rate.requestedDate,
                rate.effectiveDate,
                rate.mkdPerUsd.toFixed(6),
              ]),
            tr(
              "Rates used on transaction dates",
              "Курсеви на датумите на трансакции",
            ),
          )}
        </section>
        <section className="panel report-section" id="methodology">
          <CalculationGuide language={language} report={report} />
        </section>
        <section className="panel report-section" id="notes">
          <h2>
            {tr(
              "Calculation notes & filing checklist",
              "Белешки и проверка пред пријавување",
            )}
          </h2>
          <p className="report-context">
            {tr(
              "Your report is a calculation aid for a Macedonian tax filing, not a submission to UJP. Review the checks below and retain the original statement alongside the downloaded Excel and PDF summary.",
              "Вашиот извештај е помошна пресметка за даночна пријава во Македонија, а не поднесување до УЈП. Проверете ги ставките подолу и чувајте го оригиналниот извод со преземените Excel и PDF резиме.",
            )}
          </p>
          <ul className="warning-list">
            {report.preview.warnings.map((w) => (
              <li key={w}>{statementMessage(w, language)}</li>
            ))}
          </ul>
          <ol className="filing-checklist">
            <li>
              {tr(
                "Reconcile the sales, dividends, interest, and withholding with your full IBKR statement.",
                "Усогласете продажби, дивиденди, камата и задржан данок со целиот IBKR извод.",
              )}
            </li>
            <li>
              {tr(
                "Review exclusions, corporate actions, broker cost basis, and any income outside this statement.",
                "Проверете исклучувања, корпоративни настани, основица и приходи надвор од изводот.",
              )}
            </li>
            <li>
              {tr(
                "Confirm the applicable filing procedure and any foreign-tax-credit treatment with UJP or your adviser.",
                "Потврдете ја постапката и третманот на странскиот задржан данок со УЈП или советник.",
              )}
            </li>
            <li>
              {tr(
                "Use the monthly Excel workpaper to prepare your filing. Keep the original statement and supporting records.",
                "Користете ја месечната Excel пресметка за подготовка. Чувајте извод и докази.",
              )}
            </li>
          </ol>
          <p className="fine">
            {tr(
              "Calculation convention: 10% estimated tax; month and underlying-symbol offsets; positive monthly net interest handled separately. Tax rules and the Excel workbook structure follow the configured calculation model. This document is a preparation aid, not an official UJP form.",
              "Правило: 10% проценет данок; пребивање по месец и основен симбол; позитивна месечна нето камата одделно. Пресметката и Excel ја следат конфигурираната методологија. Овој документ е помош, а не официјален образец на УЈП.",
            )}
          </p>
          <p className="fine">
            {tr("Report reference", "Референца")}: {report.requestId}
          </p>
        </section>
      </div>
    </section>
  );
}
