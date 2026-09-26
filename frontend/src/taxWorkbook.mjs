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

export async function generateTaxWorkbook({ csvText, fileName, api, options }) {
  const csvRows = csvText.split(/\r?\n/).filter((line) => line.length > 0).map(csvLine);
  const [periodStart, periodEnd] = statementPeriod(csvRows);
  const config = {
    rateOffsetDays: 1,
    securitiesTaxRate: 10,
    dividendTaxRate: 10,
    forexTaxRate: 10,
    interestTaxRate: 10,
    offsetSecuritiesLosses: false,
    offsetForexLosses: false,
    offsetAcrossSections: false,
    includeForex: false,
    includeDividends: true,
    ...options,
  };
  const body = new FormData();
  body.append("file", new Blob([csvText], { type: "text/csv" }), fileName);
  body.append("rateOffsetDays", String(config.rateOffsetDays));
  body.append("securitiesTaxRate", String(config.securitiesTaxRate));
  body.append("dividendTaxRate", String(config.dividendTaxRate));
  body.append("forexTaxRate", String(config.forexTaxRate));
  body.append("interestTaxRate", String(config.interestTaxRate));
  body.append("offsetSecuritiesLosses", String(config.offsetSecuritiesLosses));
  body.append("offsetForexLosses", String(config.offsetForexLosses));
  body.append("offsetAcrossSections", String(config.offsetAcrossSections));
  body.append("includeSecurities", "true");
  body.append("includeDividends", String(config.includeDividends));
  body.append("includeForex", String(config.includeForex));
  body.append("includeInterest", "true");

  const resultResponse = await fetch(api, { method: "POST", body });
  if (!resultResponse.ok) throw new Error(await errorMessage(resultResponse, "Tax API returned an error"));
  const result = await resultResponse.json();

  const ratesApi = api.replace(/\/realized-gains$/, "");
  const ratesUrl = `${ratesApi}/exchange-rates?${new URLSearchParams({
    startDate: periodStart,
    endDate: periodEnd,
    rateOffsetDays: String(config.rateOffsetDays),
  })}`;
  const ratesResponse = await fetch(ratesUrl);
  if (!ratesResponse.ok) throw new Error(await errorMessage(ratesResponse, "Exchange-rate API returned an error"));
  const fullRates = await ratesResponse.json();

  const originalRows = csvRows;
  const dateText = (value) => String(value ?? "").slice(0, 10);
  const sourceRows = originalRows.map((row, index) => ({ row, sheetRow: index + 1 }));
  const sourceFormula = (column, sheetRow) => ({ f: `='Activity Statement'!${column}${sheetRow}` });
  const sourceTextFormula = (column, sheetRow) => ({ f: `=LEFT('Activity Statement'!${column}${sheetRow},10)` });
  const sameNumber = (value, expected) => Number.isFinite(Number(String(value ?? "").replaceAll(",", ""))) && Math.abs(Number(String(value).replaceAll(",", "")) - expected) < 0.00001;
  const usedTradeRows = new Set();

  function findTradeSource(item) {
    const profitColumn = item.assetCategory === "Forex" ? 14 : 13;
    const found = sourceRows.find(({ row, sheetRow }) => {
      if (usedTradeRows.has(sheetRow) || row[0] !== "Trades" || row[1] !== "Data" || row[2] !== "Order") return false;
      if (item.assetCategory === "Forex" ? row[3] !== "Forex" : row[3] === "Forex") return false;
      return row[5] === item.symbol && dateText(row[6]) === item.date && sameNumber(row[profitColumn], item.usdResult);
    });
    if (found) usedTradeRows.add(found.sheetRow);
    return found;
  }

  function dividendSources(section, item) {
    return sourceRows.filter(({ row }) => {
      if (row[0] !== section || row[1] !== "Data" || row[2] !== "USD" || dateText(row[3]) !== item.date) return false;
      const description = String(row[4]);
      const symbol = description.split("(")[0].trim();
      const normalized = description.replace(/ - US Tax$/, "").replace(/ \(Ordinary Dividend\)$/, "");
      return symbol === item.symbol && normalized === item.description;
    });
  }

  function sumSourceAmounts(rows, fallback, useAbsolute = false) {
    if (rows.length === 0) return fallback;
    const cells = rows.map(({ sheetRow }) => {
      const reference = `'Activity Statement'!F${sheetRow}`;
      return useAbsolute ? `ABS(VALUE(${reference}))` : `VALUE(${reference})`;
    });
    return { f: `=${cells.join("+")}` };
  }

  const detailStartRow = 2;
  const conversionRows = [
    ["DATE", "RATE"],
    ...fullRates.map((row) => [row.requestedDate, row.mkdPerUsd]),
  ];
  const rateEndRow = conversionRows.length;
  const detailRows = [];

  function addTradeDetail(item) {
    const source = findTradeSource(item);
    if (!source) return;
    const row = detailStartRow + detailRows.length;
    const profitColumn = item.assetCategory === "Forex" ? "O" : "N";
    detailRows.push([
      sourceTextFormula("G", source.sheetRow),
      { f: `=TEXT(DATEVALUE(A${row})-${config.rateOffsetDays},"yyyy-mm-dd")` },
      sourceFormula("F", source.sheetRow),
      sourceFormula("D", source.sheetRow),
      { f: `=IF(D${row}="Equity and Index Options",100,1)` },
      { f: `=ABS('Activity Statement'!H${source.sheetRow})` },
      { f: `=ABS('Activity Statement'!M${source.sheetRow})` },
      sourceFormula("I", source.sheetRow),
      sourceFormula("K", source.sheetRow),
      sourceFormula(profitColumn, source.sheetRow),
      "USD",
      { f: `=IFERROR(INDEX('Conversion Rates'!$B$2:$B$${rateEndRow},MATCH(B${row},'Conversion Rates'!$A$2:$A$${rateEndRow},0)),0)` },
      { f: `=J${row}*L${row}` },
    ]);
  }

  result.rows.forEach(addTradeDetail);
  if (config.includeForex) result.forexRows.forEach(addTradeDetail);
  const interestRows = [];
  result.interest.forEach((item) => {
    const source = sourceRows.find(({ row }) => row[0] === "Interest" && row[1] === "Data" && row[2] === "USD" && dateText(row[3]) === item.date && sameNumber(row[5], item.usdAmount));
    if (!source) return;
    const row = detailStartRow + detailRows.length + interestRows.length;
    interestRows.push([
      sourceTextFormula("D", source.sheetRow),
      { f: `=TEXT(DATEVALUE(A${row})-${config.rateOffsetDays},"yyyy-mm-dd")` },
      "",
      "Interest",
      "1",
      "",
      "",
      "",
      "",
      sourceFormula("F", source.sheetRow),
      "USD",
      { f: `=IFERROR(INDEX('Conversion Rates'!$B$2:$B$${rateEndRow},MATCH(B${row},'Conversion Rates'!$A$2:$A$${rateEndRow},0)),0)` },
      { f: `=J${row}*L${row}` },
    ]);
  });

  const dividendRows = [];
  result.dividends.forEach((item) => {
    const grossSources = dividendSources("Dividends", item);
    const withholdingSources = dividendSources("Withholding Tax", item);
    const row = detailStartRow + dividendRows.length;
    dividendRows.push([
      item.date,
      item.symbol,
      item.description,
      item.rateDate,
      sumSourceAmounts(grossSources, item.grossUsd),
      sumSourceAmounts(withholdingSources, item.withholdingUsd, true),
      { f: `=IFERROR(INDEX('Conversion Rates'!$B$2:$B$${rateEndRow},MATCH(A${row},'Conversion Rates'!$A$2:$A$${rateEndRow},0)),0)` },
      { f: `=ROUND(E${row}*G${row},2)` },
      Number(config.dividendTaxRate) / 100,
      config.includeDividends ? "Yes" : "No",
      { f: `=IF(J${row}="Yes",H${row},0)` },
      { f: `=ROUND(K${row}*I${row},2)` },
    ]);
  });

  const calculationRows = [
    ["DATE", "ADJUSTED DATE", "SYMBOL", "ASSET CLASS", "CONTRACT MULTIPLIER", "QUANTITY", "COST BASIS", "SALE PRICE / SHARE", "SALE PRICE TOTAL", "REALIZED P/L", "CURRENCY", "EXCHANGE RATE", "REALIZED P/L (MKD)"],
    ...detailRows,
    ...interestRows,
  ];
  const summaryMonths = [];
  for (let month = periodStart.slice(0, 7); month <= periodEnd.slice(0, 7);) {
    summaryMonths.push(month);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber, 1));
    month = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const calculationEndRow = calculationRows.length;
  const dividendEndRow = dividendRows.length + 1;
  const summaryRows = [
    ["SUMMARY", "", ""],
    ["MONTH", "TOTAL REALIZED P/L (MKD)", "TAX"],
    ...summaryMonths.map((month, index) => {
      const row = index + 3;
      const monthlyDividendSum = (column) => dividendRows.length
        ? `SUMPRODUCT((LEFT(Dividends!$A$2:$A$${dividendEndRow},7)=A${row})*Dividends!$${column}$2:$${column}$${dividendEndRow})`
        : "0";
      return [
        month,
        { f: `=SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*Calculation!$M$2:$M$${calculationEndRow})+${monthlyDividendSum("H")}` },
        { f: `=MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationEndRow}<>"Interest")*Calculation!$M$2:$M$${calculationEndRow}),0)*${Number(config.securitiesTaxRate) / 100}+MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationEndRow}="Interest")*Calculation!$M$2:$M$${calculationEndRow}),0)*${Number(config.interestTaxRate) / 100}+${monthlyDividendSum("L")}` },
      ];
    }),
    ["TOTAL", { f: `=SUM(B3:B${summaryMonths.length + 2})` }, { f: `=SUM(C3:C${summaryMonths.length + 2})` }],
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { CalcPr: { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true } };
  const original = XLSX.utils.aoa_to_sheet(originalRows);
  const formulaCells = (rows) => rows.map((row) => row.map((cell) =>
    cell && typeof cell === "object" && cell.f && !cell.t ? { ...cell, t: "n", v: 0 } : cell,
  ));
  const rates = XLSX.utils.aoa_to_sheet(formulaCells(conversionRows));
  const calculation = XLSX.utils.aoa_to_sheet(formulaCells(calculationRows));
  const dividends = XLSX.utils.aoa_to_sheet(formulaCells([
    ["DATE", "SYMBOL", "DESCRIPTION", "RATE DATE", "GROSS USD", "WITHHOLDING USD", "MKD PER USD", "GROSS MKD", "TAX RATE", "INCLUDED", "TAXABLE MKD", "ESTIMATED TAX MKD"],
    ...dividendRows,
  ]));
  const summary = XLSX.utils.aoa_to_sheet(formulaCells(summaryRows));
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
  rates["!cols"] = [{ wch: 16 }, { wch: 14 }];
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