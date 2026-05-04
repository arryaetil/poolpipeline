import { orPost } from './utils.js';

export async function editImage(chosenRenderB64, feature, analysis, orKey) {
  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET HOUSE in this oblique aerial photo.

HOW TO IDENTIFY THE CORRECT SPOT:
- The target house is the one closest to the center of the frame.
- This photo was taken from a drone hovering OVER THE BACKYARD, looking across the backyard toward the house. Therefore:
  - The BACKYARD is the grass/lawn area in the FOREGROUND (between the bottom edge and the target house).
  - The FRONT of the house (driveway, street) is BEHIND the house in the BACKGROUND — often hidden by the house itself.
- Place the feature ONLY in the foreground area. NEVER between the house and any road visible in the background. NEVER on a neighbor's lot.

${feature.edit_prompt}
${analysis.render_prompt}

Keep the rest of the image pixel-identical — same house, roof, windows, trees, driveway, neighbors, fences, camera angle, lighting, and shadows. Match the existing perspective and lighting direction. Do not change framing, zoom, or camera angle.`;

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
