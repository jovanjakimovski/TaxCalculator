import type { WorkpaperResult } from "./taxWorkbook.mjs";

export type MonthlySymbolGroup = {
  symbol: string;
  stocksMkd: number;
  optionsMkd: number;
  dividendsMkd: number;
  netMkd: number;
  taxableMkd: number;
  taxMkd: number;
};

// A read-only explanation of the groups in the existing workbook. This never
// supplies figures to the generator or changes a saved report.
export function explainMonthlyGroups(
  result: WorkpaperResult,
  month: string,
): MonthlySymbolGroup[] {
  const groups = new Map<string, MonthlySymbolGroup>();
  const group = (symbol: string) => {
    let entry = groups.get(symbol);
    if (!entry) {
      entry = {
        symbol,
        stocksMkd: 0,
        optionsMkd: 0,
        dividendsMkd: 0,
        netMkd: 0,
        taxableMkd: 0,
        taxMkd: 0,
      };
      groups.set(symbol, entry);
    }
    return entry;
  };
  for (const row of result.rows) {
    if (!row.date.startsWith(month)) continue;
    const isOption = row.assetCategory === "Equity and Index Options";
    const optionMatch = isOption
      ? (row.symbol.match(
          /^(.+?)\s+\d{1,2}[A-Z]{3}\d{2,4}\s+[\d.]+\s+[CP]$/i,
        ) ?? row.symbol.match(/^(.+?)\s+\d{6}[CP]\d{8}$/i))
      : null;
    const entry = group(optionMatch ? optionMatch[1].trim() : row.symbol);
    if (isOption) entry.optionsMkd += row.mkdResult;
    else entry.stocksMkd += row.mkdResult;
  }
  for (const row of result.dividends) {
    if (row.date.startsWith(month))
      group(row.symbol).dividendsMkd += row.grossMkd;
  }
  return [...groups.values()]
    .map((entry) => {
      const netMkd = entry.stocksMkd + entry.optionsMkd + entry.dividendsMkd;
      const taxableMkd = Math.max(netMkd, 0);
      return { ...entry, netMkd, taxableMkd, taxMkd: taxableMkd * 0.1 };
    })
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
}
