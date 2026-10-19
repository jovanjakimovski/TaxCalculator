import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inspectStatement } from "./statement";
const sample = readFileSync(
  new URL("../public/sample-ibkr.csv", import.meta.url),
  "utf8",
);
const closedLots = [
  'Statement,Data,Period,"January 1, 2025 - February 28, 2025"',
  "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Exchange,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
  "Trades,Data,Order,Stocks,USD,ACME,2025-01-10,-,-2,75,75,150,0,-100,50,0,C",
  "Trades,Data,Trade,Stocks,USD,ACME,2025-01-10,NASDAQ,-2,75,75,150,0,-100,50,0,C",
  "Trades,Data,ClosedLot,Stocks,USD,ACME,2022-01-01,,1,50,,,,50,25,,LT",
  "Trades,Data,ClosedLot,Stocks,USD,ACME,2024-01-01,,1,50,,,,50,25,,LT",
  "Trades,Data,Order,Equity and Index Options,USD,ACME 17JAN25 50 C,2025-01-17,-,-1,2,2,200,-1,-100,99,0,C",
  "Trades,Data,Trade,Equity and Index Options,USD,ACME 17JAN25 50 C,2025-01-17,CBOE,-1,2,2,200,-1,-100,99,0,C",
].join("\n");
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
  it("accepts mixed-currency statements and previews only USD income", () => {
    const fixture = sample.replaceAll("\r\n", "\n");
    const p = inspectStatement(
      fixture + "\n" + fixture.replaceAll("USD", "EUR"),
    );
    expect(p.errors).toEqual([]);
    expect(p.stocks).toBe(2);
    expect(p.dividends).toBe(1);
    expect(p.interest).toBe(2);
  });
  it("accepts Exchange columns and counts orders without treating lot acquisition dates as sales", () => {
    const p = inspectStatement(closedLots);
    expect(p.errors).toEqual([]);
    expect(p.stocks).toBe(1);
    expect(p.options).toBe(1);
    expect(p.start).toBe("2025-01-01");
    expect(p.end).toBe("2025-02-28");
  });
  it("reports invalid closed-lot data and unsupported Exchange-column layouts", () => {
    expect(
      inspectStatement(
        closedLots.replace("2022-01-01", "not-a-date"),
      ).errors.join(" "),
    ).toMatch(/Row 5:.*(date|lot)/i);
    expect(
      inspectStatement(
        closedLots.replace(
          "Date/Time,Exchange,Quantity",
          "Date/Time,Venue,Quantity",
        ),
      ).errors.join(" "),
    ).toMatch(/columns/);
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
    expect(
      inspectStatement(
        sample
          .split(/\r?\n/)
          .filter((row) => !row.startsWith("Trades,Header,"))
          .join("\n"),
      ).errors.join(" "),
    ).toMatch(/columns/);
  });
  it("retains signed withholding entries and blocks dates outside the stated period", () => {
    const reversal = inspectStatement(
      sample.replace('Dividend) - US Tax",-1', 'Dividend) - US Tax",1'),
    );
    expect(reversal.errors).toEqual([]);
    expect(reversal.warnings.join(" ")).toMatch(/withholding.*not deducted/i);
    expect(
      inspectStatement(sample.replace("2025-01-10", "2024-01-10")).errors.join(
        " ",
      ),
    ).toMatch(/outside/);
  });
  it("accepts US-format income dates while rejecting invalid calendar dates", () => {
    const fixture = sample
      .replaceAll("2025-02-15", "2/15/2025")
      .replaceAll("2025-01-31", "01/31/2025")
      .replaceAll("2025-02-28", "02/28/2025");
    const p = inspectStatement(fixture);
    expect(p.errors).toEqual([]);
    expect(p.dividends).toBe(1);
    expect(p.interest).toBe(2);
    expect(
      inspectStatement(
        fixture.replaceAll("2/15/2025", "2/29/2025"),
      ).errors.join(" "),
    ).toMatch(/invalid transaction date/);
  });
  it("accepts BOM while refusing multiline fields and excessive ranges", () => {
    expect(inspectStatement("\uFEFF" + sample).errors).toEqual([]);
    for (const newline of ["\n", "\r\n"]) {
      const fixture = sample.replaceAll("\r\n", "\n").replaceAll("\n", newline);
      expect(() =>
        inspectStatement(
          fixture.replace(
            "USD credit interest",
            `"USD${newline}credit interest"`,
          ),
        ),
      ).toThrow(/Multiline/);
    }
    expect(() =>
      inspectStatement(
        sample.replace("February 28, 2025", "February 28, 2026"),
      ),
    ).toThrow(/one year/);
  });
});
