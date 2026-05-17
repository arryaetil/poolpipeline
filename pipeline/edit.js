import { orPost } from './utils.js';

function poolScaleHint(analysis) {
  if (!analysis.pool_dimensions || !analysis.backyard_depth_m || !analysis.backyard_width_m) return '';
  const [poolLength, poolWidth] = analysis.pool_dimensions.split('×').map((s) => parseFloat(s.trim()));
  const depthPct = Math.round((poolLength / analysis.backyard_depth_m) * 100);
  const widthPct = Math.round((poolWidth / analysis.backyard_width_m) * 100);
  return ` The pool should occupy approximately ${depthPct}% of the visible lawn depth and ${widthPct}% of the lawn width — no larger.`;
}

export async function editImage(chosenRenderB64, feature, analysis, orKey) {
  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET HOUSE in this oblique aerial photo.

HOW TO IDENTIFY THE CORRECT SPOT:
- The target house is the one closest to the center of the frame.
- This photo was taken from a drone hovering OVER THE BACKYARD, looking across the backyard toward the house. Therefore:
  - The BACKYARD is the grass/lawn area in the FOREGROUND (between the bottom edge and the target house).
  - The FRONT of the house (driveway, street) is BEHIND the house in the BACKGROUND — often hidden by the house itself.
- Place the feature ONLY in the foreground area. NEVER between the house and any road visible in the background. NEVER on a neighbor's lot.

${feature.edit_prompt}${analysis.pool_terrace_style ? ` Terrace and surroundings: ${analysis.pool_terrace_style}.` : ''}${poolScaleHint(analysis)}
${analysis.render_prompt}

Keep the rest of the image pixel-identical — same house, roof, windows, trees, driveway, neighbors, fences, camera angle, lighting, and shadows. Match the existing perspective and lighting direction. Do not change framing, zoom, or camera angle. This may be either a photorealistic 3D render or a 2D satellite image — adapt your rendering style to match whichever it is.`;

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
