export type ExchangeRate = {
  requestedDate: string;
  effectiveDate: string;
  mkdPerUsd: number;
};

export type WorkpaperResult = {
  transactionCount: number;
  realizedUsd: number;
  realizedMkd: number;
  taxableIncomeMkd: number;
  estimatedTaxMkd: number;
  monthlySummary: Array<{
    month: string;
    stocksMkd: number;
    optionsMkd: number;
    dividendsMkd: number;
    interestMkd: number;
    taxablePnlMkd: number;
    taxMkd: number;
  }>;
  rows: Array<{
    assetCategory: string;
    symbol: string;
    date: string;
    rateDate: string;
    usdResult: number;
    mkdRate: number;
    mkdResult: number;
    purchaseDate?: string | null;
    daysHeld?: number | null;
    holdingExempt?: boolean;
    purchaseDateRange?: { earliest: string; latest: string };
    daysHeldRange?: { min: number; max: number };
    taxableMkdResult?: number;
    lots?: Array<{
      purchaseDate: string;
      quantity: number;
      usdResult: number;
      daysHeld: number;
      holdingExempt: boolean;
    }>;
  }>;
  dividends: Array<{
    date: string;
    rateDate: string;
    symbol: string;
    description: string;
    grossUsd: number;
    withholdingUsd: number;
    netUsd: number;
    mkdRate: number;
    grossMkd: number;
    withholdingMkd: number;
    netMkd: number;
  }>;
  dividendGrossUsd: number;
  dividendWithholdingUsd: number;
  dividendNetUsd: number;
  dividendGrossMkd: number;
  dividendWithholdingMkd: number;
  dividendNetMkd: number;
  interest: Array<{
    date: string;
    rateDate: string;
    usdAmount: number;
    mkdRate: number;
    mkdAmount: number;
  }>;
  interestPaidUsd: number;
  interestPaidMkd: number;
  interestIncomeUsd: number;
  interestIncomeMkd: number;
  interestChargesUsd: number;
  interestChargesMkd: number;
};

type WorkbookInput = {
  csvText: string;
  exchangeRatesApi: string;
  language?: "en" | "mk";
  exchangeRates?: ExchangeRate[];
};

export function calculateTaxWorkbook(input: WorkbookInput): Promise<{
  workbook: ArrayBuffer;
  calculationResult: WorkpaperResult;
  exchangeRates: ExchangeRate[];
}>;

export function generateTaxWorkbook(input: WorkbookInput): Promise<ArrayBuffer>;
