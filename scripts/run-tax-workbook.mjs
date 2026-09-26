import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { generateTaxWorkbook } from "../frontend/src/taxWorkbook.mjs";

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
if (!inputPath || args.includes("--help")) {
  console.log(`Usage: npm run generate-workbook -- <activity.csv> [options]

Options:
  --output <file.xlsx>       Output workbook path
  --rates-api <url>          Exchange-rate endpoint (default: http://localhost:8080/api/tax/exchange-rates)`);
  process.exit(args.includes("--help") ? 0 : 1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(resolvedInput)) throw new Error(`Input file not found: ${resolvedInput}`);

const exchangeRatesApi = option("rates-api", process.env.TAX_RATES_API_URL ?? "http://localhost:8080/api/tax/exchange-rates");
const workbook = await generateTaxWorkbook({
  csvText: fs.readFileSync(resolvedInput, "utf8"),
  exchangeRatesApi,
});

const defaultOutput = path.join(path.dirname(resolvedInput), `${path.basename(resolvedInput, path.extname(resolvedInput))}-tax-workpaper.xlsx`);
const outputPath = path.resolve(process.cwd(), option("output", defaultOutput));
fs.writeFileSync(outputPath, Buffer.from(workbook));
console.log(`Workbook written to ${outputPath}`);