import Papa from "papaparse";

export type StatementPreview = {
  start: string;
  end: string;
  stocks: number;
  options: number;
  dividends: number;
  interest: number;
  forex: number;
  warnings: string[];
  errors: string[];
};
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function date(value: string): string {
  const match = value.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  const iso = match
    ? `${match[3]}-${String(months.indexOf(match[1]) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`
    : value;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new Error("Invalid statement date.");
  return iso;
}
const number = (value: string | undefined) =>
  value !== undefined &&
  value.trim() !== "" &&
  Number.isFinite(Number(value.replaceAll(",", "")));

// This gate intentionally preserves the original workbook parser and rules.
// Unsupported inputs are rejected rather than rewritten or silently omitted.
export function inspectStatement(csvText: string): StatementPreview {
  if (new TextEncoder().encode(csvText).length > MAX_FILE_BYTES)
    throw new Error("The statement exceeds the 10 MB limit.");
  const parsed = Papa.parse<string[]>(csvText.replace(/^\uFEFF/, ""), {
    skipEmptyLines: true,
    delimiter: ",",
  });
  if (parsed.errors.length)
    throw new Error(
      "The CSV is malformed. Upload the original IBKR Activity Statement CSV.",
    );
  const rows = parsed.data;
  if (rows.length > 20_000)
    throw new Error(
      "This statement has too many rows. Export a shorter period (maximum 20,000 rows).",
    );
  if (rows.some((r) => r.some((c) => /[\r\n]/.test(c))))
    throw new Error(
      "Multiline CSV fields are not supported by this Excel report. Export a standard IBKR Activity Statement.",
    );
  const period = rows.find(
    (r) => r[0] === "Statement" && r[1] === "Data" && r[2] === "Period",
  )?.[3];
  const match = period?.match(
    /(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})\s*-\s*(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2}, \d{4})/,
  );
  if (!match)
    throw new Error(
      "No statement period found. Use an IBKR Activity Statement CSV, not a trade confirmation or an Excel file.",
    );
  const start = date(match[1]),
    end = date(match[2]);
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
    throw new Error("Choose a valid statement period of at most one year.");
  if (start < "2000-01-01" || end > new Date().toISOString().slice(0, 10))
    throw new Error("The statement dates must be between 2000 and today.");
  const result: StatementPreview = {
    start,
    end,
    stocks: 0,
    options: 0,
    dividends: 0,
    interest: 0,
    forex: 0,
    warnings: [],
    errors: [],
  };
  const errors = new Set<string>(),
    warnings = new Set<string>();
  let tradeHeader: string[] | undefined;
  const checkDate = (value: string | undefined, row: number) => {
    try {
      const d = date((value ?? "").slice(0, 10));
      if (d < start || d > end)
        errors.add(
          `Row ${row}: transaction date is outside the statement period.`,
        );
    } catch {
      errors.add(`Row ${row}: invalid transaction date.`);
    }
  };
  rows.forEach((r, i) => {
    if (r[0] === "Trades" && r[1] === "Header") tradeHeader = r;
    if (r[1] !== "Data") return;
    if (r[0] === "Trades" && r[2] === "Order") {
      if (r[3] === "Forex") {
        result.forex++;
        return;
      }
      if (!["Stocks", "Equity and Index Options"].includes(r[3])) {
        warnings.add(
          `${r[3] || "Other"} trades are excluded from this report.`,
        );
        return;
      }
      if (
        !tradeHeader ||
        tradeHeader[4] !== "Currency" ||
        tradeHeader[5] !== "Symbol" ||
        tradeHeader[6] !== "Date/Time" ||
        tradeHeader[7] !== "Quantity" ||
        tradeHeader[13] !== "Realized P/L"
      )
        errors.add(
          "Unsupported trade columns. Include realized P/L and cost basis in your IBKR Activity Statement.",
        );
      if (r[4] !== "USD")
        errors.add(
          "This report supports USD securities, dividends, and interest only. Non-USD income was found.",
        );
      checkDate(r[6], i + 1);
      if (![7, 8, 10, 12, 13].every((c) => number(r[c])))
        errors.add(
          `Row ${i + 1}: a required trade amount is missing or invalid.`,
        );
      const qty = Number(r[7]?.replaceAll(",", "")),
        pl = Number(r[13]?.replaceAll(",", ""));
      const code = r[15] ?? "";
      if ((qty > 0 && pl !== 0) || (qty < 0 && /(^|;)O(;|$)/.test(code)))
        errors.add(
          "Short positions are not supported by the current Excel report. A closing purchase or opening short sale was found.",
        );
      if (qty <= 0) r[3] === "Stocks" ? result.stocks++ : result.options++;
    }
    if (
      ["Interest", "Dividends", "Withholding Tax"].includes(r[0]) &&
      r[2] &&
      !r[2].startsWith("Total")
    ) {
      if (r[2] !== "USD")
        errors.add(
          "This report supports USD securities, dividends, and interest only. Non-USD income was found.",
        );
      checkDate(r[3], i + 1);
      if (!number(r[5]))
        errors.add(`Row ${i + 1}: an income amount is missing or invalid.`);
      if (r[0] === "Dividends") result.dividends++;
      if (r[0] === "Interest") result.interest++;
      if (r[0] === "Withholding Tax" && Number(r[5]) > 0)
        errors.add(
          "A withholding reversal was found. The current Excel report cannot reconcile this adjustment; review it manually.",
        );
    }
    if (r[0] === "Grant Activity")
      warnings.add(
        "Stock grants and vesting are excluded. Review their tax treatment separately.",
      );
    if (r[0] === "Corporate Actions")
      warnings.add(
        "Corporate actions are not independently reconstructed. Check their effect on broker cost basis and realized P/L.",
      );
  });
  if (result.forex)
    warnings.add("Forex is excluded from the taxable calculation.");
  if (
    !result.stocks &&
    !result.options &&
    !result.dividends &&
    !result.interest
  )
    errors.add(
      "No supported realized sales, dividends, or interest were found. No credit will be used.",
    );
  warnings.add(
    "Foreign withholding is shown for review and is not deducted from estimated tax.",
  );
  result.errors = [...errors].slice(0, 10);
  result.warnings = [...warnings];
  return result;
}

export async function fingerprint(file: Blob): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
