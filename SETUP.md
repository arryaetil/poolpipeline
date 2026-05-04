# BackyardAI Setup Guide

## Prerequisites

- Node.js 20 or later
- Google Cloud billing enabled
- OpenRouter credits for the image and video model calls
- Internet access for Google APIs, OpenRouter, and the Cesium CDN

## Google Cloud API Key

1. Open https://console.cloud.google.com
2. Create or select a project.
3. Enable billing on that project.
4. Enable these APIs:
   - Geocoding API
   - Maps Static API
   - Map Tiles API
5. Create an API key from APIs & Services, Credentials.
6. Put the key in `.env` as `GOOGLE_KEY`.

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
GOOGLE_KEY=paste_your_google_key_here
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
- If the run fails before video generation, fix that error before retrying to avoid repeated costs.
- `output/` is ignored by git because it can contain large generated files.
