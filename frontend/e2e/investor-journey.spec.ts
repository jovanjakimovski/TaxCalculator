import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/license/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.endsWith("/config")) {
      await route.fulfill({
        json: {
          accountMode: false,
          testCodeEnabled: false,
          checkoutEnabled: false,
          packages: [],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        credits: 0,
        accountMode: false,
        testCodeEnabled: false,
        checkoutEnabled: false,
      },
    });
  });
});

test("an IBKR investor can identify support and find the export instructions", async ({
  page,
}, testInfo) => {
  let consumes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your IBKR portfolio. Your Macedonian taxes.",
    }),
  ).toBeVisible();
  const platform = page.getByRole("combobox", { name: "Broker platform" });
  await expect(platform).toHaveValue("ibkr");
  await expect(
    platform.getByRole("option", { name: "Interactive Brokers (IBKR)" }),
  ).toHaveAttribute("value", "ibkr");
  await expect(
    platform.getByRole("option", { name: "Other platforms · coming later" }),
  ).toHaveJSProperty("disabled", true);
  await expect(page.getByRole("button", { name: /Choose CSV/ })).toBeEnabled();

  await page.getByRole("button", { name: /How to export from IBKR/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Export your IBKR statement" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Activity");
  await expect(dialog).toContainText("CSV");
  await expect(dialog).toContainText("USD");
  const documentation = dialog.getByRole("link").filter({ hasText: /IBKR/ });
  await expect(documentation).toHaveAttribute(
    "href",
    /^https:\/\/(?:www\.)?(?:ibkrguides|interactivebrokers)\./,
  );
  await page.screenshot({
    path: testInfo.outputPath("ibkr-export-guide.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(consumes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("calculation guidance is available before upload or purchase", async ({
  page,
}, testInfo) => {
  let consumes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Explore the calculation/ }).click();
  await expect(
    page.getByRole("heading", { name: "How your tax estimate is calculated" }),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).toContainText("10%");
  await expect(main).toContainText(/same month/);
  await expect(main).toContainText(/underlying/);
  await expect(main).toContainText(/net interest/i);
  await expect(main).toContainText(/previous.day/i);
  await expect(main).toContainText(/round/i);
  await expect(main).toContainText(/withholding/i);
  await expect(main).toContainText(/UJP/);
  const scenario = page.getByRole("combobox", {
    name: "Where does the option loss occur?",
  });
  const result = page.locator(".guide-example-result");
  await expect(result.getByText("4,000 MKD", { exact: true })).toBeVisible();
  await expect(result.getByText("400 MKD", { exact: true })).toBeVisible();
  await scenario.selectOption("other");
  await expect(result.getByText("6,500 MKD", { exact: true })).toBeVisible();
  await expect(result.getByText("650 MKD", { exact: true })).toBeVisible();
  await expect(page.getByText(/Its loss does not reduce AAPL/)).toBeVisible();
  await scenario.selectOption("later");
  await expect(result.getByText("6,500 MKD", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Losses do not transfer between months/),
  ).toBeVisible();

  await page
    .locator("summary")
    .filter({ hasText: "How does a USD amount become MKD?" })
    .click();
  await expect(
    page.locator(".guide-equation").getByText("6,648.00 MKD", { exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({
      hasText: "How are dividends, withholding, and interest treated?",
    })
    .click();
  await expect(
    page.getByText(/Withholding does not reduce the gross dividend/),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "How do the monthly amounts become the final total?" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Read the free sample: why its estimate is 240 MKD",
    }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "What do I download, and how do I use it for UJP?" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Excel: the full calculation record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PDF: a readable filing summary" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("calculation-guide.png"),
    fullPage: true,
  });
  expect(consumes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the sample explains its monthly bases and keeps report guidance beside the figures", async ({
  page,
}, testInfo) => {
  let consumes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/reports/consume")) consumes++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Just exploring/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  await expect(page.locator("#overview")).toContainText("240");
  const monthly = page.locator("#monthly");
  await expect(monthly.getByRole("table")).toContainText("Jan 2025");
  await expect(monthly.getByRole("table")).toContainText("Feb 2025");
  await expect(
    monthly.getByRole("row").filter({ hasText: "Jan 2025" }),
  ).toContainText("180.00");
  await expect(
    monthly.getByRole("row").filter({ hasText: "Feb 2025" }),
  ).toContainText("60.00");
  await expect(monthly).toContainText(/underlying symbol/);
  await expect(page.locator("#income")).toContainText(/gross/i);
  await expect(page.locator("#income")).toContainText(/net interest/i);
  await expect(page.locator("#rates")).toContainText(/previous.day/);
  await expect(page.locator("#rates")).toContainText(/illustrative/i);
  await expect(page.locator("#notes")).toContainText(
    /not an official UJP form/,
  );
  await monthly
    .locator("summary")
    .filter({ hasText: "See how monthly offsets work in your report" })
    .click();
  const audit = monthly.getByRole("region", {
    name: "Monthly underlying-symbol groups in MKD",
  });
  await expect(
    audit.getByRole("row").filter({ hasText: "GAIN" }),
  ).toContainText("1,500.00");
  await monthly
    .getByRole("combobox", { name: "Inspect a month" })
    .selectOption("2025-02");
  const loss = audit.getByRole("row").filter({ hasText: "LOSS" });
  await expect(loss).toContainText("-2,400.00");
  await expect(loss.getByRole("cell").nth(5)).toHaveText("0.00");
  await expect(loss.getByRole("cell").nth(6)).toHaveText("0.00");
  const dividend = audit.getByRole("row").filter({ hasText: "SYN" });
  await expect(dividend.getByRole("cell").nth(5)).toHaveText("600.00");
  await expect(dividend.getByRole("cell").nth(6)).toHaveText("60.00");
  await expect(
    page.getByRole("button", { name: /Download Excel/ }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: /Print/ })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("explained-sample.png"),
    fullPage: true,
  });
  expect(consumes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
