import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { calculateTaxWorkbook } from "./taxWorkbook.mjs";
import { explainMonthlyGroups } from "./reportGroups";

it("explains saved monthly bases consistently with Excel across option formats, dividends and separate interest", async () => {
  const csvText = [
    readFileSync(new URL("../public/sample-ibkr.csv", import.meta.url), "utf8"),
    "Trades,Data,Order,Equity and Index Options,USD,GAIN 01FEB25 100 C,2025-01-10,-1,0,0,0,0,0,-10,0",
    "Trades,Data,Order,Equity and Index Options,USD,GAIN 250201C00010000,2025-01-10,-1,0,0,0,0,0,2,0",
    "Trades,Data,Order,Equity and Index Options,USD,UNMAPPED,2025-01-10,-1,0,0,0,0,0,-4,0",
    'Dividends,Data,USD,2025-01-10,"GAIN (Ordinary Dividend)",2',
    "Interest,Data,USD,2025-01-30,USD debit interest,-2",
  ].join("\n");
  const exchangeRates = Array.from({ length: 59 }, (_, index) => ({
    requestedDate: new Date(Date.UTC(2025, 0, index + 1))
      .toISOString()
      .slice(0, 10),
    effectiveDate: new Date(Date.UTC(2025, 0, index))
      .toISOString()
      .slice(0, 10),
    mkdPerUsd: 60,
  }));
  const { calculationResult } = await calculateTaxWorkbook({
    csvText,
    exchangeRates,
    exchangeRatesApi: "/unused",
  });
  const january = explainMonthlyGroups(calculationResult, "2025-01");
  expect(january.find((group) => group.symbol === "GAIN")).toMatchObject({
    stocksMkd: 1_500,
    optionsMkd: -480,
    dividendsMkd: 120,
    taxableMkd: 1_140,
  });
  expect(january.find((group) => group.symbol === "UNMAPPED")?.taxableMkd).toBe(
    0,
  );
  for (const month of calculationResult.monthlySummary) {
    const groups = explainMonthlyGroups(calculationResult, month.month);
    const explainedBase =
      groups.reduce((sum, group) => sum + group.taxableMkd, 0) +
      Math.max(month.interestMkd, 0);
    expect(explainedBase).toBeCloseTo(month.taxablePnlMkd, 8);
    expect(explainedBase * 0.1).toBeCloseTo(month.taxMkd, 8);
  }
  expect(
    explainMonthlyGroups(calculationResult, "2025-02").find(
      (group) => group.symbol === "LOSS",
    )?.taxableMkd,
  ).toBe(0);
  expect(
    explainMonthlyGroups(calculationResult, "2025-02").find(
      (group) => group.symbol === "SYN",
    )?.taxableMkd,
  ).toBe(600);
});
