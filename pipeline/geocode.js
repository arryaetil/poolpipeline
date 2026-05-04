export async function geocode(address, googleKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(`Geocoding failed: ${json.status}`);
  const { lat, lng } = json.results[0].geometry.location;
  const formatted = json.results[0].formatted_address;
  return { lat, lng, formatted };
}
