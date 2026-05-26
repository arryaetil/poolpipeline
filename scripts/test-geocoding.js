import 'dotenv/config';
import { geocodeLocation } from '../services/geocoding_provider.js';

const DEFAULT_TEST_ADDRESSES = [
  'Russellaan 4, Sittard, Netherlands',
  'Op de Kollenberg 10, Sittard, Netherlands',
  'Frederik Maldersstraat 45, Maaseik, Belgium',
  'Markt 1, Maastricht, Netherlands',
  'Grote Markt, Antwerp, Belgium',
];

const addresses = process.argv.slice(2);
const queries = (addresses.length ? addresses : DEFAULT_TEST_ADDRESSES).slice(0, 5);

console.log(`Running safe geocoding test with ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} (max 5).`);

for (const query of queries) {
  const result = await geocodeLocation(query);
  console.log(JSON.stringify({
    input_query: result.input_query,
    formatted_address: result.formatted_address,
    latitude: result.latitude,
    longitude: result.longitude,
    confidence: result.confidence,
    provider: result.provider,
    cache_hit: result.cache_hit === true,
  }, null, 2));
}
