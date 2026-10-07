import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";

const csv = readFileSync(path.resolve("public/sample-ibkr.csv"), "utf8");

test("generates, exports and reopens a report without any license service", async ({
  page,
  context,
}) => {
  const licenseRequests: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) => {
    if (request.url().includes("/api/license/"))
      licenseRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/api/license/**", (route) =>
    route.fulfill({ status: 503 }),
  );
  if (process.env.E2E_LIVE_RATES !== "true") {
    await context.route("**/api/tax/exchange-rates?*", (route) =>
      route.fulfill({
        json: Array.from({ length: 59 }, (_, i) => ({
          requestedDate: new Date(Date.UTC(2025, 0, i + 1))
            .toISOString()
            .slice(0, 10),
          effectiveDate: new Date(Date.UTC(2025, 0, i))
            .toISOString()
            .slice(0, 10),
          mkdPerUsd: 60,
        })),
      }),
    );
  }
  await page.goto("/");
  await expect(
    page.getByText("Development workspace", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Have a test access code?")).toHaveCount(0);
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "free-dev-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const generate = page.getByRole("button", { name: /Generate report/ });
  await expect(generate).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Excel/ }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const workbook = XLSX.read(readFileSync(downloadPath!), { type: "buffer" });
  expect(workbook.SheetNames).toEqual([
    "Activity Statement",
    "Conversion Rates",
    "Calculation",
    "Summary",
  ]);
  await page.reload();
  await page.getByRole("button", { name: /My reports/ }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(licenseRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("keeps unsupported statements blocked in the free dev profile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "eur.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv.replaceAll("USD", "EUR")),
  });
  await expect(
    page.getByRole("heading", { name: "Your statement needs attention." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Generate report/ }),
  ).toHaveCount(0);
});
