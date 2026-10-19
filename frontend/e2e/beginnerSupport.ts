import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";

export const sampleStatement = readFileSync(
  path.resolve("public/sample-ibkr.csv"),
  "utf8",
);

export const sampleRates = Array.from({ length: 59 }, (_, index) => ({
  requestedDate: new Date(Date.UTC(2025, 0, index + 1))
    .toISOString()
    .slice(0, 10),
  effectiveDate: new Date(Date.UTC(2025, 0, index)).toISOString().slice(0, 10),
  mkdPerUsd: 60,
}));

export async function useEnglish(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem("taxcalculator.language", "en");
  });
}

export async function mockRates(context: BrowserContext) {
  await context.route("**/api/tax/exchange-rates?*", (route) =>
    route.fulfill({ json: sampleRates }),
  );
}

export async function uploadStatement(
  page: Page,
  csvText = sampleStatement,
  name = "private-statement.csv",
) {
  await page.getByLabel("IBKR Activity Statement CSV").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csvText),
  });
}

export async function exportWorkbook(page: Page, name = "Export Excel") {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  return XLSX.read(readFileSync(downloadPath!), { type: "buffer" });
}

export function expectSampleWorkbook(
  workbook: XLSX.WorkBook,
  language: "en" | "mk" = "en",
) {
  const names =
    language === "en"
      ? [
          "Original Statement",
          "Exchange Rate List",
          "Realized Transactions",
          "Calculation",
          "Summary",
        ]
      : [
          "Оригинален Извештај",
          "Курсна Листа",
          "Реализирани трансакции",
          "Пресметка",
          "Резиме",
        ];
  expect(workbook.SheetNames).toEqual(names);
  const summary = workbook.Sheets[names[4]];
  const calculation = workbook.Sheets[names[3]];
  expect(XLSX.utils.decode_range(summary["!ref"]!).e.c).toBe(2);
  expect(XLSX.utils.decode_range(calculation["!ref"]!).e.c).toBe(2);
  expect([summary.A2.v, summary.B2.v, summary.C2.v]).toEqual(
    language === "en"
      ? ["Month", "Total", "Tax"]
      : ["Месец", "Вкупно", "Данок"],
  );
  expect([summary.A3.v, summary.B3.v, summary.C3.v]).toEqual([
    "2025-01",
    1800,
    180,
  ]);
  expect([summary.A4.v, summary.B4.v, summary.C4.v]).toEqual([
    "2025-02",
    600,
    60,
  ]);
  expect(summary.C5.v).toBe(240);
  expect(summary.C5.f).toBe("=ROUNDUP(SUM(C3:C4),0)");
  expect(summary.C3.f).toBeTruthy();
  expect(calculation.C2.f).toBeTruthy();
  const transactions = workbook.Sheets[names[2]];
  expect(transactions.A1.v).toBe(
    language === "mk" ? "ДАТУМ НА КУПУВАЊЕ" : "PURCHASE DATE",
  );
  expect(transactions.B1.v).toBe(
    language === "mk" ? "ДАТУМ НА ПРОДАЖБА" : "SALE DATE",
  );
  expect(transactions.A2.v).toBe("");
  expect(transactions.B2.v).toBe("2025-01-10");
  expect(transactions.M2.v).toBe(1500);
  expect(XLSX.utils.decode_range(transactions["!ref"]!).e.c).toBe(12);
}
