import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import XLSX from "xlsx-js-style";
import { calculateTaxWorkbook, generateTaxWorkbook } from "./taxWorkbook.mjs";
import type { ExchangeRate } from "./taxWorkbook.mjs";
import { explainMonthlyGroups } from "./reportGroups";

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
    expect(transactions.A1.v).toBe(
      language === "mk" ? "ДАТУМ НА КУПУВАЊЕ" : "PURCHASE DATE",
    );
    expect(transactions.B1.v).toBe(
      language === "mk" ? "ДАТУМ НА ПРОДАЖБА" : "SALE DATE",
    );
    expect(rows(transactions)[0]).not.toContain(
      language === "mk" ? "ДЕНОВИ НА ПОСЕДУВАЊЕ" : "DAYS HELD",
    );
    expect(transactions.G1.v).toBe(
      language === "mk" ? "КУПОВНА ЦЕНА" : "PURCHASE PRICE",
    );
    expect(transactions.H1.v).toBe(
      language === "mk" ? "ПРОДАЖНА ЦЕНА ПО АКЦИЈА" : "SALE PRICE PER SHARE",
    );
    expect(transactions.I1.v).toBe(
      language === "mk" ? "ПРОДАЖНА ЦЕНА" : "SALE PRICE",
    );
    expect(output.book.Sheets[names[language][1]].B1.v).toBe(
      language === "mk" ? "КУРС USD-MKD" : "USD-MKD RATE",
    );
    expect(transactions.B2.f).toContain(`'${names[language][0]}'!G6`);
    expect(transactions.L2.f).toContain(`'${names[language][1]}'!`);
    expect(transactions.M2).toMatchObject({ f: "=J2*L2", v: 1500 });
    const calculation = output.book.Sheets[names[language][3]];
    expect(XLSX.utils.decode_range(calculation["!ref"]!).e.c).toBe(2);
    expect(calculation.C1.v).toContain(
      language === "mk" ? "РЕАЛИЗИРАНА ДОБИВКА (МКД)" : "REALIZED PROFIT (MKD)",
    );
    expect(calculation.C1.v).toContain(
      language === "mk"
        ? "(АКЦИИ+ОПЦИИ+ДИВИДЕНДИ) + ИНТЕРЕСТ"
        : "((STOCK+OPTIONS+DIVIDEND)+interest)",
    );
    expect(calculation.C1.v).not.toMatch(/FORMULA:|ФОРМУЛА:/);
    expect(calculation.C2.f).toContain(`'${names[language][2]}'!$M$2:`);
    expect(calculation.C2.z).toBe("#,##0.00");
    const summary = output.book.Sheets[names[language][4]];
    expect(rows(summary)[1]).toEqual(
      language === "mk"
        ? ["Месец", "Вкупно", "Данок"]
        : ["Month", "Total", "Tax"],
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
      ["2025-01", language === "mk" ? "Интерест" : "Interest", 300],
      ["2025-02", "GAIN", 0],
      ["2025-02", "LOSS", 0],
      ["2025-02", "SYN", 600],
      ["2025-02", language === "mk" ? "Интерест" : "Interest", 0],
    ]);
    expect(calculation.C2.f).toContain('"GAIN 01FEB25 100 C"');
    expect(calculation.C2.f).toContain('"GAIN  250201C00010000"');
    expect(calculation.C2.f).not.toContain(
      language === "mk" ? '="Интерест"' : '="Interest"',
    );
    const transactionSymbols = rows(output.book.Sheets[names[language][2]])
      .slice(1)
      .map((row) => row[3]);
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

it.each(["en", "mk"] as const)(
  "leaves missing purchase dates blank while keeping unknown dates taxable in %s",
  async (language) => {
    const output = await generate(sample, language);
    const transactions = output.book.Sheets[names[language][2]];
    expect(transactions.A2.v).toBe("");
    expect(transactions.A2.f).toBeUndefined();
    for (let row = 2; row <= 6; row++)
      expect(transactions[`A${row}`].v).toBe("");
    expect(transactions.B2.v).toBe("2025-01-10");
    expect(transactions.N1).toBeUndefined();
    expect(transactions.O1).toBeUndefined();
    expect(XLSX.utils.decode_range(transactions["!ref"]!).e.c).toBe(12);
    expect(transactions.A2.s).not.toMatchObject({
      fgColor: { rgb: "FFF2CC" },
    });
    expect(transactions["!autofilter"]?.ref).toBe("A1:M6");
    expect(output.calculationResult.rows[0]).toMatchObject({
      purchaseDate: null,
      daysHeld: null,
      holdingExempt: false,
      taxableMkdResult: 1500,
    });
    expect(output.calculationResult.estimatedTaxMkd).toBe(240);
  },
);

it.each(["en", "mk"] as const)(
  "shows the latest purchase date with consistent date-column formatting in %s",
  async (language) => {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      "Mark-to-Market Performance Summary,Header,Asset Category,Symbol,Prior Quantity,Current Quantity",
      "Mark-to-Market Performance Summary,Data,Stocks,ONE,0,0",
      "Mark-to-Market Performance Summary,Data,Stocks,MIXED,0,0",
      "Trades,Header,DataDiscriminator,AssetCategory,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
      "Trades,Data,Order,Stocks,USD,ONE,2025-01-01,1,80,80,-80,0,80,0,0,O",
      "Trades,Data,Order,Stocks,USD,MIXED,2025-01-02,1,80,80,-80,0,80,0,0,O",
      "Trades,Data,Order,Stocks,USD,MIXED,2025-01-05,1,80,80,-80,0,80,0,0,O",
      "Trades,Data,Order,Stocks,USD,ONE,2025-01-10,-1,100,100,100,0,-80,20,0,C",
      "Trades,Data,Order,Stocks,USD,MIXED,2025-01-11,-2,100,100,200,0,-160,40,0,C",
    ].join("\n");
    const output = await generate(csvText, language);
    const sheet = output.book.Sheets[names[language][2]];
    expect(sheet.A2.v).toBe("2025-01-01");
    expect(sheet.A2.f).toContain(`'${names[language][0]}'!G6`);
    expect(sheet.B2.v).toBe("2025-01-10");
    expect(sheet.A3.v).toBe("2025-01-05");
    expect(sheet.A3.f).not.toContain(`'${names[language][0]}'!G7`);
    expect(sheet.A3.f).toContain(`'${names[language][0]}'!G8`);
    const archive = XLSX.CFB.read(new Uint8Array(output.workbook), {
      type: "array",
    });
    const transactionXml = new TextDecoder().decode(
      Uint8Array.from(
        XLSX.CFB.find(archive, "/xl/worksheets/sheet3.xml").content,
      ),
    );
    const cellStyle = (address: string) => {
      const cell = transactionXml.match(
        new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>`),
      )?.[0];
      expect(cell).toBeDefined();
      return cell?.match(/\bs="([^"]*)"/)?.[1] ?? "0";
    };
    for (const row of [2, 3]) {
      expect(cellStyle(`A${row}`)).toBe(cellStyle(`B${row}`));
      expect(cellStyle(`A${row}`)).toBe(cellStyle(`C${row}`));
      expect(sheet[`A${row}`].z).toBe(sheet[`B${row}`].z);
      expect(sheet[`A${row}`].z).toBe(sheet[`C${row}`].z);
    }
    // XLSX stores the 12.5-character width plus five pixels of cell padding.
    expect(sheet["!cols"]?.slice(0, 3).map((column) => column.width)).toEqual([
      13.21484375, 13.21484375, 13.21484375,
    ]);
    expect(sheet.M2.v).toBe(1200);
    expect(sheet.M3.v).toBe(2400);
    expect(sheet.N1).toBeUndefined();
    expect(XLSX.utils.decode_range(sheet["!ref"]!).e.c).toBe(12);
    expect(output.calculationResult.estimatedTaxMkd).toBe(360);
    expect(output.calculationResult.rows[1]).toMatchObject({
      purchaseDate: null,
      purchaseDateRange: { earliest: "2025-01-02", latest: "2025-01-05" },
      daysHeldRange: { min: 6, max: 9 },
      holdingExempt: false,
    });
  },
);

it.each([
  ["2023-01-11", false],
  ["2023-01-10", false],
  ["2023-01-09", true],
  [" 2020-01-01 ", true],
] as const)(
  "propagates stock holding exemption from an explicit %s purchase date",
  async (purchaseDate, exempt) => {
    const csvText = sample
      .split(/\r?\n/)
      .map((line) => {
        if (line.startsWith("Trades,Header,")) return `${line},Code,Open Date`;
        if (line.startsWith("Trades,Data,Order,"))
          return `${line},C,${line.includes("GAIN,2025-01-10") ? purchaseDate : ""}`;
        return line;
      })
      .join("\n");
    const output = await generate(csvText);
    const transactions = output.book.Sheets["Realized Transactions"];
    expect(transactions.A2.v).toBe(purchaseDate.trim());
    expect(transactions.A2.f).toContain("'Original Statement'!Q6");
    expect(transactions.B2.v).toBe("2025-01-10");
    expect(transactions.D2.v).toBe("GAIN");
    expect(transactions.J2.v).toBe(25);
    expect(transactions.M2.v).toBe(1500);
    expect(output.book.Sheets.Calculation.C2.f).toContain("EDATE");
    expect(output.calculationResult.rows[0].holdingExempt).toBe(exempt);
    expect(output.book.Sheets.Summary.B3.v).toBe(exempt ? 300 : 1800);
    expect(output.calculationResult.estimatedTaxMkd).toBe(exempt ? 90 : 240);
    expect(
      explainMonthlyGroups(output.calculationResult, "2025-01")[0].taxableMkd,
    ).toBe(exempt ? 0 : 1500);
  },
);

it("exempts stock gains and losses without changing same-symbol options or dividends", async () => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    "Trades,Header,DataDiscriminator,AssetCategory,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code,Open Date",
    `${trade("SYN", "2025-01-10", 25)},C,2020-01-01`,
    `${trade("SYN", "2025-01-11", -5)},C,2020-01-01`,
    `${trade("SYN 01FEB25 100 C", "2025-01-10", 2, "Equity and Index Options")},C,2020-01-01`,
    'Dividends,Data,USD,2025-01-10,"SYN (Ordinary Dividend)",3',
    "Interest,Data,USD,2025-01-31,USD credit interest,1",
  ].join("\n");
  const output = await generate(csvText);
  expect(output.calculationResult.realizedMkd).toBe(1320);
  expect(output.calculationResult.taxableIncomeMkd).toBe(360);
  expect(output.calculationResult.estimatedTaxMkd).toBe(36);
  expect(rows(output.book.Sheets.Calculation).slice(1)).toEqual([
    ["2025-01", "SYN", 300],
    ["2025-01", "Interest", 60],
  ]);
  expect(
    output.calculationResult.rows.find(
      (row) => row.assetCategory === "Equity and Index Options",
    ),
  ).toMatchObject({ holdingExempt: false, taxableMkdResult: 120 });
});

it.each(["en", "mk"] as const)(
  "uses matched ClosedLot dates and shifted source columns in %s",
  async (language) => {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
      "Trades,Data,Order,Stocks,USD,SYN,2025-01-10,-,-3,140,140,420,0,-330,90,0,C",
      "Trades,Data,Trade,Stocks,USD,SYN,2025-01-10,NASDAQ,-3,140,140,420,0,-330,90,0,C",
      "Trades,Data,ClosedLot,Stocks,USD,SYN,2023-01-09,,1,80,,,,80,60,,LT",
      "Trades,Data,ClosedLot,Stocks,USD,SYN,2023-01-10,,1,110,,,,110,30,,LT",
      "Trades,Data,ClosedLot,Stocks,USD,SYN,2024-07-10,,1,140,,,,140,0,,ST",
    ].join("\n");
    const output = await generate(csvText, language);
    const result = output.calculationResult;
    const sheet = output.book.Sheets[names[language][2]];
    expect(result.transactionCount).toBe(1);
    expect(result.realizedUsd).toBe(90);
    expect(result.rows[0]).toMatchObject({
      purchaseDateRange: { earliest: "2023-01-09", latest: "2024-07-10" },
      holdingExempt: false,
      taxableMkdResult: 1800,
      lots: [
        { purchaseDate: "2023-01-09", holdingExempt: true },
        { purchaseDate: "2023-01-10", holdingExempt: false },
        { purchaseDate: "2024-07-10", holdingExempt: false },
      ],
    });
    expect(result.estimatedTaxMkd).toBe(180);
    expect(explainMonthlyGroups(result, "2025-01")[0].taxableMkd).toBe(1800);
    const original = `'${names[language][0]}'!`;
    expect(sheet.F2).toMatchObject({ f: `=ABS(VALUE(${original}I3))`, v: 3 });
    expect(sheet.G2).toMatchObject({ f: `=ABS(VALUE(${original}N3))`, v: 330 });
    expect(sheet.H2).toMatchObject({ f: `=VALUE(${original}J3)`, v: 140 });
    expect(sheet.I2).toMatchObject({ f: `=VALUE(${original}L3)`, v: 420 });
    expect(sheet.J2).toMatchObject({ f: `=VALUE(${original}O3)`, v: 90 });
    expect(sheet.M2.v).toBe(5400);
    expect(sheet.A2.v).toBe("2024-07-10");
    expect(sheet.A2.f).not.toContain(`${original}G5`);
    expect(sheet.A2.f).toContain(`${original}G7`);
    expect(sheet.B2.v).toBe("2025-01-10");
    const calculation = output.book.Sheets[names[language][3]];
    expect(calculation.C2.v).toBe(1800);
    expect(calculation.C2.f).toContain(`${original}O5`);
    expect(calculation.C2.f).toContain(`${original}O6`);
    expect(calculation.C2.f).toContain(`${original}G5`);
    expect(calculation.C2.f).toContain(`${original}G6`);
    expect(calculation.C2.f).toContain(`${original}G7`);
    expect(calculation.C2.f).toContain("EDATE");
  },
);

it("excludes an older lot's loss while retaining a taxable lot's gain and parses US purchase dates", async () => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
    "Trades,Data,Order,Stocks,USD,SYN,2025-01-10,-,-2,60,60,120,0,-120,0,0,C",
    "Trades,Data,Trade,Stocks,USD,SYN,2025-01-10,NASDAQ,-1,60,60,60,0,-80,-20,0,C",
    "Trades,Data,ClosedLot,Stocks,USD,SYN,1/9/2023,,1,80,,,,80,-20,,LT",
    "Trades,Data,Trade,Stocks,USD,SYN,2025-01-10,NASDAQ,-1,60,60,60,0,-40,20,0,C",
    "Trades,Data,ClosedLot,Stocks,USD,SYN,11/12/2024,,1,40,,,,40,20,,ST",
  ].join("\n");
  const output = await generate(csvText);
  expect(output.calculationResult.rows[0]).toMatchObject({
    usdResult: 0,
    taxableMkdResult: 1200,
    daysHeldRange: { min: 59, max: 732 },
  });
  expect(output.calculationResult.estimatedTaxMkd).toBe(120);
  expect(output.book.Sheets["Realized Transactions"].A2.v).toBe("2024-11-12");
  expect(output.book.Sheets["Realized Transactions"].A2.f).toContain(
    "DATE(RIGHT(",
  );
  expect(output.book.Sheets.Calculation.C2.f).toContain("DATE(RIGHT(");
});

it.each(["2020-01-03", "1/3/2020"])(
  "shows one ISO purchase date for repeated %s lots and retains the exempt sale",
  async (purchaseDate) => {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
      "Trades,Data,Order,Stocks,USD,SYN,2025-01-10,-,-2,75,75,150,0,-100,50,0,C",
      `Trades,Data,ClosedLot,Stocks,USD,SYN,${purchaseDate},,1,50,,,,50,25,,LT`,
      `Trades,Data,ClosedLot,Stocks,USD,SYN,${purchaseDate},,1,50,,,,50,25,,LT`,
    ].join("\n");
    for (const language of ["en", "mk"] as const) {
      const output = await generate(csvText, language);
      const sheet = output.book.Sheets[names[language][2]];
      expect(sheet.A2.v).toBe("2020-01-03");
      expect(sheet.A2.f).toMatch(new RegExp(`'${names[language][0]}'!G[45]`));
      expect(sheet.B2.v).toBe("2025-01-10");
      expect(sheet.D2.v).toBe("SYN");
      expect(sheet.F2.v).toBe(2);
      expect(sheet.J2.v).toBe(50);
      expect(sheet.M2.v).toBe(3000);
      expect(output.calculationResult.transactionCount).toBe(1);
      expect(output.calculationResult.rows[0]).toMatchObject({
        holdingExempt: true,
        taxableMkdResult: 0,
      });
      expect(output.calculationResult.estimatedTaxMkd).toBe(0);
      const calculation = output.book.Sheets[names[language][3]];
      expect(calculation.C2.v).toBe(0);
      expect(calculation.C2.f).toContain(`'${names[language][0]}'!G4`);
      expect(calculation.C2.f).toContain("EDATE");
    }
  },
);

it.each(["en", "mk"] as const)(
  "shows an option lot's purchase date without applying the stock exemption in %s",
  async (language) => {
    const csvText = [
      'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
      "Trades,Data,Order,Equity and Index Options,USD,SYN 17JAN25 50 C,2025-01-10,-,-1,1.25,1.25,125,0,-100,25,0,C",
      "Trades,Data,ClosedLot,Equity and Index Options,USD,SYN 17JAN25 50 C,1/3/2020,,1,1,,,,100,25,,LT",
    ].join("\n");
    const output = await generate(csvText, language);
    const sheet = output.book.Sheets[names[language][2]];
    expect(sheet.A2.v).toBe("2020-01-03");
    expect(sheet.B2.v).toBe("2025-01-10");
    expect(sheet.E2.v).toBe(
      language === "mk" ? "Опции" : "Equity and Index Options",
    );
    expect(sheet.J2.v).toBe(25);
    expect(sheet.M2.v).toBe(1500);
    expect(output.calculationResult.rows[0]).toMatchObject({
      holdingExempt: false,
      taxableMkdResult: 1500,
    });
    expect(output.calculationResult.estimatedTaxMkd).toBe(150);
  },
);

it("keeps large mixed-lot sales within Excel formula limits", async () => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
    "Trades,Data,Order,Stocks,USD,SYN,2025-01-10,-,-100,100,100,10000,0,-9000,1000,0,C",
    ...Array.from(
      { length: 100 },
      (_, index) =>
        `Trades,Data,ClosedLot,Stocks,USD,SYN,${index % 2 ? "1/10/2023" : "1/9/2023"},,1,90,,,,90,10,,LT`,
    ),
  ].join("\n");
  for (const language of ["en", "mk"] as const) {
    const output = await generate(csvText, language);
    expect(output.calculationResult.estimatedTaxMkd).toBe(3000);
    const calculation = output.book.Sheets[names[language][3]];
    expect(calculation.C2.v).toBe(30000);
    expect(calculation["!rows"]?.some((row) => row?.hidden)).toBe(true);
    expect(output.book.Sheets[names[language][4]].B3.f).toContain("$C$2:$C$2");
    for (const sheet of Object.values(output.book.Sheets))
      for (const cell of Object.values(sheet))
        if (cell && typeof cell === "object" && "f" in cell)
          expect(cell.f.length).toBeLessThanOrEqual(8192);
  }
});

it("normalizes older income dates and nets signed withholding refunds without reducing gross tax", async () => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    'Dividends,Data,USD,1/10/2025,"SYN (Ordinary Dividend)",10',
    'Withholding Tax,Data,USD,1/10/2025,"SYN (Ordinary Dividend) - NL Tax",-3',
    'Withholding Tax,Data,USD,1/10/2025,"SYN (Ordinary Dividend) - NL Tax",1',
    "Interest,Data,USD,1/11/2025,USD credit interest,1",
  ].join("\n");
  const output = await generate(csvText);
  expect(output.calculationResult.dividends[0]).toMatchObject({
    date: "2025-01-10",
    grossUsd: 10,
    withholdingUsd: 2,
    netUsd: 8,
  });
  expect(output.calculationResult.estimatedTaxMkd).toBe(66);
  const transactions = output.book.Sheets["Realized Transactions"];
  expect(transactions.A2.v).toBe("");
  expect(transactions.A3.v).toBe("");
  expect(transactions.B2.v).toBe("2025-01-10");
  expect(transactions.B2.f).toContain("TEXT(DATE(RIGHT(");
  expect(transactions.B3.v).toBe("2025-01-11");
  expect(transactions.B3.f).toContain("TEXT(DATE(RIGHT(");
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

it("retains zero months in Summary without inserting absent Interest groups", async () => {
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
    ["2025-02", "SYN", 120],
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
