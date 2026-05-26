const MAPBOX_GEOCODING_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';

function mapboxCostEstimate() {
  const value = process.env.MAPBOX_GEOCODING_COST_ESTIMATE_USD;
  return value ? Number.parseFloat(value) : null;
}

function parseMapboxFeature(query, feature, rawResponse) {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  const props = feature.properties ?? {};
  const context = props.context ?? {};

  return {
    input_query: query,
    formatted_address: props.full_address || props.name_preferred || props.name || feature.place_name || '',
    formatted: props.full_address || props.name_preferred || props.name || feature.place_name || '',
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    confidence: props.match_code?.confidence ?? props.coordinates?.accuracy ?? null,
    relevance: props.match_code?.confidence ?? null,
    country: context.country?.name ?? props.country ?? 'unknown',
    provider: 'mapbox',
    raw_response: rawResponse,
  };
}

export async function geocodeWithMapbox(query, {
  apiKey = process.env.MAPBOX_TOKEN,
  guard,
  cache,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('MAPBOX_TOKEN must be set for Mapbox geocoding');

  const cached = cache?.get('mapbox', query);
  if (cached) return { ...cached, cache_hit: true };

  await guard?.beforeCall('mapbox');

  const url = new URL(MAPBOX_GEOCODING_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('access_token', apiKey);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', process.env.MAPBOX_LANGUAGE || 'nl');
  if (process.env.MAPBOX_COUNTRY) {
    url.searchParams.set('country', process.env.MAPBOX_COUNTRY);
  }

  const res = await fetchImpl(url);
  guard?.recordApiCall({
    query,
    provider: 'mapbox',
    statusCode: res.status,
    costEstimateUsd: mapboxCostEstimate(),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Mapbox geocoding failed with HTTP ${res.status}: ${json.message ?? 'unknown error'}`);
  }
  const feature = json.features?.[0];
  if (!feature) throw new Error(`No Mapbox geocoding result for "${query}"`);

  const result = parseMapboxFeature(query, feature, json);
  cache?.set('mapbox', query, result);
  return result;
}
