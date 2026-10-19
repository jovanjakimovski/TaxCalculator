const BALANCE_TOLERANCE = 1e-9;

function closeQuantity(left, right) {
  return (
    Math.abs(left - right) <=
    BALANCE_TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function strictNumber(value) {
  const text = String(value ?? "").trim();
  if (
    !/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+|\d*\.\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(
      text,
    )
  ) {
    return null;
  }
  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function executionDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:[, ]*[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z)?)?$/,
  );
  if (!match) return null;
  const date = match[1];
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const timestamp = Date.parse(
    `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${(match[5] ?? "0").padEnd(3, "0")}Z`,
  );
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    return null;
  }
  return { date, timestamp };
}

function headerIndex(header, ...labels) {
  return header?.findIndex((value) => labels.includes(String(value).trim())) ?? -1;
}

function symbolFromDescription(value) {
  return String(value ?? "").match(/^\s*([^()]+)\(/)?.[1].trim() || null;
}

/**
 * Infer only acquisition-date bounds proved by the statement's long-position
 * history. Tax-lot allocation is deliberately unspecified: after partial sales,
 * every purchase date remains possible until the position is completely closed.
 * Opening inventory and unreconciled/unsupported stock movements never supply
 * a purchase date. Bounds refer to ordinary buy rows, not corporate-action dates.
 */
export function stockPurchaseHistory(csvRows) {
  const headers = new Map();
  const summaries = new Map();
  const currencies = new Map();
  const events = [];
  const disabled = new Set();
  let disableAll = false;
  const disable = (symbol) => {
    if (symbol) disabled.add(symbol);
    else disableAll = true;
  };

  csvRows.forEach((row, index) => {
    const section = String(row[0] ?? "");
    if (row[1] === "Header") {
      headers.set(section, row);
      return;
    }
    if (row[1] !== "Data") return;
    const header = headers.get(section);
    const categoryColumn = headerIndex(header, "Asset Category", "AssetCategory");
    const category = categoryColumn >= 0 ? row[categoryColumn] : null;
    const symbolColumn = headerIndex(header, "Symbol");
    const symbol = symbolColumn >= 0 ? String(row[symbolColumn] ?? "").trim() : null;

    // An unreadable movement header could conceal stock activity even when
    // the final quantity reconciles (for example, equal transfers in and out).
    if (
      ["Trades", "Corporate Actions"].includes(section) &&
      (categoryColumn < 0 || !String(category ?? "").trim())
    ) {
      disableAll = true;
      return;
    }

    if (section === "Mark-to-Market Performance Summary") {
      if (category !== "Stocks") return;
      const prior = strictNumber(row[headerIndex(header, "Prior Quantity")]);
      const current = strictNumber(row[headerIndex(header, "Current Quantity")]);
      if (!symbol || prior === null || current === null || prior < 0 || current < 0) {
        disable(symbol);
        return;
      }
      if (summaries.has(symbol)) disable(symbol);
      summaries.set(symbol, { prior, current });
      return;
    }

    if (section === "Trades") {
      if (category !== "Stocks") return;
      // Fills and ClosedLot rows supplement Orders; neither changes inventory.
      const discriminator = row[headerIndex(header, "DataDiscriminator")];
      if (["Trade", "ClosedLot"].includes(discriminator)) return;
      if (discriminator !== "Order") {
        disable(symbol);
        return;
      }
      const currency = String(row[headerIndex(header, "Currency")] ?? "").trim();
      const quantity = strictNumber(row[headerIndex(header, "Quantity")]);
      const execution = executionDate(row[headerIndex(header, "Date/Time")]);
      if (!symbol || !currency || quantity === null || quantity === 0 || !execution) {
        disable(symbol);
        return;
      }
      let symbolCurrencies = currencies.get(symbol);
      if (!symbolCurrencies) {
        symbolCurrencies = new Set();
        currencies.set(symbol, symbolCurrencies);
      }
      symbolCurrencies.add(currency);
      events.push({
        kind: "trade",
        symbol,
        currency,
        quantity,
        ...execution,
        sheetRow: index + 1,
      });
      return;
    }

    if (section === "Corporate Actions") {
      if (category !== "Stocks") return;
      const description = String(row[headerIndex(header, "Description")] ?? "");
      const actionSymbol = symbol || symbolFromDescription(description);
      const split = description.match(/\bSplit\s+(\d+(?:\.\d+)?)\s+for\s+(\d+(?:\.\d+)?)(?:\s|\()/i);
      const quantity = strictNumber(row[headerIndex(header, "Quantity")]);
      const execution = executionDate(row[headerIndex(header, "Date/Time")]);
      const currency = String(row[headerIndex(header, "Currency")] ?? "").trim();
      const numerator = split ? Number(split[1]) : 0;
      const denominator = split ? Number(split[2]) : 0;
      const zeroValueColumns = ["Proceeds", "Value", "Realized P/L"].every(
        (label) => strictNumber(row[headerIndex(header, label)]) === 0,
      );
      // Both instrument identifiers must match: a merger or symbol change is
      // not an ordinary same-instrument split, even if its text mentions Split.
      const destination = split
        ? description.slice(split.index + split[0].length).match(/^\s*\(?([^,()]+),/)?.[1].trim()
        : null;
      if (
        !actionSymbol || !split || !execution || !currency || quantity === null ||
        numerator <= 0 || denominator <= 0 || !zeroValueColumns ||
        destination !== actionSymbol
      ) {
        disable(actionSymbol);
        return;
      }
      events.push({
        kind: "split",
        symbol: actionSymbol,
        currency,
        quantity,
        ratio: numerator / denominator,
        ...execution,
        sheetRow: index + 1,
      });
      return;
    }

    if (/transfer|grant|award/i.test(section) && (category === "Stocks" || category === null)) {
      disable(symbol);
    }
  });

  if (disableAll) return new Map();
  const states = new Map();
  for (const [symbol, summary] of summaries) {
    const symbolCurrencies = currencies.get(symbol);
    if (disabled.has(symbol) || symbolCurrencies?.size !== 1 || !symbolCurrencies.has("USD")) continue;
    states.set(symbol, {
      balance: summary.prior,
      unknown: summary.prior > 0,
      earliest: null,
      latest: null,
      sales: new Map(),
      current: summary.current,
    });
  }

  events.sort((left, right) => left.timestamp - right.timestamp || left.sheetRow - right.sheetRow);
  for (const event of events) {
    const state = states.get(event.symbol);
    if (!state || disabled.has(event.symbol)) continue;
    if (event.currency !== "USD") {
      disabled.add(event.symbol);
      continue;
    }
    if (event.kind === "split") {
      const expectedDelta = state.balance * (event.ratio - 1);
      if (!closeQuantity(event.quantity, expectedDelta)) {
        disabled.add(event.symbol);
        continue;
      }
      state.balance *= event.ratio;
      continue;
    }

    if (event.quantity > 0) {
      const purchase = { date: event.date, sheetRow: event.sheetRow };
      if (!state.earliest || purchase.date < state.earliest.date) state.earliest = purchase;
      if (!state.latest || purchase.date > state.latest.date) state.latest = purchase;
      state.balance += event.quantity;
      continue;
    }

    const remaining = state.balance + event.quantity;
    if (remaining < 0 && !closeQuantity(remaining, 0)) {
      disabled.add(event.symbol);
      continue;
    }
    if (!state.unknown && state.earliest && state.latest && state.balance > 0) {
      state.sales.set(event.sheetRow, { earliest: state.earliest, latest: state.latest });
    }
    state.balance = closeQuantity(remaining, 0) ? 0 : remaining;
    if (state.balance === 0) {
      state.unknown = false;
      state.earliest = null;
      state.latest = null;
    }
  }

  const result = new Map();
  for (const [symbol, state] of states) {
    if (disabled.has(symbol) || !closeQuantity(state.balance, state.current)) continue;
    for (const [sheetRow, dates] of state.sales) result.set(sheetRow, dates);
  }
  return result;
}
