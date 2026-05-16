import { extractJson, orPost } from './utils.js';

export async function analyse(satB64, feature, orKey, poolCatalog = []) {
  const catalogSection = poolCatalog.length > 0
    ? `\nAQUAPURA POOL CATALOG (pick the single best fit for this garden):\n${JSON.stringify(poolCatalog, null, 2)}\n\nBased on the backyard dimensions and shape you observe, select the most suitable pool model from the catalog above. Return its "name" field as recommended_pool and explain your reasoning in pool_reasoning.`
    : '';

  const prompt = `You are a landscape architect. This is a top-down satellite image of a residential property. North is up.

CRITICAL: The FRONT of the house faces the road/street and contains the driveway. The BACKYARD is the OPPOSITE side — typically enclosed, often with grass, away from the street. Never confuse them.

1. Identify which compass side of the house is the FRONT (street/driveway side).
2. Identify the BACKYARD (opposite side from the front).
3. Identify obstructions in the backyard (trees, sheds, AC units, slopes, patios, existing structures).
4. ${feature.analysis_hint}
5. Describe the feature position relative to the house using clear directional language.
6. Determine the compass direction FROM the center of the house TOWARD the backyard (0–360°, 0=N, 90=E, 180=S, 270=W).
${catalogSection}

Respond in JSON only:
{
  "front_side": "...",
  "backyard": "...",
  "obstructions": "...",
  "recommendation": "...",
  "recommended_pool": "...",
  "pool_reasoning": "...",
  "render_prompt": "...",
  "backyard_camera_heading": <number>
}`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${satB64}` } },
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
