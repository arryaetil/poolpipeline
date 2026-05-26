function googleCostEstimate() {
  const value = process.env.GOOGLE_GEOCODING_COST_ESTIMATE_USD;
  return value ? Number.parseFloat(value) : null;
}

export async function geocodeWithGoogle(query, {
  apiKey = process.env.GOOGLE_KEY,
  guard,
  cache,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('GOOGLE_KEY must be set for legacy Google geocoding');

  const cached = cache?.get('google', query);
  if (cached) return { ...cached, cache_hit: true };

  await guard?.beforeCall('google');

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);

  const res = await fetchImpl(url);
  guard?.recordApiCall({
    query,
    provider: 'google',
    statusCode: res.status,
    costEstimateUsd: googleCostEstimate(),
  });

  const json = await res.json();
  if (!res.ok || json.status !== 'OK') {
    throw new Error(`Legacy Google geocoding failed: ${json.status ?? `HTTP ${res.status}`}`);
  }

  const first = json.results[0];
  const { lat, lng } = first.geometry.location;
  const countryComponent = first.address_components.find((c) => c.types.includes('country'));
  const result = {
    input_query: query,
    formatted_address: first.formatted_address,
    formatted: first.formatted_address,
    latitude: lat,
    longitude: lng,
    lat,
    lng,
    confidence: null,
    relevance: null,
    country: countryComponent?.long_name ?? 'unknown',
    provider: 'google',
    raw_response: json,
    deprecated: true,
  };
  cache?.set('google', query, result);
  return result;
}
