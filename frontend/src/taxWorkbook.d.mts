export function generateTaxWorkbook(input: {
  csvText: string;
  exchangeRatesApi: string;
}): Promise<ArrayBuffer>;