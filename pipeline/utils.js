import { readFileSync } from 'node:fs';

export function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Walk forward finding the first valid JSON object by counting braces
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(text.slice(i, j + 1)); } catch { break; }
          }
        }
      }
    }
    throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
  }
}

export function makeSlug(formattedAddress, featureId) {
  return (formattedAddress + '-' + featureId)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function orHeaders(key) {
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function orPost(url, key, body, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: orHeaders(key),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    if (!json.choices) {
      throw new Error(`OpenRouter returned no choices: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export function loadFeatures() {
  return JSON.parse(readFileSync(new URL('../features.json', import.meta.url)));
}
