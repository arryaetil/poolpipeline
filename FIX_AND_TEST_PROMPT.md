# Claude Code Prompt — Fix renders, add fallback, Railway support, tests

## What this project does

A Node.js/Express pipeline that takes a home address and generates a visualisation of an Aquapura swimming pool in that garden. Steps: geocode → satellite image → Claude Opus 4 analysis → 4 oblique 3D renders → pick best render → Gemini 3 Pro adds pool to the image.

## Current problems to fix

### Problem 1 — `pipeline/renders.js` has no fallback

`renderAll` currently just calls `renderGoogle` with no try/catch. If Puppeteer or Google 3D Tiles fails for any reason, the whole pipeline crashes. Fix it to automatically fall back to Mapbox if Google fails.

### Problem 2 — renders.js launches 4 separate browsers

It currently launches one `puppeteer.launch()` per heading, so 4 Chrome instances run in parallel. On Railway this will OOM. Fix: launch ONE browser, open 4 pages in parallel, close the browser once at the end.

### Problem 3 — No Railway/container support

There is no `nixpacks.toml`. On Railway, Chrome is not installed by default so Puppeteer crashes. Fix: create `nixpacks.toml` that installs system Chromium.

---

## Fix 1 — Rewrite `pipeline/renders.js`

```javascript
import puppeteer from 'puppeteer';

const HEADINGS = [0, 90, 180, 270];

async function renderGoogle({ lat, lng, pitch, range, googleKey, serverHost, serverPort, onProgress }) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const results = await Promise.all(HEADINGS.map(async (heading) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const url = `http://${serverHost}:${serverPort}/cesium.html?key=${googleKey}&lat=${lat}&lng=${lng}&heading=${heading}&pitch=${pitch}&range=${range}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 35000 });
      await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      await page.close();
      onProgress(heading, screenshot);
      return { heading, image: screenshot };
    }));
    return results;
  } finally {
    await browser.close();
  }
}

async function renderMapbox({ lat, lng, pitch, mapboxToken, onProgress }) {
  const mapboxPitch = Math.min(60, Math.max(0, 90 + pitch + 15));
  const zoom = 17.5 + mapboxPitch / 30;

  const results = await Promise.all(HEADINGS.map(async (heading) => {
    const bearing = (heading + 180) % 360;
    const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static` +
      `/${lng},${lat},${zoom.toFixed(2)},${bearing},${mapboxPitch}` +
      `/1280x720?access_token=${mapboxToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox render ${heading}° failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    onProgress(heading, b64);
    return { heading, image: b64 };
  }));
  return results;
}

export async function renderAll(opts) {
  if (opts.googleKey) {
    try {
      console.log('[renders] trying Google 3D Tiles');
      const result = await renderGoogle(opts);
      console.log('[renders] Google 3D Tiles succeeded');
      return result;
    } catch (err) {
      console.warn('[renders] Google 3D Tiles failed, falling back to Mapbox:', err.message);
    }
  }
  console.log('[renders] using Mapbox Static API');
  return renderMapbox(opts);
}
```

---

## Fix 2 — Create `nixpacks.toml` at project root

This tells Railway to install system Chromium so Puppeteer doesn't need to download its own:

```toml
[phases.setup]
nixPkgs = ["chromium", "nss", "freetype", "harfbuzz", "ca-certificates"]

[variables]
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"
PUPPETEER_EXECUTABLE_PATH = "/run/current-system/sw/bin/chromium"
```

---

## Fix 3 — Make sure `server.js` passes `googleKey` to `renderAll`

Find the `renderAll(...)` call in `server.js`. Make sure it includes `googleKey: GOOGLE_KEY`. It should look like this:

```javascript
const renders = await renderAll({
  lat: geo.lat,
  lng: geo.lng,
  pitch: feature.camera_pitch,
  range: feature.camera_range,
  mapboxToken: MAPBOX_TOKEN,
  googleKey: GOOGLE_KEY,
  serverHost: HOST,
  serverPort: PORT,
  onProgress: (heading, b64) => { ... },
});
```

If `googleKey` is already there, leave it. If not, add it.

---

## Fix 4 — Verify `puppeteer` is in `package.json`

Run:
```bash
npm install puppeteer
```

If it's already in `dependencies`, skip this step.

---

## Tests to write

Create `tests/renders.test.js` using Node's built-in test runner (`node:test`). Test the following:

### Test 1 — renderMapbox returns 4 results with correct headings
Mock `fetch` to return a fake 1×1 PNG buffer. Call `renderMapbox` and assert the result is an array of 4 objects each with `heading` (0, 90, 180, 270) and a non-empty `image` string.

### Test 2 — renderAll falls back to Mapbox when googleKey is missing
Call `renderAll` without a `googleKey`. Assert it uses `renderMapbox` (no Puppeteer launched, returns 4 Mapbox results).

### Test 3 — renderAll falls back to Mapbox when Google throws
Mock `renderGoogle` to throw. Assert `renderAll` catches the error and returns Mapbox results instead of crashing.

### Test 4 — extractJson parses clean JSON
Import `extractJson` from `pipeline/utils.js`. Assert it correctly parses `'{"a":1}'`.

### Test 5 — extractJson extracts JSON from markdown-wrapped response
Assert `extractJson('```json\n{"a":1}\n```')` returns `{ a: 1 }`.

### Test 6 — orPost throws on missing choices
Mock `fetch` to return `{ error: "model not found" }` with status 200. Assert `orPost` throws with a message containing "no choices".

Run all tests with:
```bash
node --test tests/*.test.js
```

All 6 tests must pass before finishing.

---

## Verification checklist

After all changes:

1. `npm test` passes all 6 tests
2. `node server.js` starts without errors
3. Submit a Belgian address (e.g. "Antwerpsesteenweg 100, Gent") with the pool feature
4. Terminal shows either `[renders] Google 3D Tiles succeeded` or `[renders] Google 3D Tiles failed, falling back to Mapbox`
5. The pipeline completes all steps without crashing
6. To test the fallback manually: set `GOOGLE_KEY=invalid` in `.env`, rerun — it should silently use Mapbox

## Do NOT touch

- `cesium.html`
- `pipeline/analysis.js`
- `pipeline/edit.js`
- `pipeline/viewSelect.js`
- `features.json`
- `aquapura-pools.json`
- `index.html`
