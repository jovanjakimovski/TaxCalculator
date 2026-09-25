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
const flag = (name, fallback = false) => {
  const value = option(name, undefined);
  return value === undefined ? fallback : value !== "false";
};

if (!inputPath || args.includes("--help")) {
  console.log(`Usage: npm run generate-workbook -- <activity.csv> [options]

Options:
  --output <file.xlsx>       Output workbook path
  --api <url>                Tax API URL (default: http://localhost:8080/api/tax/realized-gains)
  --offset <0|1>             FX date offset (default: 1)
  --securities-rate <rate>   Securities tax rate (default: 10)
  --dividend-rate <rate>     Dividend tax rate (default: 10)
  --forex-rate <rate>        Forex tax rate (default: 10)
  --interest-rate <rate>     Interest tax rate (default: 10)
  --include-forex <bool>     Include Forex in the workpaper (default: false)
  --include-dividends <bool> Include dividends in the workpaper (default: true)
  --offset-securities <bool> Offset securities losses (default: false)
  --offset-forex <bool>      Offset Forex losses (default: false)
  --offset-all <bool>        Offset losses across sections (default: false)`);
  process.exit(args.includes("--help") ? 0 : 1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(resolvedInput)) throw new Error(`Input file not found: ${resolvedInput}`);

const api = option("api", process.env.TAX_API_URL ?? "http://localhost:8080/api/tax/realized-gains");
const workbook = await generateTaxWorkbook({
  csvText: fs.readFileSync(resolvedInput, "utf8"),
  fileName: path.basename(resolvedInput),
  api,
  options: {
    rateOffsetDays: Number(option("offset", "1")),
    securitiesTaxRate: Number(option("securities-rate", "10")),
    dividendTaxRate: Number(option("dividend-rate", "10")),
    forexTaxRate: Number(option("forex-rate", "10")),
    interestTaxRate: Number(option("interest-rate", "10")),
    offsetSecuritiesLosses: flag("offset-securities"),
    offsetForexLosses: flag("offset-forex"),
    offsetAcrossSections: flag("offset-all"),
    includeForex: flag("include-forex"),
    includeDividends: flag("include-dividends", true),
  },
});

const defaultOutput = path.join(path.dirname(resolvedInput), `${path.basename(resolvedInput, path.extname(resolvedInput))}-tax-workpaper.xlsx`);
const outputPath = path.resolve(process.cwd(), option("output", defaultOutput));
fs.writeFileSync(outputPath, Buffer.from(workbook));
console.log(`Workbook written to ${outputPath}`);