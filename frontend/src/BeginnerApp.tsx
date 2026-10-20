import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";
import { buildReport } from "./buildReport";
import { inspectStatement, MAX_FILE_BYTES } from "./statement";
import type { StatementPreview } from "./statement";
import { statementMessage } from "./statementMessages";

type Language = "mk" | "en";
type GeneratedReport = Awaited<ReturnType<typeof buildReport>>;
type Report = GeneratedReport & {
  csvText: string;
  preview: StatementPreview;
  language: Language;
  fileName: string;
};

const API = import.meta.env.VITE_API_URL ?? "/api";
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP;
const lastUpdated = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(BUILD_TIMESTAMP));
// Some browsers omit Macedonian locale data; keep visible labels consistent.
const MK_MONTHS = [
  "јануари",
  "февруари",
  "март",
  "април",
  "мај",
  "јуни",
  "јули",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];
const MK_SHORT_MONTHS = [
  "јан.",
  "фев.",
  "мар.",
  "апр.",
  "мај",
  "јун.",
  "јул.",
  "авг.",
  "септ.",
  "окт.",
  "ноем.",
  "дек.",
];
function initialLanguage(): Language {
  try {
    return localStorage.getItem("taxcalculator.language") === "en"
      ? "en"
      : "mk";
  } catch {
    return "mk";
  }
}

export default function BeginnerApp() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [documentLanguage, setDocumentLanguage] = useState<Language>(language);
  const [file, setFile] = useState<File>();
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState<"" | "calculate" | "export">("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const operation = useRef(0);
  const working = useRef(false);
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const amount = (value: number, whole = false) => {
    const formatter = new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    return language === "mk"
      ? formatter
          .formatToParts(value)
          .map((part) =>
            part.type === "group"
              ? "."
              : part.type === "decimal"
                ? ","
                : part.value,
          )
          .join("")
      : formatter.format(value);
  };
  const date = (iso: string) => {
    if (language === "mk") {
      const [year, month, day] = iso.split("-");
      return `${Number(day)} ${MK_SHORT_MONTHS[Number(month) - 1]} ${year}`;
    }
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T12:00:00Z`));
  };
  const month = (iso: string) => {
    if (language === "mk") {
      const [year, month] = iso.split("-");
      return `${MK_MONTHS[Number(month) - 1]} ${year}`;
    }
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}-01T12:00:00Z`));
  };

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("taxcalculator.language", language);
    } catch {
      // Language selection also works when browser storage is unavailable.
    }
  }, [language]);
  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );
  useEffect(() => {
    if (report) {
      resultsHeading.current?.focus({ preventScroll: true });
      resultsHeading.current?.closest("section")?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }
  }, [report?.fileName, report?.preview.start, report?.preview.end]);

  function selectFile(next: File | undefined) {
    if (!next) return;
    operation.current++;
    working.current = false;
    setBusy("");
    setReport(undefined);
    setError("");
    setFile(undefined);
    if (!/\.csv$/i.test(next.name)) {
      setError(
        tr(
          "Choose an IBKR Activity Statement CSV file.",
          "Избери IBKR Activity Statement во CSV формат.",
        ),
      );
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setError("The statement exceeds the 10 MB limit.");
      return;
    }
    setFile(next);
  }

  async function calculate() {
    if (!file || working.current) return;
    const current = ++operation.current;
    const selectedFile = file;
    const selectedLanguage = documentLanguage;
    working.current = true;
    setBusy("calculate");
    setError("");
    setReport(undefined);
    try {
      const csvText = await selectedFile.text();
      if (current !== operation.current) return;
      const preview = inspectStatement(csvText);
      if (preview.errors.length) throw new Error(preview.errors.join("\n"));
      const generated = await buildReport({
        csvText,
        exchangeRatesApi: `${API}/tax/exchange-rates`,
        language: selectedLanguage,
      });
      if (current !== operation.current) return;
      setReport({
        ...generated,
        csvText,
        preview,
        language: selectedLanguage,
        fileName: selectedFile.name,
      });
    } catch (cause) {
      if (current === operation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : tr(
                "Could not calculate the report. Try again.",
                "Извештајот не можеше да се пресмета. Обиди се повторно.",
              ),
        );
    } finally {
      if (current === operation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }

  async function exportExcel() {
    if (!report || working.current) return;
    const current = ++operation.current;
    const selectedReport = report;
    const selectedLanguage = documentLanguage;
    working.current = true;
    setBusy("export");
    setError("");
    try {
      let workbook = selectedReport.workbook;
      if (selectedReport.language !== selectedLanguage) {
        const generated = await buildReport({
          csvText: selectedReport.csvText,
          exchangeRatesApi: `${API}/tax/exchange-rates`,
          exchangeRates: selectedReport.exchangeRates,
          language: selectedLanguage,
        });
        if (current !== operation.current) return;
        workbook = generated.workbook;
        setReport({
          ...selectedReport,
          ...generated,
          language: selectedLanguage,
        });
      }
      if (current !== operation.current) return;
      const url = URL.createObjectURL(
        new Blob([workbook], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `Tax_Report_${selectedReport.preview.start}_${selectedReport.preview.end}_${selectedLanguage}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (current === operation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : tr(
                "Could not export the report. Try again.",
                "Извештајот не можеше да се извезе. Обиди се повторно.",
              ),
        );
    } finally {
      if (current === operation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="beginner-app">
      <header className="beginner-header">
        <div className="beginner-container beginner-header-inner">
          <a className="beginner-brand" href="/" aria-label="TaxCalculator MK">
            <BrandMark />
            <span>
              tax<span>calculator</span>
              <sup>MK</sup>
            </span>
          </a>
          <div className="beginner-header-actions">
            <p className="beginner-last-updated">
              Last Updated:{" "}
              <time dateTime={BUILD_TIMESTAMP}>{lastUpdated}</time>
            </p>
            <select
              className="beginner-ui-language"
              aria-label={tr("Interface language", "Јазик на интерфејсот")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="mk">Македонски</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </header>

      <main className="beginner-container beginner-main">
        <div className="beginner-intro">
          <p className="beginner-eyebrow">IBKR → MKD</p>
          <h1>
            {tr(
              "Your investment report, made simple.",
              "Едноставна пресметка на инвестиции.",
            )}
          </h1>
          <p>
            {tr(
              "Upload your CSV, calculate the results, and download Excel.",
              "Прикачи CSV, пресметај ги резултатите и преземи Excel.",
            )}
          </p>
        </div>

        <section
          className="beginner-upload-card"
          aria-labelledby="upload-heading"
        >
          <div className="beginner-card-heading">
            <h2 id="upload-heading">IBKR Activity Statement</h2>
            <span className="beginner-free">{tr("Free", "Бесплатно")}</span>
          </div>
          <input
            ref={fileInput}
            id="statement-file"
            className="beginner-sr-only"
            type="file"
            accept=".csv,text/csv"
            aria-label="IBKR Activity Statement CSV"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <div
            className={`beginner-dropzone${dragging ? " dragging" : ""}${file ? " selected" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
          >
            <span className="beginner-upload-icon">
              <Icon name={file ? "file" : "upload"} />
            </span>
            <div className="beginner-file-copy">
              <strong>
                {file?.name ??
                  tr("Drop your CSV here", "Повлечи го CSV фајлот тука")}
              </strong>
              <span>
                {file
                  ? `${Math.max(1, Math.round(file.size / 1024))} KB · ${tr("Ready to calculate", "Подготвен за пресметка")}`
                  : tr(
                      "Original IBKR Activity Statement · CSV, up to 10 MB",
                      "Оригинален IBKR Activity Statement · CSV, до 10 MB",
                    )}
              </span>
            </div>
            <button
              className="beginner-button beginner-secondary"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              {file
                ? tr("Change file", "Промени фајл")
                : tr("Choose CSV", "Избери CSV")}
            </button>
          </div>
          <div className="beginner-upload-actions">
            <p>
              <Icon name="shield" />
              {tr(
                "Your statement stays in your browser.",
                "Изводот останува во твојот прелистувач.",
              )}
            </p>
            <button
              className="beginner-button beginner-primary"
              type="button"
              disabled={!file || !!busy}
              onClick={() => void calculate()}
            >
              {busy === "calculate" ? (
                <span className="beginner-spinner" />
              ) : (
                <Icon name="arrow" />
              )}
              {busy === "calculate"
                ? tr("Calculating…", "Се пресметува…")
                : tr("Calculate", "Пресметај")}
            </button>
          </div>
        </section>

        <div className="beginner-status" aria-live="polite" role="status">
          {busy === "calculate" &&
            tr(
              "Getting exchange rates and preparing your report…",
              "Се преземаат девизните курсеви и се подготвува извештајот…",
            )}
          {busy === "export" &&
            tr(
              "Preparing your Excel document…",
              "Се подготвува Excel документот…",
            )}
        </div>
        {error && (
          <p className="beginner-error" role="alert">
            {error
              .split("\n")
              .map((line) => statementMessage(line, language))
              .join("\n")}
          </p>
        )}

        {report && (
          <section
            className="beginner-results"
            aria-labelledby="results-heading"
          >
            <div className="beginner-results-heading">
              <div>
                <p className="beginner-eyebrow">
                  <Icon name="check" />
                  {tr("Report ready", "Извештајот е подготвен")}
                </p>
                <h2 ref={resultsHeading} id="results-heading" tabIndex={-1}>
                  {tr("Results", "Резултати")}
                </h2>
                <p>
                  {date(report.preview.start)} — {date(report.preview.end)}
                </p>
              </div>
              <div className="beginner-export-controls">
                <label htmlFor="document-language">
                  {tr("Excel document language", "Јазик на Excel документот")}
                </label>
                <div>
                  <select
                    id="document-language"
                    value={documentLanguage}
                    disabled={!!busy}
                    onChange={(event) =>
                      setDocumentLanguage(event.target.value as Language)
                    }
                  >
                    <option value="mk">Македонски</option>
                    <option value="en">English</option>
                  </select>
                  <button
                    className="beginner-button beginner-primary"
                    type="button"
                    disabled={!!busy}
                    onClick={() => void exportExcel()}
                  >
                    {busy === "export" ? (
                      <span className="beginner-spinner" />
                    ) : (
                      <Icon name="download" />
                    )}
                    {busy === "export"
                      ? tr("Exporting…", "Се извезува…")
                      : tr("Export Excel", "Извези Excel")}
                  </button>
                </div>
              </div>
            </div>

            <div className="beginner-metrics">
              <article>
                <span>
                  {tr("Total for calculation", "Вкупно за пресметка")}
                </span>
                <strong>
                  {amount(report.calculationResult.taxableIncomeMkd)}{" "}
                  <small>{tr("MKD", "МКД")}</small>
                </strong>
              </article>
              <article className="beginner-tax-metric">
                <span>
                  {tr("Total estimated tax", "Вкупен проценет данок")}
                </span>
                <strong>
                  {amount(report.calculationResult.estimatedTaxMkd, true)}{" "}
                  <small>{tr("MKD", "МКД")}</small>
                </strong>
              </article>
            </div>

            <div className="beginner-table-wrap">
              <table>
                <caption>
                  {tr("Monthly calculation in MKD", "Месечна пресметка во МКД")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{tr("Month", "Месец")}</th>
                    <th scope="col">{tr("Total", "Вкупно")}</th>
                    <th scope="col">{tr("Tax", "Данок")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.calculationResult.monthlySummary.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{month(row.month)}</th>
                      <td>{amount(row.taxablePnlMkd)}</td>
                      <td>{amount(row.taxMkd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{tr("Total", "Вкупно")}</th>
                    <td>{amount(report.calculationResult.taxableIncomeMkd)}</td>
                    <td>
                      {amount(report.calculationResult.estimatedTaxMkd, true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="beginner-scope">
              {tr(
                "Calculations include USD stocks, options, dividends and interest. Other currencies remain in the original statement sheet. Total tax is rounded up to a whole denar.",
                "Пресметката вклучува USD акции, опции, дивиденди и камата. Другите валути остануваат во листот со оригиналниот извештај. Вкупниот данок е заокружен нагоре до цел денар.",
              )}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
