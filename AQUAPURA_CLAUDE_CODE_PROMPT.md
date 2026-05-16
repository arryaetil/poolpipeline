# Claude Code Prompt — Aquapura Demo Transformation

Paste this entire prompt into Claude Code to implement the Aquapura demo.

---

## Context

This is a Node.js/Express app called **poolpipeline** (ESM modules). It takes a home address, fetches a satellite image, runs Claude Opus 4 analysis, generates 3D renders via Google Photorealistic Tiles, then uses Gemini 3 Pro to edit the best render by adding a pool. The output is shown in `index.html`.

We are transforming this into a demo for **Aquapura** (https://www.aquapura.be), a Belgian premium pool company. The changes needed are:

1. Create `aquapura-pools.json` with all 12 Aquapura LPW ceramic composite pool models
2. Modify `pipeline/analysis.js` so the AI picks the best Aquapura pool model from the catalog and returns `recommended_pool` and `pool_reasoning` in its JSON output
3. Update the pool entry in `features.json` with Aquapura's specific Belgian aesthetic in `edit_prompt` and an expanded `analysis_hint`
4. Update `server.js` to load `aquapura-pools.json` and pass it into the analysis call
5. Update `index.html` to display the recommended pool model name and reasoning in the analysis card

---

## Step 1 — Create `aquapura-pools.json`

Create this file at the project root. It catalogs all 12 Aquapura LPW pool models with their dimensions and ideal garden profiles so the AI can pick the best fit.

```json
[
  {
    "id": "zenn",
    "name": "Zenn",
    "dimensions_m": "8.6 × 3.5",
    "shape": "rectangular",
    "depth_range_m": "1.20–1.50",
    "ideal_garden": "medium backyard with room for terracing; versatile all-rounder"
  },
  {
    "id": "city",
    "name": "City",
    "dimensions_m": "7.0 × 3.0",
    "shape": "rectangular",
    "depth_range_m": "1.20–1.45",
    "ideal_garden": "compact urban garden or terrace; smaller footprint"
  },
  {
    "id": "city_plus",
    "name": "City+",
    "dimensions_m": "8.0 × 3.5",
    "shape": "rectangular",
    "depth_range_m": "1.20–1.50",
    "ideal_garden": "medium urban garden wanting extra length over City"
  },
  {
    "id": "xl",
    "name": "XL",
    "dimensions_m": "10.0 × 4.0",
    "shape": "rectangular",
    "depth_range_m": "1.35–1.65",
    "ideal_garden": "spacious suburban backyard; families wanting lap lane"
  },
  {
    "id": "xl_plus",
    "name": "XL+",
    "dimensions_m": "11.0 × 4.5",
    "shape": "rectangular",
    "depth_range_m": "1.40–1.70",
    "ideal_garden": "large garden; premium lap pool; maximum swim length"
  },
  {
    "id": "style",
    "name": "Style",
    "dimensions_m": "9.0 × 4.0",
    "shape": "rectangular with shallow shelf",
    "depth_range_m": "0.30 shelf / 1.45 main",
    "ideal_garden": "family garden with children; shallow relaxation shelf at one end"
  },
  {
    "id": "carre",
    "name": "Carré",
    "dimensions_m": "6.0 × 6.0",
    "shape": "square",
    "depth_range_m": "1.40–1.50",
    "ideal_garden": "near-square or wide garden; contemporary geometric design statement"
  },
  {
    "id": "zk12",
    "name": "ZK12",
    "dimensions_m": "12.0 × 4.0",
    "shape": "rectangular",
    "depth_range_m": "1.45–1.70",
    "ideal_garden": "very long garden; competition or serious lap swimming"
  },
  {
    "id": "la_plage_9",
    "name": "La Plage 9",
    "dimensions_m": "9.0 × 4.5",
    "shape": "rectangular with full-width beach entry",
    "depth_range_m": "0.0 beach / 1.50 deep",
    "ideal_garden": "medium-large garden; beach/resort feel; gentle walk-in entry"
  },
  {
    "id": "la_plage_10",
    "name": "La Plage 10",
    "dimensions_m": "10.0 × 4.5",
    "shape": "rectangular with full-width beach entry",
    "depth_range_m": "0.0 beach / 1.50 deep",
    "ideal_garden": "large garden; beach entry; extra swim length"
  },
  {
    "id": "la_plage_11",
    "name": "La Plage 11",
    "dimensions_m": "11.0 × 5.0",
    "shape": "rectangular with full-width beach entry",
    "depth_range_m": "0.0 beach / 1.55 deep",
    "ideal_garden": "very large garden; premium resort aesthetic; families"
  },
  {
    "id": "la_plage_12",
    "name": "La Plage 12",
    "dimensions_m": "12.0 × 5.0",
    "shape": "rectangular with full-width beach entry",
    "depth_range_m": "0.0 beach / 1.60 deep",
    "ideal_garden": "maximum garden space; ultimate resort pool; statement centrepiece"
  }
]
```

---

## Step 2 — Modify `pipeline/analysis.js`

The `analyse` function receives `satB64`, `feature`, and `orKey`. Add a fourth parameter `poolCatalog` (an array). Inject the catalog as JSON into the prompt and instruct the AI to pick the best model and return two new fields.

Replace the entire file with:

```javascript
import { extractJson, orPost } from './utils.js';

export async function analyse(satB64, feature, orKey, poolCatalog = []) {
  const catalogSection = poolCatalog.length > 0
    ? `\nAQUAPURA POOL CATALOG (pick the single best fit for this garden):\n${JSON.stringify(poolCatalog, null, 2)}\n\nBased on the backyard dimensions and shape you observe, select the most suitable pool model from the catalog above. Return its "name" field as recommended_pool and explain your reasoning in pool_reasoning.`
    : '';

  const prompt = `You are a landscape architect. This is a top-down satellite image of a residential property. North is up.

CRITICAL: The FRONT of the house faces the road/street and contains the driveway. The BACKYARD is the OPPOSITE side — typically enclosed, often with grass, away from the street. Never confuse them.

1. Identify which compass side of the house is the FRONT (street/driveway side).
2. Identify the BACKYARD (opposite side from the front).
3. Identify obstructions in the backyard (trees, sheds, AC units, slopes, patios, existing structures).
4. ${feature.analysis_hint}
5. Describe the feature position relative to the house using clear directional language.
6. Determine the compass direction FROM the center of the house TOWARD the backyard (0–360°, 0=N, 90=E, 180=S, 270=W).
${catalogSection}

Respond in JSON only:
{
  "front_side": "...",
  "backyard": "...",
  "obstructions": "...",
  "recommendation": "...",
  "recommended_pool": "...",
  "pool_reasoning": "...",
  "render_prompt": "...",
  "backyard_camera_heading": <number>
}`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${satB64}` } },
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
```

---

## Step 3 — Update `features.json` (pool entry only)

Replace the pool feature's `analysis_hint` and `edit_prompt` fields. Leave the adu and solar entries completely unchanged.

The pool entry should become:

```json
{
  "id": "pool",
  "label": "Zwembad",
  "label_en": "swimming pool",
  "emoji": "🏊",
  "camera_pitch": -50,
  "camera_range": 130,
  "analysis_hint": "Recommend an inground swimming pool strictly in the backyard. Estimate the usable backyard width and length in metres to help select the right pool model. Note whether the garden is compact/urban or large/suburban.",
  "edit_prompt": "Add a photorealistic Aquapura LPW inground pool in the Belgian premium style: crystal-clear light blue-green water, dark Belgian bluestone coping (anthracite-grey natural stone) flush around all edges, an anthracite automatic rolling cover (rolluik) partially retracted at one short end, clean gray stone terrace tiles surrounding the pool, manicured green Belgian lawn beyond the terrace, and two or three low modern sun loungers on the terrace. The pool shape should be clean and geometric — rectangular or square. Style must feel like a high-end Belgian backyard, minimal and refined, no tropical or Mediterranean elements.",
  "video_prompt": "Sparkling crystal-clear light blue-green pool water with gentle ripples, Belgian bluestone coping, warm golden-hour lighting, anthracite rolling cover partially retracted."
}
```

---

## Step 4 — Update `server.js`

Two changes:

**A.** At the top of the file, after the existing imports, add an import to load the pool catalog:

```javascript
import { readFileSync } from 'node:fs';
```

(Note: `readFileSync` may already be imported — check `existsSync, mkdirSync, readdirSync, writeFileSync` in the existing import from `node:fs`. If so, just add `readFileSync` to that existing import destructure.)

**B.** After the line `const features = loadFeatures();`, add:

```javascript
const poolCatalog = JSON.parse(
  readFileSync(join(__dirname, 'aquapura-pools.json'), 'utf-8')
);
```

**C.** In the `/run` route handler, find this line:

```javascript
const analysis = await analyse(satB64, feature, OR_KEY);
```

Replace it with:

```javascript
const analysis = await analyse(satB64, feature, OR_KEY, feature.id === 'pool' ? poolCatalog : []);
```

---

## Step 5 — Update `index.html`

Find the `showAnalysis` function. It currently builds HTML like this:

```javascript
function showAnalysis(analysis) {
  const body = document.getElementById('analysisBody');
  body.innerHTML = `
    <div class="analysis-fields">
      <div><div class="af-label">Achterkant perceel</div><div class="af-value">${escHtml(analysis.backyard ?? '—')}</div></div>
      <div><div class="af-label">Obstakels</div><div class="af-value">${escHtml(analysis.obstructions ?? '—')}</div></div>
      <div><div class="af-label">Aanbeveling</div><div class="af-value">${escHtml(analysis.recommendation ?? '—')}</div></div>
    </div>`;
```

Replace the body.innerHTML assignment so it also renders `recommended_pool` and `pool_reasoning` when they are present:

```javascript
function showAnalysis(analysis) {
  const body = document.getElementById('analysisBody');
  const poolModelRow = analysis.recommended_pool
    ? `<div><div class="af-label" style="color:#4ecdc4;">Aquapura model</div><div class="af-value" style="font-weight:700;font-size:18px;color:#fff;">${escHtml(analysis.recommended_pool)}</div></div>
       <div><div class="af-label" style="color:#4ecdc4;">Reden keuze</div><div class="af-value">${escHtml(analysis.pool_reasoning ?? '—')}</div></div>`
    : '';
  body.innerHTML = `
    <div class="analysis-fields">
      ${poolModelRow}
      <div><div class="af-label">Achterkant perceel</div><div class="af-value">${escHtml(analysis.backyard ?? '—')}</div></div>
      <div><div class="af-label">Obstakels</div><div class="af-value">${escHtml(analysis.obstructions ?? '—')}</div></div>
      <div><div class="af-label">Aanbeveling</div><div class="af-value">${escHtml(analysis.recommendation ?? '—')}</div></div>
    </div>`;
```

---

## Verification checklist

After making all changes, verify:

1. `aquapura-pools.json` exists at root and has 12 entries
2. `node --input-type=module < pipeline/analysis.js` has no syntax errors (or just start the server)
3. `features.json` pool entry has updated `edit_prompt` and `analysis_hint`; adu and solar are unchanged
4. `server.js` imports `readFileSync`, loads `poolCatalog`, and passes it to `analyse`
5. `index.html` `showAnalysis` renders `recommended_pool` and `pool_reasoning` rows when present
6. Run `node server.js` and test with a Belgian address (e.g. "Antwerpsesteenweg 100, Gent"). The analysis JSON in `output/<slug>/analysis.json` should contain `recommended_pool` and `pool_reasoning`. The edited image should show the Belgian-aesthetic pool.
