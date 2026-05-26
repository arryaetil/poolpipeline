import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ApiUsageGuard } from '../services/api_usage_guard.js';
import { GeocodingCache } from '../services/cache.js';
import { geocodeWithMapbox } from '../services/mapbox_provider.js';

function tempPath(name) {
  return join(mkdtempSync(join(tmpdir(), 'poolpipeline-')), name);
}

function mockMapboxFetch() {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        features: [{
          geometry: { coordinates: [5.866, 51.0] },
          properties: {
            full_address: 'Russellaan 4, Sittard, Limburg 6132 AS, Netherlands',
            match_code: { confidence: 'exact' },
            context: { country: { name: 'Netherlands' } },
          },
        }],
      };
    },
  });
}

test('Mapbox geocoding returns normalized lead location fields', async () => {
  const result = await geocodeWithMapbox('Russellaan 4, Sittard', {
    apiKey: 'test-token',
    guard: new ApiUsageGuard({ maxPerDay: 5, minIntervalMs: 0, usageFile: tempPath('usage.json'), logFile: tempPath('api.log') }),
    cache: new GeocodingCache(tempPath('cache.json')),
    fetchImpl: mockMapboxFetch(),
  });

  assert.equal(result.provider, 'mapbox');
  assert.equal(result.input_query, 'Russellaan 4, Sittard');
  assert.equal(result.formatted_address, 'Russellaan 4, Sittard, Limburg 6132 AS, Netherlands');
  assert.equal(result.latitude, 51.0);
  assert.equal(result.longitude, 5.866);
  assert.equal(result.country, 'Netherlands');
});

test('geocoding cache prevents a repeated external API call', async () => {
  let calls = 0;
  const cache = new GeocodingCache(tempPath('cache.json'));
  const guard = new ApiUsageGuard({ maxPerDay: 5, minIntervalMs: 0, usageFile: tempPath('usage.json'), logFile: tempPath('api.log') });
  const fetchImpl = async (...args) => {
    calls += 1;
    return mockMapboxFetch()(...args);
  };

  await geocodeWithMapbox('Russellaan 4, Sittard', { apiKey: 'test-token', guard, cache, fetchImpl });
  const second = await geocodeWithMapbox('  russellaan 4,   sittard  ', { apiKey: 'test-token', guard, cache, fetchImpl });

  assert.equal(calls, 1);
  assert.equal(second.cache_hit, true);
});

test('daily hard limit stops before a new provider call', async () => {
  const guard = new ApiUsageGuard({ maxPerDay: 1, minIntervalMs: 0, usageFile: tempPath('usage.json'), logFile: tempPath('api.log') });
  const cache = new GeocodingCache(tempPath('cache.json'));
  await geocodeWithMapbox('first address', { apiKey: 'test-token', guard, cache, fetchImpl: mockMapboxFetch() });

  await assert.rejects(
    () => geocodeWithMapbox('second address', { apiKey: 'test-token', guard, cache, fetchImpl: mockMapboxFetch() }),
    /Daily API call limit reached/
  );
});

test('API call logging includes timestamp, query, provider, and status code', async () => {
  const logFile = tempPath('api.log');
  const guard = new ApiUsageGuard({ maxPerDay: 5, minIntervalMs: 0, usageFile: tempPath('usage.json'), logFile });

  await geocodeWithMapbox('Russellaan 4, Sittard', {
    apiKey: 'test-token',
    guard,
    cache: new GeocodingCache(tempPath('cache.json')),
    fetchImpl: mockMapboxFetch(),
  });

  const entry = JSON.parse(readFileSync(logFile, 'utf8').trim());
  assert.ok(entry.timestamp);
  assert.equal(entry.query, 'Russellaan 4, Sittard');
  assert.equal(entry.provider, 'mapbox');
  assert.equal(entry.status_code, 200);
});
