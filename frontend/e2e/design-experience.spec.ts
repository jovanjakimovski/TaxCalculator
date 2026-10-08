import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/license/**", (route) =>
    route.fulfill({
      json: {
        accountMode: false,
        checkoutEnabled: false,
        testCodeEnabled: false,
        packages: [],
        credits: 0,
      },
    }),
  );
});

test("report preview supports keyboard exploration and opens the real sample", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.locator(".report-illustration");
  const overview = preview.getByRole("tab", { name: "Overview", exact: true });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  const breakdown = preview.getByRole("tab", {
    name: "Breakdown",
    exact: true,
  });
  await expect(breakdown).toBeFocused();
  await expect(breakdown).toHaveAttribute("aria-selected", "true");
  await expect(preview.getByRole("tabpanel")).toContainText(
    "NBRNM rates with effective dates",
  );
  await page.keyboard.press("End");
  await expect(
    preview.getByRole("tab", { name: "Exports", exact: true }),
  ).toBeFocused();
  await expect(preview.getByRole("tabpanel")).toContainText("Excel workpaper");
  await expect(preview.getByRole("tabpanel")).toContainText(
    "Printable summary",
  );
  await page.getByRole("button", { name: "Switch to Macedonian" }).click();
  await expect(preview.getByRole("tabpanel")).toContainText("Excel пресметка");
  await page.getByRole("button", { name: "Промени на англиски" }).click();
  await preview
    .getByRole("button", { name: "Explore the full sample report" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
});

test("mobile navigation closes with Escape and report navigation follows scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const open = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await open.click();
  const navigation = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await navigation
    .getByRole("button", { name: "Sample report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your investment tax report" }),
  ).toBeVisible();
  await expect(navigation).toBeHidden();
  await page
    .locator("#income")
    .evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  const sections = page.getByRole("navigation", { name: "Report sections" });
  const income = sections.getByRole("button", {
    name: "Dividends & interest",
    exact: true,
  });
  await expect(income).toHaveAttribute("aria-current", "location");
  await expect(income).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sections.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    sections.getByRole("button", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#overview")).toBeInViewport();
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }),
  );
  const checklist = sections.getByRole("button", {
    name: "Before you file",
    exact: true,
  });
  await expect(checklist).toHaveAttribute("aria-current", "location");
  await expect(checklist).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
