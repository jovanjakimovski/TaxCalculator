import { describe, expect, it } from "vitest";
import { statementTrades } from "./statementTrades.mjs";

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
const order = () => [
  "Trades",
  "Data",
  "Order",
  "Stocks",
  "USD",
  "SYN",
  "2025-06-10, 10:15:00",
  "-4",
  "40",
  "40",
  "160",
  "-1",
  "-100",
  "59",
  "0",
  "C;P",
];
const lot = (
  date = "2020-01-03",
  quantity = "2",
  basis = "50",
  result = "29.5",
) => [
  "Trades",
  "Data",
  "ClosedLot",
  "Stocks",
  "USD",
  "SYN",
  date,
  quantity,
  "25",
  "",
  "",
  "",
  basis,
  result,
  "",
  "LT",
];
const exchange = (row: string[]) => [
  ...row.slice(0, 7),
  row[1] === "Header" ? "Exchange" : "-",
  ...row.slice(7),
];
const fill = () => {
  const row = order();
  row[2] = "Trade";
  return row;
};
const optionOrder = () => {
  const row = order();
  row[3] = "Equity and Index Options";
  row[5] = "SYN 16JAN26 60 C";
  row[7] = "-1";
  row[8] = "0.25";
  row[9] = "0.25";
  row[10] = "25";
  row[11] = "-0.5";
  row[12] = "-125.25";
  row[13] = "-100.75";
  return row;
};
const optionLot = (date = "2024-01-03") => {
  const row = lot(date, "1", "125.25", "-100.75");
  row[3] = "Equity and Index Options";
  row[5] = "SYN 16JAN26 60 C";
  row[8] = "1.2525";
  return row;
};

describe("IBKR trade orders and closed lots", () => {
  it("normalizes Exchange columns and retains original worksheet coordinates", () => {
    const trades = statementTrades([
      exchange(header),
      exchange(order()),
      exchange(fill()),
      exchange(lot("2020-01-03")),
      exchange(fill()),
      exchange(lot("2024-05-09")),
    ]);
    expect(trades.size).toBe(1);
    const trade = trades.get(2)!;
    expect(trade.row).toEqual(order());
    expect(trade.header).toEqual(header);
    expect(trade.columnOffset).toBe(1);
    expect(trade.columns).toEqual({
      date: 6,
      symbol: 5,
      currency: 4,
      quantity: 8,
      tradePrice: 9,
      proceeds: 11,
      basis: 13,
      realizedPnl: 14,
      code: 16,
    });
    expect(trade.lots).toEqual([
      {
        sheetRow: 4,
        purchaseDate: "2020-01-03",
        dateFormat: "iso",
        quantity: 2,
        basis: 50,
        usdResult: 29.5,
        columns: trade.columns,
      },
      {
        sheetRow: 6,
        purchaseDate: "2024-05-09",
        dateFormat: "iso",
        quantity: 2,
        basis: 50,
        usdResult: 29.5,
        columns: trade.columns,
      },
    ]);
  });

  it("supports legacy headers, no Code column, and direct legacy rows without a header", () => {
    expect(statementTrades([header, order()]).get(2)?.columnOffset).toBe(0);
    const oldHeader = header.slice(0, 15);
    oldHeader[3] = "AssetCategory";
    expect(
      statementTrades([oldHeader, order().slice(0, 15)]).get(2)?.lots,
    ).toBeNull();
    const direct = statementTrades([order().slice(0, 15)]).get(1)!;
    expect(direct.header).toBeUndefined();
    expect(direct.columns.quantity).toBe(7);
    expect(direct.columns.realizedPnl).toBe(13);
  });

  it("preserves optional explicit acquisition-date columns after normalizing Exchange", () => {
    const trade = statementTrades([
      exchange([...header, "Open Date", "Acquisition Date"]),
      exchange([...order(), "2020-01-03", "2020-01-03"]),
    ]).get(2)!;
    expect(trade.header?.slice(16)).toEqual(["Open Date", "Acquisition Date"]);
    expect(trade.row.slice(16)).toEqual(["2020-01-03", "2020-01-03"]);
  });

  it("accepts US month/day/year ClosedLot dates and identical lots on separate fills", () => {
    const trades = statementTrades([
      header,
      order(),
      fill(),
      lot("1/3/2020"),
      fill(),
      lot("1/3/2020"),
    ]);
    expect(
      trades.get(2)?.lots?.map(({ sheetRow, purchaseDate, dateFormat }) => ({
        sheetRow,
        purchaseDate,
        dateFormat,
      })),
    ).toEqual([
      { sheetRow: 4, purchaseDate: "2020-01-03", dateFormat: "mdy" },
      { sheetRow: 6, purchaseDate: "2020-01-03", dateFormat: "mdy" },
    ]);
  });

  it("allows independently rounded lot totals within IBKR display precision", () => {
    const roundedOrder = order();
    roundedOrder[12] = "-100.000001";
    roundedOrder[13] = "58.999999";
    expect(
      statementTrades([header, roundedOrder, lot(), lot()]).get(2)?.lots,
    ).toHaveLength(2);
  });

  it.each(["2024-01-03", "1/3/2024"])(
    "reads option lot date %s and reconciles full USD totals without multiplying contracts",
    (date) => {
      const execution = optionOrder();
      execution[2] = "Trade";
      const trade = statementTrades([
        exchange(header),
        exchange(optionOrder()),
        exchange(execution),
        exchange(optionLot(date)),
      ]).get(2)!;
      expect(trade.row).toEqual(optionOrder());
      expect(trade.lots).toEqual([
        {
          sheetRow: 4,
          purchaseDate: "2024-01-03",
          dateFormat: date.includes("/") ? "mdy" : "iso",
          quantity: 1,
          basis: 125.25,
          usdResult: -100.75,
          columns: trade.columns,
        },
      ]);
    },
  );

  it("keeps separate acquisition dates for multiple option lots", () => {
    const sale = optionOrder();
    sale[7] = "-2";
    sale[10] = "50";
    sale[11] = "-1";
    sale[12] = "-250.5";
    sale[13] = "-201.5";
    const result = statementTrades([
      header,
      sale,
      optionLot("2023-01-03"),
      optionLot("2024-01-03"),
    ]);
    expect(result.get(2)?.lots?.map((entry) => entry.purchaseDate)).toEqual([
      "2023-01-03",
      "2024-01-03",
    ]);
  });

  it("applies matching, date, and amount safeguards to option lots", () => {
    expect(() => statementTrades([header, optionLot()])).toThrow(
      /preceding option sale/,
    );
    const purchase = optionOrder();
    purchase[7] = "1";
    expect(() =>
      statementTrades([header, purchase, optionLot()]),
    ).toThrow(/preceding option sale/);
    for (const column of [3, 4, 5]) {
      const mismatch = optionLot();
      mismatch[column] = "DIFFERENT";
      expect(() =>
        statementTrades([header, optionOrder(), mismatch]),
      ).toThrow(/preceding option sale/);
    }
    for (const column of [7, 12, 13]) {
      const mismatch = optionLot();
      mismatch[column] = String(Number(mismatch[column]) + 1);
      expect(() =>
        statementTrades([header, optionOrder(), mismatch]),
      ).toThrow(/must reconcile/);
    }
    expect(() =>
      statementTrades([header, optionOrder(), optionLot("2026-01-03")]),
    ).toThrow(/purchase date/);
    const missingBasis = optionLot();
    missingBasis[12] = "";
    expect(() =>
      statementTrades([header, optionOrder(), missingBasis]),
    ).toThrow(/required ClosedLot amount/);
  });

  it("rejects overflowing lot sums instead of treating them as reconciled", () => {
    expect(() =>
      statementTrades([
        header,
        order(),
        lot("2020-01-03", "1e308", "1e308", "1e308"),
        lot("2020-01-03", "1e308", "1e308", "1e308"),
      ]),
    ).toThrow(/must reconcile/);
  });

  it.each([
    ["partial quantity", [lot()]],
    ["wrong total basis", [lot("2020-01-03", "4", "99", "59")]],
    ["wrong total realized P/L", [lot("2020-01-03", "4", "100", "58")]],
    ["negative quantity", [lot("2020-01-03", "-4", "100", "59")]],
    ["zero quantity", [lot("2020-01-03", "0", "100", "59")]],
    ["invalid number", [lot("2020-01-03", "4", "100", "NaN")]],
    ["missing number", [lot("2020-01-03", "4", "", "59")]],
    ["zero basis", [lot("2020-01-03", "4", "0", "59")]],
    ["negative basis", [lot("2020-01-03", "4", "-100", "59")]],
  ])("rejects %s rather than ignoring partial or malformed lots", (_, lots) => {
    expect(() => statementTrades([header, order(), ...lots])).toThrow(
      /ClosedLot/,
    );
  });

  it.each([
    "2020-02-30",
    "2/30/2020",
    "13/1/2020",
    "2020/01/03",
    "",
    "2026-01-03",
  ])("rejects invalid or future purchase date %s", (date) => {
    expect(() =>
      statementTrades([header, order(), lot(date, "4", "100", "59")]),
    ).toThrow(/ClosedLot purchase date/);
  });

  it("rejects orphaned or mismatched stock lots", () => {
    expect(() => statementTrades([header, lot()])).toThrow(
      /preceding stock sale/,
    );
    const purchase = order();
    purchase[7] = "4";
    expect(() => statementTrades([header, purchase, lot()])).toThrow(
      /preceding stock sale/,
    );
    for (const column of [3, 4, 5]) {
      const mismatch = lot("2020-01-03", "4", "100", "59");
      mismatch[column] = "DIFFERENT";
      expect(() => statementTrades([header, order(), mismatch])).toThrow(
        /preceding stock sale/,
      );
    }
    expect(() =>
      statementTrades([
        header,
        order(),
        ["Trades", "SubTotal"],
        lot("2020-01-03", "4", "100", "59"),
      ]),
    ).toThrow(/preceding stock sale/);
  });

  it("rejects an explicitly unsupported header before considering its amounts", () => {
    const moved = [...header];
    [moved[7], moved[8]] = [moved[8], moved[7]];
    const invalidAmounts = order();
    invalidAmounts[7] = "NaN";
    expect(() => statementTrades([moved, invalidAmounts])).toThrow(
      "Unsupported trade columns. Include realized P/L and cost basis in your IBKR Activity Statement.",
    );
  });

  it("skips unsupported assets and currencies with separate layouts", () => {
    const forex = order();
    forex[3] = "Forex";
    const foreign = order();
    foreign[4] = "EUR";
    expect(
      statementTrades([
        ["Trades", "Header", "Different", "Forex Fee"],
        forex,
        foreign,
        header,
        optionOrder(),
        optionLot(),
      ]).size,
    ).toBe(1);
  });
});
