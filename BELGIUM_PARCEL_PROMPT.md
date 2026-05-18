# Claude Code Prompt — Belgian parcel integration (GRB + CadGIS)

## Context

`pipeline/parcel.js` already handles Dutch addresses using PDOK (parcel) and BAG (building footprint). We now need the same for Belgian addresses. The geocode result already includes `geo.country` ("Nederland" or "België") so the routing logic is simple.

The goal: for any Belgian address, fetch the exact parcel boundary and building footprint from Belgian government APIs — no API key needed for either.

---

## Belgian APIs

### GRB — Grootschalig Referentie Bestand (Flanders)
Free WFS, no key, covers Flanders (most of Aquapura's market):
```
https://geo.api.vlaanderen.be/GRB/wfs
  ?service=WFS&version=2.0.0&request=GetFeature
  &typeName=GRB:ADP          ← parcel polygons
  &outputFormat=application/json&srsName=EPSG:4326
  &bbox={lng-0.001},{lat-0.001},{lng+0.001},{lat+0.001}
```

For building footprints (GRB):
```
typeName=GRB:GBG            ← gebouw bij de grond (building footprint)
```

### CadGIS — Federal Cadastre (fallback for Wallonia/Brussels)
Free WFS, no key, covers all of Belgium:
```
https://ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/public/Cadastral_Boundaries/MapServer/WFSServer
  ?service=WFS&version=2.0.0&request=GetFeature
  &typeName=Cadastral_Boundaries:CadastralParcel
  &outputFormat=application/json&srsName=EPSG:4326
  &bbox={lng-0.001},{lat-0.001},{lng+0.001},{lat+0.001}
```

---

## What to implement in `pipeline/parcel.js`

### 1. Add `fetchParcelBelgium(lat, lng)`

Try GRB first (Flanders), fall back to CadGIS if GRB returns no features:

```javascript
export async function fetchParcelBelgium(lat, lng) {
  // Try GRB (Flanders) first
  try {
    const delta = 0.001;
    const url = `https://geo.api.vlaanderen.be/GRB/wfs?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=GRB:ADP&outputFormat=application/json&srsName=EPSG:4326` +
      `&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GRB failed: ${res.status}`);
    const data = await res.json();
    const feature = data.features?.find(f => {
      const coords = f.geometry?.coordinates?.[0];
      return coords && pointInPolygon([lng, lat], coords);
    });
    if (feature) {
      const coords = feature.geometry.coordinates[0];
      const dims = polygonDimensions(coords);
      console.log('[parcel] Belgium: GRB parcel found');
      return { coords, ...dims };
    }
  } catch (err) {
    console.warn('[parcel] GRB failed, trying CadGIS:', err.message);
  }

  // Fall back to CadGIS (all of Belgium)
  const delta = 0.001;
  const url = `https://ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/public/Cadastral_Boundaries/MapServer/WFSServer` +
    `?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeName=Cadastral_Boundaries:CadastralParcel` +
    `&outputFormat=application/json&srsName=EPSG:4326` +
    `&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CadGIS failed: ${res.status}`);
  const data = await res.json();
  const feature = data.features?.find(f => {
    const coords = f.geometry?.coordinates?.[0];
    return coords && pointInPolygon([lng, lat], coords);
  });
  if (!feature) throw new Error('No parcel found at this Belgian location');
  const coords = feature.geometry.coordinates[0];
  const dims = polygonDimensions(coords);
  console.log('[parcel] Belgium: CadGIS parcel found');
  return { coords, ...dims };
}
```

### 2. Add `fetchBuildingBelgium(lat, lng)`

Use GRB building footprints (GBG layer):

```javascript
export async function fetchBuildingBelgium(lat, lng) {
  try {
    const delta = 0.001;
    const url = `https://geo.api.vlaanderen.be/GRB/wfs?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeName=GRB:GBG&outputFormat=application/json&srsName=EPSG:4326` +
      `&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.find(f => {
      const coords = f.geometry?.coordinates?.[0];
      return coords && pointInPolygon([lng, lat], coords);
    });
    return feature?.geometry?.coordinates?.[0] ?? null;
  } catch {
    return null;
  }
}
```

### 3. Update the main `fetchParcel` and `fetchBuilding` exports to route by country

Currently `fetchParcel(lat, lng)` only does PDOK (Netherlands). Update the signature to accept a `country` parameter and route accordingly:

```javascript
export async function fetchParcel(lat, lng, country = 'Nederland') {
  if (country === 'België' || country === 'Belgium') {
    return fetchParcelBelgium(lat, lng);
  }
  return fetchParcelNetherlands(lat, lng); // rename existing fetchParcel internals
}

export async function fetchBuilding(lat, lng, bagKey, country = 'Nederland') {
  if (country === 'België' || country === 'Belgium') {
    return fetchBuildingBelgium(lat, lng);
  }
  // existing BAG logic
  if (!bagKey) return null;
  const url = `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/panden?lat=${lat}&lon=${lng}&radius=10`;
  const res = await fetch(url, { headers: { 'X-Api-Key': bagKey } });
  if (!res.ok) return null;
  const data = await res.json();
  const pand = data._embedded?.panden?.[0];
  return pand?.geometrie?.coordinates?.[0] ?? null;
}
```

### 4. Update `server.js`

Pass `geo.country` to `fetchParcel` and `fetchBuilding`:

```javascript
parcel = await fetchParcel(geo.lat, geo.lng, geo.country);
const building = await fetchBuilding(geo.lat, geo.lng, BAG_KEY, geo.country);
```

---

## Verification

1. Test with a Dutch address → terminal shows `[parcel] PDOK parcel found`
2. Test with a Belgian address (e.g. "Antwerpsesteenweg 100, Gent") → terminal shows `[parcel] Belgium: GRB parcel found`
3. In both cases: `output/.../satellite-annotated.png` should show the green parcel boundary
4. If GRB returns nothing (Wallonia address), terminal shows fallback to CadGIS

## Do NOT touch
- `cesium.html`
- `pipeline/analysis.js`
- `pipeline/edit.js`
- `pipeline/viewSelect.js`
- `features.json`
- `aquapura-pools.json`
- `index.html`
