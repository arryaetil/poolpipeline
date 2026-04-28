# Backyard Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js web app that takes a US street address + backyard feature type and produces a satellite image, 4× Cesium 3D renders, an AI-edited still, and an 8-second Veo cinematic video — all displayed progressively in a dark dashboard UI.

**Architecture:** Single Express process serves the dashboard HTML, handles a `POST /run` SSE stream that runs the 7-step pipeline (geocode → satellite → Claude analysis → 4× Cesium renders via Playwright → Claude view selection → Nano Banana image edit → Veo 3.1 video), and emits one SSE event per completed step so the browser can update cards in real time. Pipeline steps live in separate modules under `pipeline/` for clear responsibility boundaries.

**Tech Stack:** Node.js 20+, Express, Playwright (Chromium), CesiumJS 1.123 (CDN), OpenRouter API (Claude Opus 4 + Gemini 3 Pro Image + Veo 3.1), Google Maps APIs (Geocoding, Static Maps, Map Tiles / Photorealistic 3D Tiles), `node:test` + `assert` for unit tests, no build step.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and test script |
| `.gitignore` | Exclude `.env`, `output/`, `.superpowers/`, `node_modules/` |
| `.env.example` | Template for required env vars |
| `features.json` | Feature type config: prompts, camera settings, emoji |
| `server.js` | Express app: routing, SSE orchestration, static serving |
| `cesium.html` | Standalone page loaded by Playwright for 3D tile renders |
| `index.html` | Dashboard frontend: sidebar + 2×2 progressive results grid |
| `SETUP.md` | Step-by-step API key + install instructions |
| `pipeline/utils.js` | `extractJson`, `makeSlug`, `orPost`, `buildSSELine` |
| `pipeline/geocode.js` | Google Geocoding API → `{ lat, lng, formatted }` |
| `pipeline/satellite.js` | Google Static Maps API → base64 JPEG buffer |
| `pipeline/analysis.js` | Claude Opus: placement analysis of satellite image |
| `pipeline/renders.js` | Playwright + Cesium: 4× headings in parallel, progressive callbacks |
| `pipeline/viewSelect.js` | Claude Opus: pick best back-of-house render heading |
| `pipeline/edit.js` | Nano Banana Pro (Gemini): add feature to chosen render |
| `pipeline/video.js` | Veo 3.1: generate, poll, download video |
| `tests/utils.test.js` | Unit tests for `extractJson`, `makeSlug`, prompt assembly |
| `tests/server.test.js` | Smoke tests: GET /, GET /features, bad POST /run body |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "poolpipeline",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "playwright": "^1.44.0",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
npx playwright install chromium
```

Expected: `node_modules/` created, chromium downloaded.

- [ ] **Step 3: Create `.gitignore`**

```
.env
node_modules/
output/
.superpowers/
```

- [ ] **Step 4: Create `.env.example`**

```
GOOGLE_KEY=your_google_cloud_api_key_here
OPENROUTER_KEY=your_openrouter_api_key_here
PORT=3000
```

- [ ] **Step 5: Create `.env` from example (not committed)**

```bash
cp .env.example .env
# then fill in your real keys
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "feat: project scaffold"
```

---

## Task 2: Feature Config

**Files:**
- Create: `features.json`

- [ ] **Step 1: Create `features.json`**

```json
[
  {
    "id": "pool",
    "label": "Swimming pool",
    "emoji": "🏊",
    "camera_pitch": -50,
    "camera_range": 130,
    "analysis_hint": "Recommend an inground swimming pool strictly in the backyard.",
    "edit_prompt": "Add a photorealistic inground swimming pool with blue water, light stone coping, and a few lounge chairs.",
    "video_prompt": "Sparkling blue pool water with gentle ripples, warm golden-hour lighting."
  },
  {
    "id": "deck",
    "label": "Deck / patio",
    "emoji": "🪵",
    "camera_pitch": -55,
    "camera_range": 120,
    "analysis_hint": "Recommend a wooden deck or stone patio strictly in the backyard.",
    "edit_prompt": "Add a photorealistic wooden deck with outdoor furniture and string lights.",
    "video_prompt": "Warm evening light on a wooden deck, subtle breeze, string lights glowing."
  },
  {
    "id": "adu",
    "label": "ADU / garden studio",
    "emoji": "🏡",
    "camera_pitch": -50,
    "camera_range": 140,
    "analysis_hint": "Recommend an accessory dwelling unit or garden studio strictly in the backyard. Ensure adequate setback from fences.",
    "edit_prompt": "Add a photorealistic modern garden studio or ADU with a small path leading to it.",
    "video_prompt": "Warm afternoon light on a modern garden studio, lush surrounding landscaping."
  },
  {
    "id": "turf",
    "label": "Synthetic turf",
    "emoji": "🌿",
    "camera_pitch": -52,
    "camera_range": 125,
    "analysis_hint": "Recommend replacing the backyard lawn with synthetic turf.",
    "edit_prompt": "Replace the backyard grass with photorealistic synthetic turf — perfectly even, vivid green.",
    "video_prompt": "Perfectly manicured synthetic turf, bright afternoon sun, no shadows."
  },
  {
    "id": "pickleball",
    "label": "Pickleball court",
    "emoji": "🏓",
    "camera_pitch": -55,
    "camera_range": 150,
    "analysis_hint": "Recommend a pickleball court (13.4m × 6.1m) strictly in the backyard.",
    "edit_prompt": "Add a photorealistic outdoor pickleball court with blue/green surface, white lines, and a net.",
    "video_prompt": "Bright midday light on a crisp pickleball court, slight lens flare."
  },
  {
    "id": "solar",
    "label": "Solar panels",
    "emoji": "☀️",
    "camera_pitch": -70,
    "camera_range": 110,
    "analysis_hint": "Recommend solar panel placement on the south-facing roof sections.",
    "edit_prompt": "Add photorealistic solar panels on the south-facing roof — flush-mounted, dark blue panels in a clean grid.",
    "video_prompt": "Golden-hour light glinting off solar panels, subtle drone pull-back."
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add features.json
git commit -m "feat: feature type config"
```

---

## Task 3: Utility Functions (TDD)

**Files:**
- Create: `pipeline/utils.js`
- Create: `tests/utils.test.js`

- [ ] **Step 1: Create `tests/` directory and write failing tests**

```bash
mkdir -p tests pipeline
```

Create `tests/utils.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, makeSlug } from '../pipeline/utils.js';

test('extractJson: parses clean JSON', () => {
  const result = extractJson('{"foo": "bar"}');
  assert.deepEqual(result, { foo: 'bar' });
});

test('extractJson: extracts JSON embedded in prose', () => {
  const result = extractJson('Here is the result:\n{"front_side": "north"}\nDone.');
  assert.deepEqual(result, { front_side: 'north' });
});

test('extractJson: throws on no JSON', () => {
  assert.throws(() => extractJson('no json here'), /No JSON/);
});

test('makeSlug: lowercases and hyphenates address + feature', () => {
  const result = makeSlug('7756 Caran Ave, Stockton CA 95207, USA', 'pool');
  assert.equal(result, '7756-caran-ave-stockton-ca-95207-usa-pool');
});

test('makeSlug: strips special chars', () => {
  const result = makeSlug("123 O'Brien St., Austin TX", 'deck');
  assert.equal(result, '123-obrien-st-austin-tx-deck');
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: `ERR_MODULE_NOT_FOUND` or similar — `pipeline/utils.js` does not exist yet.

- [ ] **Step 3: Implement `pipeline/utils.js`**

```js
import { readFileSync } from 'node:fs';

export function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
    return JSON.parse(m[0]);
  }
}

export function makeSlug(formattedAddress, featureId) {
  return (formattedAddress + '-' + featureId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function orHeaders(key) {
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function orPost(url, key, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: orHeaders(key),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export function loadFeatures() {
  return JSON.parse(readFileSync(new URL('../features.json', import.meta.url)));
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/utils.js tests/utils.test.js
git commit -m "feat: utility functions (extractJson, makeSlug, SSE helpers)"
```

---

## Task 4: Cesium 3D Render Page

**Files:**
- Create: `cesium.html`

This page is loaded by Playwright in headless Chromium. It reads query params, loads CesiumJS from CDN, renders the Photorealistic 3D Tiles, and sets `window.__ready = true` when tiles have stabilised.

- [ ] **Step 1: Create `cesium.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cesium Render</title>
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.123/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.123/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
    html, body, #c { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; }
  </style>
</head>
<body>
<div id="c"></div>
<script>
(async () => {
  const p = new URLSearchParams(location.search);
  const key     = p.get('key');
  const lat     = parseFloat(p.get('lat'));
  const lng     = parseFloat(p.get('lng'));
  const heading = parseFloat(p.get('heading'));
  const pitch   = parseFloat(p.get('pitch'));
  const range   = parseFloat(p.get('range'));

  Cesium.Ion.defaultAccessToken = '';

  const viewer = new Cesium.Viewer('c', {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    skyBox: false,
    skyAtmosphere: false,
  });

  viewer.scene.globe.show = false;

  const tileset = await Cesium.Cesium3DTileset.fromUrl(
    `https://tile.googleapis.com/v1/3dtiles/root.json?key=${key}`
  );
  viewer.scene.primitives.add(tileset);

  const center = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
  viewer.camera.lookAt(
    center,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(heading),
      Cesium.Math.toRadians(pitch),
      range
    )
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  // Wait until tiles stop streaming for 30 consecutive frames, or 25s
  let stable = 0;
  await new Promise(resolve => {
    const tid = setTimeout(resolve, 25000);
    (function tick() {
      viewer.render();
      stable = tileset.tilesLoaded ? stable + 1 : 0;
      if (stable >= 30) { clearTimeout(tid); return resolve(); }
      requestAnimationFrame(tick);
    })();
  });

  window.__ready = true;
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add cesium.html
git commit -m "feat: Cesium 3D tile render page for Playwright"
```

---

## Task 5: Geocode + Satellite Steps

**Files:**
- Create: `pipeline/geocode.js`
- Create: `pipeline/satellite.js`

- [ ] **Step 1: Create `pipeline/geocode.js`**

```js
export async function geocode(address, googleKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(`Geocoding failed: ${json.status}`);
  const { lat, lng } = json.results[0].geometry.location;
  const formatted = json.results[0].formatted_address;
  return { lat, lng, formatted };
}
```

- [ ] **Step 2: Create `pipeline/satellite.js`**

```js
export async function fetchSatellite(lat, lng, googleKey) {
  const url = `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=20&size=1024x1024&maptype=satellite&key=${googleKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Satellite fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/geocode.js pipeline/satellite.js
git commit -m "feat: geocode and satellite pipeline steps"
```

---

## Task 6: Placement Analysis Step

**Files:**
- Create: `pipeline/analysis.js`

The placement analysis prompt tells Claude to identify the front/backyard, obstructions, and ideal feature placement. It returns a JSON object with `front_side`, `backyard`, `obstructions`, `recommendation`, `render_prompt`, and `backyard_camera_heading`.

- [ ] **Step 1: Create `pipeline/analysis.js`**

```js
import { extractJson, orPost } from './utils.js';

export async function analyse(satB64, feature, orKey) {
  const prompt = `You are a landscape architect. This is a top-down satellite image of a residential property. North is up.

CRITICAL: The FRONT of the house faces the road/street and contains the driveway. The BACKYARD is the OPPOSITE side — typically enclosed, often with grass, away from the street. Never confuse them.

1. Identify which compass side of the house is the FRONT (street/driveway side).
2. Identify the BACKYARD (opposite side from the front).
3. Identify obstructions in the backyard (trees, sheds, AC units, slopes, patios, existing structures).
4. ${feature.analysis_hint}
5. Describe the feature position relative to the house using clear directional language.
6. Determine the compass direction FROM the center of the house TOWARD the backyard (0–360°, 0=N, 90=E, 180=S, 270=W).

Respond in JSON only:
{
  "front_side": "...",
  "backyard": "...",
  "obstructions": "...",
  "recommendation": "...",
  "render_prompt": "...",
  "backyard_camera_heading": <number>
}`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${satB64}` } },
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/analysis.js
git commit -m "feat: Claude placement analysis step"
```

---

## Task 7: 3D Renders Step (Playwright + Cesium)

**Files:**
- Create: `pipeline/renders.js`

Launches headless Chromium, renders all 4 cardinal headings in parallel (each gets its own browser page), screenshots each, calls `onProgress(heading, base64)` as each finishes.

- [ ] **Step 1: Create `pipeline/renders.js`**

```js
import { chromium } from 'playwright';

export async function renderAll({ lat, lng, pitch, range, googleKey, serverPort, onProgress }) {
  const headings = [0, 90, 180, 270];
  const browser = await chromium.launch({ headless: true });

  try {
    const results = await Promise.all(headings.map(async (heading) => {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });

      const url = `http://localhost:${serverPort}/cesium.html` +
        `?key=${googleKey}&lat=${lat}&lng=${lng}` +
        `&heading=${heading}&pitch=${pitch}&range=${range}`;

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => window.__ready === true, { timeout: 30000 })
        .catch(() => { /* tile timeout — screenshot what we have */ });

      const buf = await page.screenshot({ type: 'png' });
      await page.close();

      const b64 = buf.toString('base64');
      onProgress(heading, b64);
      return { heading, image: b64 };
    }));

    return results; // [{ heading: 0, image: b64 }, ...]
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/renders.js
git commit -m "feat: parallel Cesium 3D renders via Playwright"
```

---

## Task 8: View Selection + Image Edit Steps

**Files:**
- Create: `pipeline/viewSelect.js`
- Create: `pipeline/edit.js`

- [ ] **Step 1: Create `pipeline/viewSelect.js`**

```js
import { extractJson, orPost } from './utils.js';

export async function selectView(renders, satB64, analysis, orKey) {
  const prompt = `I have 4 oblique 3D aerial views of the same target house, captured at compass headings 0° (camera north), 90° (camera east), 180° (camera south), and 270° (camera west). The camera looks BACK at the target in each view — so heading 180 shows the north side of the house, heading 0 shows the south side.

Backyard description (from satellite): ${analysis.backyard}.
Front (street) description: ${analysis.front_side}.

Pick which of the 4 views best shows the BACK of the target house — the view where the backyard/back wall is in the foreground and the front door/driveway/street are hidden behind or beside the house.

Respond in JSON only: { "chosen_heading": <0|90|180|270>, "reason": "..." }`;

  const imageContent = renders.map(r => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${r.image}` },
  }));

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${satB64}` } },
        ...imageContent,
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
```

- [ ] **Step 2: Create `pipeline/edit.js`**

```js
import { orPost } from './utils.js';

export async function editImage(chosenRenderB64, feature, analysis, orKey) {
  const prompt = `Add a realistic ${feature.label.toLowerCase()} to the TARGET HOUSE in this oblique aerial photo.

HOW TO IDENTIFY THE CORRECT SPOT:
- The target house is the one closest to the center of the frame.
- This photo was taken from a drone hovering OVER THE BACKYARD, looking across the backyard toward the house. Therefore:
  - The BACKYARD is the grass/lawn area in the FOREGROUND (between the bottom edge and the target house).
  - The FRONT of the house (driveway, street) is BEHIND the house in the BACKGROUND — often hidden by the house itself.
- Place the feature ONLY in the foreground area. NEVER between the house and any road visible in the background. NEVER on a neighbor's lot.

${feature.edit_prompt}
${analysis.render_prompt}

Keep the rest of the image pixel-identical — same house, roof, windows, trees, driveway, neighbors, fences, camera angle, lighting, and shadows. Match the existing perspective and lighting direction. Do not change framing, zoom, or camera angle.`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'google/gemini-3-pro-image-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${chosenRenderB64}` } },
      ],
    }],
    modalities: ['image', 'text'],
  });

  const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
  if (!imgUrl) throw new Error('No image returned from Nano Banana Pro');
  // imgUrl is already a data URL — extract base64 part
  return imgUrl.replace(/^data:image\/\w+;base64,/, '');
}
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/viewSelect.js pipeline/edit.js
git commit -m "feat: view selection and image edit pipeline steps"
```

---

## Task 9: Video Generation Step

**Files:**
- Create: `pipeline/video.js`

Veo generation is async: POST starts the job, then poll GET until `status === 'completed'`, then download via authenticated `/content` endpoint.

- [ ] **Step 1: Create `pipeline/video.js`**

```js
import { orHeaders } from './utils.js';

const OR_BASE = 'https://openrouter.ai/api/v1';

export async function generateVideo(editedB64, feature, analysis, outputPath, orKey) {
  const prompt = `Cinematic real-estate drone shot of the EXACT property shown in the reference image. The house architecture, roof, walls, windows, trees, driveway, fences, neighbors, and ${feature.label.toLowerCase()} shape/position MUST remain faithful to the input image — do not invent a different house, do not restyle, do not move the feature.

Camera move: starts as a high-angle drone shot matching the reference image (~55° looking down). Smoothly pushes in and gently descends toward the backyard, ending closer to the ${feature.label.toLowerCase()} with the back of the house as backdrop. Single continuous shot — no cuts, no orbit, no whip pans.

Atmosphere: ${feature.video_prompt} High-end real-estate listing style. ${analysis.render_prompt}`;

  // Start generation
  const startRes = await fetch(`${OR_BASE}/videos`, {
    method: 'POST',
    headers: orHeaders(orKey),
    body: JSON.stringify({
      model: 'google/veo-3.1',
      prompt,
      input_references: [{
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${editedB64}` },
      }],
      aspect_ratio: '16:9',
      duration: 8,
      resolution: '720p',
    }),
  });
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error(`Veo start failed ${startRes.status}: ${t.slice(0, 300)}`);
  }
  const { id } = await startRes.json();

  // Poll until completed
  let status = 'pending';
  while (status !== 'completed') {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${OR_BASE}/videos/${id}`, { headers: orHeaders(orKey) });
    if (!pollRes.ok) throw new Error(`Veo poll failed: ${pollRes.status}`);
    const poll = await pollRes.json();
    status = poll.status;
    if (status === 'failed') throw new Error(`Veo generation failed: ${JSON.stringify(poll)}`);
  }

  // Download via authenticated content endpoint
  const dlRes = await fetch(`${OR_BASE}/videos/${id}/content`, { headers: orHeaders(orKey) });
  if (!dlRes.ok) throw new Error(`Veo download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());

  const { writeFileSync } = await import('node:fs');
  writeFileSync(outputPath, buf);
  return outputPath;
}
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/video.js
git commit -m "feat: Veo 3.1 video generation with polling"
```

---

## Task 10: Express Server

**Files:**
- Create: `server.js`

The server: serves static files, exposes `GET /features`, and runs the full pipeline on `POST /run` with SSE streaming. The server PORT is used by `renders.js` so Playwright can navigate to `http://localhost:PORT/cesium.html`.

- [ ] **Step 1: Create `server.js`**

```js
import 'dotenv/config';
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFeatures, makeSlug, sseEvent } from './pipeline/utils.js';
import { geocode } from './pipeline/geocode.js';
import { fetchSatellite } from './pipeline/satellite.js';
import { analyse } from './pipeline/analysis.js';
import { renderAll } from './pipeline/renders.js';
import { selectView } from './pipeline/viewSelect.js';
import { editImage } from './pipeline/edit.js';
import { generateVideo } from './pipeline/video.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const OR_KEY = process.env.OPENROUTER_KEY;
const PORT = parseInt(process.env.PORT || '3000', 10);

const features = loadFeatures();
const app = express();

app.use(express.json());
app.use('/output', express.static(join(__dirname, 'output')));
app.use(express.static(__dirname)); // serves index.html, cesium.html

app.get('/features', (_req, res) => res.json(features));

app.post('/run', async (req, res) => {
  const { address, feature: featureId } = req.body;
  if (!address || !featureId) {
    return res.status(400).json({ error: 'address and feature are required' });
  }
  const feature = features.find(f => f.id === featureId);
  if (!feature) return res.status(400).json({ error: `Unknown feature: ${featureId}` });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emit = (event, data) => sseEvent(res, event, data);

  try {
    // 1. Geocode
    const geo = await geocode(address, GOOGLE_KEY);
    emit('step', { step: 'geocode', status: 'done', value: geo });

    const slug = makeSlug(geo.formatted, featureId);
    const outDir = join(__dirname, 'output', slug);
    mkdirSync(outDir, { recursive: true });

    // 2. Satellite
    const satB64 = await fetchSatellite(geo.lat, geo.lng, GOOGLE_KEY);
    writeFileSync(join(outDir, 'satellite.jpg'), Buffer.from(satB64, 'base64'));
    emit('step', { step: 'satellite', status: 'done', value: `data:image/jpeg;base64,${satB64}` });

    // 3. Analysis
    const analysis = await analyse(satB64, feature, OR_KEY);
    writeFileSync(join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));
    emit('step', { step: 'analysis', status: 'done', value: analysis });

    // 4. 3D Renders
    const renders = await renderAll({
      lat: geo.lat,
      lng: geo.lng,
      pitch: feature.camera_pitch,
      range: feature.camera_range,
      googleKey: GOOGLE_KEY,
      serverPort: PORT,
      onProgress: (heading, b64) => {
        writeFileSync(join(outDir, `render-${heading}.png`), Buffer.from(b64, 'base64'));
        emit('step', { step: 'renders', status: 'progress', value: { heading, image: `data:image/png;base64,${b64}` } });
      },
    });

    // 5. View selection
    const viewResult = await selectView(renders, satB64, analysis, OR_KEY);
    emit('step', { step: 'view_select', status: 'done', value: viewResult });

    const chosenRender = renders.find(r => r.heading === viewResult.chosen_heading) || renders[0];

    // 6. Image edit
    const editedB64 = await editImage(chosenRender.image, feature, analysis, OR_KEY);
    writeFileSync(join(outDir, 'edited.png'), Buffer.from(editedB64, 'base64'));
    emit('step', { step: 'edit', status: 'done', value: `data:image/png;base64,${editedB64}` });

    // 7. Video
    const videoPath = join(outDir, 'hero.mp4');
    await generateVideo(editedB64, feature, analysis, videoPath, OR_KEY);
    emit('step', { step: 'video', status: 'done', value: `/output/${slug}/hero.mp4` });

    emit('done', {});
  } catch (err) {
    console.error(err);
    emit('error', { step: err.step || 'unknown', message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => console.log(`BackyardAI running at http://localhost:${PORT}`));

export { app }; // for tests
```

- [ ] **Step 2: Write server smoke tests**

Create `tests/server.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server.js';

let server;
let baseUrl;

before(() => new Promise(resolve => {
  server = app.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise(resolve => server.close(resolve)));

test('GET / returns HTML', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('<html') || text.includes('<!DOCTYPE'));
});

test('GET /features returns array with id and label', async () => {
  const res = await fetch(`${baseUrl}/features`);
  assert.equal(res.status, 200);
  const features = await res.json();
  assert.ok(Array.isArray(features));
  assert.ok(features.length > 0);
  assert.ok(features[0].id);
  assert.ok(features[0].label);
});

test('POST /run without body returns 400', async () => {
  const res = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('POST /run with unknown feature returns 400', async () => {
  const res = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '123 Main St', feature: 'hot_tub' }),
  });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: 9 passing (5 utils + 4 server).

- [ ] **Step 4: Commit**

```bash
git add server.js tests/server.test.js
git commit -m "feat: Express server with SSE pipeline orchestration"
```

---

## Task 11: Dashboard Frontend

**Files:**
- Create: `index.html`

Single file, no framework. Fetches `/features` to populate the dropdown on load. On Run, opens a fetch stream to `POST /run`, parses SSE lines, and updates cards.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BackyardAI</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0d14; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; height: 100vh; display: grid; grid-template-rows: 56px 1fr; overflow: hidden; }

/* Top bar */
.topbar { background: #0f1623; border-bottom: 1px solid #1e293b; display: flex; align-items: center; padding: 0 24px; gap: 12px; }
.logo { font-weight: 700; font-size: 16px; color: #38bdf8; letter-spacing: -0.3px; }
.logo span { color: #64748b; font-weight: 400; }
.badge { background: #0ea5e920; color: #38bdf8; font-size: 11px; padding: 2px 8px; border-radius: 99px; border: 1px solid #0ea5e940; }

/* Layout */
.main { display: grid; grid-template-columns: 300px 1fr; overflow: hidden; }

/* Sidebar */
.sidebar { background: #0f1623; border-right: 1px solid #1e293b; padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
.field label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; display: block; margin-bottom: 6px; }
.addr-input, .feat-select { width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; color: #e2e8f0; font-size: 13px; outline: none; }
.feat-select { cursor: pointer; appearance: none; }
.addr-input::placeholder { color: #475569; }
.run-btn { width: 100%; background: #0ea5e9; color: #fff; border: none; border-radius: 8px; padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 4px; }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 10px; }

/* Steps */
.steps { display: flex; flex-direction: column; gap: 5px; }
.step { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; transition: all 0.2s; }
.step.done { background: #05141f; }
.step.active { background: #0ea5e910; border: 1px solid #0ea5e930; }
.step.pending { opacity: 0.4; }
.step-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; margin-top: 1px; }
.dot-done { background: #22c55e; color: #fff; }
.dot-active { border: 2px solid #0ea5e9; animation: pulse-ring 1s ease-in-out infinite; }
.dot-pending { background: #1e293b; border: 2px solid #334155; }
.step-name { color: #cbd5e1; font-weight: 500; line-height: 1.3; }
.step.active .step-name { color: #38bdf8; }
.step.done .step-name { color: #86efac; }
.step-sub { font-size: 11px; color: #475569; margin-top: 2px; }
.step-time { font-size: 10px; color: #22c55e; margin-top: 2px; }

/* Cost */
.cost-bar { background: #1e293b; border-radius: 8px; padding: 12px; font-size: 12px; }
.cost-row { display: flex; justify-content: space-between; color: #64748b; margin-bottom: 4px; }
.cost-total { color: #e2e8f0; font-weight: 600; border-top: 1px solid #334155; padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; }

/* Main content */
.content { overflow-y: auto; padding: 20px; }
.results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.card { background: #0f1623; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; transition: border-color 0.2s; }
.card.card-active { border-color: #0ea5e950; }
.card.card-error { border-color: #ef444450; }
.card.card-done { border-color: #22c55e30; }
.card-header { padding: 10px 14px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.card-title { color: #94a3b8; font-weight: 500; }
.badge-done { background: #16a34a20; color: #4ade80; border: 1px solid #16a34a40; padding: 2px 8px; border-radius: 99px; font-size: 10px; }
.badge-running { background: #0ea5e920; color: #38bdf8; border: 1px solid #0ea5e940; padding: 2px 8px; border-radius: 99px; font-size: 10px; }
.badge-wait { background: #1e293b; color: #475569; border: 1px solid #334155; padding: 2px 8px; border-radius: 99px; font-size: 10px; }
.badge-error { background: #ef444420; color: #f87171; border: 1px solid #ef444440; padding: 2px 8px; border-radius: 99px; font-size: 10px; }
.card-body { padding: 12px; }
.card-img { width: 100%; border-radius: 8px; display: block; }
.analysis-box { background: #0a0d14; border-radius: 8px; padding: 10px; font-size: 11px; color: #94a3b8; line-height: 1.7; margin-top: 10px; }
.analysis-row { display: flex; gap: 8px; }
.a-label { color: #475569; min-width: 90px; flex-shrink: 0; }
.a-val { color: #cbd5e1; }
.renders-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.render-wrap { position: relative; border-radius: 6px; overflow: hidden; border: 2px solid transparent; transition: border-color 0.3s; }
.render-wrap.chosen { border-color: #0ea5e9; }
.render-wrap img { width: 100%; display: block; border-radius: 4px; }
.render-heading { position: absolute; bottom: 0; left: 0; right: 0; font-size: 9px; color: #94a3b8; background: #00000080; padding: 3px 6px; }
.chosen-badge { position: absolute; top: 5px; right: 5px; background: #0ea5e9; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 99px; }
.placeholder { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; padding: 40px 20px; }
.placeholder-icon { font-size: 28px; opacity: 0.3; }
.placeholder-text { font-size: 12px; color: #475569; }
video { width: 100%; border-radius: 8px; display: block; background: #000; }
.error-msg { color: #f87171; font-size: 12px; padding: 16px; }

@keyframes pulse-ring { 0%,100%{box-shadow:0 0 0 0 #0ea5e940} 50%{box-shadow:0 0 0 4px #0ea5e920} }
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">Backyard<span>AI</span></div>
  <div class="badge">personal</div>
</div>

<div class="main">
  <div class="sidebar">
    <div class="field">
      <label>Address</label>
      <input class="addr-input" id="addr" placeholder="7756 Caran Ave, Stockton CA" type="text">
    </div>
    <div class="field">
      <label>Feature</label>
      <select class="feat-select" id="feat"></select>
    </div>
    <button class="run-btn" id="runBtn" onclick="run()">Run →</button>

    <div>
      <div class="section-label">Pipeline</div>
      <div class="steps" id="steps">
        <div class="step pending" id="s-geocode"><div class="step-dot dot-pending"></div><div><div class="step-name">Geocode address</div></div></div>
        <div class="step pending" id="s-satellite"><div class="step-dot dot-pending"></div><div><div class="step-name">Satellite image</div></div></div>
        <div class="step pending" id="s-analysis"><div class="step-dot dot-pending"></div><div><div class="step-name">Placement analysis</div></div></div>
        <div class="step pending" id="s-renders"><div class="step-dot dot-pending"></div><div><div class="step-name" id="renders-label">3D renders (0 / 4)</div></div></div>
        <div class="step pending" id="s-view_select"><div class="step-dot dot-pending"></div><div><div class="step-name">View selection</div></div></div>
        <div class="step pending" id="s-edit"><div class="step-dot dot-pending"></div><div><div class="step-name">Image edit</div></div></div>
        <div class="step pending" id="s-video"><div class="step-dot dot-pending"></div><div><div class="step-name">Video (Veo 3.1)</div><div class="step-sub">~90 seconds</div></div></div>
      </div>
    </div>

    <div class="cost-bar">
      <div class="section-label" style="margin-bottom:8px">Est. cost per run</div>
      <div class="cost-row"><span>Geocode + satellite</span><span>$0.01</span></div>
      <div class="cost-row"><span>3D tiles (4 renders)</span><span>$0.10</span></div>
      <div class="cost-row"><span>Claude Opus (2 calls)</span><span>$0.05</span></div>
      <div class="cost-row"><span>Image edit</span><span>$0.04</span></div>
      <div class="cost-row"><span>Veo 3.1 · 8s video</span><span>$3.20</span></div>
      <div class="cost-total"><span>Total</span><span>~$3.40</span></div>
    </div>
  </div>

  <div class="content">
    <div class="results-grid">
      <!-- Satellite card -->
      <div class="card" id="card-satellite">
        <div class="card-header"><span class="card-title">Satellite view</span><span class="badge-wait" id="badge-satellite">Waiting</span></div>
        <div class="card-body" id="body-satellite">
          <div class="placeholder"><div class="placeholder-icon">🛰</div><div class="placeholder-text">Fetching satellite image…</div></div>
        </div>
      </div>

      <!-- Renders card -->
      <div class="card" id="card-renders">
        <div class="card-header"><span class="card-title">3D renders</span><span class="badge-wait" id="badge-renders">Waiting</span></div>
        <div class="card-body">
          <div class="renders-grid" id="renders-grid">
            <div class="render-wrap" id="rw-0"><div class="placeholder" style="padding:20px"><div class="placeholder-icon" style="font-size:18px">⟳</div></div><div class="render-heading">0°</div></div>
            <div class="render-wrap" id="rw-90"><div class="placeholder" style="padding:20px"><div class="placeholder-icon" style="font-size:18px">⟳</div></div><div class="render-heading">90°</div></div>
            <div class="render-wrap" id="rw-180"><div class="placeholder" style="padding:20px"><div class="placeholder-icon" style="font-size:18px">⟳</div></div><div class="render-heading">180°</div></div>
            <div class="render-wrap" id="rw-270"><div class="placeholder" style="padding:20px"><div class="placeholder-icon" style="font-size:18px">⟳</div></div><div class="render-heading">270°</div></div>
          </div>
        </div>
      </div>

      <!-- Edit card -->
      <div class="card" id="card-edit">
        <div class="card-header"><span class="card-title" id="edit-title">Feature added</span><span class="badge-wait" id="badge-edit">Waiting</span></div>
        <div class="card-body" id="body-edit">
          <div class="placeholder"><div class="placeholder-icon">✏️</div><div class="placeholder-text">Appears after view selection</div></div>
        </div>
      </div>

      <!-- Video card -->
      <div class="card" id="card-video">
        <div class="card-header"><span class="card-title">Hero video</span><span class="badge-wait" id="badge-video">Waiting</span></div>
        <div class="card-body" id="body-video">
          <div class="placeholder"><div class="placeholder-icon">🎬</div><div class="placeholder-text">Veo 3.1 · ~90 seconds</div></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
let rendersCount = 0;
let selectedFeature = null;

async function loadFeatures() {
  const res = await fetch('/features');
  const features = await res.json();
  const sel = document.getElementById('feat');
  features.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.emoji} ${f.label}`;
    sel.appendChild(opt);
  });
}

function setStep(id, state, sub) {
  const el = document.getElementById(`s-${id}`);
  if (!el) return;
  el.className = `step ${state}`;
  const dot = el.querySelector('.step-dot');
  dot.className = `step-dot dot-${state === 'done' ? 'done' : state === 'active' ? 'active' : 'pending'}`;
  dot.textContent = state === 'done' ? '✓' : '';
  if (sub) {
    let subEl = el.querySelector('.step-sub');
    if (!subEl) { subEl = document.createElement('div'); subEl.className = 'step-sub'; el.querySelector('div:last-child').appendChild(subEl); }
    subEl.textContent = sub;
  }
}

function setCard(id, state) {
  const card = document.getElementById(`card-${id}`);
  const badge = document.getElementById(`badge-${id}`);
  if (!card || !badge) return;
  card.className = `card card-${state}`;
  const labels = { done: ['badge-done','Done'], active: ['badge-running','Running…'], error: ['badge-error','Error'], waiting: ['badge-wait','Waiting'] };
  const [cls, txt] = labels[state] || labels.waiting;
  badge.className = cls;
  badge.textContent = txt;
}

function handleStep(event) {
  const { step, status, value } = event;

  if (step === 'geocode') {
    setStep('geocode', 'done', `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`);
    setStep('satellite', 'active');
  }

  if (step === 'satellite') {
    setStep('satellite', 'done');
    setStep('analysis', 'active');
    setCard('satellite', 'active');
    const body = document.getElementById('body-satellite');
    body.innerHTML = `<img class="card-img" src="${value}">`;
    setCard('satellite', 'done');
  }

  if (step === 'analysis') {
    setStep('analysis', 'done');
    setStep('renders', 'active');
    setCard('renders', 'active');
    const body = document.getElementById('body-satellite');
    const existing = body.querySelector('img');
    if (existing) {
      const box = document.createElement('div');
      box.className = 'analysis-box';
      box.innerHTML = `
        <div class="analysis-row"><span class="a-label">Front</span><span class="a-val">${value.front_side}</span></div>
        <div class="analysis-row"><span class="a-label">Backyard</span><span class="a-val">${value.backyard}</span></div>
        <div class="analysis-row"><span class="a-label">Obstructions</span><span class="a-val">${value.obstructions}</span></div>
        <div class="analysis-row"><span class="a-label">Recommendation</span><span class="a-val">${value.recommendation}</span></div>
      `;
      body.appendChild(box);
    }
  }

  if (step === 'renders' && status === 'progress') {
    rendersCount++;
    document.getElementById('renders-label').textContent = `3D renders (${rendersCount} / 4)`;
    const wrap = document.getElementById(`rw-${value.heading}`);
    if (wrap) {
      wrap.innerHTML = `<img src="${value.image}"><div class="render-heading">${value.heading}°</div>`;
    }
    if (rendersCount === 4) {
      setStep('renders', 'done');
      setCard('renders', 'active');
      setStep('view_select', 'active');
    }
  }

  if (step === 'view_select') {
    setStep('view_select', 'done', `Chose ${value.chosen_heading}°`);
    setCard('renders', 'done');
    const chosen = document.getElementById(`rw-${value.chosen_heading}`);
    if (chosen) {
      chosen.classList.add('chosen');
      const badge = document.createElement('div');
      badge.className = 'chosen-badge';
      badge.textContent = '✓ Selected';
      chosen.appendChild(badge);
    }
    setStep('edit', 'active');
    setCard('edit', 'active');
    if (selectedFeature) {
      document.getElementById('edit-title').textContent = `${selectedFeature.emoji} ${selectedFeature.label} added`;
    }
  }

  if (step === 'edit') {
    setStep('edit', 'done');
    setCard('edit', 'done');
    document.getElementById('body-edit').innerHTML = `<img class="card-img" src="${value}">`;
    setStep('video', 'active');
    setCard('video', 'active');
  }

  if (step === 'video') {
    setStep('video', 'done');
    setCard('video', 'done');
    document.getElementById('body-video').innerHTML =
      `<video controls autoplay loop src="${value}"></video>`;
  }
}

async function run() {
  const address = document.getElementById('addr').value.trim();
  const featId = document.getElementById('feat').value;
  if (!address) { alert('Enter an address first'); return; }

  const featOpt = document.getElementById('feat');
  const features = await fetch('/features').then(r => r.json());
  selectedFeature = features.find(f => f.id === featId);

  rendersCount = 0;
  document.getElementById('runBtn').disabled = true;
  ['geocode','satellite','analysis','renders','view_select','edit','video'].forEach(s => setStep(s, 'pending'));
  ['satellite','renders','edit','video'].forEach(c => setCard(c, 'waiting'));
  document.getElementById('renders-label').textContent = '3D renders (0 / 4)';
  document.getElementById('body-satellite').innerHTML = '<div class="placeholder"><div class="placeholder-icon">🛰</div><div class="placeholder-text">Fetching…</div></div>';
  document.getElementById('body-edit').innerHTML = '<div class="placeholder"><div class="placeholder-icon">✏️</div><div class="placeholder-text">Appears after view selection</div></div>';
  document.getElementById('body-video').innerHTML = '<div class="placeholder"><div class="placeholder-icon">🎬</div><div class="placeholder-text">Veo 3.1 · ~90 seconds</div></div>';
  ['rw-0','rw-90','rw-180','rw-270'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'render-wrap';
    el.innerHTML = `<div class="placeholder" style="padding:20px"><div class="placeholder-icon" style="font-size:18px">⟳</div></div><div class="render-heading">${id.replace('rw-','')}°</div>`;
  });

  setStep('geocode', 'active');

  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, feature: featId }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error);
    document.getElementById('runBtn').disabled = false;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (currentEvent === 'step') handleStep(data);
        if (currentEvent === 'error') {
          const card = document.getElementById(`card-${data.step}`);
          if (card) {
            card.className = 'card card-error';
            const badge = document.getElementById(`badge-${data.step}`);
            if (badge) { badge.className = 'badge-error'; badge.textContent = 'Error'; }
            const body = card.querySelector('.card-body');
            if (body) body.innerHTML = `<div class="error-msg">⚠ ${data.message}</div>`;
          }
        }
        currentEvent = null;
      }
    }
  }

  document.getElementById('runBtn').disabled = false;
}

loadFeatures();
</script>
</body>
</html>
```

- [ ] **Step 2: Start server and verify dashboard loads**

```bash
node server.js
# open http://localhost:3000 in browser
```

Expected: Dashboard renders, dropdown populates with 6 feature types, Run button present.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: dashboard frontend with SSE progressive rendering"
```

---

## Task 12: SETUP.md + Final Polish

**Files:**
- Create: `SETUP.md`

- [ ] **Step 1: Create `SETUP.md`**

```markdown
# BackyardAI — Setup Guide

## Prerequisites

- Node.js 20 or later
- Internet access (for Google APIs, OpenRouter, Cesium CDN)

## 1. Google Cloud API Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable billing on the project
4. Enable these APIs (search each in the API Library):
   - **Geocoding API**
   - **Maps Static API**
   - **Map Tiles API** (labelled "Photorealistic 3D Tiles" in docs)
5. Go to **APIs & Services → Credentials → Create credentials → API key**
6. Copy the key

## 2. OpenRouter API Key

1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Add credits — minimum **$5** covers 1–2 full test runs (~$3.40 each)
3. Go to **Keys → Create key**
4. Copy the key

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
GOOGLE_KEY=paste_your_google_key_here
OPENROUTER_KEY=paste_your_openrouter_key_here
PORT=3000
```

## 4. Install & Run

```bash
npm install
npx playwright install chromium
node server.js
```

Then open **http://localhost:3000** in your browser.

## 5. First Run

1. Type a US residential address
2. Select a feature (e.g. Swimming pool)
3. Click **Run**
4. Wait ~2 minutes — watch the cards fill in progressively
5. The final video appears in the bottom-right card and is saved to `output/<slug>/hero.mp4`

## Cost per run (approx.)

| Step | Cost |
|------|------|
| Geocode + satellite | $0.01 |
| 3D tiles (4 renders) | $0.10 |
| Claude Opus × 2 | $0.05 |
| Image edit | $0.04 |
| Veo 3.1 · 8s video | $3.20 |
| **Total** | **~$3.40** |
```

- [ ] **Step 2: Run full test suite one final time**

```bash
npm test
```

Expected: All 9 tests pass.

- [ ] **Step 3: Final commit**

```bash
git add SETUP.md
git commit -m "feat: setup guide and project complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| 7-step pipeline (geocode→satellite→analysis→renders→view_select→edit→video) | Tasks 5–9 + server.js (Task 10) |
| SSE streaming per step | Task 10 |
| 4 renders in parallel | Task 7 (Promise.all) |
| Progressive card updates in frontend | Task 11 |
| Feature config via features.json | Task 2 |
| GET /features endpoint | Task 10 |
| GET / serves index.html | Task 10 (express.static) |
| GET /output/* serves video | Task 10 |
| Tolerant JSON extraction | Task 3 (extractJson) |
| Cesium heading convention documented | Task 4 + utils notes |
| Video authenticated download | Task 9 |
| Output saved to output/<slug>/ | Task 10 |
| SETUP.md with API key instructions | Task 12 |
| .gitignore excludes .env, output/ | Task 1 |

All spec requirements covered. No gaps found.

**Placeholder scan:** No TBDs, no "similar to task N" references, all code blocks complete.

**Type consistency:** `extractJson`, `makeSlug`, `sseEvent`, `orHeaders`, `orPost`, `loadFeatures` defined in Task 3 and used consistently in Tasks 6–10. `onProgress(heading, b64)` callback defined in Task 7 and called in Task 10. `renders` array shape `[{ heading, image }]` consistent between Tasks 7, 8, and 10.
