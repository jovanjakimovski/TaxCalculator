import XLSX from "xlsx-js-style";
import {
  stockHoldingDetails,
  stockPurchaseDateColumn,
  stockPurchaseDateFromRow,
} from "./stockHolding.mjs";
import { stockPurchaseHistory } from "./stockPurchaseHistory.mjs";
import { statementTrades } from "./statementTrades.mjs";

const workbookTranslations = {
  en: {
    sheets: {
      activity: "Original Statement",
      rates: "Exchange Rate List",
      transactions: "Realized Transactions",
      calculation: "Calculation",
      summary: "Summary",
    },
    rateHeaders: ["DATE", "USD-MKD RATE"],
    transactionHeaders: [
      "DATE",
      "T-1 DATE",
      "SYMBOL",
      "FINANCIAL INSTRUMENT",
      "QUANTITY",
      "PURCHASE PRICE",
      "SALE PRICE PER SHARE",
      "SALE PRICE",
      "REALIZED P/L",
      "CURRENCY",
      "EXCHANGE RATE",
      "REALIZED P/L (MKD)",
      "DAYS HELD",
    ],
    calculationHeaders: [
      "MONTH",
      "SYMBOL",
      "REALIZED PROFIT (MKD)\n((STOCK+OPTIONS+DIVIDEND)+interest)",
    ],
    assets: {
      stocks: "Stocks",
      options: "Equity and Index Options",
      dividends: "Dividends",
      interest: "Interest",
    },
    interestSymbol: "Interest",
    holdingNote:
      "Holding days use the statement's purchase dates. A range covers multiple acquisition dates. Blank holding days indicate missing lot dates; those sales remain in the calculation. With IBKR Closed Lot details, each sold lot is checked separately and results from stocks held for more than two calendar years are excluded.",
    summaryTitle: "SUMMARY",
    summaryTotal: "TOTAL",
    summaryHeaders: ["Month", "Total", "Tax"],
  },
  mk: {
    sheets: {
      activity: "Оригинален Извештај",
      rates: "Курсна Листа",
      transactions: "Реализирани трансакции",
      calculation: "Пресметка",
      summary: "Резиме",
    },
    rateHeaders: ["ДАТУМ", "КУРС USD-MKD"],
    transactionHeaders: [
      "ДАТУМ",
      "ДАТУМ НА КУРСОТ (Т-1)",
      "СИМБОЛ",
      "ФИНАНСИСКИ ИНСТРУМЕНТ",
      "КОЛИЧИНА",
      "КУПОВНА ЦЕНА",
      "ПРОДАЖНА ЦЕНА ПО АКЦИЈА",
      "ПРОДАЖНА ЦЕНА",
      "РЕАЛИЗИРАНА ДОБИВКА ИЛИ ЗАГУБА",
      "ВАЛУТА",
      "ДЕВИЗЕН КУРС",
      "РЕАЛИЗИРАНА ДОБИВКА ИЛИ ЗАГУБА (МКД)",
      "ДЕНОВИ НА ПОСЕДУВАЊЕ",
    ],
    calculationHeaders: [
      "МЕСЕЦ",
      "СИМБОЛ",
      "РЕАЛИЗИРАНА ДОБИВКА (МКД)\n(АКЦИИ+ОПЦИИ+ДИВИДЕНДИ) + ИНТЕРЕСТ",
    ],
    assets: {
      stocks: "Акции",
      options: "Опции",
      dividends: "Дивиденди",
      interest: "Интерест",
    },
    interestSymbol: "Интерест",
    holdingNote:
      "Деновите на поседување се пресметуваат автоматски од извештајот. Опсегот означува повеќе можни датуми на купување. Празно поле значи дека недостигаат датуми по лот; продажбата останува во пресметката. Се исклучуваат само акции држени подолго од две календарски години. За стари куповни датуми во истиот извештај, користи IBKR Closed Lot детали.",
    summaryTitle: "РЕЗИМЕ",
    summaryTotal: "ВКУПНО",
    summaryHeaders: ["Месец", "Вкупно", "Данок"],
  },
};

function writeWorkbookWithCalculationHeader(workbook, sheetName, header) {
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  // The writer drops rich-text runs, so preserve both font styles in the XLSX XML.
  const archive = XLSX.CFB.read(new Uint8Array(output), { type: "array" });
  const sheetNumber = workbook.SheetNames.indexOf(sheetName) + 1;
  const sheetPath = `/xl/worksheets/sheet${sheetNumber}.xml`;
  const sheet = XLSX.CFB.find(archive, sheetPath);
  const xml = new TextDecoder().decode(Uint8Array.from(sheet.content));
  const escapeXml = (text) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const [title, formulaText] = header.split("\n");
  const richText =
    `<is><r><rPr><b/><sz val="11"/><color rgb="FFFFFFFF"/><rFont val="Calibri"/></rPr><t>${escapeXml(title)}</t></r>` +
    `<r><rPr><b val="0"/><i/><sz val="9"/><color rgb="FFD9E2F3"/><rFont val="Calibri"/></rPr><t xml:space="preserve">\n${escapeXml(formulaText)}</t></r></is>`;
  const styledXml = xml.replace(
    /<c\b([^>]*\br="C1"[^>]*)>[\s\S]*?<\/c>/,
    (_, attributes) =>
      `<c${attributes.replace(/\s+t="[^"]*"/, "")} t="inlineStr">${richText}</c>`,
  );
  if (styledXml === xml) throw new Error("Calculation header cell is missing");
  sheet.content = new TextEncoder().encode(styledXml);
  sheet.size = sheet.content.length;
  const bytes = XLSX.CFB.write(archive, {
    fileType: "zip",
    type: "array",
    compression: true,
  });
  return Uint8Array.from(bytes).buffer;
}

function csvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function parsePeriodDate(value) {
  if (value.includes("-")) return value;
  const match = value.match(/([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (!match) throw new Error(`Invalid statement date: ${value}`);
  const month = new Date(`${match[1]} 1, 2000`).getMonth() + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
}

function statementPeriod(rows) {
  const periodRow = rows.find(
    (row) => row[0] === "Statement" && row[1] === "Data" && row[2] === "Period",
  );
  const periodMatch = String(periodRow?.[3] ?? "").match(
    /(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})\s*-\s*(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})/,
  );
  if (!periodMatch)
    throw new Error("Could not find the statement period in the IBKR CSV.");
  return [parsePeriodDate(periodMatch[1]), parsePeriodDate(periodMatch[2])];
}

function errorMessage(response, prefix) {
  return response
    .text()
    .then((message) => `${prefix}: ${message || response.statusText}`);
}

async function buildTaxWorkbook({
  csvText,
  exchangeRatesApi,
  language = "en",
  exchangeRates,
}) {
  const labels = workbookTranslations[language] ?? workbookTranslations.en;
  const sheetReference = (name) => `'${name.replaceAll("'", "''")}'!`;
  const activitySheetReference = sheetReference(labels.sheets.activity);
  const ratesSheetReference = sheetReference(labels.sheets.rates);
  const transactionSheetReference = sheetReference(labels.sheets.transactions);
  const calculationSheetReference = sheetReference(labels.sheets.calculation);
  const csvRows = csvText
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(csvLine);
  const [periodStart, periodEnd] = statementPeriod(csvRows);
  const trades = statementTrades(csvRows);
  if (!exchangeRatesApi && !exchangeRates)
    throw new Error("An exchange-rate API URL is required.");
  const config = {
    rateOffsetDays: 1,
    securitiesTaxRate: 10,
    dividendTaxRate: 10,
    interestTaxRate: 10,
  };
  let fullRates = exchangeRates;
  if (!fullRates) {
    const ratesUrl = `${exchangeRatesApi}?${new URLSearchParams({
      startDate: periodStart,
      endDate: periodEnd,
      rateOffsetDays: String(config.rateOffsetDays),
    })}`;
    const ratesResponse = await fetch(ratesUrl);
    if (!ratesResponse.ok)
      throw new Error(
        await errorMessage(
          ratesResponse,
          "Exchange-rate API returned an error",
        ),
      );
    fullRates = await ratesResponse.json();
  }

  const originalRows = csvRows;
  const purchaseHistory = stockPurchaseHistory(csvRows);
  const dateText = (value) => {
    const text = String(value ?? "").trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match
      ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
      : text.slice(0, 10);
  };
  const numericCell = (value) => {
    if (value == null || String(value).trim() === "") return 0;
    const parsed = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formula = (f, v, t = "n") => ({ f, v, t });
  const sourceDateFormula = (source) => {
    const ref = `TRIM(${activitySheetReference}${XLSX.utils.encode_col(source.column)}${source.sheetRow})`;
    // Closed lots in older IBKR exports use US M/D/YYYY regardless of the
    // workbook language. Construct DATE explicitly to avoid locale ambiguity.
    return source.dateFormat === "mdy"
      ? `DATE(RIGHT(${ref},4),LEFT(${ref},FIND("/",${ref})-1),MID(${ref},FIND("/",${ref})+1,LEN(${ref})-FIND("/",${ref})-5))`
      : `DATEVALUE(LEFT(${ref},10))`;
  };
  const incomeDateFormula = (sheetRow, value) => {
    const ref = `${activitySheetReference}D${sheetRow}`;
    return String(value ?? "").includes("/")
      ? `=TEXT(${sourceDateFormula({ sheetRow, column: 3, dateFormat: "mdy" })},"yyyy-mm-dd")`
      : `=LEFT(${ref},10)`;
  };
  // Excel calculates with 15 significant digits. Avoid a spurious extra MKD
  // when binary arithmetic places an exact tax total just above an integer.
  const excelPrecision = (value) => Number(value.toPrecision(15));
  const rateByDate = new Map(fullRates.map((row) => [row.requestedDate, row]));
  const formulas = {
    rate: (row) =>
      `=IFERROR(VLOOKUP(A${row},${ratesSheetReference}$A:$B,2,FALSE),0)`,
  };
  const originalSheetRow = (index) => index + 1;
  const sourceRows = csvRows.map((row, index) => ({
    row,
    sheetRow: originalSheetRow(index),
  }));
  const rateFor = (date) => {
    const rate = rateByDate.get(date);
    if (!rate) throw new Error(`Exchange rate missing for ${date}.`);
    return rate;
  };
  const conversionRows = [
    labels.rateHeaders,
    ...fullRates.map((row) => [row.requestedDate, row.mkdPerUsd]),
  ];
  const securities = [];
  const interests = [];
  const dividendsByKey = new Map();
  const dividendDescription = (description) =>
    String(description ?? "")
      .replace(/ - [A-Z]{2} Tax$/, "")
      .replace(/ \(Ordinary Dividend\)$/, "");
  const dividendSymbol = (description) =>
    String(description ?? "")
      .split("(")[0]
      .trim();

  sourceRows.forEach(({ row: sourceRow, sheetRow }) => {
    const trade = trades.get(sheetRow);
    const row = trade?.row ?? sourceRow;
    if (row[1] !== "Data") return;
    if (
      row[0] === "Trades" &&
      row[2] === "Order" &&
      ["Stocks", "Equity and Index Options"].includes(row[3]) &&
      row[4] === "USD"
    ) {
      const quantity = numericCell(row[7]);
      if (quantity > 0) return;
      const date = dateText(row[6]);
      const usdResult = numericCell(row[13]);
      const rate = rateFor(date);
      const explicitPurchaseDate = stockPurchaseDateFromRow(trade.header, row);
      const normalizedExplicitColumn = stockPurchaseDateColumn(
        trade.header,
        row,
      );
      const explicitColumn =
        normalizedExplicitColumn === null
          ? null
          : normalizedExplicitColumn + trade.columnOffset;
      const lots = trade.lots?.map((lot) => ({
        ...lot,
        holding: stockHoldingDetails("Stocks", lot.purchaseDate, date),
      }));
      const lotDates = lots
        ?.map((lot) => ({
          date: lot.purchaseDate,
          sheetRow: lot.sheetRow,
          column: lot.columns.date,
          dateFormat: lot.dateFormat,
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
      const history =
        row[3] === "Stocks" ? purchaseHistory.get(sheetRow) : undefined;
      // Broker-matched closed lots take precedence over inferred inventory.
      const purchaseDates = lotDates?.length
        ? { earliest: lotDates[0], latest: lotDates[lotDates.length - 1] }
        : explicitPurchaseDate
          ? {
              earliest: {
                date: explicitPurchaseDate,
                sheetRow,
                column: explicitColumn,
              },
              latest: {
                date: explicitPurchaseDate,
                sheetRow,
                column: explicitColumn,
              },
            }
          : history
            ? {
                earliest: { ...history.earliest, column: 6 },
                latest: { ...history.latest, column: 6 },
              }
            : null;
      const latestHolding = stockHoldingDetails(
        row[3],
        purchaseDates?.latest.date,
        date,
      );
      const earliestHolding = stockHoldingDetails(
        row[3],
        purchaseDates?.earliest.date,
        date,
      );
      const mixedDates =
        purchaseDates &&
        purchaseDates.earliest.date !== purchaseDates.latest.date;
      const holding = mixedDates
        ? {
            purchaseDate: null,
            daysHeld: null,
            exempt: latestHolding.exempt,
            purchaseDateRange: {
              earliest: purchaseDates.earliest.date,
              latest: purchaseDates.latest.date,
            },
            daysHeldRange: {
              min: latestHolding.daysHeld,
              max: earliestHolding.daysHeld,
            },
          }
        : latestHolding;
      securities.push({
        row,
        sheetRow,
        date,
        usdResult,
        rate,
        mkdResult: usdResult * rate.mkdPerUsd,
        holding,
        purchaseDates,
        columns: trade.columns,
        lots,
        taxableMkdResult: holding.exempt
          ? 0
          : (usdResult -
              (lots?.reduce(
                (sum, lot) => sum + (lot.holding.exempt ? lot.usdResult : 0),
                0,
              ) ?? 0)) *
            rate.mkdPerUsd,
      });
      return;
    }
    if (row[0] === "Interest" && row[2] === "USD") {
      const date = dateText(row[3]);
      const usdAmount = numericCell(row[5]);
      const rate = rateFor(date);
      interests.push({
        row,
        sheetRow,
        date,
        usdAmount,
        rate,
        mkdAmount: usdAmount * rate.mkdPerUsd,
      });
      return;
    }
    if (
      (row[0] === "Dividends" || row[0] === "Withholding Tax") &&
      row[2] === "USD"
    ) {
      const date = dateText(row[3]);
      const description = String(row[4] ?? "");
      const key = `${date}|${dividendSymbol(description)}|${dividendDescription(description)}`;
      let entry = dividendsByKey.get(key);
      if (!entry) {
        const rate = rateFor(date);
        entry = {
          date,
          symbol: dividendSymbol(description),
          description: dividendDescription(description),
          rate,
          gross: [],
          withholding: [],
        };
        dividendsByKey.set(key, entry);
      }
      entry[row[0] === "Dividends" ? "gross" : "withholding"].push({
        sheetRow,
        amount: numericCell(row[5]),
      });
    }
  });

  const transactionRows = [labels.transactionHeaders];
  securities.forEach((item) => {
    const row = transactionRows.length + 1;
    const ref = item.sheetRow;
    const column = (index) =>
      `${activitySheetReference}${XLSX.utils.encode_col(index)}${ref}`;
    transactionRows.push([
      formula(`=LEFT(${column(item.columns.date)},10)`, item.date, "str"),
      item.rate.effectiveDate,
      formula(`=${column(item.columns.symbol)}`, item.row[5], "str"),
      item.row[3] === "Equity and Index Options"
        ? labels.assets.options
        : labels.assets.stocks,
      formula(
        `=ABS(VALUE(${column(item.columns.quantity)}))`,
        Math.abs(numericCell(item.row[7])),
      ),
      formula(
        `=ABS(VALUE(${column(item.columns.basis)}))`,
        Math.abs(numericCell(item.row[12])),
      ),
      item.row[3] === "Equity and Index Options"
        ? ""
        : formula(
            `=VALUE(${column(item.columns.tradePrice)})`,
            numericCell(item.row[8]),
          ),
      formula(
        `=VALUE(${column(item.columns.proceeds)})`,
        numericCell(item.row[10]),
      ),
      formula(`=VALUE(${column(item.columns.realizedPnl)})`, item.usdResult),
      formula(`=${column(item.columns.currency)}`, item.row[4], "str"),
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=I${row}*K${row}`, item.mkdResult),
      "",
    ]);
  });
  interests.forEach((item) => {
    const row = transactionRows.length + 1;
    const ref = item.sheetRow;
    const column = (letter) => `${activitySheetReference}${letter}${ref}`;
    transactionRows.push([
      formula(incomeDateFormula(ref, item.row[3]), item.date, "str"),
      item.rate.effectiveDate,
      "",
      labels.assets.interest,
      "",
      "",
      "",
      "",
      formula(`=VALUE(${column("F")})`, item.usdAmount),
      "USD",
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=I${row}*K${row}`, item.mkdAmount),
    ]);
  });

  const formulaSum = (entries, absolute = false) => {
    if (entries.length === 0) return formula("=0", 0);
    const refs = entries.map(
      ({ sheetRow }) =>
        `${absolute ? "ABS(" : ""}VALUE(${activitySheetReference}F${sheetRow})${absolute ? ")" : ""}`,
    );
    return formula(
      `=SUM(${refs.join(",")})`,
      entries.reduce(
        (sum, entry) =>
          sum + (absolute ? Math.abs(entry.amount) : entry.amount),
        0,
      ),
    );
  };
  for (const item of dividendsByKey.values()) {
    if (item.gross.length === 0) continue;
    const row = transactionRows.length + 1;
    const sourceRow = item.gross[0].sheetRow;
    const gross = item.gross.reduce((sum, entry) => sum + entry.amount, 0);
    const grossMkd = gross * item.rate.mkdPerUsd;
    transactionRows.push([
      formula(
        incomeDateFormula(sourceRow, csvRows[sourceRow - 1][3]),
        item.date,
        "str",
      ),
      item.rate.effectiveDate,
      item.symbol,
      labels.assets.dividends,
      "",
      "",
      "",
      "",
      formulaSum(item.gross),
      "USD",
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=I${row}*K${row}`, grossMkd),
    ]);
  }

  transactionRows.splice(
    1,
    transactionRows.length - 1,
    ...transactionRows
      .slice(1)
      .sort((left, right) =>
        String(left[0].v).localeCompare(String(right[0].v)),
      ),
  );
  const securitiesByDateFormula = new Map(
    securities.map((item) => [
      `=LEFT(${activitySheetReference}G${item.sheetRow},10)`,
      item,
    ]),
  );
  const taxableAmountByTransaction = new Map();
  transactionRows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2;
    row[10] = formula(formulas.rate(sheetRow), row[10].v);
    row[11] = formula(`=I${sheetRow}*K${sheetRow}`, row[11].v);
    const security = securitiesByDateFormula.get(row[0].f);
    const isStock = row[3] === labels.assets.stocks;
    row[12] = "";
    if (isStock && security.purchaseDates) {
      const holding = security.holding;
      const latestDate = sourceDateFormula(security.purchaseDates.latest);
      const earliestDate = sourceDateFormula(security.purchaseDates.earliest);
      row[12] = formula(
        holding.daysHeldRange
          ? `=(DATEVALUE(A${sheetRow})-${latestDate})&" – "&(DATEVALUE(A${sheetRow})-${earliestDate})`
          : `=DATEVALUE(A${sheetRow})-${latestDate}`,
        holding.daysHeldRange
          ? `${holding.daysHeldRange.min} – ${holding.daysHeldRange.max}`
          : (holding.daysHeld ?? ""),
        holding.daysHeld === null ? "str" : "n",
      );
    }
    taxableAmountByTransaction.set(
      row,
      isStock ? security.taxableMkdResult : row[11].v,
    );
  });

  const summaryMonths = [];
  for (let month = periodStart.slice(0, 7); month <= periodEnd.slice(0, 7);) {
    summaryMonths.push(month);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber, 1));
    month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const transactionEndRow = transactionRows.length;
  const transactionFormulaEndRow = Math.max(transactionEndRow, 2);
  const transactionDates = `${transactionSheetReference}$A$2:$A$${transactionFormulaEndRow}`;
  const transactionSymbols = `${transactionSheetReference}$C$2:$C$${transactionFormulaEndRow}`;
  const transactionAssets = `${transactionSheetReference}$D$2:$D$${transactionFormulaEndRow}`;
  const transactionMkd = `${transactionSheetReference}$L$2:$L$${transactionFormulaEndRow}`;
  const cellValue = (cell) =>
    cell && typeof cell === "object" ? cell.v : cell;
  const transactionSheetRows = new Map(
    transactionRows.map((row, index) => [row, index + 1]),
  );
  const calculationRows = [labels.calculationHeaders];
  const calculationHelpers = [];
  const boundedSum = (terms, limit = 6000) => {
    const expression = `SUM(${terms.map((term) => term.f).join(",")})`;
    const value = terms.reduce((sum, term) => sum + term.v, 0);
    if (expression.length <= limit && terms.length <= 200)
      return { f: expression, v: value };
    const chunks = [];
    let chunk = [];
    let length = 5;
    for (const term of terms) {
      if (term.f.length + 5 > limit)
        throw new Error(
          "This portfolio exceeds the current Excel formula limit. Export a shorter statement period.",
        );
      if (length + term.f.length + 1 > limit || chunk.length >= 200) {
        chunks.push(chunk);
        chunk = [];
        length = 5;
      }
      chunk.push(term);
      length += term.f.length + 1;
    }
    if (chunk.length) chunks.push(chunk);
    return boundedSum(
      chunks.map((entries) => {
        const helper = boundedSum(entries, limit);
        const index = calculationHelpers.push(helper) - 1;
        return { f: `__LOT_HELPER_${index}__`, v: helper.v };
      }),
      limit,
    );
  };
  const monthlySummary = summaryMonths.map((month) => {
    const monthTransactionRows = transactionRows
      .slice(1)
      .filter((item) => String(item[0].v).slice(0, 7) === month);
    const stocksRows = monthTransactionRows.filter(
      (item) => cellValue(item[3]) === labels.assets.stocks,
    );
    const optionsRows = monthTransactionRows.filter(
      (item) => cellValue(item[3]) === labels.assets.options,
    );
    const dividendsRows = monthTransactionRows.filter(
      (item) => cellValue(item[3]) === labels.assets.dividends,
    );
    const interestRows = monthTransactionRows.filter(
      (item) => cellValue(item[3]) === labels.assets.interest,
    );
    const stocksPnl = stocksRows.reduce((sum, item) => sum + item[11].v, 0);
    const optionsPnl = optionsRows.reduce((sum, item) => sum + item[11].v, 0);
    const dividendsPnl = dividendsRows.reduce(
      (sum, item) => sum + item[11].v,
      0,
    );
    const interestPnl = interestRows.reduce((sum, item) => sum + item[11].v, 0);
    const securitiesBySymbol = new Map();
    [...stocksRows, ...optionsRows, ...dividendsRows].forEach((item) => {
      const sourceSymbol = String(cellValue(item[2]) ?? "");
      const assetClass = cellValue(item[3]);
      const readableOption =
        assetClass === labels.assets.options
          ? sourceSymbol.match(
              /^(.+?)\s+\d{1,2}[A-Z]{3}\d{2,4}\s+[\d.]+\s+[CP]$/i,
            )
          : null;
      const compactOption =
        assetClass === labels.assets.options
          ? sourceSymbol.match(/^(.+?)\s+\d{6}[CP]\d{8}$/i)
          : null;
      const optionMatch = readableOption ?? compactOption;
      const symbol = optionMatch ? optionMatch[1].trim() : sourceSymbol;
      let group = securitiesBySymbol.get(symbol);
      if (!group) {
        group = {
          amount: 0,
          sourceSymbols: new Set(),
          sourceRows: [],
          holdingRows: [],
        };
        securitiesBySymbol.set(symbol, group);
      }
      group.amount += taxableAmountByTransaction.get(item);
      group.sourceSymbols.add(sourceSymbol);
      group.sourceRows.push(transactionSheetRows.get(item));
      if (assetClass === labels.assets.stocks && item[12]?.f)
        group.holdingRows.push({
          sheetRow: transactionSheetRows.get(item),
          security: securitiesByDateFormula.get(item[0].f),
        });
    });
    // Net each underlying symbol within its month once. Summary reuses these cells.
    for (const [symbol, group] of [...securitiesBySymbol.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const row = calculationRows.length + 1;
      // Array criteria avoid repeating the full range for every option contract.
      // Escape Excel criteria wildcards so broker symbols are matched literally.
      const symbolCriteria = [...group.sourceSymbols]
        .map(
          (sourceSymbol) =>
            `"${sourceSymbol.replaceAll("~", "~~").replaceAll("*", "~*").replaceAll("?", "~?").replaceAll('"', '""')}"`,
        )
        .join(",");
      const excludedStocks = group.holdingRows.map(
        ({ sheetRow: sourceRow, security }) => {
          const source = (column) =>
            `${transactionSheetReference}${column}${sourceRow}`;
          const days = source("M");
          const minimumDays = `IF(ISNUMBER(${days}),${days},VALUE(LEFT(${days},FIND(" – ",${days})-1)))`;
          if (security.lots) {
            const checks = security.lots.map(
              (lot) =>
                `DATEVALUE(${source("A")})>EDATE(${sourceDateFormula({
                  column: lot.columns.date,
                  sheetRow: lot.sheetRow,
                  dateFormat: lot.dateFormat,
                })},24)`,
            );
            const excludedLotResults = security.lots.map((lot, index) => ({
              f: `IF(${checks[index]},VALUE(${activitySheetReference}${XLSX.utils.encode_col(lot.columns.realizedPnl)}${lot.sheetRow}),0)`,
              v: lot.holding.exempt ? lot.usdResult : 0,
            }));
            // Exclude each broker-matched lot separately. Removing the complete
            // parent result when every lot qualifies also preserves its rounding.
            return {
              f: `IF(AND(LEFT(${source("A")},7)=A${row},${source("C")}=B${row}),IF(DATEVALUE(${source("A")})>EDATE(DATEVALUE(${source("A")})-${minimumDays},24),${source("L")},${boundedSum(excludedLotResults, 4000).f}*${source("K")}),0)`,
              v: security.mkdResult - security.taxableMkdResult,
            };
          }
          return {
            f: `IF(AND(LEFT(${source("A")},7)=A${row},${source("C")}=B${row},${source("D")}="${labels.assets.stocks}",${days}<>""),IF(${minimumDays}<0,NA(),IF(DATEVALUE(${source("A")})>EDATE(DATEVALUE(${source("A")})-${minimumDays},24),${source("L")},0)),0)`,
            v: security.mkdResult - security.taxableMkdResult,
          };
        },
      );
      const holdingAdjustment = excludedStocks.length
        ? `-${boundedSum(excludedStocks).f}`
        : "";
      let groupFormula = `=MAX(0,SUM(SUMIFS(${transactionMkd},${transactionDates},A${row}&"-*",${transactionSymbols},{${symbolCriteria}},${transactionAssets},"<>${labels.assets.interest}"))${holdingAdjustment})`;
      if (groupFormula.length > 8192) {
        // Large option groups can exceed Excel's formula limit even with array
        // criteria. Use their known transaction rows, compressing adjacent rows.
        const spans = [];
        for (const sourceRow of group.sourceRows.sort(
          (left, right) => left - right,
        )) {
          const previous = spans[spans.length - 1];
          if (previous && sourceRow === previous[1] + 1)
            previous[1] = sourceRow;
          else spans.push([sourceRow, sourceRow]);
        }
        const sums = spans.map(
          ([start, end]) =>
            `SUMIF(${transactionSheetReference}$A$${start}:$A$${end},A${row}&"-*",${transactionSheetReference}$L$${start}:$L$${end})`,
        );
        groupFormula = `=MAX(0,SUM(${sums.join(",")})${holdingAdjustment})`;
      }
      calculationRows.push([
        month,
        symbol,
        formula(groupFormula, Math.max(group.amount, 0)),
      ]);
    }
    if (interestRows.length > 0) {
      const interestRow = calculationRows.length + 1;
      calculationRows.push([
        month,
        labels.interestSymbol,
        formula(
          `=MAX(0,SUMPRODUCT((LEFT(${transactionDates},7)=A${interestRow})*(${transactionAssets}="${labels.assets.interest}")*${transactionMkd}))`,
          Math.max(interestPnl, 0),
        ),
      ]);
    }
    const securitiesTaxablePnl = [...securitiesBySymbol.values()].reduce(
      (sum, group) => sum + Math.max(group.amount, 0),
      0,
    );
    const taxablePnl = securitiesTaxablePnl + Math.max(interestPnl, 0);
    const tax = excelPrecision(taxablePnl * (config.securitiesTaxRate / 100));
    return {
      month,
      stocksMkd: stocksPnl,
      optionsMkd: optionsPnl,
      dividendsMkd: dividendsPnl,
      interestMkd: interestPnl,
      taxablePnlMkd: taxablePnl,
      taxMkd: tax,
    };
  });
  const calculationEndRow = calculationRows.length;
  const helperStartRow = calculationEndRow + 2;
  const resolveHelperReferences = (expression) =>
    expression.replace(
      /__LOT_HELPER_(\d+)__/g,
      (_, index) => `$C$${helperStartRow + Number(index)}`,
    );
  for (const row of calculationRows) {
    if (row[2]?.f) row[2].f = resolveHelperReferences(row[2].f);
  }
  const calculationFormulaEndRow = Math.max(calculationEndRow, 2);
  const monthlySummaryRows = monthlySummary.map((month, index) => {
    const row = index + 3;
    return [
      month.month,
      formula(
        `=SUMIF(${calculationSheetReference}$A$2:$A$${calculationFormulaEndRow},A${row},${calculationSheetReference}$C$2:$C$${calculationFormulaEndRow})`,
        month.taxablePnlMkd,
      ),
      formula(`=B${row}*${config.securitiesTaxRate / 100}`, month.taxMkd),
    ];
  });
  const totalRow = monthlySummaryRows.length + 3;
  const summaryTotal = (columnIndex) =>
    monthlySummaryRows.reduce((sum, row) => sum + row[columnIndex].v, 0);
  const totalTax = Math.ceil(excelPrecision(summaryTotal(2)));
  const totalTaxCell = formula(
    `=ROUNDUP(SUM(C3:C${totalRow - 1}),0)`,
    totalTax,
  );
  totalTaxCell.z = "#,##0";
  const summaryRows = [
    [labels.summaryTitle, "", ""],
    labels.summaryHeaders,
    ...monthlySummaryRows,
    [labels.summaryTotal, "", totalTaxCell],
  ];

  const tradeRows = securities
    .map((item) => ({
      assetCategory: item.row[3],
      symbol: String(item.row[5] ?? ""),
      date: item.date,
      rateDate: item.rate.effectiveDate,
      usdResult: item.usdResult,
      mkdRate: item.rate.mkdPerUsd,
      mkdResult: item.mkdResult,
      purchaseDate: item.holding.purchaseDate,
      daysHeld: item.holding.daysHeld,
      holdingExempt: item.holding.exempt,
      ...(item.holding.purchaseDateRange && {
        purchaseDateRange: item.holding.purchaseDateRange,
        daysHeldRange: item.holding.daysHeldRange,
      }),
      taxableMkdResult: item.taxableMkdResult,
      ...(item.lots && {
        lots: item.lots.map((lot) => ({
          purchaseDate: lot.purchaseDate,
          quantity: lot.quantity,
          usdResult: lot.usdResult,
          daysHeld: lot.holding.daysHeld,
          holdingExempt: lot.holding.exempt,
        })),
      }),
    }))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.symbol.localeCompare(right.symbol),
    );
  const dividendRows = [...dividendsByKey.values()]
    .filter((item) => item.gross.length > 0)
    .map((item) => {
      const grossUsd = item.gross.reduce((sum, entry) => sum + entry.amount, 0);
      const withholdingUsd = item.withholding.reduce(
        (sum, entry) => sum - entry.amount,
        0,
      );
      const grossMkd = grossUsd * item.rate.mkdPerUsd;
      const withholdingMkd = withholdingUsd * item.rate.mkdPerUsd;
      return {
        date: item.date,
        rateDate: item.rate.effectiveDate,
        symbol: item.symbol,
        description: item.description,
        grossUsd,
        withholdingUsd,
        netUsd: grossUsd - withholdingUsd,
        mkdRate: item.rate.mkdPerUsd,
        grossMkd,
        withholdingMkd,
        netMkd: grossMkd - withholdingMkd,
      };
    });
  const interestRows = interests.map((item) => ({
    date: item.date,
    rateDate: item.rate.effectiveDate,
    usdAmount: item.usdAmount,
    mkdRate: item.rate.mkdPerUsd,
    mkdAmount: item.mkdAmount,
  }));
  const calculationResult = {
    transactionCount: tradeRows.length,
    realizedUsd: tradeRows.reduce((sum, item) => sum + item.usdResult, 0),
    realizedMkd: tradeRows.reduce((sum, item) => sum + item.mkdResult, 0),
    taxableIncomeMkd: summaryTotal(1),
    estimatedTaxMkd: totalTax,
    monthlySummary,
    rows: tradeRows,
    dividends: dividendRows,
    dividendGrossUsd: dividendRows.reduce(
      (sum, item) => sum + item.grossUsd,
      0,
    ),
    dividendWithholdingUsd: dividendRows.reduce(
      (sum, item) => sum + item.withholdingUsd,
      0,
    ),
    dividendNetUsd: dividendRows.reduce((sum, item) => sum + item.netUsd, 0),
    dividendGrossMkd: dividendRows.reduce(
      (sum, item) => sum + item.grossMkd,
      0,
    ),
    dividendWithholdingMkd: dividendRows.reduce(
      (sum, item) => sum + item.withholdingMkd,
      0,
    ),
    dividendNetMkd: dividendRows.reduce((sum, item) => sum + item.netMkd, 0),
    interest: interestRows,
    interestPaidUsd: interestRows.reduce(
      (sum, item) => sum + item.usdAmount,
      0,
    ),
    interestPaidMkd: interestRows.reduce(
      (sum, item) => sum + item.mkdAmount,
      0,
    ),
    interestIncomeUsd: interestRows
      .filter((item) => item.usdAmount > 0)
      .reduce((sum, item) => sum + item.usdAmount, 0),
    interestIncomeMkd: interestRows
      .filter((item) => item.mkdAmount > 0)
      .reduce((sum, item) => sum + item.mkdAmount, 0),
    interestChargesUsd: interestRows
      .filter((item) => item.usdAmount < 0)
      .reduce((sum, item) => sum + item.usdAmount, 0),
    interestChargesMkd: interestRows
      .filter((item) => item.mkdAmount < 0)
      .reduce((sum, item) => sum + item.mkdAmount, 0),
  };

  const workbook = XLSX.utils.book_new();
  const original = XLSX.utils.aoa_to_sheet(originalRows);
  const rates = XLSX.utils.aoa_to_sheet(conversionRows);
  const transactions = XLSX.utils.aoa_to_sheet(transactionRows);
  const calculation = XLSX.utils.aoa_to_sheet(calculationRows);
  if (calculationHelpers.length) {
    XLSX.utils.sheet_add_aoa(
      calculation,
      calculationHelpers.map((helper) => [
        "",
        "",
        formula(`=${resolveHelperReferences(helper.f)}`, helper.v),
      ]),
      { origin: `A${helperStartRow}` },
    );
  }
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1F4E78" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const wrappedHeaderStyle = {
    ...headerStyle,
    alignment: { ...headerStyle.alignment, wrapText: true },
  };
  const summaryTotalStyle = {
    font: { bold: true, color: { rgb: "123E43" }, sz: 12 },
    fill: { fgColor: { rgb: "DCEFE6" } },
    alignment: { vertical: "center" },
    border: { top: { style: "medium", color: { rgb: "286258" } } },
  };
  const summaryTitleStyle = {
    ...wrappedHeaderStyle,
    border: { bottom: { style: "medium", color: { rgb: "286258" } } },
  };
  const styleHeader = (sheet, row, lastColumn, style = headerStyle) => {
    for (let column = 0; column <= lastColumn; column++) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column });
      if (sheet[cell]) sheet[cell].s = style;
    }
  };
  rates["!cols"] = [{ wch: 16 }, { wch: 18 }];
  transactions["!cols"] = transactionRows[0].map((_, column) => ({
    wch: Math.min(
      24,
      Math.max(
        12,
        ...transactionRows.slice(1).map((row) => {
          const cell = row[column];
          const value = cell && typeof cell === "object" ? cell.v : cell;
          return String(value ?? "").length;
        }),
      ) + 2,
    ),
  }));
  original["!cols"] = Array.from(
    { length: Math.max(...originalRows.map((row) => row.length)) },
    (_, column) => ({
      wch: Math.min(
        42,
        Math.max(
          12,
          ...originalRows.map((row) => String(row[column] ?? "").length + 2),
        ),
      ),
    }),
  );
  styleHeader(rates, 0, 1);
  styleHeader(transactions, 0, 12, wrappedHeaderStyle);
  transactions["!rows"] = [{ hpt: 54 }];
  for (let row = 1; row < transactionEndRow; row++) {
    const cell = transactions[XLSX.utils.encode_cell({ r: row, c: 4 })];
    if (cell) cell.s = { alignment: { horizontal: "right" } };
    const sheetRow = row + 1;
    if (transactionRows[row][3] === labels.assets.stocks) {
      transactions[`M${sheetRow}`].s = {
        font: { color: { rgb: "008000" } },
        alignment: { horizontal: "center" },
      };
      transactions[`M${sheetRow}`].z = "0";
    }
  }
  transactions["!cols"][12] = { wch: 22 };
  const holdingNoteRow = transactionEndRow + 2;
  XLSX.utils.sheet_add_aoa(transactions, [[labels.holdingNote]], {
    origin: `A${holdingNoteRow}`,
  });
  transactions[`A${holdingNoteRow}`].s = {
    font: { sz: 10, color: { rgb: "666666" } },
    alignment: { wrapText: true, vertical: "center" },
  };
  transactions["!merges"] = [
    { s: { r: holdingNoteRow - 1, c: 0 }, e: { r: holdingNoteRow - 1, c: 12 } },
  ];
  transactions["!rows"][holdingNoteRow - 1] = { hpt: 36 };
  styleHeader(calculation, 0, 2, wrappedHeaderStyle);
  calculation["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 58 }];
  calculation["!rows"] = [{ hpt: 54 }];
  calculationHelpers.forEach((_, index) => {
    calculation["!rows"][helperStartRow + index - 1] = { hidden: true };
  });
  for (let row = 1; row < calculationEndRow; row++)
    calculation[`C${row + 1}`].z = "#,##0.00";
  styleHeader(summary, 0, 2, summaryTitleStyle);
  styleHeader(summary, 1, 2, wrappedHeaderStyle);
  summary["!rows"] = [{ hpt: 30 }, { hpt: 36 }];
  for (let column = 0; column <= 2; column++) {
    const cell =
      summary[XLSX.utils.encode_cell({ r: summaryRows.length - 1, c: column })];
    if (cell) cell.s = summaryTotalStyle;
  }
  summary["!rows"][summaryRows.length - 1] = { hpt: 26 };
  summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  summary["!cols"] = [{ wch: 16 }, { wch: 22 }, { wch: 22 }];
  for (let row = 3; row < totalRow; row++) {
    summary[`B${row}`].z = "#,##0.00";
    summary[`C${row}`].z = "#,##0.00";
  }
  transactions["!autofilter"] = { ref: `A1:M${transactionEndRow}` };
  calculation["!autofilter"] = { ref: `A1:C${calculationEndRow}` };
  rates["!autofilter"] = { ref: `A1:B${conversionRows.length}` };
  summary["!autofilter"] = { ref: `A2:C${totalRow - 1}` };
  transactions["!freeze"] = { xSplit: 0, ySplit: 1 };
  calculation["!freeze"] = { xSplit: 0, ySplit: 1 };
  rates["!freeze"] = { xSplit: 0, ySplit: 1 };
  summary["!freeze"] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(workbook, original, labels.sheets.activity);
  XLSX.utils.book_append_sheet(workbook, rates, labels.sheets.rates);
  XLSX.utils.book_append_sheet(
    workbook,
    transactions,
    labels.sheets.transactions,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    calculation,
    labels.sheets.calculation,
  );
  XLSX.utils.book_append_sheet(workbook, summary, labels.sheets.summary);
  return {
    workbook: writeWorkbookWithCalculationHeader(
      workbook,
      labels.sheets.calculation,
      labels.calculationHeaders[2],
    ),
    calculationResult,
    exchangeRates: fullRates,
  };
}

export async function calculateTaxWorkbook(input) {
  return buildTaxWorkbook(input);
}

export async function generateTaxWorkbook(input) {
  return (await buildTaxWorkbook(input)).workbook;
}
