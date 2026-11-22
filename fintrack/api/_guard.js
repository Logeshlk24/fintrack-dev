// api/_guard.js — shared checks for the stock-* routes.
// (Files starting with "_" are not exposed as routes by Vercel.)
//
// What this does:
//   • Rejects browser requests coming from other websites (cross-origin / cross-site),
//     and only sends CORS headers back to your own origin(s).
//   • Validates ticker symbols and caps how many can be requested at once, so the
//     endpoints can't be used as a general-purpose Yahoo Finance proxy.
//
// What it cannot do: stop a non-browser client (curl, a script) that sends no Origin
// header. For that you would require a Firebase ID token on every call.
//
// Optional env vars:
//   NEXT_PUBLIC_APP_URL — your production URL (already used by drive-token.js)
//   ALLOWED_ORIGINS     — extra comma-separated origins (e.g. a staging domain)
// Requests from the same host as the API itself (your Vercel deployment, including
// preview URLs) are always allowed.

export const MAX_TICKERS = 100;
const TICKER_RE = /^[A-Z0-9^.=&_-]{1,25}$/;

const allowedOrigins = () =>
  new Set(
    [process.env.NEXT_PUBLIC_APP_URL, ...(process.env.ALLOWED_ORIGINS || "").split(",")]
      .map(o => (o || "").trim().replace(/\/$/, ""))
      .filter(Boolean)
  );

// Returns true when the route should continue. Otherwise it has already replied.
export function guard(req, res) {
  const origin = req.headers.origin;
  const host   = req.headers.host;
  const site   = req.headers["sec-fetch-site"];
  const allowed = allowedOrigins();

  let sameHost = false;
  if (origin) { try { sameHost = new URL(origin).host === host; } catch (_) { /* bad Origin */ } }
  const originOk = !origin || sameHost || allowed.has(origin);

  if (!originOk || (site === "cross-site" && !(origin && allowed.has(origin)))) {
    res.status(403).json({ error: "Origin not allowed" });
    return false;
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") { res.status(200).end(); return false; }
  if (req.method !== "GET")     { res.status(405).json({ error: "Method not allowed" }); return false; }
  return true;
}

export const isValidTicker = (t) => TICKER_RE.test(String(t).toUpperCase());

// Parses "A,B,C" → ["A","B","C"] (upper-cased, de-duplicated, validated, capped).
// Returns null after sending a 400 if the input is not acceptable.
export function parseTickers(raw, res) {
  const text = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
  const list = [...new Set(text.split(",").map(t => t.trim().toUpperCase()).filter(Boolean))];
  if (!list.length) { res.status(400).json({ error: "No valid tickers" }); return null; }
  if (list.length > MAX_TICKERS) {
    res.status(400).json({ error: `Too many tickers (max ${MAX_TICKERS})` });
    return null;
  }
  if (!list.every(t => TICKER_RE.test(t))) { res.status(400).json({ error: "Invalid ticker" }); return null; }
  return list;
}
