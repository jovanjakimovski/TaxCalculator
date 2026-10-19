export type StockPurchaseSource = {
  date: string;
  sheetRow: number;
};

export type StockPurchaseRange = {
  earliest: StockPurchaseSource;
  latest: StockPurchaseSource;
};

export function stockPurchaseHistory(
  csvRows: readonly (readonly string[])[],
): Map<number, StockPurchaseRange>;
