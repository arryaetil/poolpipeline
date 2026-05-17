import sharp from 'sharp';

// ── Geo math helpers ──────────────────────────────────────────────

function lngLatToPixel(lng, lat, centerLng, centerLat, zoom, imgW, imgH) {
  const scale = 256 * Math.pow(2, zoom);
  const wx = (v) => (v + 180) / 360 * scale;
  const wy = (v) => (1 - Math.log(Math.tan(v * Math.PI / 180) + 1 / Math.cos(v * Math.PI / 180)) / Math.PI) / 2 * scale;
  return {
    x: Math.round(imgW / 2 + (wx(lng) - wx(centerLng))),
    y: Math.round(imgH / 2 + (wy(lat) - wy(centerLat))),
  };
}

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

function polygonCentroid(coords) {
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return {
    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
  };
}

function parcelToRange(width_m, depth_m) {
  const longest = Math.max(width_m, depth_m);
  return Math.round(Math.max(60, Math.min(150, longest * 2)));
}

function buildParcelResult(coords) {
  const dims = polygonDimensions(coords);
  const centroid = polygonCentroid(coords);
  const range = parcelToRange(dims.width_m, dims.depth_m);
  return { coords, ...dims, centroid, range };
}

// Shifts parcel centroid away from building centroid into the garden
export function gardenCentroid(parcelCoords, buildingCoords) {
  const pc = polygonCentroid(parcelCoords);
  const bc = polygonCentroid(buildingCoords);
  return {
    lat: pc.lat + (pc.lat - bc.lat) * 0.5,
    lng: pc.lng + (pc.lng - bc.lng) * 0.5,
  };
}

// ── Netherlands ───────────────────────────────────────────────────

async function fetchParcelNetherlands(lat, lng) {
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

  console.log('[parcel] Netherlands: PDOK parcel found');
  return buildParcelResult(feature.geometry.coordinates[0]);
}

async function fetchBuildingNetherlands(lat, lng, bagKey) {
  if (!bagKey) return null;
  const url = `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/panden?lat=${lat}&lon=${lng}&radius=10`;
  const res = await fetch(url, { headers: { 'X-Api-Key': bagKey } });
  if (!res.ok) return null;
  const data = await res.json();
  const pand = data._embedded?.panden?.[0];
  return pand?.geometrie?.coordinates?.[0] ?? null;
}

// ── Belgium ───────────────────────────────────────────────────────

async function fetchParcelBelgium(lat, lng) {
  const delta = 0.001;

  // Try GRB (Flanders) first
  try {
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
      console.log('[parcel] Belgium: GRB parcel found');
      return buildParcelResult(feature.geometry.coordinates[0]);
    }
  } catch (err) {
    console.warn('[parcel] GRB failed, trying CadGIS:', err.message);
  }

  // Fall back to CadGIS (all of Belgium)
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

  console.log('[parcel] Belgium: CadGIS parcel found');
  return buildParcelResult(feature.geometry.coordinates[0]);
}

async function fetchBuildingBelgium(lat, lng) {
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

// ── Public API ────────────────────────────────────────────────────

export async function fetchParcel(lat, lng, country = 'Nederland') {
  if (country === 'België' || country === 'Belgium') {
    return fetchParcelBelgium(lat, lng);
  }
  return fetchParcelNetherlands(lat, lng);
}

export async function fetchBuilding(lat, lng, bagKey, country = 'Nederland') {
  if (country === 'België' || country === 'Belgium') {
    return fetchBuildingBelgium(lat, lng);
  }
  return fetchBuildingNetherlands(lat, lng, bagKey);
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
