import XLSX from "xlsx-js-style";

const workbookTranslations = {
  en: {
    sheets: { activity: "Activity Statement", rates: "Conversion Rates", calculation: "Calculation", summary: "Summary" },
    rateHeaders: ["DATE", "MKD PER USD"],
    calculationHeaders: ["DATE", "T-1 DATE", "SYMBOL", "ASSET CLASS", "QUANTITY", "COST BASIS", "SALE PRICE / SHARE", "SALE PRICE TOTAL", "REALIZED P/L", "CURRENCY", "EXCHANGE RATE", "REALIZED P/L (MKD)"],
    assets: { stocks: "Stocks", options: "Equity and Index Options", dividends: "Dividends", interest: "Interest" },
    summaryTitle: "SUMMARY",
    summaryTotal: "TOTAL",
    summaryHeaders: ["MONTH", "STOCKS REALIZED P/L (MKD)", "OPTIONS REALIZED P/L (MKD)", "DIVIDENDS REALIZED P/L (MKD)", "INTEREST (MKD)", "TOTAL REALIZED TAXABLE P/L (MKD)", "TAX (MKD)"],
  },
  mk: {
    sheets: { activity: "Извод од IBKR", rates: "Девизни курсеви", calculation: "Пресметка", summary: "Резиме" },
    rateHeaders: ["ДАТУМ", "КУРС (МКД ЗА 1 USD)"],
    calculationHeaders: ["ДАТУМ", "ДАТУМ НА КУРСОТ (Т-1)", "СИМБОЛ", "ВИД НА ФИНАНСИСКИ ИНСТРУМЕНТ", "КОЛИЧИНА", "НАБАВНА ВРЕДНОСТ", "ПРОДАЖНА ЦЕНА ПО АКЦИЈА", "ВКУПЕН ИЗНОС НА ПРОДАЖБАТА", "ОСТВАРЕНА ДОБИВКА ИЛИ ЗАГУБА", "ВАЛУТА", "ДЕВИЗЕН КУРС", "ОСТВАРЕНА ДОБИВКА ИЛИ ЗАГУБА (МКД)"],
    assets: { stocks: "Акции", options: "Опции", dividends: "Дивиденди", interest: "Камата" },
    summaryTitle: "РЕЗИМЕ",
    summaryTotal: "ВКУПНО",
    summaryHeaders: ["МЕСЕЦ", "ОСТВАРЕНА ДОБИВКА ИЛИ ЗАГУБА ОД АКЦИИ (МКД)", "ОСТВАРЕНА ДОБИВКА ИЛИ ЗАГУБА ОД ОПЦИИ (МКД)", "ДИВИДЕНДИ (МКД)", "НЕТО КАМАТА (МКД)", "ВКУПНА ОДАНОЧЛИВА ДОБИВКА (МКД)", "ДАНОК (МКД)"],
  },
};

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
  const periodRow = rows.find((row) => row[0] === "Statement" && row[1] === "Data" && row[2] === "Period");
  const periodMatch = String(periodRow?.[3] ?? "").match(/(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})\s*-\s*(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})/);
  if (!periodMatch) throw new Error("Could not find the statement period in the IBKR CSV.");
  return [parsePeriodDate(periodMatch[1]), parsePeriodDate(periodMatch[2])];
}

function errorMessage(response, prefix) {
  return response.text().then((message) => `${prefix}: ${message || response.statusText}`);
}

async function buildTaxWorkbook({ csvText, exchangeRatesApi, language = "en", exchangeRates }) {
  const labels = workbookTranslations[language] ?? workbookTranslations.en;
  const sheetReference = (name) => `'${name.replaceAll("'", "''")}'!`;
  const activitySheetReference = sheetReference(labels.sheets.activity);
  const ratesSheetReference = sheetReference(labels.sheets.rates);
  const calculationSheetReference = sheetReference(labels.sheets.calculation);
  const csvRows = csvText.split(/\r?\n/).filter((line) => line.length > 0).map(csvLine);
  const [periodStart, periodEnd] = statementPeriod(csvRows);
  if (!exchangeRatesApi && !exchangeRates) throw new Error("An exchange-rate API URL is required.");
  const config = { rateOffsetDays: 1, securitiesTaxRate: 10, dividendTaxRate: 10, interestTaxRate: 10 };
  let fullRates = exchangeRates;
  if (!fullRates) {
    const ratesUrl = `${exchangeRatesApi}?${new URLSearchParams({
      startDate: periodStart,
      endDate: periodEnd,
      rateOffsetDays: String(config.rateOffsetDays),
    })}`;
    const ratesResponse = await fetch(ratesUrl);
    if (!ratesResponse.ok) throw new Error(await errorMessage(ratesResponse, "Exchange-rate API returned an error"));
    fullRates = await ratesResponse.json();
  }

  const originalRows = csvRows;
  const dateText = (value) => String(value ?? "").slice(0, 10);
  const numericCell = (value) => {
    if (value == null || String(value).trim() === "") return 0;
    const parsed = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formula = (f, v, t = "n") => ({ f, v, t });
  const rateByDate = new Map(fullRates.map((row) => [row.requestedDate, row]));
  const formulas = {
    rate: (row) => `=IFERROR(VLOOKUP(A${row},${ratesSheetReference}$A:$B,2,FALSE),0)`,
  };
  const originalSheetRow = (index) => index + 1;
  const sourceRows = originalRows.map((row, index) => ({ row, sheetRow: originalSheetRow(index) }));
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
  const dividendDescription = (description) => String(description ?? "").replace(/ - US Tax$/, "").replace(/ \(Ordinary Dividend\)$/, "");
  const dividendSymbol = (description) => String(description ?? "").split("(")[0].trim();

  sourceRows.forEach(({ row, sheetRow }) => {
    if (row[1] !== "Data") return;
    if (row[0] === "Trades" && row[2] === "Order" && ["Stocks", "Equity and Index Options"].includes(row[3])) {
      const quantity = numericCell(row[7]);
      if (quantity > 0) return;
      const date = dateText(row[6]);
      const plColumn = row[3] === "Forex" ? 14 : 13;
      const usdResult = numericCell(row[plColumn]);
      const rate = rateFor(date);
      securities.push({ row, sheetRow, date, usdResult, rate, mkdResult: usdResult * rate.mkdPerUsd });
      return;
    }
    if (row[0] === "Interest" && row[2] === "USD") {
      const date = dateText(row[3]);
      const usdAmount = numericCell(row[5]);
      const rate = rateFor(date);
      interests.push({ row, sheetRow, date, usdAmount, rate, mkdAmount: usdAmount * rate.mkdPerUsd });
      return;
    }
    if ((row[0] === "Dividends" || row[0] === "Withholding Tax") && row[2] === "USD") {
      const date = dateText(row[3]);
      const description = String(row[4] ?? "");
      const key = `${date}|${dividendSymbol(description)}|${dividendDescription(description)}`;
      let entry = dividendsByKey.get(key);
      if (!entry) {
        const rate = rateFor(date);
        entry = { date, symbol: dividendSymbol(description), description: dividendDescription(description), rate, gross: [], withholding: [] };
        dividendsByKey.set(key, entry);
      }
      entry[row[0] === "Dividends" ? "gross" : "withholding"].push({ sheetRow, amount: numericCell(row[5]) });
    }
  });

  const calculationRows = [labels.calculationHeaders];
  securities.forEach((item) => {
    const row = calculationRows.length + 1;
    const ref = item.sheetRow;
    const column = (letter) => `${activitySheetReference}${letter}${ref}`;
    calculationRows.push([
      formula(`=LEFT(${column("G")},10)`, item.date, "str"),
      item.rate.effectiveDate,
      formula(`=${column("F")}`, item.row[5], "str"),
      item.row[3] === "Equity and Index Options" ? labels.assets.options : labels.assets.stocks,
      formula(`=ABS(VALUE(${column("H")}))`, Math.abs(numericCell(item.row[7]))),
      formula(`=ABS(VALUE(${column("M")}))`, Math.abs(numericCell(item.row[12]))),
      item.row[3] === "Equity and Index Options" ? "" : formula(`=VALUE(${column("I")})`, numericCell(item.row[8])),
      formula(`=VALUE(${column("K")})`, numericCell(item.row[10])),
      formula(`=VALUE(${column(item.row[3] === "Forex" ? "O" : "N")})`, item.usdResult),
      formula(`=${column("E")}`, item.row[4], "str"),
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=I${row}*K${row}`, item.mkdResult),
    ]);
  });
  interests.forEach((item) => {
    const row = calculationRows.length + 1;
    const ref = item.sheetRow;
    const column = (letter) => `${activitySheetReference}${letter}${ref}`;
    calculationRows.push([
      formula(`=LEFT(${column("D")},10)`, item.date, "str"),
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
    const refs = entries.map(({ sheetRow }) => `${absolute ? "ABS(" : ""}VALUE(${activitySheetReference}F${sheetRow})${absolute ? ")" : ""}`);
    return formula(`=SUM(${refs.join(",")})`, entries.reduce((sum, entry) => sum + (absolute ? Math.abs(entry.amount) : entry.amount), 0));
  };
  for (const item of dividendsByKey.values()) {
    if (item.gross.length === 0) continue;
    const row = calculationRows.length + 1;
    const sourceRow = item.gross[0].sheetRow;
    const gross = item.gross.reduce((sum, entry) => sum + entry.amount, 0);
    const grossMkd = gross * item.rate.mkdPerUsd;
    calculationRows.push([
      formula(`=LEFT(${activitySheetReference}D${sourceRow},10)`, item.date, "str"),
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

  calculationRows.splice(1, calculationRows.length - 1, ...calculationRows.slice(1).sort((left, right) => String(left[0].v).localeCompare(String(right[0].v))));
  calculationRows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2;
    row[10] = formula(formulas.rate(sheetRow), row[10].v);
    row[11] = formula(`=I${sheetRow}*K${sheetRow}`, row[11].v);
  });

  const summaryMonths = [];
  for (let month = periodStart.slice(0, 7); month <= periodEnd.slice(0, 7);) {
    summaryMonths.push(month);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber, 1));
    month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const calculationEndRow = calculationRows.length;
  const calculationFormulaEndRow = Math.max(calculationEndRow, 2);
  const cellValue = (cell) => cell && typeof cell === "object" ? cell.v : cell;
  const monthlySummaryRows = summaryMonths.map((month, index) => {
    const row = index + 3;
    const monthCalculationRows = calculationRows.slice(1).filter((item) => String(item[0].v).slice(0, 7) === month);
    const calculationDates = `${calculationSheetReference}$A$2:$A$${calculationFormulaEndRow}`;
    const calculationSymbols = `${calculationSheetReference}$C$2:$C$${calculationFormulaEndRow}`;
    const calculationAssets = `${calculationSheetReference}$D$2:$D$${calculationFormulaEndRow}`;
    const calculationMkd = `${calculationSheetReference}$L$2:$L$${calculationFormulaEndRow}`;
    const sumByAssetFormula = (assetClass) => `SUMPRODUCT((LEFT(${calculationDates},7)=A${row})*(${calculationAssets}="${assetClass}")*${calculationMkd})`;
    const stocksRows = monthCalculationRows.filter((item) => cellValue(item[3]) === labels.assets.stocks);
    const optionsRows = monthCalculationRows.filter((item) => cellValue(item[3]) === labels.assets.options);
    const dividendsRows = monthCalculationRows.filter((item) => cellValue(item[3]) === labels.assets.dividends);
    const interestRows = monthCalculationRows.filter((item) => cellValue(item[3]) === labels.assets.interest);
    const stocksPnl = stocksRows.reduce((sum, item) => sum + item[11].v, 0);
    const optionsPnl = optionsRows.reduce((sum, item) => sum + item[11].v, 0);
    const dividendsPnl = dividendsRows.reduce((sum, item) => sum + item[11].v, 0);
    const interestPnl = interestRows.reduce((sum, item) => sum + item[11].v, 0);
    const securitiesBySymbol = new Map();
    [...stocksRows, ...optionsRows, ...dividendsRows].forEach((item) => {
      const sourceSymbol = String(cellValue(item[2]) ?? "");
      const assetClass = cellValue(item[3]);
      const readableOption = assetClass === labels.assets.options
        ? sourceSymbol.match(/^(.+?)\s+\d{1,2}[A-Z]{3}\d{2,4}\s+[\d.]+\s+[CP]$/i)
        : null;
      const compactOption = assetClass === labels.assets.options
        ? sourceSymbol.match(/^(.+?)\s+\d{6}[CP]\d{8}$/i)
        : null;
      const optionMatch = readableOption ?? compactOption;
      const symbol = optionMatch ? optionMatch[1].trim() : sourceSymbol;
      let group = securitiesBySymbol.get(symbol);
      if (!group) {
        group = { amount: 0, sourceSymbols: new Set() };
        securitiesBySymbol.set(symbol, group);
      }
      group.amount += item[11].v;
      group.sourceSymbols.add(sourceSymbol);
    });
    const symbolTaxableFormulas = [...securitiesBySymbol.values()].map((group) => {
      const symbolConditions = [...group.sourceSymbols]
        .map((symbol) => `(${calculationSymbols}="${symbol.replaceAll('"', '""')}")`)
        .join("+");
      const taxableAssetClasses = [labels.assets.stocks, labels.assets.options, labels.assets.dividends]
        .map((assetClass) => `(${calculationAssets}="${assetClass}")`)
        .join("+");
      return `MAX(0,SUMPRODUCT((LEFT(${calculationDates},7)=A${row})*(${symbolConditions})*(${taxableAssetClasses})*${calculationMkd}))`;
    });
    const securitiesTaxablePnl = [...securitiesBySymbol.values()].reduce((sum, group) => sum + Math.max(group.amount, 0), 0);
    const securitiesTaxableFormula = symbolTaxableFormulas.length > 0 ? `SUM(${symbolTaxableFormulas.join(",")})` : "0";
    const interestFormula = sumByAssetFormula(labels.assets.interest);
    const taxablePnl = securitiesTaxablePnl + Math.max(interestPnl, 0);
    const tax = securitiesTaxablePnl * config.securitiesTaxRate / 100 + Math.max(interestPnl, 0) * config.interestTaxRate / 100;
    const totalFormula = `=${securitiesTaxableFormula}+MAX(0,${interestFormula})`;
    const taxFormula = `=${securitiesTaxableFormula}*${config.securitiesTaxRate / 100}+MAX(0,${interestFormula})*${config.interestTaxRate / 100}`;
    return [
      month,
      formula(`=${sumByAssetFormula(labels.assets.stocks)}`, stocksPnl),
      formula(`=${sumByAssetFormula(labels.assets.options)}`, optionsPnl),
      formula(`=${sumByAssetFormula(labels.assets.dividends)}`, dividendsPnl),
      formula(`=${interestFormula}`, interestPnl),
      formula(totalFormula, taxablePnl),
      formula(taxFormula, tax),
    ];
  });
  const totalRow = monthlySummaryRows.length + 3;
  const summaryTotal = (columnIndex) => monthlySummaryRows.reduce((sum, row) => sum + row[columnIndex].v, 0);
  const totalTaxCell = formula(`=ROUNDUP(SUM(G3:G${totalRow - 1}),0)`, Math.ceil(summaryTotal(6)));
  totalTaxCell.z = "#,##0";
  const summaryRows = [
    [labels.summaryTitle, "", "", "", "", "", ""],
    labels.summaryHeaders,
    ...monthlySummaryRows,
    [labels.summaryTotal, "", "", "", "", "", totalTaxCell],
  ];

  const tradeRows = securities.map((item) => ({
    assetCategory: item.row[3],
    symbol: String(item.row[5] ?? ""),
    date: item.date,
    rateDate: item.rate.effectiveDate,
    usdResult: item.usdResult,
    mkdRate: item.rate.mkdPerUsd,
    mkdResult: item.mkdResult,
  })).sort((left, right) => left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol));
  const dividendRows = [...dividendsByKey.values()].filter((item) => item.gross.length > 0).map((item) => {
    const grossUsd = item.gross.reduce((sum, entry) => sum + entry.amount, 0);
    const withholdingUsd = item.withholding.reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
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
    taxableIncomeMkd: summaryTotal(5),
    estimatedTaxMkd: Math.ceil(summaryTotal(6)),
    monthlySummary: monthlySummaryRows.map((row) => ({
      month: row[0],
      stocksMkd: row[1].v,
      optionsMkd: row[2].v,
      dividendsMkd: row[3].v,
      interestMkd: row[4].v,
      taxablePnlMkd: row[5].v,
      taxMkd: row[6].v,
    })),
    rows: tradeRows,
    dividends: dividendRows,
    dividendGrossUsd: dividendRows.reduce((sum, item) => sum + item.grossUsd, 0),
    dividendWithholdingUsd: dividendRows.reduce((sum, item) => sum + item.withholdingUsd, 0),
    dividendNetUsd: dividendRows.reduce((sum, item) => sum + item.netUsd, 0),
    dividendGrossMkd: dividendRows.reduce((sum, item) => sum + item.grossMkd, 0),
    dividendWithholdingMkd: dividendRows.reduce((sum, item) => sum + item.withholdingMkd, 0),
    dividendNetMkd: dividendRows.reduce((sum, item) => sum + item.netMkd, 0),
    interest: interestRows,
    interestPaidUsd: interestRows.reduce((sum, item) => sum + item.usdAmount, 0),
    interestPaidMkd: interestRows.reduce((sum, item) => sum + item.mkdAmount, 0),
    interestIncomeUsd: interestRows.filter((item) => item.usdAmount > 0).reduce((sum, item) => sum + item.usdAmount, 0),
    interestIncomeMkd: interestRows.filter((item) => item.mkdAmount > 0).reduce((sum, item) => sum + item.mkdAmount, 0),
    interestChargesUsd: interestRows.filter((item) => item.usdAmount < 0).reduce((sum, item) => sum + item.usdAmount, 0),
    interestChargesMkd: interestRows.filter((item) => item.mkdAmount < 0).reduce((sum, item) => sum + item.mkdAmount, 0),
  };

  const workbook = XLSX.utils.book_new();
  const original = XLSX.utils.aoa_to_sheet(originalRows);
  const rates = XLSX.utils.aoa_to_sheet(conversionRows);
  const calculation = XLSX.utils.aoa_to_sheet(calculationRows);
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F4E78" } }, alignment: { horizontal: "center", vertical: "center" } };
  const wrappedHeaderStyle = { ...headerStyle, alignment: { ...headerStyle.alignment, wrapText: true } };
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
  calculation["!cols"] = calculationRows[0].map((_, column) => ({
    wch: Math.min(24, Math.max(12, ...calculationRows.slice(1).map((row) => {
      const cell = row[column];
      const value = cell && typeof cell === "object" ? cell.v : cell;
      return String(value ?? "").length;
    })) + 2),
  }));
  original["!cols"] = Array.from({ length: Math.max(...originalRows.map((row) => row.length)) }, (_, column) => ({
    wch: Math.min(42, Math.max(12, ...originalRows.map((row) => String(row[column] ?? "").length + 2))),
  }));
  styleHeader(rates, 0, 1);
  styleHeader(calculation, 0, 11, wrappedHeaderStyle);
  calculation["!rows"] = [{ hpt: 54 }];
  for (let row = 1; row < calculationEndRow; row++) {
    const cell = calculation[XLSX.utils.encode_cell({ r: row, c: 4 })];
    if (cell) cell.s = { alignment: { horizontal: "right" } };
  }
  styleHeader(summary, 0, 6, summaryTitleStyle);
  styleHeader(summary, 1, 6, wrappedHeaderStyle);
  summary["!rows"] = [{ hpt: 30 }, { hpt: 54 }];
  for (let column = 0; column <= 6; column++) {
    const cell = summary[XLSX.utils.encode_cell({ r: summaryRows.length - 1, c: column })];
    if (cell) cell.s = summaryTotalStyle;
  }
  summary["!rows"][summaryRows.length - 1] = { hpt: 26 };
  summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  summary["!cols"] = summaryRows[0].map((_, column) => ({
    wch: Math.min(22, Math.max(12, ...summaryRows.slice(2).map((row) => {
      const cell = row[column];
      const value = cell && typeof cell === "object" ? cell.v : cell;
      return String(value ?? "").length;
    })) + 2),
  }));
  calculation["!autofilter"] = { ref: `A1:L${calculationEndRow}` };
  rates["!autofilter"] = { ref: `A1:B${conversionRows.length}` };
  summary["!autofilter"] = { ref: `A2:G${summaryRows.length}` };
  calculation["!freeze"] = { xSplit: 0, ySplit: 1 };
  rates["!freeze"] = { xSplit: 0, ySplit: 1 };
  summary["!freeze"] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(workbook, original, labels.sheets.activity);
  XLSX.utils.book_append_sheet(workbook, rates, labels.sheets.rates);
  XLSX.utils.book_append_sheet(workbook, calculation, labels.sheets.calculation);
  XLSX.utils.book_append_sheet(workbook, summary, labels.sheets.summary);
  return {
    workbook: XLSX.write(workbook, { bookType: "xlsx", type: "array" }),
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