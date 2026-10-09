// Copies the non-TypeScript files the compiled code reads at runtime into dist/.
// Run after `tsc -p tsconfig.build.json` (see the "build" script).

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.join(import.meta.dirname, "..");
const RUNTIME_ASSETS = ["reports/html-report-template.html"];

for (const asset of RUNTIME_ASSETS) {
  const target = path.join(projectRoot, "dist", asset);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(projectRoot, "src", asset), target);
  console.log(`Copied ${asset} to dist/`);
}
