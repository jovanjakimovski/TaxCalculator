import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
const csv = readFileSync(path.resolve("public/sample-ibkr.csv"), "utf8");
test("recovers from a temporary balance outage without reloading", async ({
  page,
}) => {
  await page.route("**/api/license/entitlement", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: /My reports/ }).click();
  await page.getByLabel("Have a test access code?").fill("LOCAL-TEST-CODE");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(page.getByText(/Test credits are available/)).toBeVisible();
  await page
    .getByRole("button", { name: "Upload statement", exact: true })
    .click();
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "recovery.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: /Unlock report/ }),
  ).toBeEnabled();
});
test.beforeEach(async ({ page }) => {
  let credits = 0;
  const used = new Set<string>();
  await page.context().route("**/api/license/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.endsWith("/config"))
      return route.fulfill({
        json: {
          accountMode: false,
          testCodeEnabled: true,
          checkoutEnabled: false,
          packages: [],
        },
      });
    if (endpoint.endsWith("/test-code")) credits = 1;
    if (endpoint.endsWith("/consume")) {
      const id = route.request().postDataJSON().requestId;
      if (!used.has(id)) {
        if (!credits)
          return route.fulfill({ status: 402, json: { error: "No credits" } });
        credits--;
        used.add(id);
      }
    }
    await route.fulfill({
      json: {
        credits,
        accountMode: false,
        testCodeEnabled: true,
        checkoutEnabled: false,
      },
    });
  });
  await page.context().route("**/api/tax/exchange-rates?*", async (route) => {
    const rates = Array.from({ length: 59 }, (_, i) => ({
      requestedDate: new Date(Date.UTC(2025, 0, i + 1))
        .toISOString()
        .slice(0, 10),
      effectiveDate: new Date(Date.UTC(2025, 0, i)).toISOString().slice(0, 10),
      mkdPerUsd: 60,
    }));
    await route.fulfill({ json: rates });
  });
});
test("sample report, language, privacy dialog, layout and print", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your IBKR portfolio/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Just exploring/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  await expect(page.getByText(/SAMPLE REPORT —/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("report.png"),
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Excel/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^SAMPLE_.*\.xlsx$/);
  await page.getByRole("button", { name: "Switch to Macedonian" }).click();
  await expect(
    page.getByRole("heading", { name: "Ваш инвестициски даночен извештај" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подготви македонски Excel" }).click();
  await expect(
    page.getByRole("button", { name: "Подготви македонски Excel" }),
  ).toHaveCount(0);
  if (testInfo.project.name === "desktop") {
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: testInfo.outputPath("summary.pdf"), format: "A4" });
  }
  expect(errors).toEqual([]);
});
test("upload, test credit, durable report and free repeat access", async ({
  page,
}) => {
  let consumes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "private-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  await page.getByLabel("Have a test access code?").fill("LOCAL-TEST-CODE");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(page.getByText(/Test credits are available/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Understand the calculation first/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "How your tax estimate is calculated" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back to your preview/ }).click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  expect(consumes).toBe(0);
  await page.getByRole("button", { name: /Unlock report/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(consumes).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: /My reports/ }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(consumes).toBe(1);
});
test("reject unsupported currency without using a credit", async ({ page }) => {
  let consumes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "eur.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv.replaceAll("USD", "EUR")),
  });
  await expect(
    page.getByRole("heading", { name: "Your statement needs attention." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Unlock report/ })).toHaveCount(
    0,
  );
  expect(consumes).toBe(0);
});
test("lost debit response recovers with original ID at zero balance", async ({
  page,
}) => {
  let requests: string[] = [];
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "pending.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByLabel("Have a test access code?").fill("LOCAL-TEST-CODE");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(page.getByText(/Test credits are available/)).toBeVisible();
  await page.route("**/api/license/reports/consume", async (route) => {
    requests.push(route.request().postDataJSON().requestId);
    if (requests.length === 1) await route.abort();
    else
      await route.fulfill({
        json: {
          credits: 0,
          accountMode: false,
          testCodeEnabled: true,
          checkoutEnabled: false,
        },
      });
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Unlock report/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /My reports/ }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(requests.length).toBe(2);
  expect(requests[0]).toBe(requests[1]);
});
test("two tabs share one debit ID even without Web Locks", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  const requests: string[] = [];
  context.on("request", (req) => {
    if (req.url().endsWith("/reports/consume"))
      requests.push(req.postDataJSON().requestId);
  });
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "shared.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByLabel("Have a test access code?").fill("LOCAL-TEST-CODE");
  await page.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(page.getByText(/Test credits are available/)).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await other.getByRole("checkbox").check();
  await Promise.all([
    page.getByRole("button", { name: /Unlock report/ }).click(),
    other.getByRole("button", { name: /Unlock report/ }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  await expect(
    other.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(new Set(requests).size).toBe(1);
});

test("refreshing zero credits discovers a report unlocked in another tab", async ({
  page,
  context,
}) => {
  let consumes = 0;
  context.on("request", (request) => {
    if (request.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "shared-at-zero.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: /Unlock report/ }),
  ).toBeDisabled();
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  await other.getByLabel("Have a test access code?").fill("LOCAL-TEST-CODE");
  await other.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(other.getByText(/Test credits are available/)).toBeVisible();
  await other.getByRole("checkbox").check();
  await other.getByRole("button", { name: /Unlock report/ }).click();
  await expect(
    other.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(consumes).toBe(1);
  await page
    .getByRole("button", { name: "Refresh credits", exact: true })
    .click();
  await page.getByRole("button", { name: /Open saved report · free/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  expect(consumes).toBe(1);
});

test("a free sample stays visible when account configuration finishes loading", async ({
  page,
}) => {
  let releaseConfig!: () => void;
  const configured = new Promise<void>((resolve) => {
    releaseConfig = resolve;
  });
  await page.route("**/api/license/config", async (route) => {
    await configured;
    await route.fulfill({
      json: {
        accountMode: false,
        testCodeEnabled: true,
        checkoutEnabled: false,
        packages: [],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Just exploring/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  const balanceLoaded = page.waitForResponse((response) =>
    response.url().endsWith("/api/license/entitlement"),
  );
  releaseConfig();
  await balanceLoaded;
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
});
