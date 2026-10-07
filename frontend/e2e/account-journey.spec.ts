import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const statement = readFileSync(path.resolve("public/sample-ibkr.csv"), "utf8");

async function accountWithoutProvider(page: Page) {
  const protectedRequests: string[] = [];
  await page.context().route("**/api/license/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.endsWith("/config")) {
      await route.fulfill({
        json: {
          accountMode: true,
          testCodeEnabled: false,
          checkoutEnabled: true,
          packages: [1, 2, 3],
        },
      });
      return;
    }
    protectedRequests.push(endpoint);
    await route.fulfill({ status: 401, json: { error: "Sign in required" } });
  });
  return protectedRequests;
}

async function uploadStatement(page: Page) {
  await page.getByLabel("IBKR statement CSV").setInputFiles({
    name: "investor-preview.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(statement),
  });
  await expect(
    page.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
}

test("anonymous visitors can explore a sample and calculation guidance in account mode", async ({
  page,
}) => {
  const protectedRequests = await accountWithoutProvider(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Explore the calculation/ }).click();
  await expect(
    page.getByRole("heading", { name: "How your tax estimate is calculated" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "TaxCalculator home" }).click();
  await page.getByRole("button", { name: /Just exploring/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  await expect(page.getByText(/SAMPLE REPORT/)).toBeVisible();
  expect(protectedRequests).toEqual([]);
});

test("the login journey explains account credits and browser-local files and fails closed without a provider", async ({
  page,
}, testInfo) => {
  const protectedRequests = await accountWithoutProvider(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your report credits. One account." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with email/ }),
  ).toBeDisabled();
  const main = page.getByRole("main");
  await expect(main).toContainText(/credit/i);
  await expect(main).toContainText(/browser/i);
  await expect(main).toContainText(/password|verification/i);
  await expect(main).toContainText("Account sign-in is not enabled here yet.");
  await expect(main.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("account-signin.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to Macedonian" }).click();
  await expect(
    page.getByRole("heading", { name: "Вашите кредити. Една сметка." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Продолжи со е-пошта/ }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("account-signin-mk.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(protectedRequests).toEqual([]);
});

test("local test reports are a separate workspace and do not impersonate a logged-in account", async ({
  page,
}) => {
  await page.context().route("**/api/license/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: endpoint.endsWith("/config")
        ? {
            accountMode: false,
            testCodeEnabled: true,
            checkoutEnabled: false,
            packages: [],
          }
        : {
            credits: 0,
            accountMode: false,
            testCodeEnabled: true,
            checkoutEnabled: false,
          },
    });
  });
  await page.goto("/");
  const testWorkspace = page.getByRole("note").filter({
    hasText: "Local test workspace",
  });
  await expect(testWorkspace).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your report credits. One account." }),
  ).toBeVisible();
  await testWorkspace.getByRole("button", { name: /My reports/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your reports, at a glance." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /My account/ })).toHaveCount(0);
  await expect(page.getByLabel("Have a test access code?")).toBeVisible();
});

test("a free preview survives the sign-in detour and reload without an anonymous debit", async ({
  page,
}) => {
  const protectedRequests = await accountWithoutProvider(page);
  await page.goto("/");
  await uploadStatement(page);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /2 reports/ }).click();
  await page.getByRole("button", { name: /Sign in to continue/ }).click();
  await expect(
    page.getByRole("button", { name: /Continue with email/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Back to your preview/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("button", { name: /2 reports/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /Unlock report/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your records are ready to review." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /2 reports/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(protectedRequests).toEqual([]);
});
