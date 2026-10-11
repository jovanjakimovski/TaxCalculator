import { calculateTaxWorkbook } from "./taxWorkbook.mjs";
import XLSX from "xlsx-js-style";

self.onmessage = async ({ data }) => {
  try {
    const output = await calculateTaxWorkbook(data);
    // Reject formulas that Excel cannot open before returning the export.
    const book = XLSX.read(output.workbook, {
      type: "array",
      cellFormula: true,
    });
    for (const name of book.SheetNames)
      for (const cell of Object.values(book.Sheets[name])) {
        if (
          cell &&
          typeof cell === "object" &&
          "f" in cell &&
          typeof cell.f === "string" &&
          cell.f.length > 8192
        )
          throw new Error(
            "This portfolio exceeds the current Excel formula limit. Export a shorter statement period.",
          );
      }
    self.postMessage({ output }, { transfer: [output.workbook] });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Report generation failed.",
    });
  }
};
