// Maps a URL path to a file inside a folder, refusing anything that would
// leave it ("..", encoded or not). Used by the demo shops and the web UI.

import path from "node:path";

/** The file inside `folder` that `urlPath` names (a trailing "/" means index.html), or null if it points outside. */
export function resolveFileInsideFolder(folder: string, urlPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decodedPath.includes("\0")) return null;
  const relativePath = decodedPath.endsWith("/") ? `${decodedPath}index.html` : decodedPath;
  const root = path.resolve(folder);
  const filePath = path.resolve(root, `.${relativePath.startsWith("/") ? "" : "/"}${relativePath}`);
  return filePath.startsWith(root + path.sep) ? filePath : null;
}
