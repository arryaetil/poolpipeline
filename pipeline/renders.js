export async function renderAll({ lat, lng, pitch, range, mapboxToken, onProgress }) {
  const headings = [0, 90, 180, 270];

  // Cesium pitch (-90=down, 0=horizontal) → Mapbox pitch (0=top-down, 60=max tilt)
  const mapboxPitch = Math.min(60, Math.max(0, 90 + pitch + 15));
  // Higher pitch = more perspective stretch = needs more zoom to keep house in frame
  const zoom = 17.5 + mapboxPitch / 30;

  const results = await Promise.all(headings.map(async (heading) => {
    // Cesium heading = orbit position → Mapbox bearing = direction camera faces
    const bearing = (heading + 180) % 360;
    const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static` +
      `/${lng},${lat},${zoom.toFixed(2)},${bearing},${mapboxPitch}` +
      `/1280x720?access_token=${mapboxToken}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Render ${heading}° failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    onProgress(heading, b64);
    return { heading, image: b64 };
  }));

  return results;
}
