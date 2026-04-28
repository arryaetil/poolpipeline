# Backyard Visualizer — Design Spec
_2026-04-28_

## Overview

A personal-use web tool that turns a US street address + a chosen backyard feature into a cinematic 8-second drone video showing what that feature would look like on the actual property. Supports pools, decks, ADUs, turf, pickleball courts, solar panels — and any future feature added via a config entry.

Pipeline: Google Geocoding → satellite image → Claude placement analysis → 4× Cesium 3D renders (headless Chromium) → Claude view selection → Nano Banana Pro image edit → Veo 3.1 video.

Estimated cost per run: ~$3.40 (dominated by Veo at $3.20).

---

## Stack

- **Runtime:** Node.js 20+
- **Server:** Express (single process, no queue, no worker)
- **3D rendering:** Playwright + Chromium running `cesium.html` (Cesium Photorealistic 3D Tiles)
- **AI models via OpenRouter:**
  - `anthropic/claude-opus-4` — placement analysis + view selection
  - `google/gemini-3-pro-image-preview` (Nano Banana Pro) — image edit
  - `google/veo-3.1` — video generation
- **External APIs:**
  - Google Geocoding API
  - Google Maps Static API
  - Google Map Tiles API (Photorealistic 3D Tiles)
- **Frontend:** Single `index.html`, no framework, no build step
- **Live updates:** `fetch` + `ReadableStream` SSE (not native `EventSource`, which doesn't support POST)

---

## File Structure

```
poolpipeline/
├── server.js          # Express server + full pipeline logic
├── index.html         # Dashboard frontend
├── cesium.html        # Loaded by headless Chromium for 3D renders
├── features.json      # Feature type config (prompts, camera settings)
├── .env               # GOOGLE_KEY, OPENROUTER_KEY (gitignored)
├── .gitignore
├── package.json
├── SETUP.md           # Step-by-step API key + install instructions
└── output/            # Per-run artifacts
    └── <slug>/        # e.g. 7756-caran-ave-pool/
        ├── satellite.jpg
        ├── render-0.png
        ├── render-90.png
        ├── render-180.png
        ├── render-270.png
        ├── analysis.json
        ├── edited.png
        └── hero.mp4
```

---

## Feature Config (`features.json`)

An array of feature objects. Adding a new feature = one new object in this file, no code changes required.

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

---

## API Endpoints

### `GET /`
Serves `index.html`.

### `POST /run`
**Body:** `{ "address": "7756 Caran Ave, Stockton CA", "feature": "pool" }`

**Response:** `Content-Type: text/event-stream`

Emits SSE events in sequence:

| event | data shape | notes |
|-------|-----------|-------|
| `step` | `{ step: "geocode", status: "done", value: { lat, lng, formatted } }` | |
| `step` | `{ step: "satellite", status: "done", value: "data:image/jpeg;base64,..." }` | base64 data URL |
| `step` | `{ step: "analysis", status: "done", value: { front_side, backyard, obstructions, recommendation, render_prompt, backyard_camera_heading } }` | `recommendation` is feature-agnostic |
| `step` | `{ step: "renders", status: "progress", value: { heading: 0\|90\|180\|270, image: "data:..." } }` | emitted 4× as each render completes |
| `step` | `{ step: "view_select", status: "done", value: { chosen_heading, reason } }` | |
| `step` | `{ step: "edit", status: "done", value: "data:image/png;base64,..." }` | |
| `step` | `{ step: "video", status: "done", value: "/output/<slug>/hero.mp4" }` | served as static file |
| `done` | `{}` | signals pipeline complete |
| `error` | `{ step, message }` | on any failure |

### `GET /features`
Returns the parsed `features.json` array. Used by the frontend to populate the dropdown on page load.

### `GET /output/*`
Static file serving for the `output/` directory (video download).

---

## Pipeline Steps (server.js)

### 1. Geocode
`GET https://maps.googleapis.com/maps/api/geocode/json?address=...&key=GOOGLE_KEY`

Extract `lat`, `lng`, `formatted_address`. Derive output slug from formatted address + feature id.

### 2. Satellite image
`GET https://maps.googleapis.com/maps/api/staticmap?center=LAT,LNG&zoom=20&size=1024x1024&maptype=satellite&key=GOOGLE_KEY`

Returns JPEG buffer. Emit as base64 data URL. Save to `output/<slug>/satellite.jpg`.

### 3. Placement analysis (Claude Opus via OpenRouter)
POST to `https://openrouter.ai/api/v1/chat/completions` with model `anthropic/claude-opus-4`.

Send satellite image as base64 + the placement analysis prompt (from skill spec, adapted with `features.json` `analysis_hint`). Parse response with tolerant JSON extractor (find first `{...}` block). Save to `analysis.json`.

### 4. 3D renders (Playwright + Cesium)
Launch headless Chromium. For each heading in `[0, 90, 180, 270]` (run in parallel via `Promise.all`):
- Navigate to `cesium.html?key=GOOGLE_KEY&lat=...&lng=...&heading=...&pitch=FEATURE_PITCH&range=FEATURE_RANGE`
- Wait for `window.__ready === true` (tiles loaded) or 25s timeout
- Screenshot as PNG buffer
- Emit SSE `renders/progress` event with base64 image
- Save to `output/<slug>/render-<heading>.png`

Close browser after all 4 renders.

### 5. View selection (Claude Opus via OpenRouter)
Send all 4 render images + satellite + placement analysis result to Claude. Use back-of-house view selector prompt. Parse `chosen_heading` from response.

### 6. Image edit (Nano Banana Pro via OpenRouter)
POST to `https://openrouter.ai/api/v1/chat/completions` with model `google/gemini-3-pro-image-preview`.

Send chosen render image + edit prompt (assembled from feature config + placement analysis). Include `modalities: ["image", "text"]` in request body.

Extract edited image from `choices[0].message.images[0].image_url.url`. Save to `output/<slug>/edited.png`.

### 7. Video generation (Veo 3.1 via OpenRouter)
POST to `https://openrouter.ai/api/v1/videos`:
```json
{
  "model": "google/veo-3.1",
  "prompt": "<assembled video prompt>",
  "input_references": [{ "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }],
  "aspect_ratio": "16:9",
  "duration": 8,
  "resolution": "720p"
}
```

Poll `GET /api/v1/videos/{id}` until `status === "completed"`. Then download via `GET /api/v1/videos/{id}/content` with `Authorization: Bearer OPENROUTER_KEY`. Save to `output/<slug>/hero.mp4`.

---

## Frontend (`index.html`)

### Layout
- **Top bar:** "BackyardAI" logo + personal badge
- **Left sidebar (300px):** address input, feature dropdown (populated from `features.json` served at `GET /features`), Run button, pipeline step checklist, cost estimate
- **Main area:** 2×2 results grid
  - Top-left: Satellite + analysis summary
  - Top-right: 3D renders (2×2 thumbnail grid, chosen render gets blue border after view selection)
  - Bottom-left: Edited image ("Pool added" / "Deck added" etc.)
  - Bottom-right: Video player (`<video controls>`)

### SSE handling
```js
const res = await fetch('/run', { method: 'POST', body: JSON.stringify({ address, feature }), headers: { 'Content-Type': 'application/json' } });
const reader = res.body.getReader();
// read chunks, parse SSE lines, dispatch to card updaters
```

Each step event calls the corresponding card's update function. Sidebar dots transition: grey → spinning blue → green check.

### Error state
If an `error` event arrives, the relevant card turns red and shows the error message. Other completed cards remain visible.

---

## Cesium 3D Render Page (`cesium.html`)

Standalone HTML page served by Express. Loaded by Playwright. Reads params from URL query string: `key`, `lat`, `lng`, `heading`, `pitch`, `range`.

Initialises CesiumJS 1.123 with Photorealistic 3D Tiles (`tile.googleapis.com/v1/3dtiles/root.json?key=...`). Disables globe, all UI chrome. Calls `camera.lookAt(target, HeadingPitchRange(heading, pitch, range))` then waits for `tileset.tilesLoaded` to be stable for 30 frames (or 25s timeout), then sets `window.__ready = true`.

---

## Setup (SETUP.md)

1. **Google Cloud:**
   - Create project at console.cloud.google.com
   - Enable: Geocoding API, Maps Static API, Map Tiles API, (billing required)
   - Create API key → copy to `.env` as `GOOGLE_KEY=...`

2. **OpenRouter:**
   - Create account at openrouter.ai
   - Add credits (minimum ~$5 for a few test runs)
   - Create API key → copy to `.env` as `OPENROUTER_KEY=...`

3. **Install & run:**
   ```bash
   npm install
   npx playwright install chromium
   node server.js
   # open http://localhost:3000
   ```

4. Add `.env` and `output/` to `.gitignore`.

---

## Key Implementation Notes

- **Tolerant JSON extraction:** Claude sometimes wraps JSON in prose. Always extract with `text.match(/\{[\s\S]*\}/)` fallback before `JSON.parse`.
- **Generic analysis field:** The placement analysis prompt instructs Claude to return `recommendation` (not `pool_recommendation`) so it works for all feature types. The `analysis_hint` from `features.json` tells Claude what to recommend.
- **Cesium heading convention:** `heading=0` puts camera NORTH of target (looking south). To show the backyard as foreground, camera must sit IN the backyard — so `heading` = direction from house center to backyard.
- **4 renders in parallel:** `Promise.all` four Playwright page instances. Each gets its own page, screenshots independently, and emits its SSE event as soon as it's done.
- **Video download auth:** `unsigned_urls` in the Veo response returns 401. Always use `GET /api/v1/videos/{id}/content` with the OpenRouter bearer token.
- **Image data size:** Base64 PNG renders (~2MB each) are fine for SSE over localhost. Don't do this over the internet.
- **Output slug:** Derived from `formatted_address + feature_id`, lowercased, spaces → hyphens, special chars stripped.
