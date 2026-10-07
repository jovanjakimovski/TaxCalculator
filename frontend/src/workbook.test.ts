import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import XLSX from "xlsx-js-style";
import { calculateTaxWorkbook } from "./taxWorkbook.mjs";
it("preserves the existing generator byte for byte", () => {
  expect(
    createHash("sha256")
      .update(readFileSync(new URL("./taxWorkbook.mjs", import.meta.url)))
      .digest("hex"),
  ).toBe("a409b8f61ce1dc9eddb767a5808452bfa92943ca240cbe27da643be58f4af93f");
});
it("keeps the current monthly offset and 10% workbook results", async () => {
  const csvText = readFileSync(
    new URL("../public/sample-ibkr.csv", import.meta.url),
    "utf8",
  );
  const exchangeRates = Array.from({ length: 59 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 0, i + 1));
    const e = new Date(Date.UTC(2025, 0, i));
    return {
      requestedDate: d.toISOString().slice(0, 10),
      effectiveDate: e.toISOString().slice(0, 10),
      mkdPerUsd: 60,
    };
  });
  const en = await calculateTaxWorkbook({
    csvText,
    exchangeRates,
    exchangeRatesApi: "/unused",
    language: "en",
  });
  const mk = await calculateTaxWorkbook({
    csvText,
    exchangeRates,
    exchangeRatesApi: "/unused",
    language: "mk",
  });
  expect(en.calculationResult).toEqual(mk.calculationResult);
  expect(en.calculationResult.estimatedTaxMkd).toBe(240);
  expect(en.calculationResult.monthlySummary.map((m) => m.taxMkd)).toEqual([
    180, 60,
  ]);
  expect(XLSX.read(en.workbook).SheetNames).toEqual([
    "Activity Statement",
    "Conversion Rates",
    "Calculation",
    "Summary",
  ]);
});
it("preserves netting interest charges within the same month", async () => {
  const csvText =
    readFileSync(
      new URL("../public/sample-ibkr.csv", import.meta.url),
      "utf8",
    ) + "\nInterest,Data,USD,2025-01-30,USD debit interest,-2";
  const exchangeRates = Array.from({ length: 59 }, (_, i) => ({
    requestedDate: new Date(Date.UTC(2025, 0, i + 1))
      .toISOString()
      .slice(0, 10),
    effectiveDate: new Date(Date.UTC(2025, 0, i)).toISOString().slice(0, 10),
    mkdPerUsd: 60,
  }));
  const output = await calculateTaxWorkbook({
    csvText,
    exchangeRates,
    exchangeRatesApi: "/unused",
  });
  expect(output.calculationResult.monthlySummary[0].interestMkd).toBe(180);
  expect(output.calculationResult.estimatedTaxMkd).toBe(228);
});
