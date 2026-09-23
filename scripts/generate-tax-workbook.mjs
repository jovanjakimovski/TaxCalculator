import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "../frontend/node_modules/xlsx-js-style/dist/xlsx.min.js";

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const flag = (name, fallback = false) => {
  const value = option(name, undefined);
  return value === undefined ? fallback : value !== "false";
};

if (!inputPath || args.includes("--help")) {
  console.log(`Usage: npm run generate-workbook -- <activity.csv> [options]

Options:
  --output <file.xlsx>       Output workbook path
  --api <url>                Tax API URL (default: http://localhost:8080/api/tax/realized-gains)
  --offset <0|1>             FX date offset (default: 1)
  --securities-rate <rate>   Securities tax rate (default: 10)
  --dividend-rate <rate>     Dividend tax rate (default: 10)
  --forex-rate <rate>        Forex tax rate (default: 10)
  --interest-rate <rate>     Interest tax rate (default: 10)
  --include-forex <bool>     Include Forex in total (default: false)
  --offset-securities <bool> Offset securities losses (default: false)
  --offset-forex <bool>      Offset Forex losses (default: false)
  --offset-all <bool>        Offset losses across sections (default: false)`);
  process.exit(inputPath ? 0 : 1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(resolvedInput)) throw new Error(`Input file not found: ${resolvedInput}`);

const api = option("api", process.env.TAX_API_URL ?? "http://localhost:8080/api/tax/realized-gains");
const body = new FormData();
body.append("file", new Blob([fs.readFileSync(resolvedInput)], { type: "text/csv" }), path.basename(resolvedInput));
body.append("rateOffsetDays", option("offset", "1"));
body.append("securitiesTaxRate", option("securities-rate", "10"));
body.append("dividendTaxRate", option("dividend-rate", "10"));
body.append("forexTaxRate", option("forex-rate", "10"));
body.append("interestTaxRate", option("interest-rate", "10"));
body.append("offsetSecuritiesLosses", String(flag("offset-securities")));
body.append("offsetForexLosses", String(flag("offset-forex")));
body.append("offsetAcrossSections", String(flag("offset-all")));
body.append("includeSecurities", "true");
body.append("includeDividends", "false");
body.append("includeForex", "false");
body.append("includeInterest", "true");

const response = await fetch(api, { method: "POST", body });
if (!response.ok) {
  const message = await response.text();
  throw new Error(`Tax API returned ${response.status}: ${message}`);
}
const result = await response.json();

const csvLine = (line) => {
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
};
const originalRows = fs.readFileSync(resolvedInput, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map(csvLine);
const periodRow = originalRows.find((row) => row[0] === "Statement" && row[1] === "Data" && row[2] === "Period");
const periodMatch = String(periodRow?.[3] ?? "").match(/(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})\s*-\s*(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})/);
if (!periodMatch) throw new Error("Could not find the statement period in the IBKR CSV.");
const parsePeriodDate = (value) => {
  if (value.includes("-")) return value;
  const match = value.match(/([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (!match) throw new Error(`Invalid statement date: ${value}`);
  const month = new Date(`${match[1]} 1, 2000`).getMonth() + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
};
const periodStart = parsePeriodDate(periodMatch[1]);
const periodEnd = parsePeriodDate(periodMatch[2]);
const pad = (value) => String(value).padStart(2, "0");
const dateText = (value) => {
  if (typeof value !== "number") return String(value).slice(0, 10);
  const parsed = XLSX.SSF.parse_date_code(value);
  return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
};
const sourceRows = originalRows.map((row, index) => ({ row, sheetRow: index + 1 }));
const sourceFormula = (column, sheetRow) => ({ f: `='Activity Statement'!${column}${sheetRow}` });
const sourceTextFormula = (column, sheetRow) => ({ f: `=LEFT('Activity Statement'!${column}${sheetRow},10)` });
const sameNumber = (value, expected) => Number.isFinite(Number(value)) && Math.abs(Number(value) - expected) < 0.00001;
const usedTradeRows = new Set();

function findTradeSource(item) {
  const found = sourceRows.find(({ row, sheetRow }) => {
    if (usedTradeRows.has(sheetRow) || row[0] !== "Trades" || row[1] !== "Data" || row[2] !== "Order") return false;
    if (item.assetCategory === "Forex" ? row[3] !== "Forex" : row[3] === "Forex") return false;
    return row[5] === item.symbol && dateText(row[6]) === item.date && sameNumber(row[13], item.usdResult);
  });
  if (found) usedTradeRows.add(found.sheetRow);
  return found;
}

function incomeSources(section, item) {
  return sourceRows.filter(({ row }) => {
    if (row[0] !== section || row[1] !== "Data" || row[2] !== "USD" || dateText(row[3]) !== item.date) return false;
    if (section === "Interest") return sameNumber(row[5], item.usdAmount);
    const description = String(row[4]);
    const symbol = description.split("(")[0].trim();
    const normalized = description.replace(/ \(Ordinary Dividend\)$/, "").replace(/ - US Tax$/, "");
    return symbol === item.symbol && normalized === item.description;
  });
}

const rateMap = new Map();
function addRate(date, rateDate, rate, category) {
  const key = `${date}|${rateDate}|${rate}`;
  const current = rateMap.get(key);
  if (current) current.categories.add(category);
  else rateMap.set(key, { date, rateDate, rate, categories: new Set([category]) });
}
for (const row of [...result.rows, ...result.forexRows]) addRate(row.date, row.rateDate, row.mkdRate, row.assetCategory);
const ratesApi = option("api", process.env.TAX_API_URL ?? "http://localhost:8080/api/tax/realized-gains").replace(/\/realized-gains$/, "");
const ratesResponse = await fetch(`${ratesApi}/exchange-rates?startDate=${periodStart}&endDate=${periodEnd}&rateOffsetDays=${option("offset", "1")}`);
if (!ratesResponse.ok) throw new Error(`Exchange-rate API returned ${ratesResponse.status}: ${await ratesResponse.text()}`);
const fullRates = await ratesResponse.json();
const conversionRows = [
  ["DATE", "RATE"],
  ...fullRates.map((row) => [row.requestedDate, row.mkdPerUsd]),
];

const detailStartRow = 2;
const rateEndRow = conversionRows.length;
const detailRows = [];

function addTradeDetail(item) {
  const source = findTradeSource(item);
  if (!source) return;
  const row = detailStartRow + detailRows.length;
    detailRows.push([
      sourceTextFormula("G", source.sheetRow),
      { f: `=TEXT(DATEVALUE(A${row})-1,"yyyy-mm-dd")` },
      sourceFormula("F", source.sheetRow),
      sourceFormula("D", source.sheetRow),
      { f: `=IF(D${row}="Equity and Index Options",100,1)` },
      { f: `=ABS('Activity Statement'!H${source.sheetRow})` },
      { f: `=ABS('Activity Statement'!M${source.sheetRow})` },
      sourceFormula("I", source.sheetRow),
      sourceFormula("K", source.sheetRow),
      sourceFormula("N", source.sheetRow),
      "USD",
      { f: `=IFERROR(INDEX('Conversion Rates'!$B$2:$B$${rateEndRow},MATCH(A${row},'Conversion Rates'!$A$2:$A$${rateEndRow},0)),0)` },
      { f: `=J${row}*L${row}` },
    ]);
}
result.rows.forEach(addTradeDetail);
const interestRows = [];
const taxRate = Number(option("securities-rate", "10")) / 100;
const interestTaxRate = Number(option("interest-rate", "10")) / 100;
const interestRowsStart = detailStartRow + detailRows.length;

result.interest.forEach((item) => {
  const source = incomeSources("Interest", item)[0];
  if (!source) return;
  const row = interestRowsStart + interestRows.length;
  interestRows.push([
    sourceTextFormula("D", source.sheetRow),
    { f: `=TEXT(DATEVALUE(A${row})-1,"yyyy-mm-dd")` },
    "",
    "Interest",
    "1",
    "",
    "",
    "",
    "",
    sourceFormula("F", source.sheetRow),
    "USD",
    { f: `=IFERROR(INDEX('Conversion Rates'!$B$2:$B$${rateEndRow},MATCH(A${row},'Conversion Rates'!$A$2:$A$${rateEndRow},0)),0)` },
    { f: `=J${row}*L${row}` },
  ]);
});

const calculationRows = [
  ["DATE", "ADJUSTED DATE (T-1)", "SYMBOL", "ASSET CLASS", "CONTRACT MULTIPLIER", "QUANTITY", "COST BASIS", "SALE PRICE / SHARE", "SALE PRICE TOTAL", "REALIZED P/L", "CURRENCY", "EXCHANGE RATE", "REALIZED P/L (MKD)"],
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
const calculationEndRow = detailStartRow + detailRows.length + interestRows.length - 1;
const summaryRows = [
  ["SUMMARY", "", ""],
  ["MONTH", "TOTAL REALIZED P/L (MKD)", "TAX"],
  ...summaryMonths.map((month, index) => {
    const row = index + 3;
    return [
      month,
      { f: `=SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*Calculation!$M$2:$M$${calculationEndRow})` },
      { f: `=MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationEndRow}<>"Interest")*Calculation!$M$2:$M$${calculationEndRow}),0)*${taxRate}+MAX(SUMPRODUCT((LEFT(Calculation!$A$2:$A$${calculationEndRow},7)=A${row})*(Calculation!$D$2:$D$${calculationEndRow}="Interest")*Calculation!$M$2:$M$${calculationEndRow}),0)*${interestTaxRate}` },
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
const originalWidths = Math.max(...originalRows.map((row) => row.length));
original["!cols"] = Array.from({ length: originalWidths }, (_, column) => ({
  wch: Math.min(42, Math.max(12, ...originalRows.map((row) => String(row[column] ?? "").length + 2))),
}));
styleHeader(rates, 0, 1);
styleHeader(calculation, 0, 12);
for (let row = 1; row <= calculationEndRow - 1; row++) {
  const cell = calculation[XLSX.utils.encode_cell({ r: row, c: 4 })];
  if (cell) cell.s = { alignment: { horizontal: "right" } };
}
styleTitle(summary, 0, 2);
styleHeader(summary, 1, 2);
summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
summary["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 16 }];
calculation["!autofilter"] = { ref: `A1:M${calculationEndRow}` };
rates["!autofilter"] = { ref: `A1:B${conversionRows.length}` };
summary["!autofilter"] = { ref: `A2:C${summaryRows.length}` };
calculation["!freeze"] = { xSplit: 0, ySplit: 1 };
rates["!freeze"] = { xSplit: 0, ySplit: 1 };
summary["!freeze"] = { xSplit: 0, ySplit: 2 };
XLSX.utils.book_append_sheet(workbook, original, "Activity Statement");
XLSX.utils.book_append_sheet(workbook, rates, "Conversion Rates");
XLSX.utils.book_append_sheet(workbook, calculation, "Calculation");
XLSX.utils.book_append_sheet(workbook, summary, "Summary");

const defaultOutput = path.join(path.dirname(resolvedInput), `${path.basename(resolvedInput, path.extname(resolvedInput))}-tax-workpaper.xlsx`);
const outputPath = path.resolve(process.cwd(), option("output", defaultOutput));
XLSX.writeFile(workbook, outputPath);
console.log(`Workbook written to ${outputPath}`);
