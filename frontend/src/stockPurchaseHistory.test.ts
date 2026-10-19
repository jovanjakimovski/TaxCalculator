import { describe, expect, it } from "vitest";
import { stockPurchaseHistory } from "./stockPurchaseHistory.mjs";

const summaryHeader = [
  "Mark-to-Market Performance Summary", "Header", "Asset Category", "Symbol",
  "Prior Quantity", "Current Quantity",
];
const tradeHeader = [
  "Trades", "Header", "DataDiscriminator", "Asset Category", "Currency", "Symbol",
  "Date/Time", "Quantity", "T. Price", "C. Price", "Proceeds", "Comm/Fee", "Basis",
  "Realized P/L", "MTM P/L", "Code",
];
const corporateHeader = [
  "Corporate Actions", "Header", "Asset Category", "Currency", "Report Date",
  "Date/Time", "Description", "Quantity", "Proceeds", "Value", "Realized P/L", "Code",
];
const trade = (date: string, quantity: string | number, currency = "USD") => [
  "Trades", "Data", "Order", "Stocks", currency, "SYN", date, String(quantity),
  "100", "100", "0", "0", "0", "0", "0", Number(quantity) > 0 ? "O" : "C",
];
const statement = (trades: string[][], prior: string | number = 0, current: string | number = 0) => [
  summaryHeader,
  ["Mark-to-Market Performance Summary", "Data", "Stocks", "SYN", String(prior), String(current)],
  tradeHeader,
  ...trades,
];
const exact = (date: string, sheetRow: number) => ({
  earliest: { date, sheetRow }, latest: { date, sheetRow },
});

describe("automatic stock acquisition history", () => {
  it("links a sale to a proven ordinary buy from a flat opening position", () => {
    const result = stockPurchaseHistory(statement([
      trade("2020-01-03, 09:30:01", 10), trade("2024-01-04, 09:30:01", -10),
    ]));
    expect([...result]).toEqual([[5, exact("2020-01-03", 4)]]);
  });

  it("ignores execution fills when inferring dates and reconciling inventory", () => {
    const fill = (date: string, quantity: number) => {
      const row = trade(date, quantity);
      row[2] = "Trade";
      return row;
    };
    const rows = statement([
      trade("2020-01-03", 10), fill("2020-01-03", 6), fill("2020-01-03", 4),
      trade("2024-01-04", -3), fill("2024-01-04", -1), fill("2024-01-04", -2),
      trade("2024-02-05", -4), fill("2024-02-05", -2), fill("2024-02-05", -2),
    ], 0, 3).map((row) =>
      row[0] === "Trades"
        ? [...row.slice(0, 7), row[1] === "Header" ? "Exchange" : "-", ...row.slice(7)]
        : row,
    );
    expect([...stockPurchaseHistory(rows)]).toEqual([
      [7, exact("2020-01-03", 4)],
      [10, exact("2020-01-03", 4)],
    ]);
  });

  it("keeps every possible purchase date after partial sales without assuming FIFO", () => {
    const result = stockPurchaseHistory(statement([
      trade("2020-01-03", 2), trade("2023-02-04", 3),
      trade("2024-03-05", -1), trade("2024-04-06", -4),
    ]));
    const bounds = {
      earliest: { date: "2020-01-03", sheetRow: 4 },
      latest: { date: "2023-02-04", sheetRow: 5 },
    };
    expect([...result]).toEqual([[6, bounds], [7, bounds]]);
  });

  it("starts a new date range only after the position is fully closed", () => {
    const result = stockPurchaseHistory(statement([
      trade("2020-01-03", 2), trade("2022-02-04", -2),
      trade("2023-03-05", 4), trade("2024-04-06", -4),
    ]));
    expect(result.get(5)).toEqual(exact("2020-01-03", 4));
    expect(result.get(7)).toEqual(exact("2023-03-05", 6));
  });

  it("does not date carried opening shares, but can prove a later flat-position cycle", () => {
    const result = stockPurchaseHistory(statement([
      trade("2023-01-03", 3), trade("2023-02-04", -8),
      trade("2023-03-05", 4), trade("2024-04-06", -4),
    ], 5));
    expect([...result]).toEqual([[7, exact("2023-03-05", 6)]]);
  });

  it("sorts full execution timestamps while preserving source sheet row references", () => {
    const result = stockPurchaseHistory(statement([
      trade("2024-01-03, 10:30:01", -2), trade("2024-01-03, 09:30:01", 2),
    ]));
    expect([...result]).toEqual([[4, exact("2024-01-03", 5)]]);
  });

  it("treats multiple buys on the same calendar day as one exact acquisition day", () => {
    const result = stockPurchaseHistory(statement([
      trade("2020-01-03T09:30:01", 1.25), trade("2020-01-03T10:30:01", 2.75),
      trade("2024-01-03T11:30:01", -3),
    ], 0, 1));
    expect(result.get(6)).toEqual(exact("2020-01-03", 4));
  });

  it.each(["", "--", "garbage", "-1", "1,2"])(
    "never treats malformed or short opening quantity %s as zero",
    (prior) => {
      expect(stockPurchaseHistory(statement([
        trade("2020-01-03", 2), trade("2024-01-03", -2),
      ], prior)).size).toBe(0);
    },
  );

  it.each(["", "--", "garbage", "-1", "1"])(
    "rejects an invalid or unreconciled closing quantity %s",
    (current) => {
      expect(stockPurchaseHistory(statement([
        trade("2020-01-03", 2), trade("2024-01-03", -2),
      ], 0, current)).size).toBe(0);
    },
  );

  it("requires an unambiguous opening summary and one currency for the symbol", () => {
    const rows = statement([trade("2020-01-03", 2), trade("2024-01-03", -2)]);
    expect(stockPurchaseHistory(rows.slice(2)).size).toBe(0);
    expect(stockPurchaseHistory([...rows, rows[1]]).size).toBe(0);
    expect(stockPurchaseHistory([
      ...rows, trade("2024-02-01", 1, "EUR"), trade("2024-03-01", -1, "EUR"),
    ]).size).toBe(0);
  });

  it.each([
    [trade("2023-02-29", 2), trade("2024-01-03", -2)],
    [trade("2020-01-03, 24:01:00", 2), trade("2024-01-03", -2)],
    [trade("2020-01-03", "--"), trade("2024-01-03", -2)],
    [trade("2020-01-03", -2), trade("2024-01-03", 2)],
  ])("fails closed for malformed trades or an unsupported short position", (...trades) => {
    expect(stockPurchaseHistory(statement(trades)).size).toBe(0);
  });

  it("allows broker fractional rounding without rounding shares to integers", () => {
    const result = stockPurchaseHistory(statement([
      trade("2020-01-03", 0.1), trade("2020-01-03", 0.2), trade("2024-01-03", -0.3),
    ]));
    expect(result.get(6)).toEqual(exact("2020-01-03", 4));
  });

  it("validates a same-instrument split delta and preserves the purchase day", () => {
    const rows = statement([
      trade("2020-01-03", 2), trade("2024-06-10", -20),
    ]);
    rows.push(corporateHeader, [
      "Corporate Actions", "Data", "Stocks", "USD", "2024-06-10",
      "2024-06-07, 20:25:00", "SYN(US0000000001) Split 10 for 1 (SYN, SYN INC, US0000000001)",
      "18", "0", "0", "0", "",
    ]);
    expect(stockPurchaseHistory(rows).get(5)).toEqual(exact("2020-01-03", 4));
    rows.at(-1)![7] = "17";
    expect(stockPurchaseHistory(rows).size).toBe(0);
  });

  it("does not infer a purchase day through an unsupported or renamed corporate action", () => {
    const rows = statement([trade("2020-01-03", 2), trade("2024-01-03", -2)]);
    rows.push(corporateHeader, [
      "Corporate Actions", "Data", "Stocks", "USD", "2023-01-03", "2023-01-03",
      "SYN(US0000000001) Merger (OTHER, OTHER INC, US0000000002)", "0", "0", "0", "0", "",
    ]);
    expect(stockPurchaseHistory(rows).size).toBe(0);
    rows.at(-1)![6] = "SYN(US0000000001) Split 1 for 1 (OTHER, OTHER INC, US0000000002)";
    expect(stockPurchaseHistory(rows).size).toBe(0);
  });

  it.each(["Transfers", "Stock Grants", "Equity Awards"])(
    "disables inference for stock movements in %s",
    (section) => {
      const rows = statement([trade("2020-01-03", 2), trade("2024-01-03", -2)]);
      rows.push([section, "Header", "Asset Category", "Symbol", "Quantity"]);
      rows.push([section, "Data", "Stocks", "SYN", "0"]);
      expect(stockPurchaseHistory(rows).size).toBe(0);
    },
  );

  it("fails closed globally when an unsupported stock movement cannot be attributed", () => {
    const rows = statement([trade("2020-01-03", 2), trade("2024-01-03", -2)]);
    rows.push(["Transfers", "Header", "Description"]);
    rows.push(["Transfers", "Data", "Unidentified stock movement"]);
    expect(stockPurchaseHistory(rows).size).toBe(0);
  });

  it.each(["Trades", "Corporate Actions"])(
    "fails closed when a %s movement has an unreadable asset-category header",
    (section) => {
      const rows = statement([trade("2020-01-03", 2), trade("2024-01-03", -2)]);
      rows.push([section, "Header", "Unrecognized Category", "Description"]);
      rows.push([section, "Data", "Stocks", "Unidentified stock movement"]);
      expect(stockPurchaseHistory(rows).size).toBe(0);
    },
  );
});
