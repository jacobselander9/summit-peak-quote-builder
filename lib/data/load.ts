// Server-only: reads /data from disk. The browser gets the parsed Dataset
// passed down from the server instead of importing this file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { DATA_FILE_NAMES, parseDataset, type Dataset, type RawDataFiles } from "./parse";

export const DATA_DIR = path.join(process.cwd(), "data");

export function readRawDataFiles(dir: string = DATA_DIR): RawDataFiles {
  const raw = {} as RawDataFiles;
  for (const name of DATA_FILE_NAMES) {
    raw[name] = readFileSync(path.join(dir, name), "utf8");
  }
  return raw;
}

let cached: Dataset | null = null;

/** Loads and validates every file in /data. Throws a DataError if anything is wrong. */
export function loadDataset(dir: string = DATA_DIR): Dataset {
  if (dir !== DATA_DIR) return parseDataset(readRawDataFiles(dir));
  cached ??= parseDataset(readRawDataFiles(dir));
  return cached;
}
