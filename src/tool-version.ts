import { readFileSync } from "node:fs";
import path from "node:path";

const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };

export const TOOL_VERSION: string = packageJson.version;
