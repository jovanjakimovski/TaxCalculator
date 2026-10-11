import { expect, test } from "@playwright/test";
import {
  expectSampleWorkbook,
  exportWorkbook,
  mockRates,
  uploadStatement,
  useEnglish,
} from "./beginnerSupport";

test("development deployment runs the same free upload, calculate and export flow", async ({
  page,
  context,
}) => {
  const serviceRequests: string[] = [];
  const errors: string[] = [];
  await useEnglish(context);
  await context.route("**/api/license/**", (route) => route.abort());
  if (process.env.E2E_LIVE_RATES !== "true") await mockRates(context);
  context.on("request", (request) => {
    if (request.url().includes("/api/")) serviceRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Log in|Unlock|Redeem/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await uploadStatement(page);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  const workbook = await exportWorkbook(page);
  if (process.env.E2E_LIVE_RATES !== "true") expectSampleWorkbook(workbook);
  else {
    expect(workbook.SheetNames).toEqual([
      "Original Statement",
      "Exchange Rate List",
      "Realized Transactions",
      "Calculation",
      "Summary",
    ]);
    expect(workbook.Sheets.Summary.C5.v).toBeGreaterThan(0);
    expect(workbook.Sheets.Summary.C5.f).toBe("=ROUNDUP(SUM(C3:C4),0)");
  }
  expect(serviceRequests).toHaveLength(1);
  expect(serviceRequests[0]).toContain("/api/tax/exchange-rates?");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
