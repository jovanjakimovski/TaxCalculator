import { expect, it } from "vitest";
import { reportFilename } from "./reportFilename";

it.each([
  ["2025-01-01", "2025-12-31", "mk", "2025_mk"],
  ["2024-01-01", "2024-12-31", "en", "2024_en"],
  ["2025-01-01", "2025-10-14", "mk", "01.01.2025-14.10.2025_mk"],
  ["2025-02-01", "2025-02-28", "en", "01.02.2025-28.02.2025_en"],
  ["2024-12-01", "2025-02-28", "mk", "01.12.2024-28.02.2025_mk"],
  ["2024-01-01", "2025-12-31", "en", "01.01.2024-31.12.2025_en"],
] as const)(
  "names the %s to %s report in %s using its actual period",
  (start, end, language, suffix) => {
    expect(
      reportFilename({ accountId: "U13131314", start, end }, language),
    ).toBe(`Tax_Report_U13131314_${suffix}.xlsx`);
  },
);

it("omits the account segment when the statement has no account identifier", () => {
  expect(
    reportFilename(
      { accountId: null, start: "2025-01-01", end: "2025-12-31" },
      "en",
    ),
  ).toBe("Tax_Report_2025_en.xlsx");
});
