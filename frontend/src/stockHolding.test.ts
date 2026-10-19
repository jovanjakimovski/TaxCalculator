import { describe, expect, it } from "vitest";
import {
  stockHoldingDetails,
  stockPurchaseDateColumn,
  stockPurchaseDateFromRow,
} from "./stockHolding.mjs";

describe("verified stock holding dates", () => {
  it.each([
    ["2022-03-01", "2024-02-29", 730, false],
    ["2022-03-01", "2024-03-01", 731, false],
    ["2022-03-01", "2024-03-02", 732, true],
    ["2021-03-01", "2023-02-28", 729, false],
    ["2021-03-01", "2023-03-01", 730, false],
    ["2021-03-01", "2023-03-02", 731, true],
  ])(
    "uses calendar years and actual days: %s to %s",
    (purchase, sale, daysHeld, exempt) => {
      expect(stockHoldingDetails("Stocks", purchase, sale)).toEqual({
        purchaseDate: purchase,
        daysHeld,
        exempt,
      });
    },
  );

  it.each([
    ["2022-02-27", 729, false],
    ["2022-02-28", 730, false],
    ["2022-03-01", 731, true],
  ])("clamps a February 29 anniversary: sale %s", (sale, daysHeld, exempt) => {
    expect(stockHoldingDetails("Stocks", "2020-02-29", sale)).toEqual({
      purchaseDate: "2020-02-29",
      daysHeld,
      exempt,
    });
  });

  it.each([undefined, null, "", "  "])(
    "keeps a missing acquisition date taxable: %s",
    (purchaseDate) => {
      expect(stockHoldingDetails("Stocks", purchaseDate, "2025-01-01")).toEqual(
        {
          purchaseDate: null,
          daysHeld: null,
          exempt: false,
        },
      );
    },
  );

  it.each(["Equity and Index Options", "Dividends", "Interest", "Forex"])(
    "does not exempt %s or validate irrelevant dates",
    (assetCategory) => {
      expect(stockHoldingDetails(assetCategory, "invalid", "invalid")).toEqual({
        purchaseDate: null,
        daysHeld: null,
        exempt: false,
      });
    },
  );

  it.each(["2023-02-29", "2022-13-01", "2022-01-32", "2022-1-01", "invalid"])(
    "rejects an invalid purchase date: %s",
    (purchaseDate) => {
      expect(() =>
        stockHoldingDetails("Stocks", purchaseDate, "2025-01-01"),
      ).toThrow("Invalid stock purchase date");
    },
  );

  it("rejects an invalid sale or a purchase after sale", () => {
    expect(() =>
      stockHoldingDetails("Stocks", "2022-01-01", "2025-02-29"),
    ).toThrow("Invalid stock sale date");
    expect(() =>
      stockHoldingDetails("Stocks", "2025-01-02", "2025-01-01"),
    ).toThrow("later than its sale date");
    expect(stockHoldingDetails("Stocks", "2025-01-01", "2025-01-01")).toEqual({
      purchaseDate: "2025-01-01",
      daysHeld: 0,
      exempt: false,
    });
  });
});

describe("explicit purchase-date columns", () => {
  const header = [
    "Trades",
    "Header",
    "DataDiscriminator",
    "Asset Category",
    "Currency",
    "Symbol",
    "Date/Time",
    "Quantity",
    "T. Price",
    "C. Price",
    "Proceeds",
    "Comm/Fee",
    "Basis",
    "Realized P/L",
    "MTM P/L",
    "Code",
  ];
  const row = [
    "Trades",
    "Data",
    "Order",
    "Stocks",
    "USD",
    "SYN",
    "2025-01-01",
    "-1",
    "100",
    "100",
    "100",
    "0",
    "-80",
    "20",
    "0",
    "C",
  ];

  it.each(["Open Date", "Acquisition Date", "Purchase Date"])(
    "reads the appended explicit %s column",
    (alias) => {
      expect(
        stockPurchaseDateFromRow([...header, alias], [...row, "2022-01-01"]),
      ).toBe("2022-01-01");
      expect(stockPurchaseDateColumn([...header, alias])).toBe(16);
    },
  );

  it("does not infer dates from execution date or unspecified extra columns", () => {
    expect(stockPurchaseDateFromRow(header, row)).toBeNull();
    expect(
      stockPurchaseDateFromRow([...header, "Date"], [...row, "2022-01-01"]),
    ).toBeNull();
    expect(
      stockPurchaseDateFromRow([...header, "Open Date"], [...row, ""]),
    ).toBeNull();
    expect(stockPurchaseDateFromRow(undefined, row)).toBeNull();
    expect(
      stockPurchaseDateFromRow(["Trades", "Header", "Open Date"], row),
    ).toBeNull();
    expect(stockPurchaseDateColumn(header)).toBeNull();
    expect(
      stockPurchaseDateColumn(["Trades", "Header", "Open Date"]),
    ).toBeNull();
  });

  it.each([
    "2022-01-01T12:30:00",
    "2022-01-01T12:30:00Z",
    "2022-01-01 12:30:00",
    "2022-01-01, 12:30:00",
  ])("normalizes explicit ISO purchase timestamps: %s", (dateTime) => {
    expect(
      stockPurchaseDateFromRow([...header, "Open Date"], [...row, dateTime]),
    ).toBe("2022-01-01");
  });

  it("requires a compatible Order/Stocks row and rejects conflicting dates", () => {
    const datedHeader = [...header, "Open Date"];
    const optionRow = [...row, "2022-01-01"];
    optionRow[3] = "Equity and Index Options";
    expect(stockPurchaseDateFromRow(datedHeader, optionRow)).toBeNull();
    const lotRow = [...row, "2022-01-01"];
    lotRow[2] = "ClosedLot";
    expect(stockPurchaseDateFromRow(datedHeader, lotRow)).toBeNull();
    expect(() =>
      stockPurchaseDateFromRow(
        [...header, "Open Date", "Purchase Date"],
        [...row, "2022-01-01", "2023-01-01"],
      ),
    ).toThrow("Conflicting stock purchase dates");
  });

  it("selects the same populated date column for parsing and the source link", () => {
    const aliases = [...header, "Open Date", "Purchase Date"];
    const values = [...row, "", "2020-01-01"];
    expect(stockPurchaseDateFromRow(aliases, values)).toBe("2020-01-01");
    expect(stockPurchaseDateColumn(aliases, values)).toBe(17);
  });
});
