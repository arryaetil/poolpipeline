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

// Camera range based on parcel size: show the parcel + surrounding context
function parcelToRange(width_m, depth_m) {
  const longest = Math.max(width_m, depth_m);
  return Math.round(Math.max(60, Math.min(250, longest * 4)));
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
  const centroid = polygonCentroid(coords);
  const range = parcelToRange(dims.width_m, dims.depth_m);
  return { coords, ...dims, centroid, range };
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
