import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_USAGE_FILE = join(__dirname, '..', '.cache', 'api-usage.json');
const DEFAULT_LOG_FILE = join(__dirname, '..', 'logs', 'api-calls.jsonl');

function todayKey(timeZone = process.env.API_USAGE_TIMEZONE || 'Europe/Amsterdam') {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiUsageGuard {
  constructor({
    maxPerDay = Number.parseInt(process.env.MAX_API_CALLS_PER_DAY || '100', 10),
    minIntervalMs = Number.parseInt(process.env.API_MIN_INTERVAL_MS || '1000', 10),
    usageFile = DEFAULT_USAGE_FILE,
    logFile = DEFAULT_LOG_FILE,
  } = {}) {
    this.maxPerDay = maxPerDay;
    this.minIntervalMs = minIntervalMs;
    this.usageFile = usageFile;
    this.logFile = logFile;
    this.timeZone = process.env.API_USAGE_TIMEZONE || 'Europe/Amsterdam';
    this.lastCallAt = 0;
  }

  loadUsage() {
    const today = todayKey(this.timeZone);
    const usage = readJson(this.usageFile, { date: today, total: 0, providers: {} });
    if (usage.date !== today) {
      return { date: today, total: 0, providers: {} };
    }
    return usage;
  }

  saveUsage(usage) {
    mkdirSync(dirname(this.usageFile), { recursive: true });
    writeFileSync(this.usageFile, JSON.stringify(usage, null, 2));
  }

  assertCanCall(provider) {
    const usage = this.loadUsage();
    if (usage.total >= this.maxPerDay) {
      throw new Error(`Daily API call limit reached (${usage.total}/${this.maxPerDay}). Stopping before ${provider} call.`);
    }
  }

  async waitForRateLimit() {
    if (this.minIntervalMs <= 0) return;
    const elapsed = Date.now() - this.lastCallAt;
    if (this.lastCallAt && elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastCallAt = Date.now();
  }

  async beforeCall(provider) {
    this.assertCanCall(provider);
    await this.waitForRateLimit();
  }

  recordApiCall({ query, provider, statusCode, costEstimateUsd = null }) {
    const usage = this.loadUsage();
    usage.total += 1;
    usage.providers[provider] = (usage.providers[provider] ?? 0) + 1;
    this.saveUsage(usage);

    const logEntry = {
      timestamp: new Date().toISOString(),
      query,
      provider,
      status_code: statusCode,
      cost_estimate_usd: costEstimateUsd,
      daily_count: usage.total,
      daily_limit: this.maxPerDay,
    };
    mkdirSync(dirname(this.logFile), { recursive: true });
    appendFileSync(this.logFile, `${JSON.stringify(logEntry)}\n`);
  }
}

export function createApiUsageGuard(options) {
  return new ApiUsageGuard(options);
}
