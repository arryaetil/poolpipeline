import { orPost } from './utils.js';

export async function editImage(chosenRenderB64, feature, analysis, orKey, country = null) {
  const countryLabel = country === 'België' || country === 'Belgium' ? 'Belgian' : country === 'Nederland' ? 'Dutch' : '';
  const positionBlock = analysis.recommendation
    ? `\nPOOL POSITION: ${analysis.recommendation}\n`
    : '';
  const dimensionsLine = analysis.pool_dimensions
    ? `Pool dimensions: ${analysis.pool_dimensions}m — scale accordingly.\n`
    : '';

  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET HOUSE in this oblique aerial photo.

TARGET HOUSE IDENTIFICATION — CRITICAL:
- This photo was taken from a drone hovering OVER THE BACKYARD, looking across the backyard toward the back of the house.
- The BACKYARD is the grass/lawn area in the FOREGROUND of the image — between the bottom edge of the photo and the target house.
- The FRONT of the house (driveway, street, road) is BEHIND the house in the BACKGROUND — often partially hidden by the house itself.
- Place the pool ONLY in the foreground grass/lawn area. NEVER between the house and any road/driveway in the background. NEVER on a neighbour's lot.
- DO NOT touch, modify, or add anything to any neighboring house or garden.
${positionBlock}
${dimensionsLine}${feature.edit_prompt}${analysis.pool_terrace_style ? ` Terrace and surroundings: ${analysis.pool_terrace_style}.` : ''}
${analysis.render_prompt ? analysis.render_prompt : ''}

STRICT RULES — do not break these:
- Add ONLY the swimming pool and its immediate terrace. Nothing else.
- Do NOT add trees, plants, shrubs, or any vegetation anywhere in the image.
- Do NOT modify the house, roof, walls, windows, or driveway.
- Do NOT modify neighboring properties in any way.
- Do NOT change the framing, zoom level, or camera angle.
- Do NOT change the color, brightness, or texture of any grass or lawn — the grass outside the terrace must be pixel-perfect identical to the original.
- Keep every pixel outside the pool and terrace area identical to the original.
- This is${countryLabel ? ` a ${countryLabel} residential property.` : ' a residential property.'} Match the visual style of the input image exactly — whether photorealistic 3D render or 2D satellite.`;

  const models = [
    'google/gemini-3-pro-image-preview',
    'google/gemini-3.1-flash-image-preview',
    'google/gemini-2.5-flash-image',
  ];
  const body = (model) => ({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${chosenRenderB64}` } },
      ],
    }],
    modalities: ['image', 'text'],
  });

  let lastErr;
  for (const model of models) {
    try {
      const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, body(model), 180000);
      const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
      if (!imgUrl) {
        console.warn(`[edit] ${model} returned no image:`, JSON.stringify(data).slice(0, 500));
        throw new Error('No image in response');
      }
      console.log(`[edit] success with ${model}`);
      return imgUrl.replace(/^data:image\/\w+;base64,/, '');
    } catch (err) {
      lastErr = err;
      console.warn(`[edit] ${model} failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error(`Image edit failed on all models: ${lastErr.message}`);
}
