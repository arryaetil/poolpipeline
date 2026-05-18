# Claude Code Prompt — Kadaster parcel integration

## Goal

Right now the pipeline guesses where the garden is by asking Claude Opus 4 to look at a satellite photo. This leads to pools being placed in the wrong garden or on the neighbour's lot. We want to fix this permanently by fetching the exact parcel boundary and building footprint from official Dutch government APIs, drawing them on the satellite image, and passing the exact dimensions through the pipeline.

## How it works after this change

1. Address → geocode (already exists)
2. **NEW** → PDOK WFS: fetch exact parcel polygon (perceelgrens) — free, no key
3. **NEW** → BAG API: fetch exact building footprint (huisomtrek) — BAG_KEY in .env
4. **NEW** → Draw both polygons on the satellite image as coloured overlays
5. Claude Opus 4 receives the annotated image — can see exactly where the property ends
6. **NEW** → Pass exact backyard dimensions (calculated from parcel polygon) directly — no more AI guessing
7. Gemini receives proportional scale hint based on real measurements

## APIs used

**PDOK Kadastrale Kaart WFS** — free, no key, public endpoint:
```
https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0
  ?service=WFS&version=2.0.0&request=GetFeature
  &typeName=kadastralekaart:Perceel
  &outputFormat=application/json&srsName=EPSG:4326
  &bbox={lng-0.001},{lat-0.001},{lng+0.001},{lat+0.001}
```
Returns GeoJSON FeatureCollection. Find the feature whose polygon contains the point [lng, lat].

**BAG API Individuele Bevragingen** — requires BAG_KEY header:
```
GET https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/panden
  ?lat={lat}&lon={lng}&radius=10
Header: X-Api-Key: {BAG_KEY}
```
Returns the building (pand) at that location. Use `geometrie.coordinates` for the footprint polygon.

## Step 1 — Install sharp

```bash
npm install sharp
```

Sharp is used to draw the polygon overlays on the satellite PNG image.

---

## Step 2 — Create `pipeline/parcel.js`

This file handles all parcel and building fetching, polygon math, and image annotation.

```javascript
import sharp from 'sharp';

// ── Geo math helpers ──────────────────────────────────────────────

// Convert lat/lng to Web Mercator pixel position within a Mapbox Static image
function lngLatToPixel(lng, lat, centerLng, centerLat, zoom, imgW, imgH) {
  const scale = 256 * Math.pow(2, zoom);
  const wx = (v) => (v + 180) / 360 * scale;
  const wy = (v) => (1 - Math.log(Math.tan(v * Math.PI / 180) + 1 / Math.cos(v * Math.PI / 180)) / Math.PI) / 2 * scale;
  return {
    x: Math.round(imgW / 2 + (wx(lng) - wx(centerLng))),
    y: Math.round(imgH / 2 + (wy(lat) - wy(centerLat))),
  };
}

// Check if a point [lng, lat] is inside a polygon (ray casting)
function pointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Calculate approximate width/depth of a polygon in metres
function polygonDimensions(coords) {
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(avgLat * Math.PI / 180);
  const width = Math.round((Math.max(...lngs) - Math.min(...lngs)) * metersPerDegLng);
  const depth = Math.round((Math.max(...lats) - Math.min(...lats)) * metersPerDegLat);
  return { width_m: width, depth_m: depth };
}

// ── API fetchers ──────────────────────────────────────────────────

export async function fetchParcel(lat, lng) {
  const delta = 0.001;
  const url = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0` +
    `?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=kadastralekaart:Perceel&outputFormat=application/json` +
    `&srsName=EPSG:4326&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDOK WFS failed: ${res.status}`);
  const data = await res.json();

  const feature = data.features?.find(f => {
    const coords = f.geometry?.coordinates?.[0];
    return coords && pointInPolygon([lng, lat], coords);
  });

  if (!feature) throw new Error('No parcel found at this location');

  const coords = feature.geometry.coordinates[0];
  const dims = polygonDimensions(coords);
  return { coords, ...dims };
}

export async function fetchBuilding(lat, lng, bagKey) {
  if (!bagKey) return null;
  const url = `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/panden?lat=${lat}&lon=${lng}&radius=10`;
  const res = await fetch(url, { headers: { 'X-Api-Key': bagKey } });
  if (!res.ok) return null;
  const data = await res.json();
  const pand = data._embedded?.panden?.[0];
  if (!pand?.geometrie?.coordinates?.[0]) return null;
  return pand.geometrie.coordinates[0];
}

// ── Image annotation ──────────────────────────────────────────────

export async function annotateImage(satB64, parcel, building, centerLat, centerLng) {
  const ZOOM = 20;
  const IMG_W = 1024;
  const IMG_H = 1024;

  const toPixel = (lng, lat) => lngLatToPixel(lng, lat, centerLng, centerLat, ZOOM, IMG_W, IMG_H);

  function polygonToSvgPoints(coords) {
    return coords.map(([lng, lat]) => {
      const p = toPixel(lng, lat);
      return `${p.x},${p.y}`;
    }).join(' ');
  }

  const parcelPoints = polygonToSvgPoints(parcel.coords);
  const buildingLayer = building
    ? `<polygon points="${polygonToSvgPoints(building)}" fill="rgba(255,165,0,0.25)" stroke="orange" stroke-width="3"/>`
    : '';

  const svg = `<svg width="${IMG_W}" height="${IMG_H}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${parcelPoints}" fill="rgba(0,255,0,0.08)" stroke="lime" stroke-width="4" stroke-dasharray="12,6"/>
    ${buildingLayer}
    <text x="10" y="24" font-size="18" fill="lime" font-family="sans-serif">■ Perceelgrens</text>
    ${building ? '<text x="10" y="48" font-size="18" fill="orange" font-family="sans-serif">■ Woning</text>' : ''}
  </svg>`;

  const annotated = await sharp(Buffer.from(satB64, 'base64'))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return annotated.toString('base64');
}
```

---

## Step 3 — Update `server.js`

Add `BAG_KEY` to the env reads at the top:
```javascript
const BAG_KEY = process.env.BAG_KEY;
```

Add imports for the new parcel functions:
```javascript
import { fetchParcel, fetchBuilding, annotateImage } from './pipeline/parcel.js';
```

In the `/run` route, after the satellite fetch and before the analysis, add:

```javascript
// Parcel + building lookup
let parcel = null;
let annotatedSatB64 = satB64;
try {
  parcel = await fetchParcel(geo.lat, geo.lng);
  const building = await fetchBuilding(geo.lat, geo.lng, BAG_KEY);
  annotatedSatB64 = await annotateImage(satB64, parcel, building, geo.lat, geo.lng);
  emit('step', { step: 'satellite', status: 'annotated', value: `data:image/png;base64,${annotatedSatB64}` });
  writeFileSync(join(outDir, 'satellite-annotated.png'), Buffer.from(annotatedSatB64, 'base64'));
  console.log(`[parcel] ${parcel.width_m}m wide × ${parcel.depth_m}m deep`);
} catch (err) {
  console.warn('[parcel] lookup failed, continuing without parcel data:', err.message);
}
```

Then update the `analyse` call to use the annotated image and pass parcel dimensions:
```javascript
const analysis = await analyse(annotatedSatB64, feature, OR_KEY, feature.id === 'pool' ? poolCatalog : [], parcel);
```

Also update the pool dimensions lookup block — if we have real parcel data, use it instead of the catalog dimensions:
```javascript
if (feature.id === 'pool' && analysis.recommended_pool) {
  const matched = poolCatalog.find((p) => p.name === analysis.recommended_pool);
  if (matched) analysis.pool_dimensions = matched.dimensions_m;
}
// Override backyard dimensions with real parcel data if available
if (parcel) {
  analysis.backyard_width_m = parcel.width_m;
  analysis.backyard_depth_m = parcel.depth_m;
}
```

---

## Step 4 — Update `pipeline/analysis.js`

Add a `parcel` parameter (defaults to null):
```javascript
export async function analyse(satB64, feature, orKey, poolCatalog = [], parcel = null) {
```

Replace the backyard dimension instruction in the prompt. Currently it asks Claude to estimate the dimensions. If we have real parcel data, tell Claude the real numbers instead:

```javascript
const dimensionInfo = parcel
  ? `Het perceel is exact ${parcel.width_m}m breed en ${parcel.depth_m}m diep (officiële Kadasterdata). Gebruik deze afmetingen — je hoeft ze niet te schatten.`
  : `Schat de bruikbare breedte en diepte van de achtertuin in meters (backyard_width_m, backyard_depth_m).`;
```

Add this to the prompt text between step 3 and 4, and remove the backyard_width_m/backyard_depth_m estimation instructions. Also update the prompt to mention the image annotations:

Add after the CRITICAL line:
```
De satellietfoto heeft een groene stippellijn die de EXACTE PERCEELGRENS toont (officiële Kadasterdata). Een oranje lijn toont de woning. Plaats het zwembad uitsluitend BINNEN de groene lijn, nooit erbuiten.
```

---

## Step 5 — Verify everything

1. Run `node server.js`
2. Test with a Dutch address (e.g. "Keizersgracht 1, Amsterdam")
3. Terminal should show `[parcel] Xm wide × Ym deep`
4. The annotated satellite image saved to `output/.../satellite-annotated.png` should show green parcel boundary and orange building outline
5. The analysis JSON should have `backyard_width_m` and `backyard_depth_m` matching the real parcel size
6. The final render should show the pool inside the property boundary

If the BAG API returns 401, check that `BAG_KEY` is set correctly in `.env`.
If PDOK returns no parcel (rural address, new development), the pipeline continues without annotation — it degrades gracefully.

## Do NOT touch
- `cesium.html`
- `pipeline/edit.js`
- `pipeline/viewSelect.js`
- `features.json`
- `aquapura-pools.json`
- `index.html`
