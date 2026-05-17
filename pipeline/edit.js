import { orPost } from './utils.js';

function poolScaleHint(analysis) {
  if (!analysis.pool_dimensions || !analysis.backyard_depth_m || !analysis.backyard_width_m) return '';
  const [poolLength, poolWidth] = analysis.pool_dimensions.split('×').map((s) => parseFloat(s.trim()));
  const depthPct = Math.round((poolLength / analysis.backyard_depth_m) * 100);
  const widthPct = Math.round((poolWidth / analysis.backyard_width_m) * 100);
  return ` The pool should occupy approximately ${depthPct}% of the visible lawn depth and ${widthPct}% of the lawn width — no larger.`;
}

export async function editImage(chosenRenderB64, feature, analysis, orKey, country = null) {
  const countryLabel = country === 'België' || country === 'Belgium' ? 'Belgian' : country === 'Nederland' ? 'Dutch' : '';
  const positionBlock = analysis.recommendation
    ? `\nPOOL POSITION: ${analysis.recommendation}\n`
    : '';

  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET HOUSE in this oblique aerial photo.

TARGET HOUSE IDENTIFICATION — CRITICAL:
- The camera is aimed directly at the TARGET garden — it occupies the CENTER of this image.
- The TARGET HOUSE is the house immediately behind that central garden area.
- DO NOT touch, modify, or add anything to any neighboring house or garden visible in the image.
- If you are unsure which garden is the target, use the garden closest to the exact center of the image.
${positionBlock}
${feature.edit_prompt}${analysis.pool_terrace_style ? ` Terrace and surroundings: ${analysis.pool_terrace_style}.` : ''}${poolScaleHint(analysis)}
${analysis.render_prompt}

STRICT RULES — do not break these:
- Add ONLY the swimming pool and its immediate terrace. Nothing else.
- Do NOT add trees, plants, shrubs, or any vegetation anywhere in the image.
- Do NOT modify the house, roof, walls, windows, or driveway.
- Do NOT modify neighboring properties in any way.
- Do NOT change the framing, zoom level, or camera angle.
- Keep every pixel outside the pool and terrace area identical to the original.
- This is${countryLabel ? ` a ${countryLabel} residential property.` : ' a residential property.'} Match the visual style of the input image exactly — whether photorealistic 3D render or 2D satellite.`;

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'google/gemini-3-pro-image-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${chosenRenderB64}` } },
      ],
    }],
    modalities: ['image', 'text'],
  });

  const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
  if (!imgUrl) throw new Error('No image returned from Nano Banana Pro');
  return imgUrl.replace(/^data:image\/\w+;base64,/, '');
}
