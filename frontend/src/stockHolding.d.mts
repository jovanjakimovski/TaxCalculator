export type StockHoldingDetails = {
  purchaseDate: string | null;
  daysHeld: number | null;
  exempt: boolean;
};

export function stockHoldingDetails(
  assetCategory: string,
  purchaseDate: string | null | undefined,
  saleDate: string,
): StockHoldingDetails;

export function stockPurchaseDateFromRow(
  header: readonly string[] | undefined,
  row: readonly string[],
): string | null;

export function stockPurchaseDateColumn(
  header: readonly string[] | undefined,
  row?: readonly string[],
): number | null;
