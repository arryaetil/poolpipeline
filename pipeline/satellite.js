export async function fetchSatellite(lat, lng, mapboxToken) {
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lng},${lat},20/1024x1024?access_token=${mapboxToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Satellite fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
