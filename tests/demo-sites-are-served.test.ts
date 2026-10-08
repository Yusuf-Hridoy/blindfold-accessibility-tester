import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDemoSiteServer, type RunningDemoSiteServer } from "../demo-sites/serve-demo-sites.ts";

const SHOP_PAGES = ["/", "/index.html", "/product-linen-tote-bag.html", "/cart.html", "/checkout.html"];

/** Sends a raw path, because fetch() would normalise "../" away before it reached the server. */
function getStatusForRawPath(port: number, rawPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: "localhost", port, path: rawPath }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

for (const shop of ["buggy", "accessible"] as const) {
  describe(`${shop} shop`, () => {
    let server: RunningDemoSiteServer;

    beforeAll(async () => {
      server = await startDemoSiteServer({ shop, port: 0 });
    });

    afterAll(async () => {
      await server.close();
    });

    it.each(SHOP_PAGES)("serves %s with the shop name", async (pagePath) => {
      const response = await fetch(`${server.url}${pagePath}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("Pebble & Pine");
    });

    it("serves the stylesheet and script", async () => {
      expect((await fetch(`${server.url}/shop-styles.css`)).status).toBe(200);
      expect((await fetch(`${server.url}/shop-behaviour.js`)).status).toBe(200);
    });

    it("returns 404 for a missing page", async () => {
      expect((await fetch(`${server.url}/no-such-page.html`)).status).toBe(404);
    });

    it("refuses paths that leave the shop folder", async () => {
      expect(await getStatusForRawPath(server.port, "/..%2fserve-demo-sites.ts")).toBe(400);
    });
  });
}
