# 🌍 WorldPulse

A multi-API dashboard that lets you search any country or city and instantly see **live weather**, **breaking news headlines**, and **key country facts** — all in one place.

> Built with Node.js + Express. No build step. Runs on any machine with Node ≥ 16.

---

## 🚀 How to Run

### Prerequisites

- **Node.js ≥ 16** — [download here](https://nodejs.org/)
- A free **NewsAPI key** (optional, but recommended) — [get one here](https://newsapi.org/register) (60-second signup, no credit card)

### Steps

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd worldpulse   # or wherever you cloned it

# 2. Install dependencies
npm install

# 3. Set up your environment (copy template, fill in your key)
copy .env.example .env
```

Open `.env` and replace `your_newsapi_key_here` with your actual NewsAPI key:

```
NEWS_API_KEY=abc123yourkeyhere
```

> **Skipping the key?** The app still works — weather and country info load fine. The news section will show a friendly "key not configured" message.

```bash
# 4. Start the server
npm start
```

```
Open http://localhost:3000 in your browser
```

That's it. No build step, no database, no Docker needed.

---

## 📡 APIs Used

| API | Purpose | Key Required? |
|-----|---------|---------------|
| [REST Countries v3](https://restcountries.com) | Country name, flag, capital, population | ❌ No |
| [Open-Meteo](https://open-meteo.com) | Current weather (temperature, wind, humidity) | ❌ No |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Lat/lng lookup for city names | ❌ No |
| [NewsAPI](https://newsapi.org) | Latest news headlines (6 articles) | ✅ Free key |

All API calls are **proxied through the Express server** — your NewsAPI key is never exposed to the browser.

---

## 🗂️ Project Structure

```
worldpulse/
├── server.js         # Express server + all API proxy routes
├── package.json
├── .env.example      # Copy to .env, add your NewsAPI key
├── .gitignore
├── public/
│   ├── index.html    # Main UI (semantic HTML, no framework)
│   ├── style.css     # Premium dark-mode styles (vanilla CSS)
│   └── app.js        # Frontend JS (fetch, render, error handling)
├── README.md
└── ANSWERS.md
```

---

## ⚡ Features

- **Search** any country or city name
- **Country card** — flag, capital, region, population, area, languages, currency
- **Weather card** — temperature, feels like, humidity, wind speed, weather description + emoji (WMO codes)
- **News feed** — 6 latest headlines with thumbnails, source names, relative timestamps
- **Quick chips** — one-click for Pakistan, Japan, USA, etc.
- **Graceful degradation** — if any one section fails, the other two still render
- **Skeleton loaders** during data fetch
- **Fully responsive** — works on mobile

---

## 🛡️ Error Handling

The app handles all of these:

| Scenario | Behaviour |
|----------|-----------|
| Empty/whitespace search | Inline error before any API call |
| Country not found | Friendly "not found" message in card |
| API timeout (>8s) | AbortController fires, error displayed |
| NewsAPI 429 rate limit | Specific "rate limit" message shown |
| NewsAPI key missing/invalid | Warning at startup; graceful UI message |
| Weather coords unavailable | Falls back to geocoding, or shows error |
| News API down | Error shown in news card, other cards still render |

---

## 🧪 Deliberately Testing Edge Cases

```bash
# Test empty input: just press Search with nothing typed

# Test bad input:
# Type "xyzxyzxyz" — returns "no country found", weather/news attempt anyway

# Simulate rate limit: change NEWS_API_KEY to "invalid" in .env
# → news card shows "Invalid NewsAPI key" message

# Simulate timeout: disconnect internet, search something
# → "Request timed out after 8s" message
```

---

## 🔒 Security Notes

- `.env` is in `.gitignore` — your API key is never committed
- All external API calls go through the server — client never sees keys
- No user data is stored or logged

---

*Built with Node.js · Express · REST Countries · Open-Meteo · NewsAPI*
