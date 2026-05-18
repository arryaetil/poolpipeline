import { extractJson, orPost } from './utils.js';

export async function analyse(satB64, feature, orKey, poolCatalog = [], country = null) {
  const catalogSection = poolCatalog.length > 0
    ? `\nAQUAPURA ZWEMBAD MODELLEN (kies op basis van beschikbare tuinruimte):\n- City (small): ${poolCatalog.find(p=>p.id==='city')?.ideal_garden}\n- Zenn (medium): ${poolCatalog.find(p=>p.id==='zenn')?.ideal_garden}\n- XL (large): ${poolCatalog.find(p=>p.id==='xl')?.ideal_garden}\n\nKies het passende model. Geef de naam terug als recommended_pool en leg je keuze kort uit in pool_reasoning (Nederlands).`
    : '';

  const countryLine = country ? `\nHet adres bevindt zich in: ${country}.\n` : '';

  const prompt = `You are a landscape architect. This is a top-down satellite image of a residential property. North is up.${countryLine}
BELANGRIJK: De VOORKANT van de woning grenst aan de straat/oprit. De TUIN (achtertuin) bevindt zich aan de TEGENOVERGESTELDE zijde — doorgaans omheind, met gras, weg van de straat. Verwar ze nooit.

1. Identificeer aan welke kompaszijde de VOORKANT van de woning ligt (straat/oprit).
2. Identificeer de ACHTERTUIN (tegenover de voorkant).
3. Identificeer obstakels in de achtertuin (bomen, tuinhuisjes, airco-units, hellingen, terrassen, bestaande constructies).
4. ${feature.analysis_hint}
5. Beschrijf de positie van het element ten opzichte van de woning in duidelijke richtingaanduidingen.
6. Bepaal de kompasrichting VAN het midden van de woning NAAR de achtertuin (0–360°, 0=N, 90=O, 180=Z, 270=W).
${catalogSection}

Antwoord UITSLUITEND in JSON, alle tekstwaarden in het Nederlands:
{
  "front_side": "...",
  "backyard": "...",
  "backyard_width_m": <number>,
  "backyard_depth_m": <number>,
  "obstructions": "...",
  "recommendation": "...",
  "recommended_pool": "...",
  "pool_reasoning": "...",
  "render_prompt": "...",
  "backyard_camera_heading": <number>
}`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4.5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${satB64}` } },
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
