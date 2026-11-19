/* The Cloudflare Worker behind whoisstronger.org.
   Static files (index.html, js, css, pictures) are served by Cloudflare
   directly. This script only runs for paths that aren't files:
     POST /api/vote, /api/slider, /api/score  → votes database (D1, binding "DB")
     anything else                            → the 404 page               */
import * as vote from "./api/vote.js";
import * as slider from "./api/slider.js";
import * as score from "./api/score.js";

const ROUTES = { "/api/vote": vote, "/api/slider": slider, "/api/score": score };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname.replace(/\/$/, "")];
    if (route) {
      if (request.method !== "POST") return route.onRequest();
      if (!env.DB) return json({ error: "votes database is not connected yet" }, 503);
      try { return await route.onRequestPost({ request, env }); }
      catch (e) { return json({ error: "server error" }, 500); }
    }
    return env.ASSETS.fetch(request); // falls back to 404.html
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
