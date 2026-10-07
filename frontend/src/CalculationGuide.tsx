import { useState } from "react";
import type { Language, SavedReport } from "./reportStore";
import "./calculation-guide.css";

type Props = { language: Language; report?: SavedReport };

export function CalculationGuide({ language, report }: Props) {
  const tr = (en: string, mk: string) => (language === "mk" ? mk : en);
  const [scenario, setScenario] = useState("same");
  const number = (value: number, whole = false) =>
    new Intl.NumberFormat(language === "mk" ? "mk-MK" : "en-GB", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(value);
  const taxableExample = scenario === "same" ? 4_000 : 6_500;
  const unroundedTax = report?.result.monthlySummary.reduce(
    (sum, month) => sum + month.taxMkd,
    0,
  );
  return (
    <div className="calculation-guide">
      <div className="guide-intro">
        <span className="eyebrow">
          {tr("EVERY NUMBER HAS A REASON", "СЕКОЈ БРОЈ ИМА ОБЈАСНУВАЊЕ")}
        </span>
        <h2>
          {tr(
            "How your tax estimate is calculated",
            "Како се пресметува вашиот проценет данок",
          )}
        </h2>
        <p>
          {tr(
            "Follow your IBKR activity from the original USD amounts to the monthly MKD estimate. These are the calculation rules this app uses for your filing preparation.",
            "Следете ја вашата активност на IBKR од изворните USD износи до месечната проценка во MKD. Ова се правилата што апликацијата ги користи за подготовка на вашата даночна пријава.",
          )}
        </p>
      </div>
      <ol
        className="guide-flow"
        aria-label={tr("Calculation steps", "Чекори на пресметката")}
      >
        <li>
          <span>01</span>
          <strong>{tr("Read your IBKR income", "Приходите од IBKR")}</strong>
          <small>
            {tr(
              "Realized trades, gross dividends, interest",
              "Реализирани трансакции, бруто дивиденди, камата",
            )}
          </small>
        </li>
        <li>
          <span>02</span>
          <strong>{tr("Convert USD to MKD", "Претворање USD во MKD")}</strong>
          <small>
            {tr(
              "Previous-day NBRNM rate for each event",
              "Курс на НБРСМ од претходниот ден за секој настан",
            )}
          </small>
        </li>
        <li>
          <span>03</span>
          <strong>{tr("Apply monthly offsets", "Месечно пребивање")}</strong>
          <small>
            {tr(
              "Same month + same underlying symbol",
              "Ист месец + ист основен симбол",
            )}
          </small>
        </li>
        <li>
          <span>04</span>
          <strong>{tr("Calculate 10% tax", "Пресметка на 10% данок")}</strong>
          <small>
            {tr(
              "Add monthly tax; round the final total up",
              "Збир на месечниот данок; конечниот износ се заокружува нагоре",
            )}
          </small>
        </li>
      </ol>
      <div className="guide-chapters">
        <details open>
          <summary>
            <span className="guide-chapter-number">01</span>
            {tr(
              "Which IBKR activity is included?",
              "Која активност од IBKR е вклучена?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <div className="guide-two-columns">
              <div>
                <h3>
                  {tr("Sales and income in USD", "Продажби и приходи во USD")}
                </h3>
                <p>
                  {tr(
                    "The app reads supported stock and equity/index option sale orders, IBKR-reported realized profit or loss, gross cash dividends, and USD interest entries. Both positive and negative interest entries are retained.",
                    "Апликацијата ги чита поддржаните налози за продажба на акции и опции, реализираната добивка или загуба пријавена од IBKR, бруто паричните дивиденди и записите за камата во USD. Се задржуваат и позитивните и негативните записи за камата.",
                  )}
                </p>
              </div>
              <div>
                <h3>
                  {tr(
                    "Check what is outside the estimate",
                    "Проверете што е надвор од проценката",
                  )}
                </h3>
                <p>
                  {tr(
                    "Buying shares or holding an unsold position does not create a realized sale result here. Deposits, withdrawals, Forex trades, and unsupported assets or currencies are outside this model. Grants, corporate actions, unusual transactions, and income outside the statement need your review. Upload validation shows the applicable warnings.",
                    "Купувањето акции или држењето непродадена позиција тука не создава реализиран резултат од продажба. Депозити, повлекувања, Forex трансакции и неподдржани инструменти или валути се надвор од овој модел. Грантови, корпоративни настани, невообичаени трансакции и приходи надвор од изводот бараат проверка. Валидацијата при прикачување ги покажува соодветните предупредувања.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </details>
        <details>
          <summary>
            <span className="guide-chapter-number">02</span>
            {tr(
              "How does a USD amount become MKD?",
              "Како износот во USD се претвора во MKD?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <p>
              {tr(
                "For a sale, the starting amount is IBKR’s realized profit or loss in USD, using the broker’s cost basis. The app multiplies that realized result by the USD/MKD rate associated with the sale date. It does not separately convert the original purchase cost and sale proceeds at two different dates. Dividends and interest use their own transaction dates.",
                "За продажба, почетниот износ е реализираната добивка или загуба во USD од IBKR, според набавната основица на брокерот. Апликацијата го множи реализираниот резултат со USD/MKD курсот поврзан со датумот на продажба. Оригиналната набавна вредност и продажниот износ не се претвораат одделно со курсеви од два различни датуми. Дивидендите и каматата ги користат своите датуми на трансакција.",
              )}
            </p>
            <div className="guide-equation">
              <span>
                {tr("USD profit/loss", "Добивка/загуба во USD")}
                <strong>$120.00</strong>
              </span>
              <b aria-hidden="true">×</b>
              <span>
                {tr("Illustrative rate", "Илустративен курс")}
                <strong>55.40</strong>
              </span>
              <b aria-hidden="true">=</b>
              <span>
                {tr("Realized result in MKD", "Реализиран резултат во MKD")}
                <strong>{number(6_648)} MKD</strong>
              </span>
            </div>
            <p>
              {tr(
                "The rate convention is T−1: the previous day. If that day has no published rate, the latest available earlier rate is used. Your real report retains the requested transaction date, effective rate date, and rate in the Exchange rates section. Rates are saved with the report so repeat downloads use the same evidence.",
                "Правилото за курс е Т−1: претходниот ден. Ако за тој ден нема објавен курс, се користи последниот претходен достапен курс. Вистинскиот извештај ги задржува датумот на трансакцијата, ефективниот датум на курсот и курсот во делот „Курсеви“. Курсевите се зачувуваат со извештајот за повторното преземање да ги користи истите податоци.",
              )}
            </p>
            <p className="guide-small">
              {tr(
                "The amounts above are synthetic. Real reports use NBRNM rates; the free sample report uses a clearly labelled illustrative 60 MKD/USD rate.",
                "Износите погоре се синтетички. Вистинските извештаи користат курсеви од НБРСМ; бесплатниот пример користи јасно означен илустративен курс од 60 MKD/USD.",
              )}
            </p>
          </div>
        </details>
        <details open>
          <summary>
            <span className="guide-chapter-number">03</span>
            {tr(
              "Which gains and losses can offset each other?",
              "Кои добивки и загуби можат да се пребиваат?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <p>
              {tr(
                "Within each calendar month, the app groups stock profit/loss, option profit/loss, and gross dividends by underlying symbol. A recognizable AAPL option belongs to the AAPL group. If an option symbol cannot be mapped to its underlying by the supported symbol format, its full symbol remains its own group. Each group contributes the greater of its combined result or zero to the taxable base.",
                "Во секој календарски месец, апликацијата ги групира добивката/загубата од акции, добивката/загубата од опции и бруто дивидендите по основен симбол. Препознатлива AAPL опција припаѓа на групата AAPL. Ако форматот на симболот на опцијата не овозможува поврзување со основниот симбол, целиот симбол останува посебна група. Секоја група придонесува во даночната основица со поголемиот износ од нејзиниот збир или нула.",
              )}
            </p>
            <div className="guide-example">
              <div className="guide-example-heading">
                <span className="tag">
                  {tr("SYNTHETIC EXAMPLE · MKD", "СИНТЕТИЧКИ ПРИМЕР · MKD")}
                </span>
                <h3>
                  {tr(
                    "Same loss. Different group. Different tax base.",
                    "Иста загуба. Различна група. Различна основица.",
                  )}
                </h3>
                <p>
                  {tr(
                    "March: AAPL stock gain 6,000 + AAPL gross dividend 500. Choose where the 2,500 option loss belongs.",
                    "Март: добивка од AAPL акции 6.000 + бруто дивиденда AAPL 500. Изберете каде припаѓа загубата од опција од 2.500.",
                  )}
                </p>
              </div>
              <label className="guide-scenario-label">
                {tr(
                  "Where does the option loss occur?",
                  "Каде настанува загубата од опцијата?",
                )}
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                >
                  <option value="same">
                    {tr("AAPL option · same month", "AAPL опција · ист месец")}
                  </option>
                  <option value="other">
                    {tr("MSFT option · same month", "MSFT опција · ист месец")}
                  </option>
                  <option value="later">
                    {tr(
                      "AAPL option · next month",
                      "AAPL опција · следен месец",
                    )}
                  </option>
                </select>
              </label>
              <div className="guide-example-result" aria-live="polite">
                <div>
                  <small>
                    {tr(
                      "March taxable securities base",
                      "Мартовска основица за хартии од вредност",
                    )}
                  </small>
                  <strong>{number(taxableExample, true)} MKD</strong>
                </div>
                <div>
                  <small>
                    {tr(
                      "March estimated tax · 10%",
                      "Мартовски проценет данок · 10%",
                    )}
                  </small>
                  <strong>{number(taxableExample * 0.1, true)} MKD</strong>
                </div>
              </div>
              <p>
                {scenario === "same"
                  ? tr(
                      "AAPL combines 6,000 + 500 − 2,500 = 4,000 MKD in March. The option loss offsets the stock gain and dividend in that same group.",
                      "AAPL има збир 6.000 + 500 − 2.500 = 4.000 MKD во март. Загубата од опцијата ги пребива добивката од акции и дивидендата во истата група.",
                    )
                  : scenario === "other"
                    ? tr(
                        "The AAPL group remains 6,500 MKD. The separate MSFT group has −2,500 MKD and contributes zero. Its loss does not reduce AAPL’s base.",
                        "Групата AAPL останува 6.500 MKD. Посебната група MSFT има −2.500 MKD и придонесува со нула. Нејзината загуба не ја намалува основицата на AAPL.",
                      )
                    : tr(
                        "March’s AAPL base remains 6,500 MKD. April’s −2,500 MKD group contributes zero in April. Losses do not transfer between months.",
                        "Мартовската основица на AAPL останува 6.500 MKD. Априлската група од −2.500 MKD придонесува со нула во април. Загубите не се пренесуваат меѓу месеци.",
                      )}
              </p>
            </div>
            <p className="guide-callout">
              {tr(
                "This is why a negative annual trading result can still produce an estimated tax liability: losses in another symbol or another month do not cancel a positive group.",
                "Затоа и негативен годишен резултат од тргување може да има проценет данок: загубите кај друг симбол или во друг месец не ја поништуваат позитивната група.",
              )}
            </p>
          </div>
        </details>
        <details>
          <summary>
            <span className="guide-chapter-number">04</span>
            {tr(
              "How are dividends, withholding, and interest treated?",
              "Како се третираат дивидендите, задржаниот данок и каматата?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <div className="guide-two-columns">
              <div>
                <h3>
                  {tr(
                    "Dividends: start with gross",
                    "Дивиденди: почетниот износ е бруто",
                  )}
                </h3>
                <p>
                  {tr(
                    "Gross dividends join the matching underlying-symbol group in their payment month. Foreign withholding is shown separately, and net cash received equals gross minus withholding. Withholding does not reduce the gross dividend used in this model and is not deducted from the estimated tax. Review any applicable foreign-tax-credit treatment with UJP or your adviser before filing.",
                    "Бруто дивидендите се вклучуваат во соодветната група на основниот симбол во месецот на исплата. Странскиот задржан данок е прикажан одделно, а нето исплатата е бруто минус задржан данок. Задржувањето не ја намалува бруто дивидендата во овој модел и не е одземено од проценетиот данок. Пред пријавување проверете го применливиот третман на странскиот данок со УЈП или советник.",
                  )}
                </p>
                <div className="guide-mini-equation">
                  $10 {tr("gross", "бруто")} − $3{" "}
                  {tr("withheld", "задржан данок")} = $7{" "}
                  {tr("net cash", "нето исплата")}
                  <small>
                    {tr(
                      "At an illustrative 60 MKD/USD, the group receives 600 MKD of gross dividend, not 420 MKD of net cash.",
                      "При илустративен курс 60 MKD/USD, во групата влегуваат 600 MKD бруто дивиденда, а не 420 MKD нето исплата.",
                    )}
                  </small>
                </div>
              </div>
              <div>
                <h3>
                  {tr(
                    "Interest: a separate monthly calculation",
                    "Камата: посебна месечна пресметка",
                  )}
                </h3>
                <p>
                  {tr(
                    "Interest income and negative interest charges are each converted on their event dates, then summed within the month. Only positive monthly net interest is added to the taxable base. A negative net-interest month contributes zero and does not offset stocks, options, or dividends.",
                    "Приходот од камата и негативните трошоци за камата се претвораат според датумот на секој настан, а потоа се собираат во месецот. Само позитивната месечна нето камата се додава на даночната основица. Месец со негативна нето камата придонесува со нула и не пребива акции, опции или дивиденди.",
                  )}
                </p>
                <div className="guide-mini-equation">
                  300 MKD − 100 MKD = 200 MKD
                  <small>
                    {tr(
                      "Monthly taxable interest 200 MKD → estimated interest tax 20 MKD. If charges exceed income, this month’s interest tax is zero.",
                      "Месечна оданочлива камата 200 MKD → проценет данок на камата 20 MKD. Ако трошоците се поголеми од приходот, данокот на камата за тој месец е нула.",
                    )}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </details>
        <details>
          <summary>
            <span className="guide-chapter-number">05</span>
            {tr(
              "How do the monthly amounts become the final total?",
              "Како месечните износи го даваат конечниот вкупен износ?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <p className="guide-formula">
              {tr(
                "Monthly taxable base = sum of positive symbol-group results + positive monthly net interest",
                "Месечна даночна основица = збир на позитивните резултати по симбол + позитивна месечна нето камата",
              )}
            </p>
            <p>
              {tr(
                "Each month’s tax is 10% of that month’s taxable base. The app sums the unrounded monthly tax amounts and rounds the final total upward to the next whole MKD, matching the unchanged Excel Summary sheet. The two decimals displayed in tables are for readability; they are not rounded before calculating the final total.",
                "Данокот за секој месец е 10% од неговата даночна основица. Апликацијата ги собира незаокружените месечни износи на данок и го заокружува конечниот збир нагоре до следен цел MKD, како во непроменетиот Excel лист „Резиме“. Двете децимали во табелите служат за читливост; износите не се заокружуваат пред пресметката на конечниот збир.",
              )}
            </p>
            <div className="guide-mini-equation">
              {number(420.24)} + {number(79.87)} = {number(500.11)} MKD →{" "}
              {number(501, true)} MKD
              <small>
                {tr(
                  "Synthetic rounding example. An already-whole total stays unchanged: 240.00 MKD → 240 MKD.",
                  "Синтетички пример за заокружување. Збир што веќе е цел број останува непроменет: 240,00 MKD → 240 MKD.",
                )}
              </small>
            </div>
            {report && unroundedTax !== undefined && (
              <div className="guide-actual-total">
                <span>{tr("Your report", "Вашиот извештај")}</span>
                <p>
                  {tr("Sum of monthly tax", "Збир на месечниот данок")}:{" "}
                  <strong>{number(unroundedTax)} MKD</strong> →{" "}
                  {tr(
                    "Final estimate, rounded up",
                    "Конечна проценка, заокружена нагоре",
                  )}
                  :{" "}
                  <strong>
                    {number(report.result.estimatedTaxMkd, true)} MKD
                  </strong>
                </p>
              </div>
            )}
            <div className="guide-sample-breakdown">
              <h3>
                {tr(
                  "Read the free sample: why its estimate is 240 MKD",
                  "Прочитајте го бесплатниот пример: зошто проценката е 240 MKD",
                )}
              </h3>
              <p>
                {tr(
                  "January: 1,500 MKD trading gain + 300 MKD net interest = 1,800 MKD taxable base → 180 MKD tax. February: a −2,400 MKD loss in one symbol contributes zero; a different symbol’s 600 MKD gross dividend remains taxable. Net interest of −120 MKD contributes zero → 60 MKD tax. Final total: 180 + 60 = 240 MKD.",
                  "Јануари: 1.500 MKD добивка од тргување + 300 MKD нето камата = 1.800 MKD даночна основица → 180 MKD данок. Февруари: загуба од −2.400 MKD кај еден симбол придонесува со нула; бруто дивидендата од 600 MKD кај друг симбол останува оданочлива. Нето каматата од −120 MKD придонесува со нула → 60 MKD данок. Конечен збир: 180 + 60 = 240 MKD.",
                )}
              </p>
              <small>
                {tr(
                  "Synthetic transactions and illustrative rates. This sample demonstrates the report, and cannot be used for filing.",
                  "Синтетички трансакции и илустративни курсеви. Примерот го прикажува извештајот и не се користи за пријавување.",
                )}
              </small>
            </div>
          </div>
        </details>
        <details>
          <summary>
            <span className="guide-chapter-number">06</span>
            {tr(
              "What do I download, and how do I use it for UJP?",
              "Што преземам и како го користам за УЈП?",
            )}
          </summary>
          <div className="guide-chapter-body">
            <div className="guide-two-columns">
              <div>
                <h3>
                  {tr(
                    "Excel: the full calculation record",
                    "Excel: целосна евиденција на пресметката",
                  )}
                </h3>
                <dl className="guide-workbook-sheets">
                  <dt>{tr("Activity Statement", "Извод од IBKR")}</dt>
                  <dd>
                    {tr(
                      "Your original CSV rows, retained for reconciliation.",
                      "Изворните CSV редови, зачувани за усогласување.",
                    )}
                  </dd>
                  <dt>{tr("Conversion Rates", "Девизни курсеви")}</dt>
                  <dd>
                    {tr(
                      "The USD/MKD rates used by the workbook.",
                      "USD/MKD курсевите што ги користи Excel.",
                    )}
                  </dd>
                  <dt>{tr("Calculation", "Пресметка")}</dt>
                  <dd>
                    {tr(
                      "Transaction-level references, amounts, and conversion formulas.",
                      "Референци, износи и формули за претворање по трансакција.",
                    )}
                  </dd>
                  <dt>{tr("Summary", "Резиме")}</dt>
                  <dd>
                    {tr(
                      "Monthly results, taxable bases, tax, and the rounded final total.",
                      "Месечни резултати, даночни основици, данок и заокружен конечен збир.",
                    )}
                  </dd>
                </dl>
              </div>
              <div>
                <h3>
                  {tr(
                    "PDF: a readable filing summary",
                    "PDF: читливо резиме за пријавување",
                  )}
                </h3>
                <p>
                  {tr(
                    "Print / Save PDF includes the report summary, monthly table, review warnings, and filing checklist. The detailed ledgers and formulas remain in Excel. Keep both files together with your original IBKR statement and relevant supporting records.",
                    "„Печати / Зачувај PDF“ го вклучува резимето, месечната табела, предупредувањата и листата за проверка пред пријавување. Деталните дневници и формулите остануваат во Excel. Чувајте ги двата документа со оригиналниот IBKR извод и соодветните докази.",
                  )}
                </p>
                <p className="guide-callout">
                  {tr(
                    "The report helps you prepare your filing. It is not an official UJP form and the app does not submit a tax return for you.",
                    "Извештајот помага во подготовка на пријавата. Тој не е официјален образец на УЈП и апликацијата не поднесува даночна пријава во ваше име.",
                  )}
                </p>
              </div>
            </div>
            <ol className="guide-filing-steps">
              <li>
                <strong>
                  {tr("Reconcile the statement", "Усогласете го изводот")}
                </strong>
                <span>
                  {tr(
                    "Check sales, broker cost basis, dividends, withholding, and interest against the full IBKR statement.",
                    "Проверете ги продажбите, набавната основица на брокерот, дивидендите, задржаниот данок и каматата со целиот IBKR извод.",
                  )}
                </span>
              </li>
              <li>
                <strong>
                  {tr(
                    "Review the tax treatment",
                    "Проверете го даночниот третман",
                  )}
                </strong>
                <span>
                  {tr(
                    "Check exclusions and any other income. Confirm the relevant filing procedure and foreign withholding treatment with UJP or your adviser.",
                    "Проверете ги исклучувањата и другите приходи. Потврдете ги соодветната постапка за пријавување и третманот на странскиот задржан данок со УЈП или советник.",
                  )}
                </span>
              </li>
              <li>
                <strong>
                  {tr(
                    "Prepare and submit your filing",
                    "Подгответе ја и поднесете ја пријавата",
                  )}
                </strong>
                <span>
                  {tr(
                    "Use the monthly workpaper as supporting calculation evidence. You are responsible for entering the correct figures, meeting deadlines, and submitting the return.",
                    "Користете ја месечната пресметка како доказ за износите. Вие сте одговорни за внесување точни податоци, почитување на роковите и поднесување на пријавата.",
                  )}
                </span>
              </li>
            </ol>
          </div>
        </details>
      </div>
    </div>
  );
}
