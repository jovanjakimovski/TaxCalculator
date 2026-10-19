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
  quantity: number;
  basis: number;
  usdResult: number;
  columns: TradeColumns;
};

export type StatementTrade = {
  row: string[];
  header: string[] | undefined;
  columns: TradeColumns;
  columnOffset: 0 | 1;
  lots: StatementClosedLot[] | null;
};

export function statementTrades(
  csvRows: readonly (readonly string[])[],
): Map<number, StatementTrade>;
