import { extractJson, orPost } from './utils.js';

export async function analyse(satB64, feature, orKey, poolCatalog = [], country = null, parcel = null) {
  const catalogSection = poolCatalog.length > 0
    ? `\nAQUAPURA ZWEMBAD CATALOGUS:\n${poolCatalog.map(p => `- ${p.name}: ${p.dimensions_m}m — ${p.ideal_garden}`).join('\n')}\n\nKies het meest geschikte model op basis van de achtertuin. Geef de naam terug als recommended_pool en leg je keuze kort uit in pool_reasoning (Nederlands).`
    : '';

  const countryLine = country ? `\nHet adres bevindt zich in: ${country}.\n` : '';
  const parcelLine = parcel
    ? `\nOFFICIËLE KADASTERDATA: Het perceel is exact ${parcel.width_m}m breed en ${parcel.depth_m}m diep. Gebruik deze afmetingen — je hoeft ze niet te schatten.\n`
    : '';
  const annotationNote = parcel
    ? `\nDe satellietfoto toont een GROENE STIPPELLIJN die de EXACTE PERCEELGRENS markeert (officiële Kadasterdata). Een ORANJE LIJN toont de woning. Plaats het element uitsluitend BINNEN de groene lijn.\n`
    : '';

  const prompt = `You are a landscape architect. This is a top-down satellite image of a residential property. North is up.${countryLine}${parcelLine}${annotationNote}
BELANGRIJK: De VOORKANT van de woning grenst aan de straat/oprit. De TUIN (achtertuin) bevindt zich aan de TEGENOVERGESTELDE zijde — doorgaans omheind, met gras, weg van de straat. Verwar ze nooit.

1. Identificeer aan welke kompaszijde de VOORKANT van de woning ligt (straat/oprit).
2. Identificeer de ACHTERTUIN (tegenover de voorkant).
3. Identificeer obstakels in de achtertuin (bomen, tuinhuisjes, airco-units, hellingen, terrassen, bestaande constructies).
4. ${feature.analysis_hint}
5. Beschrijf de positie van het element ten opzichte van de woning in duidelijke richtingaanduidingen.
6. Bepaal de kompasrichting VAN het midden van de woning NAAR de achtertuin (0–360°, 0=N, 90=O, 180=Z, 270=W).
${catalogSection}

TERRAS MATERIAAL: Bekijk de stijl van de woning en de bestaande tuin. Kies het meest passende terrasmateriaal rondom het zwembad uit deze Aquapura opties:
- "arduin" — blauwesteen tegels, donkergrijs natuursteen (past bij klassieke, landelijke of traditionele woningen)
- "composiet" — composiet houtlook vlonderplanken, grijsbruin (past bij moderne en eigentijdse woningen)
- "tropisch hardhout" — naturel ipé of bangkirai hardhouten vlonder, warme bruine tint (past bij woningen met warm karakter of bestaande houten elementen)
- "keramische tegels" — grote lichtgrijze keramische tegels (past bij ultra-moderne of minimalistische woningen)

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
  "terrace_material": "arduin|composiet|tropisch hardhout|keramische tegels",
  "terrace_reasoning": "...",
  "render_prompt": "...",
  "backyard_camera_heading": <number>
}`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4',
    max_tokens: 2000,
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
