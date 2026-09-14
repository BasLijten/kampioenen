import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  FileBacktestReportStore,
  runChronologicalBacktest,
  verifyBacktestReproducibility,
  type BacktestMatchRow,
  type ChronologicalBacktestOptions,
  type ShadowRunCheck,
} from "../lib/backtest";

interface CliOptions {
  input: string;
  output: string;
  datasetVersion: string;
  generatedAt?: string;
  baseline?: ChronologicalBacktestOptions["baseline"];
  shadowRunPath?: string;
}

function usage(): string {
  return [
    "Usage: npm run backtest -- --input <rows.json> --output <directory> --dataset-version <version>",
    "  --generated-at <ISO timestamp>  freeze report metadata for reproducible reruns",
    "  --baseline <clubelo-direct|bzzoiro|poisson>  production comparison baseline",
    "  --shadow-run <path>  JSON proof of a completed clean full-round shadow run",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Invalid argument: ${argument}`);
    values.set(argument.slice(2), argv[index + 1]);
    index += 1;
  }
  const input = values.get("input");
  const output = values.get("output");
  const datasetVersion = values.get("dataset-version");
  if (!input || !output || !datasetVersion) throw new Error(`Missing required arguments.\n${usage()}`);
  const baseline = values.get("baseline") as CliOptions["baseline"];
  if (baseline && !["clubelo-direct", "bzzoiro", "poisson"].includes(baseline)) throw new Error("--baseline must be clubelo-direct, bzzoiro, or poisson");
  return { input, output, datasetVersion, generatedAt: values.get("generated-at"), baseline, shadowRunPath: values.get("shadow-run") };
}

function readRows(path: string): BacktestMatchRow[] {
  const value = JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
  if (Array.isArray(value)) return value as BacktestMatchRow[];
  if (typeof value === "object" && value !== null && Array.isArray((value as { rows?: unknown }).rows)) return (value as { rows: BacktestMatchRow[] }).rows;
  throw new Error("backtest input must be an array or an object with a rows array");
}

function readShadowRun(path: string | undefined): ShadowRunCheck | undefined {
  if (!path) return undefined;
  const value = JSON.parse(readFileSync(resolve(path), "utf8")) as Partial<ShadowRunCheck>;
  if (typeof value.completed !== "boolean" || typeof value.fullRound !== "boolean" || !Array.isArray(value.dataQualityErrors)) throw new Error("shadow-run input must contain completed, fullRound, and dataQualityErrors");
  return { completed: value.completed, fullRound: value.fullRound, dataQualityErrors: value.dataQualityErrors.filter((error): error is string => typeof error === "string") };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseArgs(argv);
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const shadowRun = readShadowRun(options.shadowRunPath);
    const runOptions: ChronologicalBacktestOptions = {
      datasetVersion: options.datasetVersion,
      generatedAt,
      baseline: options.baseline,
      shadowRun,
    };
    const rows = readRows(options.input);
    const reproducible = verifyBacktestReproducibility(rows, runOptions);
    const finalReport = runChronologicalBacktest(rows, { ...runOptions, reproducible });
    mkdirSync(dirname(resolve(options.output)), { recursive: true });
    await new FileBacktestReportStore(resolve(options.output)).save(finalReport);
    console.log(`Wrote ${resolve(options.output)}/${finalReport.reportId}.json`);
    console.log(`Promotion: ${finalReport.promotion.status} (${finalReport.promotion.passed ? "passed" : "blocked"})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("backtest.ts")) void main();
