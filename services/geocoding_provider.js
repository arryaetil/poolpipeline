import { createApiUsageGuard } from './api_usage_guard.js';
import { createGeocodingCache } from './cache.js';
import { geocodeWithMapbox } from './mapbox_provider.js';
import { geocodeWithGoogle } from './google_provider.js';

const SUPPORTED_PROVIDERS = new Set(['mapbox', 'google']);

export function getMapProvider(env = process.env) {
  return (env.MAP_PROVIDER || 'mapbox').trim().toLowerCase();
}

export function validateGeocodingConfig(env = process.env) {
  const provider = getMapProvider(env);
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported MAP_PROVIDER "${provider}". Supported providers: mapbox, google.`);
  }
  if (provider === 'mapbox' && !env.MAPBOX_TOKEN) {
    throw new Error('MAPBOX_TOKEN must be set when MAP_PROVIDER=mapbox');
  }
  if (provider === 'google' && !env.GOOGLE_KEY) {
    throw new Error('GOOGLE_KEY must be set when MAP_PROVIDER=google');
  }
}

export async function geocodeLocation(query, {
  provider = getMapProvider(),
  guard = createApiUsageGuard(),
  cache = createGeocodingCache(),
  fetchImpl = fetch,
} = {}) {
  if (!query || !query.trim()) throw new Error('geocodeLocation requires a non-empty query');

  const selectedProvider = provider.trim().toLowerCase();
  if (selectedProvider === 'mapbox') {
    return geocodeWithMapbox(query, { guard, cache, fetchImpl });
  }
  if (selectedProvider === 'google') {
    return geocodeWithGoogle(query, { guard, cache, fetchImpl });
  }
  throw new Error(`Unsupported MAP_PROVIDER "${provider}". Supported providers: mapbox, google.`);
}

export const geocode_location = geocodeLocation;
