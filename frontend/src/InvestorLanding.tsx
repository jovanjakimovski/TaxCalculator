import { useState, type RefObject } from "react";
import type { Language } from "./reportStore";
import { ReportPreview } from "./ReportPreview";
import { Icon } from "./Icon";
import { DEV_PROFILE } from "./appProfile";
import "./investor-journey.css";

type Actions = {
  language: Language;
  busy: boolean;
  onChoose: () => void;
  onFile: (file: File) => void;
  onSample: () => void;
  onExportHelp: () => void;
  onCalculations: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

export function JourneyProgress({
  language,
  current,
}: {
  language: Language;
  current: 1 | 2 | 3 | 4;
}) {
  const labels =
    language === "mk"
      ? [
          "Додај извод",
          "Провери",
          DEV_PROFILE ? "Создај" : "Отклучи",
          "Подготви пријава",
        ]
      : [
          "Add statement",
          "Preview",
          DEV_PROFILE ? "Generate" : "Unlock",
          "Prepare filing",
        ];
  return (
    <ol
      className="journey-progress"
      aria-label={
        language === "mk" ? "Чекори до извештајот" : "Your report journey"
      }
    >
      {labels.map((label, index) => (
        <li
          key={label}
          className={
            index + 1 < current
              ? "completed"
              : index + 1 === current
                ? "current"
                : ""
          }
          aria-current={index + 1 === current ? "step" : undefined}
        >
          <span aria-hidden="true">
            {index + 1 < current ? "✓" : index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function ExportInstructions({ language }: { language: Language }) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const steps = [
    [
      tr("Open Statements in IBKR", "Отворете Statements во IBKR"),
      tr(
        "Sign in to IBKR Client Portal. Go to Performance & Reports → Statements, or Menu → Reporting → Statements. Choose the account you want to report on.",
        "Најавете се во IBKR Client Portal. Одете во Performance & Reports → Statements, или Menu → Reporting → Statements. Изберете ја сметката за извештајот.",
      ),
    ],
    [
      tr("Run an Activity Statement", "Изберете Activity Statement"),
      tr(
        "Use the Run arrow next to Activity. Choose Annually for a completed year, or a custom range within one calendar year. Export one account per CSV.",
        "Изберете ја стрелката Run до Activity. Изберете Annually за завршена година, или период во една календарска година. Извезете една сметка по CSV.",
      ),
    ],
    [
      tr("Choose English and CSV", "Изберете English и CSV"),
      tr(
        "Use English statement labels and CSV format. Keep the original file and its column order. Include Trades with realized P/L and basis, Dividends, Withholding Tax, and Interest.",
        "Користете англиски називи на изводот и CSV формат. Зачувајте ги оригиналната датотека и редоследот на колоните. Вклучете Trades со реализирана добивка/загуба и основица, Dividends, Withholding Tax и Interest.",
      ),
    ],
    [
      tr("Check it here for free", "Проверете го бесплатно тука"),
      DEV_PROFILE
        ? tr(
            "Choose your downloaded CSV. Review the period, supported records, and warnings before generating your report. A PDF, Flex Query, or edited spreadsheet is not a supported input.",
            "Изберете CSV. Проверете ги периодот, записите и предупредувањата пред создавање извештај. PDF, Flex Query и изменета табела не се поддржани.",
          )
        : tr(
            "Choose your downloaded CSV. We show the period, supported records, and warnings before you spend a report credit. A PDF, Flex Query, or edited spreadsheet is not a supported input.",
            "Изберете го преземениот CSV. Периодот, поддржаните записи и предупредувањата се прикажуваат пред користење кредит. PDF, Flex Query и изменета табела не се поддржани.",
          ),
    ],
  ];
  return (
    <div className="export-instructions">
      <p>
        {tr(
          "Use the original Activity Statement for your USD portfolio. You only need the statement file; we never ask for your IBKR login or connect to your brokerage account.",
          "Користете оригинален Activity Statement за USD портфолиото. Потребен е само изводот; не ги бараме IBKR податоците за најава и не се поврзуваме со брокерската сметка.",
        )}
      </p>
      <ol>
        {steps.map(([title, text]) => (
          <li key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <a
        href="https://www.ibkrguides.com/clientportal/performanceandstatements/runstatement.htm"
        target="_blank"
        rel="noopener noreferrer"
      >
        {tr(
          "Official IBKR statement instructions",
          "Официјални IBKR упатства за изводи",
        )}{" "}
        ↗
      </a>
    </div>
  );
}

export function InvestorLanding({
  language,
  busy,
  onChoose,
  onFile,
  onSample,
  onExportHelp,
  onCalculations,
  headingRef,
}: Actions) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <section className="hero investor-hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              {tr(
                "FOR IBKR INVESTORS · NORTH MACEDONIA",
                "ЗА IBKR ИНВЕСТИТОРИ · СЕВЕРНА МАКЕДОНИЈА",
              )}
            </span>
            <h1 ref={headingRef} tabIndex={-1}>
              {tr("Your IBKR portfolio.", "Вашето IBKR портфолио.")}
              <br />
              <span>
                {tr("Your Macedonian taxes.", "Вашите даноци во Македонија.")}
              </span>
            </h1>
            <p className="hero-lead">
              {tr(
                "Turn your IBKR statement into a clear monthly MKD report. Review your trades, income, and exchange rates before preparing your UJP filing.",
                "Претворете го IBKR изводот во јасен месечен MKD извештај. Проверете ги трансакциите, приходите и курсевите пред подготовката за УЈП.",
              )}
            </p>
            <div className="investor-upload-card">
              <div className="upload-card-heading">
                <strong>
                  {tr(
                    "Add your investment statement",
                    "Додајте го инвестицискиот извод",
                  )}
                </strong>
                <span>{tr("FREE PREVIEW", "БЕСПЛАТЕН ПРЕГЛЕД")}</span>
              </div>
              <label className="broker-field" htmlFor="broker-platform">
                <span>{tr("Broker platform", "Брокерска платформа")}</span>
                <select
                  id="broker-platform"
                  defaultValue="ibkr"
                  disabled={busy}
                  aria-describedby="broker-scope"
                >
                  <option value="ibkr">Interactive Brokers (IBKR)</option>
                  <option value="future" disabled>
                    {tr(
                      "Other platforms · coming later",
                      "Други платформи · во иднина",
                    )}
                  </option>
                </select>
              </label>
              <p id="broker-scope" className="broker-scope">
                <i aria-hidden="true" />
                {tr(
                  "English Activity Statement · USD base currency",
                  "Англиски Activity Statement · основна валута USD",
                )}
              </p>
              <div
                className={`upload-box investor-dropzone${dragging && !busy ? " dragging" : ""}`}
                onDragEnter={() => setDragging(true)}
                onDragLeave={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setDragging(false);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file && !busy) onFile(file);
                }}
              >
                <span className="upload-icon" aria-hidden="true">
                  <Icon name="upload" />
                </span>
                <div>
                  <strong>
                    {tr(
                      "Drop your IBKR CSV here",
                      "Додајте го вашиот IBKR CSV",
                    )}
                  </strong>
                  <small>
                    {tr(
                      "Original CSV · up to 10 MB",
                      "Оригинален CSV · до 10 MB",
                    )}
                  </small>
                </div>
                <button
                  className="button yellow"
                  disabled={busy}
                  onClick={onChoose}
                >
                  {tr("Choose CSV", "Изберете CSV")} <Icon name="arrow" />
                </button>
              </div>
              <div className="upload-card-footer">
                <span>
                  <Icon name="check" />
                  {tr(
                    "Free check. No payment needed.",
                    "Бесплатна проверка. Без плаќање.",
                  )}
                </span>
                <button className="text-button" onClick={onExportHelp}>
                  {tr("How to export from IBKR", "Како да извезете од IBKR")} ↗
                </button>
              </div>
            </div>
            <button
              className="text-button hero-sample"
              disabled={busy}
              onClick={onSample}
            >
              {tr(
                "Just exploring? See a sample report",
                "Само разгледувате? Погледнете пример",
              )}{" "}
              →
            </button>
            <p className="fine privacy-line">
              <Icon name="shield" />
              <span>
                {tr(
                  "Your CSV stays on your device. No IBKR login required.",
                  "CSV останува на вашиот уред. Не е потребна IBKR најава.",
                )}
              </span>
            </p>
          </div>
          <div className="investor-report-preview">
            <ReportPreview
              language={language}
              busy={busy}
              onSample={onSample}
            />
            <div className="report-preview-caption">
              <span>IBKR CSV</span>
              <span aria-hidden="true">→</span>
              <span>{tr("MKD report", "MKD извештај")}</span>
              <span aria-hidden="true">→</span>
              <span>{tr("Your UJP preparation", "Подготовка за УЈП")}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="investor-proof-strip">
        <div className="container">
          <span>
            {tr("Built for Macedonian investors", "За македонски инвеститори")}
          </span>
          <span>
            {tr("Monthly breakdown in MKD", "Месечна пресметка во MKD")}
          </span>
          <span>
            {tr("NBRNM exchange-rate evidence", "Преглед на курсеви од НБРСМ")}
          </span>
          <span>
            {tr("Excel + printable summary", "Excel + резиме за печатење")}
          </span>
        </div>
      </div>

      <section
        className="container steps-section investor-steps"
        id="how-it-works"
      >
        <span className="eyebrow">
          {tr(
            "FROM YOUR BROKER TO YOUR FILING PREPARATION",
            "ОД БРОКЕРОТ ДО ПОДГОТОВКА НА ПРИЈАВАТА",
          )}
        </span>
        <h2>
          {tr(
            "A clear path from CSV to report.",
            "Јасен пат од CSV до извештај.",
          )}
        </h2>
        <p className="section-lead">
          {tr(
            DEV_PROFILE
              ? "Review your data first. Generate the report when you’re ready."
              : "Review your data first. Pay when you’re ready for the complete calculation.",
            DEV_PROFILE
              ? "Прво проверете ги податоците. Создајте извештај кога ќе сте подготвени."
              : "Прво проверете ги податоците. Платете кога ќе сте подготвени за целосната пресметка.",
          )}
        </p>
        <div className="steps">
          {[
            [
              tr("Export from IBKR", "Извезете од IBKR"),
              tr(
                "Download an English Activity Statement CSV for the calendar year or period you want to review.",
                "Преземете англиски Activity Statement CSV за календарската година или периодот што го проверувате.",
              ),
            ],
            [
              tr("Preview for free", "Бесплатен преглед"),
              DEV_PROFILE
                ? tr(
                    "Confirm the period, sales and income records. Check warnings before generating your report.",
                    "Потврдете ги периодот, продажбите и приходите. Проверете ги предупредувањата пред создавање извештај.",
                  )
                : tr(
                    "Confirm the period, sales and income records. Check warnings before buying or using a credit.",
                    "Потврдете ги периодот, продажбите и приходите. Проверете ги предупредувањата пред купување или користење кредит.",
                  ),
            ],
            [
              DEV_PROFILE
                ? tr("Generate your report", "Создајте извештај")
                : tr("Sign in & unlock", "Најавете се и отклучете"),
              DEV_PROFILE
                ? tr(
                    "Generate the complete report and download Excel. No account or payment is required in this development workspace.",
                    "Создајте целосен извештај и преземете Excel. Во развојната околина не е потребна сметка или плаќање.",
                  )
                : tr(
                    "Buy 1, 2 or 3 report credits. One credit unlocks one unique statement; repeat downloads are free on this browser.",
                    "Купете 1, 2 или 3 кредити. Еден кредит отклучува еден уникатен извод; повторните преземања во овој прелистувач се бесплатни.",
                  ),
            ],
            [
              tr("Review & prepare filing", "Проверете и подгответе пријава"),
              tr(
                "Review monthly MKD amounts, download Excel, and keep the original IBKR statement as supporting evidence for your UJP preparation.",
                "Проверете ги месечните MKD износи, преземете Excel и зачувајте го IBKR изводот како доказ за подготовката за УЈП.",
              ),
            ],
          ].map(([title, text], i) => (
            <article key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="deliverables-section">
        <div className="container">
          <div className="marketing-section-heading">
            <div>
              <span className="eyebrow">
                {tr("WHAT YOUR REPORT INCLUDES", "ШТО СОДРЖИ ИЗВЕШТАЈОТ")}
              </span>
              <h2>
                {tr(
                  "Understand the numbers before you file.",
                  "Разберете ги износите пред пријавување.",
                )}
              </h2>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={onSample}
            >
              {tr("See a sample report", "Погледнете пример извештај")} ↗
            </button>
          </div>
          <div className="deliverable-grid">
            {[
              [
                "01",
                tr("Your monthly MKD breakdown", "Месечна пресметка во MKD"),
                tr(
                  "Sales, dividends, interest, eligible offsets and a 10% tax estimate, organized by month. See how the period total is built.",
                  "Продажби, дивиденди, камата, применети пребивања и даночна проценка од 10%, по месеци. Погледнете како се добива вкупниот износ.",
                ),
              ],
              [
                "02",
                tr("A detailed Excel workpaper", "Детална Excel пресметка"),
                tr(
                  "The full calculation workbook with sales, income and rate evidence. Download in English or Macedonian and keep it for your review.",
                  "Целосна пресметка со продажби, приходи и преглед на курсеви. Преземете на англиски или македонски и зачувајте за проверка.",
                ),
              ],
              [
                "03",
                tr("A report you can follow", "Разбирлив извештај"),
                tr(
                  "Search transactions, read the calculation method, print a summary, and work through the filing preparation checklist.",
                  "Пребарувајте трансакции, прочитајте го методот, испечатете резиме и следете ги чекорите за подготовка на пријавата.",
                ),
              ],
            ].map(([number, title, text]) => (
              <article className="panel deliverable-card" key={number}>
                <span className="deliverable-number">{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="filing-boundary">
            {tr(
              "Your report helps you prepare. Review it and use the relevant amounts when filing with UJP; the app does not submit your tax return.",
              "Извештајот помага при подготовката. Проверете го и користете ги соодветните износи при поднесување во УЈП; апликацијата не ја поднесува даночната пријава.",
            )}
          </p>
        </div>
      </section>

      <section className="container investor-scope-section">
        <div className="scope-intro">
          <span className="eyebrow">
            {tr("CHECK THE FIT", "ПРОВЕРЕТЕ ДАЛИ ОДГОВАРА")}
          </span>
          <h2>
            {tr(
              "For your USD portfolio on IBKR.",
              "За вашето USD портфолио на IBKR.",
            )}
          </h2>
          <p>
            {DEV_PROFILE
              ? tr(
                  "Built around the income Macedonian investors commonly receive from U.S. stocks and options. We validate your statement before generating a report.",
                  "За приходите од американски акции и опции. Изводот се проверува пред создавање извештај.",
                )
              : tr(
                  "Built around the income Macedonian investors commonly receive from U.S. stocks and options. We validate your statement before you use a credit.",
                  "За приходите што македонските инвеститори ги добиваат од американски акции и опции. Изводот се проверува пред користење кредит.",
                )}
          </p>
          <button className="text-button" onClick={onCalculations}>
            {tr("How we calculate", "Како пресметуваме")} →
          </button>
        </div>
        <div className="panel scope-card">
          <h3>{tr("Included in your estimate", "Вклучено во проценката")}</h3>
          <ul className="checklist">
            <li>
              {tr(
                "Realized USD stock and option sales",
                "Реализирани USD продажби на акции и опции",
              )}
            </li>
            <li>
              {tr(
                "Gross dividends and withholding evidence",
                "Бруто дивиденди и преглед на задржан данок",
              )}
            </li>
            <li>
              {tr(
                "Monthly net interest, calculated separately",
                "Месечна нето камата, пресметана одделно",
              )}
            </li>
            <li>
              {tr(
                "Monthly offsets for the same underlying symbol",
                "Месечно пребивање за истиот основен симбол",
              )}
            </li>
          </ul>
          <div className="scope-limit">
            <strong>
              {tr(
                "Check other activity separately",
                "Другите активности проверете ги одделно",
              )}
            </strong>
            <p>
              {tr(
                "Forex, grants, deposits and unrealized gains are excluded. Non-USD income and short positions are unsupported. Foreign withholding is shown but does not reduce this estimate.",
                "Forex, доделени акции, депозити и нереализирани добивки се исклучени. Приходи во друга валута и кратки позиции не се поддржани. Задржаниот странски данок е прикажан, но не ја намалува проценката.",
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="container trust-banner investor-calculation-banner">
        <div>
          <span className="eyebrow">
            {tr("EVERY STEP EXPLAINED", "СЕКОЈ ЧЕКОР Е ОБЈАСНЕТ")}
          </span>
          <h2>
            {tr(
              "The calculation should make sense to you.",
              "Пресметката треба да ви биде јасна.",
            )}
          </h2>
          <p>
            {tr(
              "See how IBKR realized results become MKD amounts, how monthly offsets work, and how the 10% estimate is added up. Worked examples make the method easy to check.",
              "Погледнете како IBKR реализираните резултати стануваат MKD износи, како работи месечното пребивање и како се собира проценката од 10%. Примерите помагаат да го проверите методот.",
            )}
          </p>
        </div>
        <button className="button primary" onClick={onCalculations}>
          {tr("Explore the calculation", "Погледнете ја пресметката")} →
        </button>
      </section>

      <section className="container investor-faq">
        <span className="eyebrow">
          {tr("BEFORE YOU START", "ПРЕД ДА ЗАПОЧНЕТЕ")}
        </span>
        <h2>
          {tr("A few things worth knowing.", "Неколку корисни информации.")}
        </h2>
        {[
          [
            tr(
              "Is this the document I submit to UJP?",
              "Дали овој документ го поднесувам во УЈП?",
            ),
            tr(
              "It is a supporting calculation and filing preparation report, not an official UJP form. Review the monthly amounts and evidence, confirm your tax treatment, and use them to complete the applicable filing. You remain responsible for correctness and submission.",
              "Ова е пресметка и извештај за подготовка, а не официјален образец на УЈП. Проверете ги месечните износи и доказите, потврдете го даночниот третман и користете ги за соодветната пријава. Вие сте одговорни за точноста и поднесувањето.",
            ),
          ],
          [
            DEV_PROFILE
              ? tr(
                  "Can I generate multiple reports?",
                  "Може ли да создадам повеќе извештаи?",
                )
              : tr(
                  "What does one report credit cover?",
                  "Што покрива еден кредит?",
                ),
            DEV_PROFILE
              ? tr(
                  "Yes. Generate reports for supported statements without credits or access codes. Reports stay on this browser; download copies before clearing its storage.",
                  "Да. Создавајте извештаи за поддржани изводи без кредити или кодови. Извештаите остануваат во овој прелистувач; преземете копии пред бришење на податоците.",
                )
              : tr(
                  "One credit unlocks one unique CSV statement, including its detailed Excel and printable summary. Choose a completed calendar year or a period within one year. Reopening, downloading again, and switching the workbook language on the same browser are free. A different CSV uses a new credit.",
                  "Еден кредит отклучува еден уникатен CSV извод со детален Excel и резиме за печатење. Изберете завршена календарска година или период во една година. Повторно отворање, преземање и промена на јазикот во истиот прелистувач се бесплатни. Друг CSV користи нов кредит.",
                ),
          ],
          [
            tr(
              "Can I use another investment platform?",
              "Може ли да користам друга инвестициска платформа?",
            ),
            tr(
              "IBKR is the only supported platform today. The platform choice will expand as other import formats are supported. Please do not rename or convert another broker’s file into an IBKR statement.",
              "Моментално се поддржува само IBKR. Изборот ќе се прошири кога ќе се додадат други формати. Не преименувајте и не претворајте извод од друг брокер во IBKR извод.",
            ),
          ],
          [
            tr(
              "Where do my statement and reports stay?",
              "Каде остануваат изводот и извештаите?",
            ),
            DEV_PROFILE
              ? tr(
                  "Your CSV and calculations are processed locally in your browser. Report files stay on this browser and device. Download and keep copies before clearing browser storage or changing devices.",
                  "CSV и пресметките се обработуваат локално во прелистувачот. Извештаите остануваат на овој уред. Преземете копии пред бришење податоци или промена на уред.",
                )
              : tr(
                  "Your CSV and calculations are processed locally in your browser. Credits follow your account, but report files stay on this browser and device. Download and keep copies before clearing browser storage or changing devices.",
                  "CSV и пресметките се обработуваат локално во прелистувачот. Кредитите се поврзани со сметката, но датотеките остануваат во овој прелистувач и уред. Преземете копии пред бришење податоци или промена на уред.",
                ),
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
    </>
  );
}
