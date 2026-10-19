const UNSUPPORTED_COLUMNS =
  "Unsupported trade columns. Include realized P/L and cost basis in your IBKR Activity Statement.";

const LEGACY_HEADER = [
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

function tradeLayout(header) {
  // Older callers supply canonical rows directly, without a CSV header.
  const source = header ?? LEGACY_HEADER;
  const columnOffset = source[7] === "Exchange" ? 1 : 0;
  const normalized = source.filter((_, index) => !columnOffset || index !== 7);
  if (
    normalized[2] !== "DataDiscriminator" ||
    !["Asset Category", "AssetCategory"].includes(normalized[3]) ||
    !LEGACY_HEADER.slice(4, 15).every(
      (label, index) => normalized[index + 4] === label,
    ) ||
    (normalized.length > 15 && normalized[15] !== "Code")
  ) {
    throw new Error(UNSUPPORTED_COLUMNS);
  }
  const originalColumn = (index) => index + (index >= 7 ? columnOffset : 0);
  return {
    header: header ? normalized : undefined,
    columnOffset,
    columns: Object.fromEntries(
      Object.entries({
        date: 6,
        symbol: 5,
        currency: 4,
        quantity: 7,
        tradePrice: 8,
        proceeds: 10,
        basis: 12,
        realizedPnl: 13,
        code: 15,
      }).map(([name, index]) => [name, originalColumn(index)]),
    ),
  };
}

function strictNumber(value) {
  const text = String(value ?? "").trim();
  if (
    !/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
      text,
    )
  ) {
    return null;
  }
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function purchaseDate(value, sheetRow) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = match
    ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
    : text;
  if (!validIsoDate(normalized)) {
    throw new Error(
      `Row ${sheetRow}: invalid ClosedLot purchase date. Use YYYY-MM-DD or M/D/YYYY.`,
    );
  }
  return { purchaseDate: normalized, dateFormat: match ? "mdy" : "iso" };
}

function reconciles(actual, expected, lotCount) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  // IBKR rounds displayed lot amounts independently, commonly to six decimals.
  const tolerance = Math.max(
    0.00001,
    (lotCount + 1) * 0.0000005,
    Number.EPSILON * 8 * Math.max(Math.abs(actual), Math.abs(expected)),
  );
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Read each supported Order once, preserving original worksheet coordinates.
 * ClosedLot rows add verified acquisitions to their parent sale; Trade rows are
 * execution detail and never create additional sales or terminate the parent.
 */
export function statementTrades(csvRows) {
  const trades = new Map();
  let header;
  let currentOrder = null;

  csvRows.forEach((sourceRow, index) => {
    const sheetRow = index + 1;
    if (sourceRow[0] !== "Trades") {
      currentOrder = null;
      return;
    }
    if (sourceRow[1] === "Header") {
      header = sourceRow;
      currentOrder = null;
      return;
    }
    if (sourceRow[1] !== "Data") {
      currentOrder = null;
      return;
    }
    if (sourceRow[2] === "Order") {
      currentOrder = null;
      if (
        !["Stocks", "Equity and Index Options"].includes(sourceRow[3]) ||
        sourceRow[4] !== "USD"
      )
        return;
      // Validate columns before reading any amounts from their positions.
      const layout = tradeLayout(header);
      const row = sourceRow.filter(
        (_, column) => !layout.columnOffset || column !== 7,
      );
      const trade = { row, ...layout, lots: null };
      trades.set(sheetRow, trade);
      currentOrder = { trade, sheetRow };
      return;
    }
    if (sourceRow[2] !== "ClosedLot") return;

    const parent = currentOrder?.trade;
    const parentIsStock = parent?.row[3] === "Stocks";
    const stockLot = sourceRow[3] === "Stocks" && sourceRow[4] === "USD";
    // Ignore unsupported instruments/currencies, including Forex's own layout.
    if (!stockLot && !parentIsStock) return;
    const layout = tradeLayout(header);
    if (
      !parentIsStock ||
      sourceRow[3] !== parent.row[3] ||
      sourceRow[4] !== parent.row[4] ||
      !String(parent.row[5] ?? "").trim() ||
      sourceRow[5] !== parent.row[5] ||
      !(strictNumber(parent.row[7]) < 0)
    ) {
      throw new Error(
        `Row ${sheetRow}: ClosedLot does not match a preceding stock sale Order.`,
      );
    }

    const date = purchaseDate(sourceRow[layout.columns.date], sheetRow);
    const saleDate = String(parent.row[6] ?? "").slice(0, 10);
    if (!validIsoDate(saleDate) || date.purchaseDate > saleDate) {
      throw new Error(
        `Row ${sheetRow}: ClosedLot purchase date cannot be later than its sale date.`,
      );
    }
    const quantity = strictNumber(sourceRow[layout.columns.quantity]);
    const basis = strictNumber(sourceRow[layout.columns.basis]);
    const usdResult = strictNumber(sourceRow[layout.columns.realizedPnl]);
    if (
      quantity === null ||
      quantity <= 0 ||
      basis === null ||
      basis <= 0 ||
      usdResult === null
    ) {
      throw new Error(
        `Row ${sheetRow}: a required ClosedLot amount is missing or invalid.`,
      );
    }
    (parent.lots ??= []).push({
      sheetRow,
      ...date,
      quantity,
      basis,
      usdResult,
      columns: layout.columns,
    });
  });

  for (const [sheetRow, trade] of trades) {
    if (!trade.lots) continue;
    const expected = [
      strictNumber(trade.row[7]),
      strictNumber(trade.row[12]),
      strictNumber(trade.row[13]),
    ];
    const actual = trade.lots.reduce(
      (totals, lot) => [
        totals[0] + lot.quantity,
        totals[1] + lot.basis,
        totals[2] + lot.usdResult,
      ],
      [0, 0, 0],
    );
    if (
      expected.some((value) => value === null) ||
      ![
        reconciles(actual[0], Math.abs(expected[0]), trade.lots.length),
        reconciles(actual[1], Math.abs(expected[1]), trade.lots.length),
        reconciles(actual[2], expected[2], trade.lots.length),
      ].every(Boolean)
    ) {
      throw new Error(
        `Row ${sheetRow}: ClosedLot quantities, cost basis, and realized P/L must reconcile to the sale Order.`,
      );
    }
  }
  return trades;
}
