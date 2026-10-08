import { useId, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";
import type { Language } from "./reportStore";

export function ReportPreview({
  language,
  busy,
  onSample,
}: {
  language: Language;
  busy: boolean;
  onSample: () => void;
}) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const labels = [
    tr("Overview", "Преглед"),
    tr("Breakdown", "Пресметка"),
    tr("Exports", "Извоз"),
  ];
  const months =
    language === "mk"
      ? ["Ј", "Ф", "М", "А", "М", "Ј", "Ј", "А", "С", "О", "Н", "Д"]
      : ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <section
      className="report-illustration"
      aria-label={tr(
        "Explore the report preview",
        "Разгледајте го прегледот на извештајот",
      )}
    >
      <div className="preview-editorial">
        <span className="preview-kicker">
          {tr("THE REPORT, AT A GLANCE", "ИЗВЕШТАЈОТ, НА ЕДНО МЕСТО")}
        </span>
        <h2>
          {tr("A year of investing.", "Година на инвестирање.")}
          <br />
          <span>{tr("One clear view.", "Еден јасен преглед.")}</span>
        </h2>
        <div className="preview-editorial-mark" aria-hidden="true">
          <Icon name="chart" />
        </div>
      </div>
      <div className="demo-report">
        <div className="demo-report-top">
          <div className="demo-brand">
            <BrandMark />
            <span>
              taxcalculator <small>MK</small>
            </span>
          </div>
          <span className="demo-label">
            {tr("ILLUSTRATIVE PREVIEW", "ИЛУСТРАТИВЕН ПРЕГЛЕД")}
          </span>
        </div>
        <div className="demo-title-row">
          <div>
            <span className="demo-overline">
              {tr("INVESTMENT TAX WORKPAPER", "ИНВЕСТИЦИСКА ДАНОЧНА ПРЕСМЕТКА")}
            </span>
            <h3>{tr("Your tax report", "Ваш даночен извештај")}</h3>
          </div>
          <span className="demo-currency">USD → MKD</span>
        </div>
        <div
          className="demo-tabs"
          role="tablist"
          aria-label={tr("Preview sections", "Делови на прегледот")}
        >
          {labels.map((label, index) => (
            <button
              key={index}
              type="button"
              ref={(el) => {
                buttons.current[index] = el;
              }}
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={active === index}
              aria-controls={`${id}-panel-${index}`}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowRight")
                  next = (index + 1) % labels.length;
                else if (event.key === "ArrowLeft")
                  next = (index + labels.length - 1) % labels.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = labels.length - 1;
                else return;
                event.preventDefault();
                setActive(next);
                buttons.current[next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="demo-panels">
          <div
            role="tabpanel"
            id={`${id}-panel-0`}
            aria-labelledby={`${id}-tab-0`}
            hidden={active !== 0}
            tabIndex={0}
          >
            <div className="demo-metrics">
              <div className="demo-metric-primary">
                <small>
                  {tr("Estimated tax rate", "Проценета даночна стапка")}
                </small>
                <strong>
                  10<span>%</span>
                </strong>
                <span className="demo-metric-note">
                  {tr(
                    "A method you can review",
                    "Метод што можете да го проверите",
                  )}
                </span>
              </div>
              <div>
                <small>{tr("Monthly breakdown", "Месечна пресметка")}</small>
                <strong>
                  12<span> {tr("months", "месеци")}</span>
                </strong>
                <span className="demo-metric-note">
                  {tr("Organized by month", "Организирано по месеци")}
                </span>
              </div>
            </div>
            <div className="demo-chart-heading">
              <strong>
                {tr("Investment activity", "Инвестициска активност")}
              </strong>
              <span>{tr("ILLUSTRATIVE", "ИЛУСТРАЦИЈА")}</span>
            </div>
            <div className="demo-chart" aria-hidden="true">
              {[30, 44, 37, 65, 54, 81, 67, 93, 76, 64, 98, 83].map(
                (height, i) => (
                  <div key={i}>
                    <div className="demo-bar-track">
                      <i style={{ height: `${height}%` }} />
                    </div>
                    <small>{months[i]}</small>
                  </div>
                ),
              )}
            </div>
          </div>
          <div
            role="tabpanel"
            id={`${id}-panel-1`}
            aria-labelledby={`${id}-tab-1`}
            hidden={active !== 1}
            tabIndex={0}
          >
            <p className="demo-panel-intro">
              {tr(
                "Follow the numbers, month by month.",
                "Следете ги износите, месец по месец.",
              )}
            </p>
            <div className="demo-breakdown">
              {[
                [
                  "chart",
                  tr("Stocks & options", "Акции и опции"),
                  tr(
                    "Realized sales and monthly offsets",
                    "Реализирани продажби и месечни пребивања",
                  ),
                ],
                [
                  "coins",
                  tr("Dividends & interest", "Дивиденди и камата"),
                  tr(
                    "Income records and withholding evidence",
                    "Приходи и докази за задржан данок",
                  ),
                ],
                [
                  "calendar",
                  tr("Exchange rates", "Курсеви"),
                  tr(
                    "NBRNM rates with effective dates",
                    "Курсеви од НБРСМ со датуми",
                  ),
                ],
              ].map(([icon, title, note]) => (
                <div className="demo-breakdown-row" key={title}>
                  <span className="demo-feature-icon">
                    <Icon name={icon as "chart" | "coins" | "calendar"} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{note}</small>
                  </div>
                  <span className="demo-row-unit">MKD</span>
                </div>
              ))}
            </div>
            <div className="demo-evidence">
              <Icon name="check" />
              {tr(
                "Every amount has a record behind it.",
                "Зад секој износ има запис.",
              )}
            </div>
          </div>
          <div
            role="tabpanel"
            id={`${id}-panel-2`}
            aria-labelledby={`${id}-tab-2`}
            hidden={active !== 2}
            tabIndex={0}
          >
            <p className="demo-panel-intro">
              {tr(
                "Ready to review. Easy to keep.",
                "За лесна проверка и зачувување.",
              )}
            </p>
            <div className="demo-export">
              <span className="demo-file-icon">
                <Icon name="file" />
              </span>
              <div>
                <strong>{tr("Excel workpaper", "Excel пресметка")}</strong>
                <small>
                  {tr(
                    "Transactions, formulas & rate evidence",
                    "Трансакции, формули и курсеви",
                  )}
                </small>
                <span className="demo-file-extension">.XLSX · EN / MK</span>
              </div>
            </div>
            <div className="demo-export">
              <span className="demo-file-icon">
                <Icon name="file" />
              </span>
              <div>
                <strong>{tr("Printable summary", "Резиме за печатење")}</strong>
                <small>
                  {tr(
                    "Monthly totals & filing checklist",
                    "Месечни износи и листа за проверка",
                  )}
                </small>
                <span className="demo-file-extension">
                  {tr("PRINT / SAVE PDF", "ПЕЧАТИ / ЗАЧУВАЈ PDF")}
                </span>
              </div>
            </div>
          </div>
        </div>
        <button className="demo-open-sample" disabled={busy} onClick={onSample}>
          <span>
            {tr(
              "Explore the full sample report",
              "Разгледајте го целосниот пример",
            )}
          </span>
          <Icon name="arrow" />
        </button>
      </div>
      <div className="preview-privacy">
        <Icon name="shield" />
        <span>
          {tr(
            "Your statement stays on your device.",
            "Изводот останува на вашиот уред.",
          )}
        </span>
      </div>
    </section>
  );
}
