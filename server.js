/**
 * WorldPulse — Multi-API Dashboard Server
 *
 * APIs used:
 *  1. REST Countries  — https://restcountries.com       (free, no key)
 *  2. Open-Meteo      — https://open-meteo.com          (free, no key)
 *  3. NewsAPI         — https://newsapi.org              (free, key required)
 *
 * All external API calls are proxied through this server so:
 *  - API keys are never exposed to the browser
 *  - We can apply consistent timeout + error handling in one place
 */

'use strict';

require('dotenv').config();

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Startup checks ──────────────────────────────────────────────────────────

const NEWS_API_KEY = process.env.NEWS_API_KEY;

if (!NEWS_API_KEY || NEWS_API_KEY === 'your_newsapi_key_here') {
  console.warn(
    '\n⚠️  WARNING: NEWS_API_KEY is not set in .env\n' +
    '   News headlines will return a friendly "not configured" message.\n' +
    '   Get a free key at: https://newsapi.org/register\n'
  );
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: fetch with timeout ───────────────────────────────────────────────

/**
 * Wraps node-fetch with an AbortController-based timeout.
 *
 * Edge case handled (line ~50): If a downstream API hangs, the AbortController
 * fires after `ms` milliseconds and throws an AbortError. Without this, a slow
 * API could keep the user waiting indefinitely — the browser would eventually
 * time out too, but users would see a blank spinner with no feedback.
 *
 * @param {string} url    - Target URL
 * @param {object} opts   - fetch options
 * @param {number} ms     - Timeout in milliseconds (default 8000)
 */
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

// ─── Input validation middleware ──────────────────────────────────────────────

/**
 * Validates the `q` query param used by all search endpoints.
 *
 * Edge case handled: Empty or whitespace-only queries (e.g., user presses
 * Search with an empty field, or sends "   "). Without this check the APIs
 * would receive a blank query and return confusing or empty results.
 */
function validateQuery(req, res, next) {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({
      error: 'Please enter a country or city name to search.',
    });
  }
  req.query.q = q; // use trimmed value downstream
  next();
}

// ─── Route: GET /api/country?q=<name> ────────────────────────────────────────

app.get('/api/country', validateQuery, async (req, res) => {
  const query = req.query.q;

  try {
    const response = await fetchWithTimeout(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fullText=false`
    );

    // Edge case: API returns 404 when country not found
    if (response.status === 404) {
      return res.json({ found: false, message: `No country found matching "${query}".` });
    }

    if (!response.ok) {
      throw new Error(`REST Countries API responded with status ${response.status}`);
    }

    const data = await response.json();

    // Return only what we need — don't forward entire payload
    const country = data[0];
    res.json({
      found: true,
      name:       country.name?.common || query,
      official:   country.name?.official,
      capital:    country.capital?.[0] || 'N/A',
      region:     country.region,
      subregion:  country.subregion,
      population: country.population,
      area:       country.area,
      languages:  Object.values(country.languages || {}),
      currencies: Object.values(country.currencies || {}).map(c => `${c.name} (${c.symbol})`),
      flag:       country.flags?.svg || country.flags?.png,
      flagAlt:    country.flags?.alt || '',
      maps:       country.maps?.googleMaps,
      timezones:  country.timezones,
      latlng:     country.latlng,
    });
  } catch (err) {
    console.error('[/api/country]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Route: GET /api/weather?lat=<>8lng=<> ───────────────────────────────────

app.get('/api/weather', async (req, res) => {
  const { lat, lng, name } = req.query;

  // Edge case: coordinates missing (e.g., country not found upstream)
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required for weather lookup.' });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  // Edge case: non-numeric coordinates
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Invalid coordinates provided.' });
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',            latNum.toFixed(4));
    url.searchParams.set('longitude',           lngNum.toFixed(4));
    url.searchParams.set('current',             [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'weather_code',
      'is_day',
    ].join(','));
    url.searchParams.set('wind_speed_unit',     'kmh');
    url.searchParams.set('timezone',            'auto');
    url.searchParams.set('forecast_days',       '1');

    const response = await fetchWithTimeout(url.toString());

    if (!response.ok) {
      throw new Error(`Open-Meteo API responded with status ${response.status}`);
    }

    const data = await response.json();
    const cur  = data.current;

    res.json({
      location:    name || `${latNum.toFixed(2)}, ${lngNum.toFixed(2)}`,
      temperature: cur.temperature_2m,
      feelsLike:   cur.apparent_temperature,
      humidity:    cur.relative_humidity_2m,
      windSpeed:   cur.wind_speed_10m,
      weatherCode: cur.weather_code,
      isDay:       cur.is_day,
      timezone:    data.timezone,
      units: {
        temperature: data.current_units?.temperature_2m || '°C',
        wind:        data.current_units?.wind_speed_10m || 'km/h',
      },
    });
  } catch (err) {
    console.error('[/api/weather]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Route: GET /api/news?q=<country> ────────────────────────────────────────

app.get('/api/news', validateQuery, async (req, res) => {
  const query = req.query.q;

  // Edge case: API key not configured
  if (!NEWS_API_KEY || NEWS_API_KEY === 'your_newsapi_key_here') {
    return res.status(503).json({
      error: 'News API key not configured. Add NEWS_API_KEY to your .env file.',
      setupUrl: 'https://newsapi.org/register',
    });
  }

  try {
    const url = new URL('https://newsapi.org/v2/everything');
    url.searchParams.set('q',        query);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy',   'publishedAt');
    url.searchParams.set('pageSize', '6');
    url.searchParams.set('apiKey',   NEWS_API_KEY);

    const response = await fetchWithTimeout(url.toString(), {}, 10000);

    // Edge case: rate limit exceeded (free tier = 100 req/day)
    if (response.status === 429) {
      return res.status(429).json({
        error: 'NewsAPI rate limit reached (100 requests/day on free tier). Try again later.',
      });
    }

    // Edge case: invalid / revoked API key
    if (response.status === 401) {
      return res.status(401).json({
        error: 'Invalid NewsAPI key. Check your NEWS_API_KEY in .env.',
      });
    }

    if (!response.ok) {
      throw new Error(`NewsAPI responded with status ${response.status}`);
    }

    const data = await response.json();

    // Edge case: NewsAPI returns ok:false with an error message in the body
    if (data.status !== 'ok') {
      return res.status(400).json({ error: data.message || 'NewsAPI returned an error.' });
    }

    // Filter out articles with [Removed] content (NewsAPI quirk for paywalled items)
    const articles = (data.articles || [])
      .filter(a => a.title && a.title !== '[Removed]' && a.url)
      .slice(0, 6)
      .map(a => ({
        title:       a.title,
        description: a.description,
        url:         a.url,
        image:       a.urlToImage,
        source:      a.source?.name,
        publishedAt: a.publishedAt,
      }));

    res.json({ articles, total: data.totalResults });
  } catch (err) {
    console.error('[/api/news]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Route: GET /api/geocode?q=<city> ────────────────────────────────────────
// Used to look up lat/lng for a city name when country lat/lng is not precise enough

app.get('/api/geocode', validateQuery, async (req, res) => {
  const query = req.query.q;

  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name',    query);
    url.searchParams.set('count',   '1');
    url.searchParams.set('format',  'json');

    const response = await fetchWithTimeout(url.toString());

    if (!response.ok) {
      throw new Error(`Geocoding API responded with status ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.json({ found: false, message: `Could not find coordinates for "${query}".` });
    }

    const loc = data.results[0];
    res.json({
      found:   true,
      name:    loc.name,
      country: loc.country,
      lat:     loc.latitude,
      lng:     loc.longitude,
    });
  } catch (err) {
    console.error('[/api/geocode]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─── Catch-all: serve index.html for any non-API route ───────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌍 WorldPulse is running at http://localhost:${PORT}\n`);
  console.log('APIs:');
  console.log('  ✅ REST Countries  — ready (no key needed)');
  console.log('  ✅ Open-Meteo      — ready (no key needed)');
  console.log(`  ${NEWS_API_KEY && NEWS_API_KEY !== 'your_newsapi_key_here' ? '✅' : '⚠️ '} NewsAPI           — ${NEWS_API_KEY && NEWS_API_KEY !== 'your_newsapi_key_here' ? 'ready' : 'key missing (see .env.example)'}`);
  console.log('');
});
