import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_CACHE_FILE = join(__dirname, '..', '.cache', 'geocoding-cache.json');

function normalizeKey(provider, query) {
  return `${provider}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export class GeocodingCache {
  constructor(cacheFile = DEFAULT_CACHE_FILE) {
    this.cacheFile = cacheFile;
    this.data = null;
  }

  load() {
    if (this.data) return this.data;
    if (!existsSync(this.cacheFile)) {
      this.data = {};
      return this.data;
    }
    this.data = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
    return this.data;
  }

  get(provider, query) {
    const data = this.load();
    return data[normalizeKey(provider, query)]?.value ?? null;
  }

  set(provider, query, value) {
    const data = this.load();
    data[normalizeKey(provider, query)] = {
      cached_at: new Date().toISOString(),
      provider,
      query,
      value,
    };
    mkdirSync(dirname(this.cacheFile), { recursive: true });
    writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
  }
}

export function createGeocodingCache(cacheFile) {
  return new GeocodingCache(cacheFile);
}
