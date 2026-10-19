const DAY_MS = 86400000;
const PURCHASE_DATE_HEADERS = new Set([
  "Open Date",
  "Acquisition Date",
  "Purchase Date",
]);

function isoDate(value, kind) {
  const text = String(value ?? "").trim();
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(text) : NaN;
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== text
  ) {
    throw new Error(`Invalid stock ${kind} date. Use YYYY-MM-DD.`);
  }
  return { text, timestamp };
}

function twoYearAnniversary(timestamp) {
  const purchase = new Date(timestamp);
  const year = purchase.getUTCFullYear() + 2;
  const month = purchase.getUTCMonth();
  const monthEnd = new Date(0);
  monthEnd.setUTCFullYear(year, month + 1, 0);
  monthEnd.setUTCHours(0, 0, 0, 0);
  const anniversary = new Date(0);
  anniversary.setUTCFullYear(
    year,
    month,
    Math.min(purchase.getUTCDate(), monthEnd.getUTCDate()),
  );
  anniversary.setUTCHours(0, 0, 0, 0);
  return anniversary.getTime();
}

/**
 * An exemption applies to a verified stock lot only, after its second calendar
 * anniversary. Unknown dates remain taxable. Never supply the earliest purchase
 * date of an aggregate sale containing lots bought on different dates.
 */
export function stockHoldingDetails(assetCategory, purchaseDate, saleDate) {
  if (assetCategory !== "Stocks" || !String(purchaseDate ?? "").trim()) {
    return { purchaseDate: null, daysHeld: null, exempt: false };
  }
  const purchase = isoDate(purchaseDate, "purchase");
  const sale = isoDate(saleDate, "sale");
  if (purchase.timestamp > sale.timestamp) {
    throw new Error("Stock purchase date cannot be later than its sale date.");
  }
  return {
    purchaseDate: purchase.text,
    daysHeld: Math.round((sale.timestamp - purchase.timestamp) / DAY_MS),
    exempt: sale.timestamp > twoYearAnniversary(purchase.timestamp),
  };
}

/** Read explicit dates only; annual trade history cannot prove carried lots. */
export function stockPurchaseDateColumn(header, row) {
  if (
    !header ||
    header[0] !== "Trades" ||
    header[1] !== "Header" ||
    header[2] !== "DataDiscriminator" ||
    !["Asset Category", "AssetCategory"].includes(header[3]) ||
    header[4] !== "Currency" ||
    header[5] !== "Symbol" ||
    header[6] !== "Date/Time" ||
    header[7] !== "Quantity" ||
    header[12] !== "Basis" ||
    header[13] !== "Realized P/L"
  ) {
    return null;
  }
  const index = header.findIndex(
    (label, index) =>
      index >= 16 &&
      PURCHASE_DATE_HEADERS.has(String(label).trim()) &&
      (!row || String(row[index] ?? "").trim() !== ""),
  );
  return index < 0 ? null : index;
}

function normalizedPurchaseDate(value) {
  const text = String(value ?? "").trim();
  const timestampText = text.replace(", ", "T").replace(" ", "T");
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timestampText) &&
    Number.isFinite(Date.parse(timestampText))
  ) {
    return text.slice(0, 10);
  }
  return text;
}

export function stockPurchaseDateFromRow(header, row) {
  const column = stockPurchaseDateColumn(header, row);
  if (
    column === null ||
    row?.[0] !== "Trades" ||
    row[1] !== "Data" ||
    row[2] !== "Order" ||
    row[3] !== "Stocks"
  ) {
    return null;
  }
  const dates = header
    .map((label, index) => ({ label: String(label).trim(), index }))
    .filter(
      ({ label, index }) => index >= 16 && PURCHASE_DATE_HEADERS.has(label),
    )
    .map(({ index }) => normalizedPurchaseDate(row[index]))
    .filter(Boolean);
  if (new Set(dates).size > 1) {
    throw new Error("Conflicting stock purchase dates were found.");
  }
  return normalizedPurchaseDate(row[column]) || null;
}
