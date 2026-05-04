export async function fetchSatellite(lat, lng, googleKey) {
  const url = `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=20&size=1024x1024&maptype=satellite&key=${googleKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Satellite fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
