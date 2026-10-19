export type TradeColumns = {
  date: number;
  symbol: number;
  currency: number;
  quantity: number;
  tradePrice: number;
  proceeds: number;
  basis: number;
  realizedPnl: number;
  code: number;
};

export type StatementClosedLot = {
  sheetRow: number;
  purchaseDate: string;
  dateFormat: "iso" | "mdy";
  /** Share or option-contract quantity, matching its parent Order units. */
  quantity: number;
  /** Full USD cost basis; option contract multipliers are already included. */
  basis: number;
  /** Full USD realized result; option contract multipliers are already included. */
  usdResult: number;
  columns: TradeColumns;
};

export type StatementTrade = {
  row: string[];
  header: string[] | undefined;
  columns: TradeColumns;
  columnOffset: 0 | 1;
  /** Broker-matched acquisitions for supported stock or option sale Orders. */
  lots: StatementClosedLot[] | null;
};

export function statementTrades(
  csvRows: readonly (readonly string[])[],
): Map<number, StatementTrade>;
