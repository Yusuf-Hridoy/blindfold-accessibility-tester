import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type DemoShopName = "buggy" | "accessible";

export interface RunningDemoSiteServer {
  shop: DemoShopName;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export const DEFAULT_DEMO_SHOP_PORTS: Record<DemoShopName, number> = {
  buggy: 4000,
  accessible: 4001,
};

const SHOP_FOLDERS: Record<DemoShopName, string> = {
  buggy: path.join(import.meta.dirname, "buggy-shop"),
  accessible: path.join(import.meta.dirname, "accessible-shop"),
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

/** Maps a URL path to a file inside the shop folder, or null if it points outside it. */
function resolveFileInsideShop(shopFolder: string, urlPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relativePath = decodedPath.endsWith("/") ? `${decodedPath}index.html` : decodedPath;
  const filePath = path.resolve(shopFolder, `.${relativePath}`);
  return filePath.startsWith(shopFolder + path.sep) ? filePath : null;
}

function createShopServer(shopFolder: string): Server {
  return createServer(async (request, response) => {
    const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const filePath = resolveFileInsideShop(shopFolder, urlPath);
    if (filePath === null) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad request");
      return;
    }
    try {
      const body = await readFile(filePath);
      const contentType = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
}

/** Starts one demo shop. Pass port 0 to get a random free port (used by tests). */
export function startDemoSiteServer(options: {
  shop: DemoShopName;
  port: number;
}): Promise<RunningDemoSiteServer> {
  const server = createShopServer(SHOP_FOLDERS[options.shop]);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port;
      resolve({
        shop: options.shop,
        port,
        url: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.closeAllConnections();
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}

function describeStartError(shop: DemoShopName, port: number, error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") {
    return `Port ${port} is already in use, so the ${shop} shop cannot start. Stop whatever is using it and try again.`;
  }
  return `The ${shop} shop could not start: ${String(error)}`;
}

async function runFromCommandLine(): Promise<void> {
  const choice = process.argv[2];
  const shops: DemoShopName[] =
    choice === "buggy" ? ["buggy"] : choice === "accessible" ? ["accessible"] : choice === "both" ? ["buggy", "accessible"] : [];
  if (shops.length === 0) {
    console.error("Usage: tsx demo-sites/serve-demo-sites.ts <buggy|accessible|both>");
    process.exit(1);
  }

  const running: RunningDemoSiteServer[] = [];
  for (const shop of shops) {
    const port = DEFAULT_DEMO_SHOP_PORTS[shop];
    try {
      running.push(await startDemoSiteServer({ shop, port }));
    } catch (error) {
      console.error(describeStartError(shop, port, error));
      await Promise.all(running.map((server) => server.close()));
      process.exit(1);
    }
  }
  for (const server of running) {
    console.log(`Pebble & Pine (${server.shop} shop): ${server.url}`);
  }
  console.log("Press Ctrl+C to stop.");
}

const isRunDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  await runFromCommandLine();
}
