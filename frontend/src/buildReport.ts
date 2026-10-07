import type { calculateTaxWorkbook } from "./taxWorkbook.mjs";
export function buildReport(
  input: Parameters<typeof calculateTaxWorkbook>[0],
): Promise<Awaited<ReturnType<typeof calculateTaxWorkbook>>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./report.worker.ts", import.meta.url), {
      type: "module",
    });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "Report generation timed out. No credit has been used. Try again.",
        ),
      );
    }, 120_000);
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = ({ data }) => {
      finish();
      data.error ? reject(new Error(data.error)) : resolve(data.output);
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "Could not prepare the report. No credit has been used. Refresh and try again.",
        ),
      );
    };
    worker.postMessage(input);
  });
}
