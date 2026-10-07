import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import XLSX from "xlsx-js-style";
import { calculateTaxWorkbook } from "../src/taxWorkbook.mjs";

const base = process.env.SMOKE_APP_URL ?? "http://localhost:8188";
const input = process.env.PRIVATE_STATEMENT_PATH;
if (!input)
  throw new Error(
    "Set PRIVATE_STATEMENT_PATH to a local CSV. The file is never sent to a server.",
  );
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [],
    serviceRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/")) serviceRequests.push(request);
  });
  await page.goto(base);
  await page.getByLabel("IBKR statement CSV").setInputFiles(input);
  await page
    .getByRole("heading", { name: "Your records are ready to review." })
    .waitFor();
  await page
    .getByLabel("Have a test access code?")
    .fill(process.env.SMOKE_TEST_CODE ?? "LOCAL-TEST-CODE");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await page.getByText(/Test credits are available/).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Unlock report/ }).click();
  await page
    .getByRole("heading", { name: "Your investment tax report" })
    .waitFor({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Excel/ }).click();
  const download = await downloadPromise;
  const outputDir = path.resolve("../Excel");
  mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, "verified-built-app-export.xlsx");
  await download.saveAs(output);
  const book = XLSX.read(readFileSync(output), { cellStyles: true });
  assert.deepEqual(book.SheetNames, [
    "Activity Statement",
    "Conversion Rates",
    "Calculation",
    "Summary",
  ]);
  const rateRequest = serviceRequests.find((request) =>
    request.url().includes("/tax/exchange-rates"),
  );
  assert.ok(rateRequest);
  const response = await fetch(rateRequest.url());
  assert.ok(response.ok);
  const rates = await response.json();
  const original = await calculateTaxWorkbook({
    csvText: readFileSync(input, "utf8").replace(/^\uFEFF/, ""),
    exchangeRates: rates,
    exchangeRatesApi: "unused",
    language: "en",
  });
  const originalBook = XLSX.read(original.workbook, { cellStyles: true });
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const name of book.SheetNames)
    assert.equal(
      hash(book.Sheets[name]),
      hash(originalBook.Sheets[name]),
      `Workbook sheet differs: ${name}`,
    );
  const expected = book.SheetNames.flatMap((sheet) =>
    Object.entries(book.Sheets[sheet])
      .filter(
        ([address, cell]) =>
          !address.startsWith("!") && cell.f && typeof cell.v === "number",
      )
      .map(([address, cell]) => ({ sheet, address, value: cell.v })),
  );
  writeFileSync(
    path.join(outputDir, "private-excel-check.json"),
    JSON.stringify(expected),
  );
  assert.equal(
    serviceRequests.filter((request) =>
      request.url().endsWith("/reports/consume"),
    ).length,
    1,
  );
  for (const request of serviceRequests) {
    assert.ok(!request.postData()?.includes("Trades,"));
    assert.ok(!request.url().includes(path.basename(input)));
  }
  await page.reload();
  await page.getByRole("button", { name: /My reports/ }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your investment tax report" })
    .waitFor();
  assert.equal(
    serviceRequests.filter((request) =>
      request.url().endsWith("/reports/consume"),
    ).length,
    1,
  );
  assert.deepEqual(errors, []);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.join(outputDir, "verified-filing-summary.pdf"),
    format: "A4",
    preferCSSPageSize: true,
  });
  console.log(
    "Built app smoke passed: private CSV, live rates, real credit debit, unchanged workbook cells, reload/re-download, and no CSV in API requests.",
  );
} finally {
  await browser.close();
}
