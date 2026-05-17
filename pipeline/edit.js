import { orPost } from './utils.js';

function poolScaleHint(analysis) {
  if (!analysis.pool_dimensions || !analysis.backyard_depth_m || !analysis.backyard_width_m) return '';
  const [poolLength, poolWidth] = analysis.pool_dimensions.split('×').map((s) => parseFloat(s.trim()));
  const depthPct = Math.round((poolLength / analysis.backyard_depth_m) * 100);
  const widthPct = Math.round((poolWidth / analysis.backyard_width_m) * 100);
  return ` The pool should occupy approximately ${depthPct}% of the visible lawn depth and ${widthPct}% of the lawn width — no larger.`;
}

export async function editImage(chosenRenderB64, feature, analysis, orKey, country = null, satB64 = null) {
  const countryLabel = country === 'België' || country === 'Belgium' ? 'Belgian' : country === 'Nederland' ? 'Dutch' : '';
  const positionBlock = analysis.recommendation
    ? `\nPOOL POSITION: ${analysis.recommendation}\n`
    : '';
  const satelliteBlock = satB64
    ? `\nREFERENCE IMAGE: The first image is a satellite photo of the same area. The TARGET PROPERTY is outlined with a GREEN dashed line. An ORANGE outline shows the building footprint. Match this property in the aerial render and edit ONLY that garden.\n`
    : '';

  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET PROPERTY shown in the reference satellite image.
${satelliteBlock}
TARGET GARDEN IDENTIFICATION — CRITICAL:
- Use the satellite reference image (first image) to identify the correct property — it is outlined in green.
- Find that SAME property in the aerial render (second image) and edit ONLY its garden.
- DO NOT touch any neighboring garden or property.
${positionBlock}
${feature.edit_prompt}${analysis.pool_terrace_style ? ` Terrace and surroundings: ${analysis.pool_terrace_style}.` : ''}${poolScaleHint(analysis)}
${analysis.render_prompt}

STRICT RULES — do not break these:
- Add ONLY the swimming pool and its immediate terrace. Nothing else.
- Do NOT add trees, plants, shrubs, or any vegetation anywhere in the image.
- Do NOT modify the house, roof, walls, windows, or driveway.
- Do NOT modify neighboring properties in any way.
- Do NOT change the framing, zoom level, or camera angle.
- Do NOT change the color, brightness, or texture of any grass or lawn — the grass outside the terrace must be pixel-perfect identical to the original.
- Keep every pixel outside the pool and terrace area identical to the original.
- This is${countryLabel ? ` a ${countryLabel} residential property.` : ' a residential property.'} Match the visual style of the input image exactly — whether photorealistic 3D render or 2D satellite.`;

  const imageContent = [
    ...(satB64 ? [{ type: 'image_url', image_url: { url: `data:image/png;base64,${satB64}` } }] : []),
    { type: 'image_url', image_url: { url: `data:image/png;base64,${chosenRenderB64}` } },
  ];

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'google/gemini-3-pro-image-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...imageContent,
      ],
    }],
    modalities: ['image', 'text'],
  }, 180000);

  const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
  if (!imgUrl) throw new Error('No image returned from Nano Banana Pro');
  return imgUrl.replace(/^data:image\/\w+;base64,/, '');
}
