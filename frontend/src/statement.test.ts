import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inspectStatement } from "./statement";
const sample = readFileSync(
  new URL("../public/sample-ibkr.csv", import.meta.url),
  "utf8",
);
describe("statement preflight", () => {
  it("accepts the public sample and summarizes supported rows", () => {
    const p = inspectStatement(sample);
    expect(p.errors).toEqual([]);
    expect(p.stocks).toBe(2);
    expect(p.dividends).toBe(1);
    expect(p.interest).toBe(2);
  });
  it("rejects malformed and unsupported CSVs", () => {
    expect(() => inspectStatement('a,b,c\n"unfinished')).toThrow(/malformed/);
    expect(() => inspectStatement("symbol,quantity\nABC,12")).toThrow(/period/);
  });
  it("blocks currencies that the preserved workbook would misinterpret", () => {
    expect(
      inspectStatement(sample.replaceAll("USD", "EUR")).errors.join(" "),
    ).toMatch(/USD/);
  });
  it("blocks short closes, invalid numbers and moved columns", () => {
    expect(
      inspectStatement(
        sample.replace("-1,75,75,75,0,50,25", "1,75,75,75,0,50,25"),
      ).errors.join(" "),
    ).toMatch(/Short/);
    expect(
      inspectStatement(
        sample.replace("-1,75,75,75,0,50,25", "-1,75,75,75,0,50,NaN"),
      ).errors.join(" "),
    ).toMatch(/invalid/);
    expect(
      inspectStatement(
        sample.replace("Currency,Symbol", "Symbol,Currency"),
      ).errors.join(" "),
    ).toMatch(/columns/);
  });
  it("blocks reversals and dates outside the stated period", () => {
    expect(
      inspectStatement(
        sample.replace('Dividend) - US Tax",-1', 'Dividend) - US Tax",1'),
      ).errors.join(" "),
    ).toMatch(/reversal/);
    expect(
      inspectStatement(sample.replace("2025-01-10", "2024-01-10")).errors.join(
        " ",
      ),
    ).toMatch(/outside/);
  });
  it("accepts BOM while refusing multiline fields and excessive ranges", () => {
    expect(inspectStatement("\uFEFF" + sample).errors).toEqual([]);
    expect(() =>
      inspectStatement(
        sample.replace("USD credit interest", "USD\ncredit interest"),
      ),
    ).toThrow();
    expect(() =>
      inspectStatement(
        sample.replace("February 28, 2025", "February 28, 2026"),
      ),
    ).toThrow(/one year/);
  });
});
