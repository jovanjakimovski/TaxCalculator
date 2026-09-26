import XLSX from "xlsx-js-style";

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

export async function generateTaxWorkbook({ csvText, exchangeRatesApi }) {
  const csvRows = csvText.split(/\r?\n/).filter((line) => line.length > 0).map(csvLine);
  const [periodStart, periodEnd] = statementPeriod(csvRows);
  if (!exchangeRatesApi) throw new Error("An exchange-rate API URL is required.");
  const config = { rateOffsetDays: 1, securitiesTaxRate: 10, dividendTaxRate: 10, interestTaxRate: 10 };
  const ratesUrl = `${exchangeRatesApi}?${new URLSearchParams({
    startDate: periodStart,
    endDate: periodEnd,
    rateOffsetDays: String(config.rateOffsetDays),
  })}`;
  const ratesResponse = await fetch(ratesUrl);
  if (!ratesResponse.ok) throw new Error(await errorMessage(ratesResponse, "Exchange-rate API returned an error"));
  const fullRates = await ratesResponse.json();

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
    rate: (row) => `=IFERROR(VLOOKUP(A${row},'Conversion Rates'!$A:$B,2,FALSE),0)`,
  };
  const originalSheetRow = (index) => index + 1;
  const sourceRows = originalRows.map((row, index) => ({ row, sheetRow: originalSheetRow(index) }));
  const rateFor = (date) => {
    const rate = rateByDate.get(date);
    if (!rate) throw new Error(`Exchange rate missing for ${date}.`);
    return rate;
  };
  const conversionRows = [
    ["DATE", "MKD PER USD"],
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

  const calculationRows = [["DATE", "RATE DATE", "SYMBOL", "ASSET CLASS", "CONTRACT MULTIPLIER", "QUANTITY", "COST BASIS", "SALE PRICE / SHARE", "SALE PRICE TOTAL", "REALIZED P/L", "CURRENCY", "EXCHANGE RATE", "REALIZED P/L (MKD)"]];
  securities.forEach((item) => {
    const row = calculationRows.length + 1;
    const ref = item.sheetRow;
    const column = (letter) => `'Activity Statement'!${letter}${ref}`;
    calculationRows.push([
      formula(`=LEFT(${column("G")},10)`, item.date, "str"),
      item.rate.effectiveDate,
      formula(`=${column("F")}`, item.row[5], "str"),
      formula(`=${column("D")}`, item.row[3], "str"),
      formula(`=IF(D${row}="Equity and Index Options",100,1)`, item.row[3] === "Equity and Index Options" ? 100 : 1),
      formula(`=ABS(VALUE(${column("H")}))`, Math.abs(numericCell(item.row[7]))),
      formula(`=ABS(VALUE(${column("M")}))`, Math.abs(numericCell(item.row[12]))),
      formula(`=VALUE(${column("I")})`, numericCell(item.row[8])),
      formula(`=VALUE(${column("K")})`, numericCell(item.row[10])),
      formula(`=VALUE(${column(item.row[3] === "Forex" ? "O" : "N")})`, item.usdResult),
      formula(`=${column("E")}`, item.row[4], "str"),
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=J${row}*L${row}`, item.mkdResult),
    ]);
  });
  interests.forEach((item) => {
    const row = calculationRows.length + 1;
    const ref = item.sheetRow;
    const column = (letter) => `'Activity Statement'!${letter}${ref}`;
    calculationRows.push([
      formula(`=LEFT(${column("D")},10)`, item.date, "str"),
      item.rate.effectiveDate,
      "",
      "Interest",
      1,
      "",
      "",
      "",
      "",
      formula(`=VALUE(${column("F")})`, item.usdAmount),
      "USD",
      formula(formulas.rate(row), item.rate.mkdPerUsd),
      formula(`=J${row}*L${row}`, item.mkdAmount),
    ]);
  });

  const formulaSum = (entries, absolute = false) => {
    if (entries.length === 0) return formula("=0", 0);
    const refs = entries.map(({ sheetRow }) => `${absolute ? "ABS(" : ""}VALUE('Activity Statement'!F${sheetRow})${absolute ? ")" : ""}`);
    return formula(`=SUM(${refs.join(",")})`, entries.reduce((sum, entry) => sum + (absolute ? Math.abs(entry.amount) : entry.amount), 0));
  };
  const dividendRows = [];
  for (const item of dividendsByKey.values()) {
    const row = dividendRows.length + 2;
    const descriptionSourceRow = item.gross[0]?.sheetRow ?? item.withholding[0].sheetRow;
    const descriptionSource = `'Activity Statement'!E${descriptionSourceRow}`;
    const gross = item.gross.reduce((sum, entry) => sum + entry.amount, 0);
    const withholding = item.withholding.reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
    const grossMkd = gross * item.rate.mkdPerUsd;
    const grossFormula = formulaSum(item.gross);
    const withholdingFormula = formulaSum(item.withholding, true);
    dividendRows.push([
      formula(`=LEFT('Activity Statement'!D${item.gross[0]?.sheetRow ?? item.withholding[0].sheetRow},10)`, item.date, "str"),
      formula(`=LEFT(${descriptionSource},FIND(" (",${descriptionSource}&" ( ")-1)`, item.symbol, "str"),
      formula(`=SUBSTITUTE(LEFT(${descriptionSource},FIND(" - US Tax",${descriptionSource}&" - US Tax")-1)," (Ordinary Dividend)","")`, item.description, "str"),
      item.rate.effectiveDate,
      grossFormula,
      withholdingFormula,
      formula(`=IFERROR(VLOOKUP(A${row},'Conversion Rates'!$A:$B,2,FALSE),0)`, item.rate.mkdPerUsd),
      formula(`=ROUND(E${row}*G${row},2)`, Math.round(grossMkd * 100) / 100),
      formula("=10%", config.dividendTaxRate / 100),
      "Yes",
      formula(`=H${row}`, Math.round(grossMkd * 100) / 100),
      formula(`=ROUND(K${row}*I${row},2)`, Math.round(grossMkd * config.dividendTaxRate) / 100),
    ]);
  }

  const summaryMonths = [];
  for (let month = periodStart.slice(0, 7); month <= periodEnd.slice(0, 7);) {
    summaryMonths.push(month);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber, 1));
    month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const calculationEndRow = calculationRows.length;
  const dividendEndRow = dividendRows.length + 1;
  const calculationFormulaEndRow = Math.max(calculationEndRow, 2);
  const dividendFormulaEndRow = Math.max(dividendEndRow, 2);
  const monthlySummaryRows = summaryMonths.map((month, index) => {
    const row = index + 3;
    const monthCalculationRows = calculationRows.slice(1).filter((item) => String(item[0].v).slice(0, 7) === month);
    const monthDividendRows = dividendRows.filter((item) => String(item[0].v).slice(0, 7) === month);
    const realizedMkd = monthCalculationRows.reduce((sum, item) => sum + item[12].v, 0);
    const dividendGrossMkd = monthDividendRows.reduce((sum, item) => sum + item[7].v, 0);
    const tradeTaxBase = monthCalculationRows.filter((item) => item[3] !== "Interest").reduce((sum, item) => sum + item[12].v, 0);
    const interestTaxBase = monthCalculationRows.filter((item) => item[3] === "Interest").reduce((sum, item) => sum + item[12].v, 0);
    const dividendTax = monthDividendRows.reduce((sum, item) => sum + item[11].v, 0);
    const tax = Math.max(tradeTaxBase, 0) * config.securitiesTaxRate / 100 + Math.max(interestTaxBase, 0) * config.interestTaxRate / 100 + dividendTax;
    const totalFormula = `=SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationFormulaEndRow},7)=A${row})*Calculation!$M$2:$M$${calculationFormulaEndRow})+SUMPRODUCT((LEFT(Dividends!$A$2:$A$${dividendFormulaEndRow},7)=A${row})*Dividends!$H$2:$H$${dividendFormulaEndRow})`;
    const taxFormula = `=MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationFormulaEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationFormulaEndRow}<>"Interest")*Calculation!$M$2:$M$${calculationFormulaEndRow}),0)*10%+MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationFormulaEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationFormulaEndRow}="Interest")*Calculation!$M$2:$M$${calculationFormulaEndRow}),0)*10%+SUMPRODUCT((LEFT(Dividends!$A$2:$A$${dividendFormulaEndRow},7)=A${row})*Dividends!$L$2:$L$${dividendFormulaEndRow})`;
    return [month, formula(totalFormula, realizedMkd + dividendGrossMkd), formula(taxFormula, tax)];
  });
  const totalRow = monthlySummaryRows.length + 3;
  const summaryRows = [
    ["SUMMARY", "", ""],
    ["MONTH", "TOTAL REALIZED P/L (MKD)", "TAX"],
    ...monthlySummaryRows,
    ["TOTAL", formula(`=SUM(B3:B${totalRow - 1})`, monthlySummaryRows.reduce((sum, row) => sum + row[1].v, 0)), formula(`=SUM(C3:C${totalRow - 1})`, monthlySummaryRows.reduce((sum, row) => sum + row[2].v, 0))],
  ];

  const workbook = XLSX.utils.book_new();
  const original = XLSX.utils.aoa_to_sheet(originalRows);
  const rates = XLSX.utils.aoa_to_sheet(conversionRows);
  const calculation = XLSX.utils.aoa_to_sheet(calculationRows);
  const dividends = XLSX.utils.aoa_to_sheet([
    ["DATE", "SYMBOL", "DESCRIPTION", "RATE DATE", "GROSS USD", "WITHHOLDING USD", "MKD PER USD", "GROSS MKD", "TAX RATE", "INCLUDED", "TAXABLE MKD", "ESTIMATED TAX MKD"],
    ...dividendRows,
  ]);
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F4E78" } }, alignment: { horizontal: "center", vertical: "center" } };
  const titleStyle = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 }, fill: { fgColor: { rgb: "17365D" } } };
  const styleHeader = (sheet, row, lastColumn) => {
    for (let column = 0; column <= lastColumn; column++) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column });
      if (sheet[cell]) sheet[cell].s = headerStyle;
    }
  };
  const styleTitle = (sheet, row, lastColumn) => {
    for (let column = 0; column <= lastColumn; column++) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column });
      if (sheet[cell]) sheet[cell].s = titleStyle;
    }
  };
  rates["!cols"] = [{ wch: 16 }, { wch: 18 }];
  calculation["!cols"] = [
    { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
  ];
  dividends["!cols"] = [
    { wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 19 }, { wch: 15 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 16 }, { wch: 20 },
  ];
  original["!cols"] = Array.from({ length: Math.max(...originalRows.map((row) => row.length)) }, (_, column) => ({
    wch: Math.min(42, Math.max(12, ...originalRows.map((row) => String(row[column] ?? "").length + 2))),
  }));
  styleHeader(rates, 0, 1);
  styleHeader(calculation, 0, 12);
  styleHeader(dividends, 0, 11);
  for (let row = 1; row < calculationEndRow; row++) {
    const cell = calculation[XLSX.utils.encode_cell({ r: row, c: 4 })];
    if (cell) cell.s = { alignment: { horizontal: "right" } };
  }
  styleTitle(summary, 0, 2);
  styleHeader(summary, 1, 2);
  summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  summary["!cols"] = [{ wch: 14 }, { wch: 36 }, { wch: 22 }];
  calculation["!autofilter"] = { ref: `A1:M${calculationEndRow}` };
  rates["!autofilter"] = { ref: `A1:B${conversionRows.length}` };
  dividends["!autofilter"] = { ref: `A1:L${dividendEndRow}` };
  summary["!autofilter"] = { ref: `A2:C${summaryRows.length}` };
  calculation["!freeze"] = { xSplit: 0, ySplit: 1 };
  rates["!freeze"] = { xSplit: 0, ySplit: 1 };
  dividends["!freeze"] = { xSplit: 0, ySplit: 1 };
  summary["!freeze"] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(workbook, original, "Activity Statement");
  XLSX.utils.book_append_sheet(workbook, rates, "Conversion Rates");
  XLSX.utils.book_append_sheet(workbook, calculation, "Calculation");
  XLSX.utils.book_append_sheet(workbook, dividends, "Dividends");
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}