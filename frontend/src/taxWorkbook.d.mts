export type TaxWorkbookOptions = {
  rateOffsetDays: number;
  securitiesTaxRate: number;
  dividendTaxRate: number;
  forexTaxRate: number;
  interestTaxRate: number;
  offsetSecuritiesLosses: boolean;
  offsetForexLosses: boolean;
  offsetAcrossSections: boolean;
  includeForex: boolean;
  includeDividends: boolean;
};

export function generateTaxWorkbook(input: {
  csvText: string;
  fileName: string;
  api: string;
  options: TaxWorkbookOptions;
}): Promise<ArrayBuffer>;