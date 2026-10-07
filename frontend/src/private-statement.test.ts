import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { inspectStatement } from "./statement";
import { calculateTaxWorkbook } from "./taxWorkbook.mjs";
import XLSX from "xlsx-js-style";
// Opt-in only: never copy a private statement into fixtures or log its contents.
it.skipIf(!process.env.PRIVATE_STATEMENT_PATH)(
  "validates the private statement against live rate service",
  async () => {
    const csvText = readFileSync(process.env.PRIVATE_STATEMENT_PATH!, "utf8");
    const preview = inspectStatement(csvText);
    expect(preview.errors).toEqual([]);
    const response = await fetch(
      `${process.env.PRIVATE_RATE_API ?? "http://localhost:8188/api/tax/exchange-rates"}?${new URLSearchParams({ startDate: preview.start, endDate: preview.end, rateOffsetDays: "1" })}`,
      { signal: AbortSignal.timeout(45_000) },
    );
    expect(response.ok).toBe(true);
    const rates = await response.json();
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) {
      expect(rate.mkdPerUsd).toBeGreaterThan(0);
      expect(rate.effectiveDate < rate.requestedDate).toBe(true);
    }
    const output = await calculateTaxWorkbook({
      csvText,
      exchangeRates: rates,
      exchangeRatesApi: "/unused",
    });
    expect(output.calculationResult.estimatedTaxMkd).toBeGreaterThanOrEqual(0);
    expect(output.calculationResult.transactionCount).toBe(
      preview.stocks + preview.options,
    );
    const book = XLSX.read(output.workbook);
    expect(book.SheetNames).toEqual([
      "Activity Statement",
      "Conversion Rates",
      "Calculation",
      "Summary",
    ]);
    expect(output.calculationResult.monthlySummary.length).toBe(12);
    for (const name of book.SheetNames)
      for (const cell of Object.values(book.Sheets[name])) {
        if (
          cell &&
          typeof cell === "object" &&
          "f" in cell &&
          typeof cell.f === "string"
        )
          expect(cell.f.length).toBeLessThanOrEqual(8192);
      }
    if (process.env.PRIVATE_EXPORT_PATH)
      writeFileSync(
        process.env.PRIVATE_EXPORT_PATH,
        new Uint8Array(output.workbook),
      );
  },
  60_000,
);
