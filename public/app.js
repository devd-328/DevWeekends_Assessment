/**
 * WorldPulse — Frontend Application
 *
 * Talks only to our own Express server (/api/*).
 * Never makes direct calls to external APIs (keys stay server-side).
 */

'use strict';

// ─── WMO Weather Code → label + emoji ────────────────────────────────────────
// Reference: https://open-meteo.com/en/docs#weathervariables
const WMO_CODES = {
  0:  { label: 'Clear Sky',             emoji: '☀️'  },
  1:  { label: 'Mainly Clear',          emoji: '🌤️' },
  2:  { label: 'Partly Cloudy',         emoji: '⛅'  },
  3:  { label: 'Overcast',              emoji: '☁️'  },
  45: { label: 'Fog',                   emoji: '🌫️' },
  48: { label: 'Icy Fog',               emoji: '🌫️' },
  51: { label: 'Light Drizzle',         emoji: '🌦️' },
  53: { label: 'Moderate Drizzle',      emoji: '🌦️' },
  55: { label: 'Dense Drizzle',         emoji: '🌧️' },
  61: { label: 'Slight Rain',           emoji: '🌧️' },
  63: { label: 'Moderate Rain',         emoji: '🌧️' },
  65: { label: 'Heavy Rain',            emoji: '🌧️' },
  71: { label: 'Slight Snow',           emoji: '🌨️' },
  73: { label: 'Moderate Snow',         emoji: '❄️'  },
  75: { label: 'Heavy Snow',            emoji: '❄️'  },
  77: { label: 'Snow Grains',           emoji: '🌨️' },
  80: { label: 'Slight Showers',        emoji: '🌦️' },
  81: { label: 'Moderate Showers',      emoji: '🌧️' },
  82: { label: 'Violent Showers',       emoji: '⛈️'  },
  85: { label: 'Slight Snow Showers',   emoji: '🌨️' },
  86: { label: 'Heavy Snow Showers',    emoji: '❄️'  },
  95: { label: 'Thunderstorm',          emoji: '⛈️'  },
  96: { label: 'Thunderstorm + Hail',   emoji: '⛈️'  },
  99: { label: 'Heavy Thunderstorm',    emoji: '⛈️'  },
};

function getWeatherInfo(code, isDay) {
  const info = WMO_CODES[code] || { label: 'Unknown', emoji: '🌍' };
  // Show moon emoji at night for clear/mainly clear
  if (!isDay && (code === 0 || code === 1)) {
    return { label: info.label, emoji: '🌙' };
  }
  return info;
}

// ─── Utility: Format large numbers ───────────────────────────────────────────
function formatNumber(n) {
  if (!n && n !== 0) return 'N/A';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── Utility: Relative date ───────────────────────────────────────────────────
function relativeDate(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1)  return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

// ─── Utility: Safe API fetch with error normalisation ─────────────────────────
async function apiFetch(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ─── DOM references ───────────────────────────────────────────────────────────
const searchInput  = document.getElementById('search-input');
const searchBtn    = document.getElementById('search-btn');
const errorBanner  = document.getElementById('error-banner');
const errorText    = document.getElementById('error-text');
const loadingEl    = document.getElementById('loading');
const welcomeEl    = document.getElementById('welcome');
const resultsEl    = document.getElementById('results');

// ─── Show / hide helpers ──────────────────────────────────────────────────────
function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function showLoading() {
  welcomeEl.style.display  = 'none';
  resultsEl.classList.remove('visible');
  loadingEl.classList.add('visible');
  hideError();
}

function showResults() {
  loadingEl.classList.remove('visible');
  resultsEl.classList.add('visible');
}

function resetToWelcome() {
  loadingEl.classList.remove('visible');
  resultsEl.classList.remove('visible');
  welcomeEl.style.display = 'block';
}

// ─── Render: Country ──────────────────────────────────────────────────────────
function renderCountry(c) {
  const el = document.getElementById('country-card');

  if (!c.found) {
    el.innerHTML = `
      <div class="card-header">
        <span class="card-icon">🗺️</span>
        <span class="card-title">Country</span>
      </div>
      <p style="color:var(--text-secondary);font-size:.9rem">${c.message}</p>`;
    return;
  }

  el.innerHTML = `
    <div class="card-header">
      <span class="card-icon">🗺️</span>
      <span class="card-title">Country Info</span>
    </div>
    ${c.flag ? `<img class="country-flag" src="${c.flag}" alt="${c.flagAlt || c.name + ' flag'}" loading="lazy" onerror="this.style.display='none'">` : ''}
    <div class="country-name">${c.name}</div>
    ${c.official && c.official !== c.name ? `<div class="country-official">${c.official}</div>` : ''}
    <div class="stat-grid">
      <div class="stat-item">
        <div class="stat-label">Capital</div>
        <div class="stat-value">${c.capital || 'N/A'}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Region</div>
        <div class="stat-value">${c.region}${c.subregion ? ` · ${c.subregion}` : ''}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Population</div>
        <div class="stat-value">${formatNumber(c.population)}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Area</div>
        <div class="stat-value">${c.area ? formatNumber(c.area) + ' km²' : 'N/A'}</div>
      </div>
      ${c.languages?.length ? `
      <div class="stat-item">
        <div class="stat-label">Languages</div>
        <div class="stat-value">${c.languages.slice(0, 2).join(', ')}</div>
      </div>` : ''}
      ${c.currencies?.length ? `
      <div class="stat-item">
        <div class="stat-label">Currency</div>
        <div class="stat-value">${c.currencies[0]}</div>
      </div>` : ''}
    </div>`;
}

// ─── Render: Weather ──────────────────────────────────────────────────────────
function renderWeather(w) {
  const el = document.getElementById('weather-card');

  if (w.error) {
    el.innerHTML = `
      <div class="card-header">
        <span class="card-icon">🌤️</span>
        <span class="card-title">Weather</span>
      </div>
      <p style="color:var(--text-secondary);font-size:.9rem">⚠️ ${w.error}</p>`;
    return;
  }

  const info = getWeatherInfo(w.weatherCode, w.isDay);

  el.innerHTML = `
    <div class="card-header">
      <span class="card-icon">🌤️</span>
      <span class="card-title">Current Weather · ${w.location}</span>
    </div>
    <div class="weather-main">
      <div class="weather-icon">${info.emoji}</div>
      <div>
        <div class="weather-temp">${Math.round(w.temperature)}${w.units?.temperature || '°C'}</div>
        <div class="weather-desc">${info.label}</div>
      </div>
    </div>
    <div class="weather-stats">
      <div class="weather-stat">
        <div class="weather-stat-val">${Math.round(w.feelsLike)}°</div>
        <div class="weather-stat-label">Feels Like</div>
      </div>
      <div class="weather-stat">
        <div class="weather-stat-val">${w.humidity}%</div>
        <div class="weather-stat-label">Humidity</div>
      </div>
      <div class="weather-stat">
        <div class="weather-stat-val">${Math.round(w.windSpeed)}</div>
        <div class="weather-stat-label">Wind km/h</div>
      </div>
    </div>`;
}

// ─── Render: News ──────────────────────────────────────────────────────────────
function renderNews(data, query) {
  const container = document.getElementById('news-container');
  const countEl   = document.getElementById('news-count');

  if (data.error) {
    const isSetup = data.setupUrl;
    countEl.style.display = 'none';
    container.innerHTML = `
      <div class="news-empty">
        <span>⚠️</span>
        <div>
          ${data.error}
          ${isSetup ? `<br><a href="${data.setupUrl}" target="_blank" rel="noopener">Get a free NewsAPI key →</a>` : ''}
        </div>
      </div>`;
    return;
  }

  const articles = data.articles || [];
  countEl.textContent = articles.length;
  countEl.style.display = articles.length ? '' : 'none';

  if (!articles.length) {
    container.innerHTML = `<div class="news-empty"><span>📰</span><div>No recent English news found for "<strong>${query}</strong>".</div></div>`;
    return;
  }

  container.innerHTML = articles.map(a => `
    <a class="news-card" href="${a.url}" target="_blank" rel="noopener noreferrer">
      ${a.image
        ? `<img class="news-img" src="${a.image}" alt="${a.title}" loading="lazy" onerror="this.outerHTML='<div class=\\"news-img-placeholder\\">📰</div>'">`
        : '<div class="news-img-placeholder">📰</div>'}
      <div class="news-body">
        <div class="news-source">${a.source || 'News'}</div>
        <div class="news-title">${a.title}</div>
        <div class="news-date">${relativeDate(a.publishedAt)}</div>
      </div>
    </a>
  `).join('');
}

// ─── Main: Search ─────────────────────────────────────────────────────────────
async function doSearch(rawQuery) {
  // Edge case: empty input — show inline error, don't hit server
  const query = (rawQuery || '').trim();
  if (!query) {
    showError('Please enter a country or city name.');
    return;
  }

  showLoading();
  searchBtn.disabled = true;

  try {
    // Step 1: Look up country info
    const country = await apiFetch(`/api/country?q=${encodeURIComponent(query)}`);

    // Determine coordinates: use country latlng if found, else geocode the query
    let lat, lng, locationName;
    if (country.found && country.latlng) {
      [lat, lng] = country.latlng;
      locationName = country.capital || country.name;
    } else {
      // Fallback: geocode the raw query as a city name
      const geo = await apiFetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (geo.found) {
        lat = geo.lat; lng = geo.lng;
        locationName = geo.name;
      }
    }

    // Step 2: Parallel — weather + news (don't block each other)
    const [weatherData, newsData] = await Promise.allSettled([
      lat != null ? apiFetch(`/api/weather?lat=${lat}&lng=${lng}&name=${encodeURIComponent(locationName)}`) : Promise.resolve({ error: 'Location not found' }),
      apiFetch(`/api/news?q=${encodeURIComponent(query)}`),
    ]);

    // Render all sections
    renderCountry(country);
    renderWeather(weatherData.status === 'fulfilled' ? weatherData.value : { error: weatherData.reason?.message });
    renderNews(newsData.status   === 'fulfilled' ? newsData.value   : { error: newsData.reason?.message }, query);

    showResults();

    // Update page title for context
    document.title = `${country.found ? country.name : query} — WorldPulse`;

  } catch (err) {
    resetToWelcome();
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    searchBtn.disabled = false;
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

searchBtn.addEventListener('click', () => doSearch(searchInput.value));

// Enter key support
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(searchInput.value);
});

// Quick chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const val = chip.dataset.query;
    searchInput.value = val;
    doSearch(val);
  });
});
