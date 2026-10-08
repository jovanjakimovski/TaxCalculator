import { openDB } from "idb";
import type { WorkpaperResult, ExchangeRate } from "./taxWorkbook.mjs";
import type { StatementPreview } from "./statement";
export type Language = "en" | "mk";
export type SavedReport = {
  id: string;
  owner: string;
  fingerprint: string;
  requestId: string;
  file: File;
  language: Language;
  workbook: ArrayBuffer;
  result: WorkpaperResult;
  exchangeRates: ExchangeRate[];
  preview: StatementPreview;
  created: number;
  status: "pending" | "ready";
};
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB("taxcalculator-private-reports", 1, {
    upgrade(db) {
      db.createObjectStore("reports", { keyPath: "id" });
      db.createObjectStore("draft");
    },
  }));
export const reportId = (owner: string, hash: string) =>
  `${owner}:workpaper-v1:${hash}`;
export async function saveReport(report: SavedReport) {
  await (await db()).put("reports", report);
}
export async function saveReportIfAbsent(
  report: SavedReport,
): Promise<SavedReport> {
  const transaction = (await db()).transaction("reports", "readwrite");
  const existing = (await transaction.store.get(report.id)) as
    SavedReport | undefined;
  if (!existing) await transaction.store.put(report);
  await transaction.done;
  return existing ?? report;
}
export async function getReport(id: string): Promise<SavedReport | undefined> {
  return (await db()).get("reports", id);
}
export async function listReports(owner: string): Promise<SavedReport[]> {
  const reports: SavedReport[] = await (await db()).getAll("reports");
  return reports
    .filter((r) => r.owner === owner)
    .sort((a, b) => b.created - a.created);
}
export async function forgetReport(id: string) {
  await (await db()).delete("reports", id);
}
export async function saveDraft(file: File) {
  await (await db()).put("draft", { file, created: Date.now() }, "selected");
}
export async function loadDraft(): Promise<File | undefined> {
  // Keep expiry cleanup in the same transaction as the read so it cannot
  // delete a statement the user selects while the page is starting up.
  const transaction = (await db()).transaction("draft", "readwrite");
  const draft = await transaction.store.get("selected");
  const valid = draft && Date.now() - draft.created < 86400000;
  if (draft && !valid) await transaction.store.delete("selected");
  await transaction.done;
  return valid ? draft.file : undefined;
}
export async function clearDraft() {
  await (await db()).delete("draft", "selected");
}
