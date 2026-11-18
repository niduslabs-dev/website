/**
 * niduslabs.dev's Worker. Static assets answer every path except the two
 * live releases pages, which wrangler.jsonc's `run_worker_first` sends here.
 */
import { APPS, serveReleases } from "./releases.js";

const RELEASES_PATH = /^\/(drop|pane)\/releases(\/?)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = RELEASES_PATH.exec(url.pathname);
    if (!match || !Object.hasOwn(APPS, match[1])) return env.ASSETS.fetch(request);
    if (match[2]) return Response.redirect(`${url.origin}/${match[1]}/releases`, 301);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return serveReleases(match[1], {
      method: request.method,
      build: env.CF_VERSION_METADATA?.id ?? "dev",
      fetch: (input, init) => fetch(input, init),
      cache: caches.default,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};
