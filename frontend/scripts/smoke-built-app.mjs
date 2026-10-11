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
const csvText = readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const suppliedRates = process.env.SMOKE_RATE_DATA_PATH
  ? JSON.parse(readFileSync(process.env.SMOKE_RATE_DATA_PATH, "utf8"))
  : undefined;
const outputDir = path.resolve("../Excel");
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  const serviceRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/")) serviceRequests.push(request);
  });
  await page.addInitScript(() => {
    localStorage.setItem("taxcalculator.language", "en");
  });
  if (suppliedRates)
    await page.route("**/api/tax/exchange-rates?*", (route) =>
      route.fulfill({ json: suppliedRates }),
    );
  await page.goto(base);
  assert.equal(
    await page.getByRole("button", { name: /Log in|Unlock|Redeem/ }).count(),
    0,
  );
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await page.getByLabel("IBKR Activity Statement CSV").setInputFiles(input);
  const rateResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/tax/exchange-rates?"),
  );
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  const rateResponse = await rateResponsePromise;
  assert.ok(rateResponse.ok(), "Exchange rates could not be loaded");
  const rates = await rateResponse.json();
  await page.getByRole("heading", { name: "Results", exact: true }).waitFor({
    timeout: 120_000,
  });

  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  let englishBook;
  for (const language of ["en", "mk"]) {
    await page.getByLabel("Excel document language").selectOption(language);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Excel", exact: true })
      .click();
    const download = await downloadPromise;
    const output = path.join(
      outputDir,
      language === "en"
        ? "verified-built-app-export.xlsx"
        : "verified-built-app-export-mk.xlsx",
    );
    await download.saveAs(output);
    const book = XLSX.read(readFileSync(output), { cellStyles: true });
    const original = await calculateTaxWorkbook({
      csvText,
      exchangeRates: rates,
      exchangeRatesApi: "unused",
      language,
    });
    const originalBook = XLSX.read(original.workbook, { cellStyles: true });
    assert.deepEqual(book.SheetNames, originalBook.SheetNames);
    assert.equal(book.SheetNames.length, 5);
    for (const name of book.SheetNames)
      assert.equal(
        hash(book.Sheets[name]),
        hash(originalBook.Sheets[name]),
        `Workbook sheet differs: ${name}`,
      );
    const summary = book.Sheets[book.SheetNames[4]];
    const calculation = book.Sheets[book.SheetNames[3]];
    assert.equal(XLSX.utils.decode_range(summary["!ref"]).e.c, 2);
    assert.equal(XLSX.utils.decode_range(calculation["!ref"]).e.c, 2);
    const finalRow = XLSX.utils.decode_range(summary["!ref"]).e.r + 1;
    assert.equal(
      summary[`C${finalRow}`].v,
      original.calculationResult.estimatedTaxMkd,
    );
    if (language === "en") englishBook = book;
  }

  const expected = englishBook.SheetNames.flatMap((sheet) =>
    Object.entries(englishBook.Sheets[sheet])
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
  assert.equal(serviceRequests.length, 1);
  for (const request of serviceRequests) {
    assert.ok(request.url().includes("/api/tax/exchange-rates?"));
    assert.equal(request.method(), "GET");
    assert.equal(request.postData(), null);
    assert.ok(!request.url().includes(path.basename(input)));
  }
  assert.deepEqual(errors, []);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.join(outputDir, "verified-filing-summary.pdf"),
    format: "A4",
    preferCSSPageSize: true,
  });
  console.log(
    `Built app smoke passed: one-click free calculation, private local CSV, ${suppliedRates ? "supplied" : "live"} rates, matching English and Macedonian workbook cells, and no license or CSV-upload requests.`,
  );
} finally {
  await browser.close();
}
