// Opens a link in the default browser: `open` (macOS), `start` (Windows) or
// `xdg-open` (Linux). Failing to open is fine: the link is printed anyway.

import { spawn } from "node:child_process";

function openCommand(url: string): [string, string[]] {
  if (process.platform === "darwin") return ["open", [url]];
  // `start` is built into cmd; the empty "" is the window title.
  if (process.platform === "win32") return ["cmd", ["/c", "start", '""', url]];
  return ["xdg-open", [url]];
}

export function openInBrowser(url: string): void {
  const [command, args] = openCommand(url);
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: process.platform === "win32" });
    child.on("error", () => console.log("  Couldn't open your browser. Open the link above yourself."));
    child.unref();
  } catch {
    console.log("  Couldn't open your browser. Open the link above yourself.");
  }
}
