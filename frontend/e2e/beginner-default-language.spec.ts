import { expect, test } from "@playwright/test";
import {
  expectSampleWorkbook,
  exportWorkbook,
  mockRates,
  uploadStatement,
} from "./beginnerSupport";

test("starts in Macedonian with a Macedonian Excel document by default", async ({
  page,
  context,
}, testInfo) => {
  await mockRates(context);
  await context.route("**/api/license/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByLabel("Јазик на интерфејсот")).toHaveValue("mk");
  await expect(
    page.getByRole("button", { name: "Пресметај", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("macedonian-upload.png"),
    fullPage: true,
  });
  await uploadStatement(page);
  await page.getByRole("button", { name: "Пресметај", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Резултати", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Резултати", exact: true }),
  ).toBeInViewport();
  await expect(page.getByLabel("Јазик на Excel документот")).toHaveValue("mk");
  await expect(page.getByRole("table")).toHaveAccessibleName(
    "Месечна пресметка во МКД",
  );
  await expect(page.getByRole("table")).toContainText("јануари 2025");
  await expect(page.getByRole("table")).toContainText("февруари 2025");
  await expect(page.getByRole("table")).toContainText("1.800,00");
  expectSampleWorkbook(await exportWorkbook(page, "Извези Excel"), "mk");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("macedonian-results.png"),
    fullPage: true,
  });
});
