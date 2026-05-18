# Claude Code Prompt — Automatic render fallback: Google 3D Tiles → Mapbox

## Context

`pipeline/renders.js` currently uses the Mapbox Static API to generate oblique aerial renders (2D satellite images with tilt). Previously the project used Google Photorealistic 3D Tiles via CesiumJS in `cesium.html`, screenshotted by Puppeteer. That was much higher quality. We want both back, with automatic fallback.

`cesium.html` already exists and is correct — do not modify it. It sets `window.__ready = true` when all tiles are loaded.

`GOOGLE_KEY` is already in `.env` and `server.js` already reads it and passes it to `renderAll` via the `serverHost` and `serverPort` parameters (which are currently unused in renders.js).

## Goal

Rewrite `pipeline/renders.js` so it:
1. **Tries Google first** — uses Puppeteer to screenshot `cesium.html` from 4 headings
2. **Falls back to Mapbox automatically** — if Google fails for any reason (API error, key invalid, timeout, Puppeteer crash)
3. **Logs clearly** which provider was used: `[renders] using Google 3D Tiles` or `[renders] Google failed, falling back to Mapbox`

## Step 1 — Install Puppeteer

```bash
npm install puppeteer
```

## Step 1b — Railway compatibility

The app runs on Railway (Docker/Nixpacks container). Two things are required:

**A. Puppeteer launch flags** — containers don't allow Chrome's default sandbox. Always launch Puppeteer with:

```javascript
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
```

**B. Create `nixpacks.toml` at the project root** — tells Railway to install Chrome system dependencies:

```toml
[phases.setup]
nixPkgs = ["chromium", "nss", "freetype", "harfbuzz", "ca-certificates", "ttf-dejavu"]

[variables]
PUPPETEER_EXECUTABLE_PATH = "/run/current-system/sw/bin/chromium"
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"
```

When `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` is set, Puppeteer uses the system Chromium instead of downloading its own. Update the Puppeteer launch call to use `executablePath` from the environment:

```javascript
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
```

## Step 2 — Rewrite `pipeline/renders.js`

The function signature must stay identical to what `server.js` expects:

```javascript
export async function renderAll({ lat, lng, pitch, range, mapboxToken, googleKey, serverHost, serverPort, onProgress })
```

Note: `server.js` currently passes `mapboxToken` but not `googleKey`. You will also need to update the `renderAll` call in `server.js` to pass `googleKey: GOOGLE_KEY`.

### Google render logic (Puppeteer)

For each of the 4 headings `[0, 90, 180, 270]`:
- Launch Puppeteer (headless), open a new page
- Navigate to `http://${serverHost}:${serverPort}/cesium.html?key=${googleKey}&lat=${lat}&lng=${lng}&heading=${heading}&pitch=${pitch}&range=${range}`
- Wait for `window.__ready === true` with a 30 second timeout
- Take a full-page screenshot, convert to base64
- Call `onProgress(heading, b64)`
- Close the browser

Run all 4 headings in parallel with `Promise.all`. Wrap the entire Google attempt in a try/catch — if anything throws, fall through to Mapbox.

### Mapbox fallback logic

Keep the existing Mapbox Static API implementation exactly as it is now:

```javascript
const mapboxPitch = Math.min(60, Math.max(0, 90 + pitch + 15));
const zoom = 17.5 + mapboxPitch / 30;

const results = await Promise.all(headings.map(async (heading) => {
  const bearing = (heading + 180) % 360;
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static` +
    `/${lng},${lat},${zoom.toFixed(2)},${bearing},${mapboxPitch}` +
    `/1280x720?access_token=${mapboxToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Render ${heading}° failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const b64 = Buffer.from(buffer).toString('base64');
  onProgress(heading, b64);
  return { heading, image: b64 };
}));
return results;
```

### Full structure of renders.js

```javascript
import puppeteer from 'puppeteer';

const HEADINGS = [0, 90, 180, 270];

async function renderGoogle({ lat, lng, pitch, range, googleKey, serverHost, serverPort, onProgress }) {
  // launch puppeteer, render all 4 headings in parallel, return results array
}

async function renderMapbox({ lat, lng, pitch, mapboxToken, onProgress }) {
  // existing mapbox logic
}

export async function renderAll(opts) {
  if (opts.googleKey) {
    try {
      console.log('[renders] using Google 3D Tiles');
      return await renderGoogle(opts);
    } catch (err) {
      console.warn('[renders] Google failed, falling back to Mapbox:', err.message);
    }
  }
  console.log('[renders] using Mapbox Static API');
  return await renderMapbox(opts);
}
```

## Step 3 — Update `server.js`

Find the `renderAll` call and add `googleKey`:

```javascript
// Before:
const renders = await renderAll({
  lat: geo.lat,
  lng: geo.lng,
  pitch: feature.camera_pitch,
  range: feature.camera_range,
  mapboxToken: MAPBOX_TOKEN,
  serverHost: HOST,
  serverPort: PORT,
  onProgress: ...
});

// After:
const renders = await renderAll({
  lat: geo.lat,
  lng: geo.lng,
  pitch: feature.camera_pitch,
  range: feature.camera_range,
  mapboxToken: MAPBOX_TOKEN,
  googleKey: GOOGLE_KEY,
  serverHost: HOST,
  serverPort: PORT,
  onProgress: ...
});
```

## Verification

1. Run `node server.js`
2. Submit a Belgian address with the pool feature
3. Check the terminal — you should see either `[renders] using Google 3D Tiles` or `[renders] Google failed, falling back to Mapbox`
4. If Google works: the 4 render images in the UI should show full 3D buildings
5. If you want to test the fallback: temporarily set `GOOGLE_KEY=invalid` in `.env` and rerun — it should silently fall back to Mapbox without crashing

## What NOT to touch

- `cesium.html` — leave it exactly as is
- `pipeline/analysis.js` — leave it
- `pipeline/edit.js` — leave it
- `features.json` — leave it
- `aquapura-pools.json` — leave it
