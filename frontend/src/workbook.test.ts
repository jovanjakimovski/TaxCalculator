import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import XLSX from "xlsx-js-style";
import { calculateTaxWorkbook, generateTaxWorkbook } from "./taxWorkbook.mjs";
import type { ExchangeRate } from "./taxWorkbook.mjs";

const sample = readFileSync(
  new URL("../public/sample-ibkr.csv", import.meta.url),
  "utf8",
);
const names = {
  en: [
    "Original Statement",
    "Exchange Rate List",
    "Realized Transactions",
    "Calculation",
    "Summary",
  ],
  mk: [
    "Оригинален Извештај",
    "Курсна Листа",
    "Реализирани трансакции",
    "Пресметка",
    "Резиме",
  ],
};
function rates(start = "2025-01-01", end = "2025-02-28"): ExchangeRate[] {
  const result = [];
  for (let day = Date.parse(start); day <= Date.parse(end); day += 86400000) {
    result.push({
      requestedDate: new Date(day).toISOString().slice(0, 10),
      effectiveDate: new Date(day - 86400000).toISOString().slice(0, 10),
      mkdPerUsd: 60,
    });
  }
  return result;
}
async function generate(
  csvText = sample,
  language: "en" | "mk" = "en",
  exchangeRates = rates(),
) {
  const output = await calculateTaxWorkbook({
    csvText,
    exchangeRates,
    exchangeRatesApi: "/unused",
    language,
  });
  const book = XLSX.read(output.workbook, {
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
  });
  return { ...output, book };
}
const rows = (sheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    raw: true,
  });
const trade = (symbol: string, date: string, pl: number, asset = "Stocks") =>
  `Trades,Data,Order,${asset},USD,${symbol},${date},-1,0,0,0,0,0,${pl},0`;

it("exports five translated sheets with intact original data and updated purchase-price labels", async () => {
  const en = await generate();
  const mk = await generate(sample, "mk");
  expect(en.calculationResult).toEqual(mk.calculationResult);
  expect(en.calculationResult.estimatedTaxMkd).toBe(240);
  expect(
    en.calculationResult.monthlySummary.map((month) => month.taxMkd),
  ).toEqual([180, 60]);
  for (const [language, output] of [
    ["en", en],
    ["mk", mk],
  ] as const) {
    expect(output.book.SheetNames).toEqual(names[language]);
    expect(rows(output.book.Sheets[names[language][0]])).toEqual(
      rows(en.book.Sheets[names.en[0]]),
    );
    const transactions = output.book.Sheets[names[language][2]];
    expect(transactions.F1.v).toBe(
      language === "mk" ? "КУПОВНА ЦЕНА" : "PURCHASE PRICE",
    );
    expect(transactions.A2.f).toContain(`'${names[language][0]}'!G6`);
    expect(transactions.K2.f).toContain(`'${names[language][1]}'!`);
    expect(transactions.L2).toMatchObject({ f: "=I2*K2", v: 1500 });
    const calculation = output.book.Sheets[names[language][3]];
    expect(XLSX.utils.decode_range(calculation["!ref"]!).e.c).toBe(2);
    expect(calculation.C1.v).toContain(
      language === "mk"
        ? "ОСТВАРЕНА ДОБИВКА ИЛИ ЗАГУБА"
        : "REALIZED PROFIT OR LOSS",
    );
    expect(calculation.C1.v).toContain(
      language === "mk"
        ? "MAX(0, АКЦИИ + ОПЦИИ + ДИВИДЕНДИ)"
        : "MAX(0, STOCKS + OPTIONS + DIVIDENDS)",
    );
    expect(calculation.C1.v).toContain("Interest: MAX(0,");
    expect(calculation.C2.f).toContain(`'${names[language][2]}'!$L$2:`);
    expect(calculation.C2.z).toBe("#,##0.00");
    const summary = output.book.Sheets[names[language][4]];
    expect(rows(summary)[1]).toEqual(
      language === "mk"
        ? ["ДАТУМ", "ВКУПНО (МКД)", "ДАНОК (МКД)"]
        : ["DATE", "TOTAL (MKD)", "TAX (MKD)"],
    );
    expect(XLSX.utils.decode_range(summary["!ref"]!).e.c).toBe(2);
    expect(summary.B3.f).toContain(`'${names[language][3]}'!$C$2:`);
    expect(summary.C3).toMatchObject({ f: "=B3*0.1", v: 180 });
    expect(summary.C5).toMatchObject({
      f: "=ROUNDUP(SUM(C3:C4),0)",
      v: 240,
      z: "#,##0",
    });
    expect(summary["!autofilter"]?.ref).toBe("A2:C4");
    expect(summary["!merges"]).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    ]);
  }
});

it("nets stock, both IBKR option formats and gross dividends by underlying symbol and month", async () => {
  const csvText = [
    sample,
    trade("GAIN 01FEB25 100 C", "2025-01-10", -10, "Equity and Index Options"),
    trade("GAIN  250201C00010000", "2025-01-10", 2, "Equity and Index Options"),
    trade("UNMAPPED", "2025-01-10", -4, "Equity and Index Options"),
    'Dividends,Data,USD,2025-01-10,"GAIN (Ordinary Dividend)",2',
    'Dividends,Data,USD,2025-01-10,"GAIN (Ordinary Dividend)",1',
    'Withholding Tax,Data,USD,2025-01-10,"GAIN (Ordinary Dividend) - US Tax",-1',
    trade("GAIN", "2025-02-20", -100),
  ].join("\n");
  for (const language of ["en", "mk"] as const) {
    const output = await generate(csvText, language);
    const calculation = output.book.Sheets[names[language][3]];
    expect(rows(calculation).slice(1)).toEqual([
      ["2025-01", "GAIN", 1200],
      ["2025-01", "UNMAPPED", 0],
      ["2025-01", "Interest", 300],
      ["2025-02", "GAIN", 0],
      ["2025-02", "LOSS", 0],
      ["2025-02", "SYN", 600],
      ["2025-02", "Interest", 0],
    ]);
    expect(calculation.C2.f).toContain('"GAIN 01FEB25 100 C"');
    expect(calculation.C2.f).toContain('"GAIN  250201C00010000"');
    expect(calculation.C2.f).not.toContain(
      language === "mk" ? '="Камата"' : '="Interest"',
    );
    const transactionSymbols = rows(output.book.Sheets[names[language][2]])
      .slice(1)
      .map((row) => row[2]);
    expect(transactionSymbols).toContain("GAIN 01FEB25 100 C");
    expect(transactionSymbols).toContain("GAIN  250201C00010000");
    expect(output.calculationResult.estimatedTaxMkd).toBe(210);
  }
});

it("nets Interest independently and floors negative security and interest groups at zero", async () => {
  const output = await generate(
    [
      sample,
      "Interest,Data,USD,2025-01-30,USD debit interest,-2",
      "Interest,Data,USD,2025-02-20,USD credit interest,1",
      trade("OTHER", "2025-01-10", -1000),
    ].join("\n"),
  );
  expect(rows(output.book.Sheets.Calculation).slice(1)).toEqual([
    ["2025-01", "GAIN", 1500],
    ["2025-01", "OTHER", 0],
    ["2025-01", "Interest", 180],
    ["2025-02", "LOSS", 0],
    ["2025-02", "SYN", 600],
    ["2025-02", "Interest", 0],
  ]);
  expect(output.calculationResult.monthlySummary[0].interestMkd).toBe(180);
  expect(output.calculationResult.monthlySummary[1].interestMkd).toBe(-60);
  expect(output.calculationResult.estimatedTaxMkd).toBe(228);
});

it("converts every event to MKD before netting, and reconciles grouped cells with summary and UI totals", async () => {
  const exchangeRates = rates().map((rate) => ({
    ...rate,
    mkdPerUsd: rate.requestedDate === "2025-01-20" ? 55 : 60,
  }));
  const output = await generate(
    [
      sample,
      trade(
        "GAIN 01FEB25 100 C",
        "2025-01-20",
        -10,
        "Equity and Index Options",
      ),
    ].join("\n"),
    "en",
    exchangeRates,
  );
  const grouped = rows(output.book.Sheets.Calculation).slice(1);
  expect(grouped[0]).toEqual(["2025-01", "GAIN", 950]);
  for (const [
    index,
    month,
  ] of output.calculationResult.monthlySummary.entries()) {
    const amount = grouped
      .filter((row) => row[0] === month.month)
      .reduce((sum, row) => sum + Number(row[2]), 0);
    expect(amount).toBeCloseTo(month.taxablePnlMkd, 8);
    expect(output.book.Sheets.Summary[`B${index + 3}`].v).toBeCloseTo(
      amount,
      8,
    );
    expect(output.book.Sheets.Summary[`C${index + 3}`].v).toBeCloseTo(
      amount * 0.1,
      8,
    );
  }
  expect(output.calculationResult.estimatedTaxMkd).toBe(185);
});

it("retains zero months and Interest entries when no interest exists across a year boundary", async () => {
  const csvText = [
    'Statement,Data,Period,"December 15, 2024 - February 10, 2025"',
    trade("SYN", "2024-12-20", 1),
    trade("SYN", "2025-02-03", 2),
  ].join("\n");
  const output = await generate(
    csvText,
    "en",
    rates("2024-12-15", "2025-02-10"),
  );
  expect(rows(output.book.Sheets.Calculation).slice(1)).toEqual([
    ["2024-12", "SYN", 60],
    ["2024-12", "Interest", 0],
    ["2025-01", "Interest", 0],
    ["2025-02", "SYN", 120],
    ["2025-02", "Interest", 0],
  ]);
  expect(output.book.Sheets.Summary.B4.v).toBe(0);
  expect(output.book.Sheets.Summary.C6.v).toBe(18);
});

it("rounds only the final tax total upward, preserving unrounded monthly calculations", async () => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    trade("SYN", "2025-01-10", 0.001),
    trade("SYN", "2025-02-10", 0.001),
  ].join("\n");
  const output = await generate(csvText);
  expect(output.book.Sheets.Summary.C3.v).toBeCloseTo(0.006, 10);
  expect(output.book.Sheets.Summary.C4.v).toBeCloseTo(0.006, 10);
  expect(output.book.Sheets.Summary.C5.v).toBe(1);
  expect(output.calculationResult.estimatedTaxMkd).toBe(1);
});

it("uses the same five-sheet generator for the CLI export", async () => {
  const workbook = await generateTaxWorkbook({
    csvText: sample,
    exchangeRates: rates(),
    exchangeRatesApi: "/unused",
    language: "mk",
  });
  const book = XLSX.read(workbook);
  expect(book.SheetNames).toEqual(names.mk);
  expect(book.Sheets["Резиме"].C5.v).toBe(240);
});

it("keeps formulas within Excel limits for an active symbol with many option contracts", async () => {
  for (const contractCount of [160, 500]) {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      ...Array.from({ length: contractCount }, (_, index) =>
        trade(
          `SYN 31JAN25 ${index + 1} C`,
          "2025-01-10",
          1,
          "Equity and Index Options",
        ),
      ),
    ].join("\n");
    for (const language of ["en", "mk"] as const) {
      const output = await generate(csvText, language);
      const calculation = output.book.Sheets[names[language][3]];
      expect(calculation.C2.v).toBe(contractCount * 60);
      expect(calculation.C2.f!.length).toBeLessThanOrEqual(8192);
      expect(output.calculationResult.estimatedTaxMkd).toBe(contractCount * 6);
    }
  }
});

it("matches Excel precision at whole-MKD tax rounding boundaries", async () => {
  for (const [securityUsd, interestUsd] of [
    [0.0029, 0.1971],
    [0.001, 0.199],
    [0.0124, 0.1876],
  ]) {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      trade("SYN", "2025-01-10", securityUsd),
      `Interest,Data,USD,2025-01-10,USD credit interest,${interestUsd}`,
    ].join("\n");
    const output = await generate(
      csvText,
      "en",
      rates().map((rate) => ({ ...rate, mkdPerUsd: 50 })),
    );
    expect(output.book.Sheets.Summary.B3.v).toBeCloseTo(10, 10);
    expect(output.book.Sheets.Summary.C3.v).toBe(1);
    expect(output.book.Sheets.Summary.C5.v).toBe(1);
    expect(output.calculationResult.estimatedTaxMkd).toBe(1);
  }
});
