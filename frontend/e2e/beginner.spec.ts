import { expect, test } from "@playwright/test";
import {
  expectSampleWorkbook,
  exportWorkbook,
  mockRates,
  sampleRates,
  sampleStatement,
  uploadStatement,
  useEnglish,
} from "./beginnerSupport";

test.beforeEach(async ({ context }) => {
  await useEnglish(context);
  await mockRates(context);
  await context.route("**/api/license/**", (route) => route.abort());
});

test("last updated identifies the deployed build above the language selector", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const updated = page.locator(".beginner-last-updated");
  const time = updated.locator("time[datetime]");
  const language = page.locator(".beginner-ui-language");
  await expect(updated).toBeVisible();
  await expect(updated).toContainText("Last Updated:");
  await expect(time).not.toHaveText("");
  const timestamp = await time.getAttribute("datetime");
  expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(new Date(timestamp!).toISOString()).toBe(timestamp);
  const displayedTime = await time.innerText();

  await language.selectOption("mk");
  await expect(language).toHaveValue("mk");
  await expect(time).toHaveAttribute("datetime", timestamp!);
  await expect(time).toHaveText(displayedTime);
  await page.reload();
  await expect(time).toHaveAttribute("datetime", timestamp!);
  await expect(time).toHaveText(displayedTime);
  await expect(updated).toBeVisible();
  const updatedBounds = await updated.boundingBox();
  const languageBounds = await language.boundingBox();
  expect(updatedBounds).not.toBeNull();
  expect(languageBounds).not.toBeNull();
  expect(updatedBounds!.y + updatedBounds!.height).toBeLessThanOrEqual(
    languageBounds!.y,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("last-updated.png"),
    fullPage: true,
  });
});

test("upload and one click produce a free report and matching Excel", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  const serviceRequests: Array<{ url: string; body: string | null }> = [];
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("request", (request) => {
    if (request.url().includes("/api/"))
      serviceRequests.push({ url: request.url(), body: request.postData() });
  });
  await page.goto("/");
  const calculate = page.getByRole("button", {
    name: "Calculate",
    exact: true,
  });
  await expect(calculate).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Log in|Unlock|Redeem/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Expert/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("upload.png"),
    fullPage: true,
  });
  await uploadStatement(page);
  await expect(calculate).toBeEnabled();
  expect(serviceRequests).toEqual([]);
  await calculate.click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("January 2025");
  await expect(page.getByRole("table")).toContainText("February 2025");
  expectSampleWorkbook(await exportWorkbook(page));
  expect(serviceRequests).toHaveLength(1);
  expect(serviceRequests[0].url).toContain("/api/tax/exchange-rates?");
  expect(serviceRequests[0].body).toBeNull();
  expect(serviceRequests[0].url).not.toContain("private-statement.csv");
  expect(serviceRequests[0].url).not.toContain("Trades");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("results.png"),
    fullPage: true,
  });
});

test("Excel document language changes independently without fetching rates again", async ({
  page,
}) => {
  let rateRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/tax/exchange-rates?")) rateRequests++;
  });
  await page.goto("/");
  await uploadStatement(page);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Excel document language").selectOption("mk");
  expectSampleWorkbook(await exportWorkbook(page), "mk");
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Interface language").selectOption("mk");
  await expect(
    page.getByRole("heading", { name: "Резултати", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Јазик на Excel документот").selectOption("en");
  expectSampleWorkbook(await exportWorkbook(page, "Извези Excel"));
  await expect(
    page.getByRole("heading", { name: "Резултати", exact: true }),
  ).toBeVisible();
  expect(rateRequests).toBe(1);
});

for (const { period, filenamePeriod } of [
  {
    period: "January 1, 2025 - December 31, 2025",
    filenamePeriod: "2025",
  },
  {
    period: "January 1, 2025 - February 28, 2025",
    filenamePeriod: "01.01.2025-28.02.2025",
  },
  {
    period: "December 1, 2024 - February 28, 2025",
    filenamePeriod: "01.12.2024-28.02.2025",
  },
]) {
  test(`Excel filename includes the statement account and ${filenamePeriod}`, async ({
    page,
  }) => {
    const csvText = [
      "Account Information,Data,Account,U13131314",
      sampleStatement
        .replaceAll("\r\n", "\n")
        .replace("January 1, 2025 - February 28, 2025", period),
    ].join("\n");
    await page.goto("/");
    await uploadStatement(page, csvText, "U99999999.csv");
    await page.getByRole("button", { name: "Calculate", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Results", exact: true }),
    ).toBeVisible();

    for (const language of ["en", "mk"]) {
      await page.getByLabel("Excel document language").selectOption(language);
      const downloaded = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export Excel", exact: true })
        .click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe(
        `Tax_Report_U13131314_${filenamePeriod}_${language}.xlsx`,
      );
    }
  });
}

test("lot-detail statements exempt only older shares in the exported report", async ({
  page,
}) => {
  const csvText = [
    'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
    "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
    "Trades,Data,Order,Stocks,USD,SYN,2025-01-10,-,-2,60,60,120,0,-120,0,0,C",
    "Trades,Data,Trade,Stocks,USD,SYN,2025-01-10,NASDAQ,-2,60,60,120,0,-120,0,0,C",
    "Trades,Data,ClosedLot,Stocks,USD,SYN,1/9/2023,,1,80,,,,80,-20,,LT",
    "Trades,Data,ClosedLot,Stocks,USD,SYN,11/12/2024,,1,40,,,,40,20,,ST",
    'Dividends,Data,USD,1/10/2025,"SYN (Ordinary Dividend)",1',
    'Withholding Tax,Data,USD,1/10/2025,"SYN (Ordinary Dividend) - US Tax",0.01',
  ].join("\n");
  await page.goto("/");
  await uploadStatement(page, csvText);
  const calculate = page.getByRole("button", {
    name: "Calculate",
    exact: true,
  });
  await expect(calculate).toBeEnabled();
  await calculate.click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  const workbook = await exportWorkbook(page);
  expect(workbook.Sheets.Summary.B3.v).toBe(1260);
  expect(workbook.Sheets.Summary.C5.v).toBe(126);
  expect(workbook.Sheets["Realized Transactions"].A2.v).toBe("2024-11-12");
  expect(workbook.Sheets["Realized Transactions"].B2.v).toBe("2025-01-10");
  expect(workbook.Sheets["Realized Transactions"].J2.v).toBe(0);
});

test("a malformed statement can be replaced and calculated without reloading", async ({
  page,
}) => {
  let rateRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/tax/exchange-rates?")) rateRequests++;
  });
  await page.goto("/");
  await page.getByLabel("IBKR Activity Statement CSV").setInputFiles({
    name: "wrong-format.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("not a CSV"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Calculate", exact: true }),
  ).toBeDisabled();
  await uploadStatement(
    page,
    "not,an,activity,statement\n1,2,3,4",
    "invalid.csv",
  );
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(rateRequests).toBe(0);
  await uploadStatement(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  expectSampleWorkbook(await exportWorkbook(page));
});

test("a temporary rate-service failure can be retried with the same uploaded file", async ({
  page,
  context,
}) => {
  let requests = 0;
  await context.route("**/api/tax/exchange-rates?*", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({
          status: 503,
          json: { error: "Rates temporarily unavailable" },
        })
      : route.fulfill({ json: sampleRates });
  });
  await page.goto("/");
  await uploadStatement(page);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  expectSampleWorkbook(await exportWorkbook(page));
  expect(requests).toBe(2);
});

test("mixed-currency rows stay in the original sheet and USD calculations stay unchanged", async ({
  page,
}) => {
  const foreignRows = sampleStatement
    .split(/\r?\n/)
    .filter((line) =>
      /^(Trades|Dividends|Withholding Tax|Interest),Data,/.test(line),
    )
    .map((line) => line.replaceAll("USD", "EUR"));
  const forex =
    "Trades,Data,Order,Forex,USD,EUR.USD,2025-01-20,1,1,1,-1,0,0,0,0";
  await page.goto("/");
  await uploadStatement(
    page,
    [sampleStatement, ...foreignRows, forex]
      .join("\n")
      .replaceAll("\r\n", "\n"),
    "mixed.csv",
  );
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  const workbook = await exportWorkbook(page);
  expectSampleWorkbook(workbook);
  const originalValues = Object.values(
    workbook.Sheets["Original Statement"],
  ).map((cell) => cell.v);
  expect(originalValues).toContain("EUR");
  expect(originalValues).toContain("Forex");
  const transactionValues = Object.values(
    workbook.Sheets["Realized Transactions"],
  ).map((cell) => cell.v);
  expect(transactionValues).not.toContain("EUR");
  expect(transactionValues).not.toContain("Forex");
});

test("replacing a calculated file clears its results and exports the replacement", async ({
  page,
}) => {
  await page.goto("/");
  await uploadStatement(page);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  const replacement = sampleStatement.replace(
    '"SYN (Ordinary Dividend)",10',
    '"SYN (Ordinary Dividend)",20',
  );
  await uploadStatement(page, replacement, "replacement.csv");
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Results", exact: true }),
  ).toBeVisible();
  const workbook = await exportWorkbook(page);
  expect(workbook.Sheets.Summary.B4.v).toBe(1200);
  expect(workbook.Sheets.Summary.C4.v).toBe(120);
  expect(workbook.Sheets.Summary.C5.v).toBe(300);
});
