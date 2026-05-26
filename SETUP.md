# BackyardAI Setup Guide

## Prerequisites

- Node.js 20 or later
- Mapbox account and token
- OpenRouter credits for the image and video model calls
- Internet access for Mapbox, OpenRouter, and the Cesium CDN

## Mapbox Token

1. Open https://account.mapbox.com
2. Create or reuse a token.
3. Put the token in `.env` as `MAPBOX_TOKEN`.
4. Keep `MAP_PROVIDER=mapbox` for the MVP.

## OpenRouter API Key

1. Open https://openrouter.ai
2. Add credits. A full video run is expected to cost a few dollars.
3. Create an API key.
4. Put the key in `.env` as `OPENROUTER_KEY`.

## Environment

Copy the example file if `.env` does not exist:

```bash
cp .env.example .env
```

The file should contain:

```env
MAP_PROVIDER=mapbox
MAX_API_CALLS_PER_DAY=100
API_MIN_INTERVAL_MS=1000
API_USAGE_TIMEZONE=Europe/Amsterdam
MAPBOX_TOKEN=paste_your_mapbox_token_here
OPENROUTER_KEY=paste_your_openrouter_key_here
PORT=3000
HOST=127.0.0.1
SKIP_VIDEO=true
```

Do not commit `.env`.

## Install And Run

```bash
npm install
npx playwright install chromium
npm start
```

Open http://localhost:3000 in your browser.

## First Run

1. Enter a US residential address.
2. Choose a feature.
3. Click Run.
4. Wait for the cards to fill in from left to right.
5. In demo mode, the run stops after the edited image and skips paid video generation.

## Video Generation

Video generation is disabled by default to avoid Veo costs:

```env
SKIP_VIDEO=true
```

To enable full video generation later, change it to:

```env
SKIP_VIDEO=false
```

Then restart the server.

## Notes

- The final video step is the most expensive part.
- Geocoding calls are cached in `.cache/geocoding-cache.json`, counted in `.cache/api-usage.json`, and logged to `logs/api-calls.jsonl`.
- The pipeline stops before a geocoding request when `MAX_API_CALLS_PER_DAY` is reached.
- If the run fails before video generation, fix that error before retrying to avoid repeated costs.
- `output/` is ignored by git because it can contain large generated files.
