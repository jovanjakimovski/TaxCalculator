import type { StatementPreview } from "./statement";

export function reportFilename(
  {
    accountId,
    start,
    end,
  }: Pick<StatementPreview, "accountId" | "start" | "end">,
  language: "en" | "mk",
): string {
  const year = start.slice(0, 4);
  const fullYear = start === `${year}-01-01` && end === `${year}-12-31`;
  const date = (iso: string) => iso.split("-").reverse().join(".");
  const period = fullYear ? year : `${date(start)}-${date(end)}`;
  return (
    ["Tax_Report", accountId, period, language].filter(Boolean).join("_") +
    ".xlsx"
  );
}
