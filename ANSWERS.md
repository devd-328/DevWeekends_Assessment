# ANSWERS.md

---

## 1. How to Run

**Prerequisites:** Node.js ≥ 16 (https://nodejs.org). A free NewsAPI key is optional but recommended (https://newsapi.org/register — 60-second signup, no card).

```bash
git clone <repo-url>
cd worldpulse
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # Mac/Linux
```

Edit `.env`, replace `your_newsapi_key_here` with your actual key, then:

```bash
npm start
```

Open **http://localhost:3000** in a browser. Done.

> If you skip the NewsAPI key, weather and country info still load. The news section shows a friendly setup message instead.

---

## 2. Stack Choice

**I chose Node.js + Express + Vanilla JS.**

**Why this stack:**

- **Node.js** is the minimal runtime for a server-side proxy — no compilation, runs anywhere, and `node-fetch` + `AbortController` give clean timeout handling.
- **Express** adds routing and static file serving in ~5 lines. Its middleware model made input validation (`validateQuery`) trivial to reuse across routes.
- **Vanilla JS (no frontend framework)** — The UI has three data cards and a search bar. React or Vue would add a 200KB bundle, a build step, and a node_modules that dwarfs the app itself, for zero actual benefit here. Vanilla `fetch` + `innerHTML` templating is faster to ship and easier to audit.
- **node-fetch v2** (CommonJS) instead of v3 (ESM-only) so the whole project stays CommonJS — no transpilation, no `"type":"module"` friction.

**A worse choice would be:** Python + Flask with server-side Jinja2 rendering.

- It would require `pip`, a virtual environment setup, and `waitress` or `gunicorn` for serving static files properly.
- Jinja2 templates make it harder to show graceful partial failures (e.g., news fails but weather still renders) — you'd re-render the entire page on each search.
- Python's `requests` library is synchronous by default; async (`httpx` + `asyncio`) adds complexity just to match what `node-fetch` + `Promise.allSettled` gives for free.

---

## 3. One Real Edge Case

**Scenario:** The user's search succeeds for country info, but the weather API takes longer than 8 seconds (e.g., Open-Meteo is under load, or the user is on a slow connection).

**File:** [`server.js`](./server.js), lines ~50–70 (`fetchWithTimeout` function).

```js
// server.js ~line 50
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${ms / 1000}s — the API may be slow or unreachable.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

**What happens without this:** Node's `node-fetch` has no default timeout. If Open-Meteo hangs, the weather route handler `await`s forever. The browser eventually gives up (after 2+ minutes), but the user sees a frozen spinner with no feedback — and on the server side, the connection hangs indefinitely, leaking memory.

**What happens with it:** After 8 seconds, `AbortController.abort()` fires. The `AbortError` is caught and re-thrown as a readable message: `"Request timed out after 8s"`. On the frontend, `Promise.allSettled` (in `app.js`, the parallel fetch block) catches the rejected weather promise while still resolving the news promise — so country info and news still render, and the weather card shows the timeout error instead of staying blank.

---

## 4. AI Usage

I used **Google Gemini (Antigravity IDE)** throughout this project. Here's every place:

| # | What I asked | What it gave |
|---|---|---|
| 1 | Generate the full Express server with timeout, input validation, and per-status-code error handling | A complete `server.js` with `fetchWithTimeout`, `validateQuery` middleware, and 429/401/404 handlers |
| 2 | Build a WMO weather code → emoji + label mapping table | A `WMO_CODES` object covering codes 0–99 |
| 3 | Write the CSS for a glassmorphism dark-mode dashboard | Full `style.css` with CSS variables, shimmer skeleton animation, responsive grid |
| 4 | Generate skeleton loader HTML that matches the final card layout | Skeleton markup matching the 2-col grid |
| 5 | Write the ANSWERS.md responses | Draft answers for all 5 questions |

**One thing I changed about the AI output:**

For question 1 (the server), the AI initially put the `validateQuery` middleware inline inside each route handler, repeating the check three times. I asked it to extract this into a named middleware function so it could be reused as `app.get('/api/country', validateQuery, ...)` — the Express middleware chain pattern. This is cleaner, more testable, and follows the single-responsibility principle. If the validation rules change (e.g., adding a max-length check), there's one place to update.

I also changed the AI's initial NewsAPI rate-limit handling — it returned a generic 502, which would make client-side code treat it the same as a server crash. I changed it to return a **429** so the frontend can distinguish "slow/broken" from "quota exceeded" and show a different, more helpful message.

---

## 5. Honest Gap

**The gap:** NewsAPI's free tier allows **100 requests per day**, shared across all users (or all your own searches). If the app were deployed publicly or tested heavily, it would hit this limit quickly, and every subsequent news search would fail for the rest of the day.

**What I'd do with another day:**

1. **Add server-side response caching** with a simple in-memory TTL store (or Redis for production). Cache news results per query for 15–30 minutes — NewsAPI's data doesn't change second-to-second anyway.

```js
// Rough sketch:
const cache = new Map(); // { query -> { data, expiresAt } }

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
}
```

2. **Swap NewsAPI for a key-free alternative** for the demo version — [GNews API](https://gnews.io) has a generous free tier (100 req/day but resets daily and caches better), or [The Guardian API](https://open-platform.theguardian.com) is completely free with a 5000 req/day cap.

3. **Add a usage counter** displayed in the UI so users know how many requests remain before hitting the limit.
