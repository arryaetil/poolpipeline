import { orPost } from './utils.js';

export async function editImage(chosenRenderB64, feature, analysis, orKey) {
  const positionBlock = analysis.recommendation
    ? `\nPOOL POSITION: ${analysis.recommendation}\n`
    : '';

  const prompt = `Add a realistic ${(feature.label_en ?? feature.label).toLowerCase()} to the TARGET PROPERTY in this aerial image.

TARGET GARDEN IDENTIFICATION — CRITICAL:
- The TARGET GARDEN is the garden in the CENTER and FOREGROUND of this image — the camera is aimed directly at it.
- The TARGET HOUSE is the house immediately behind that garden.
- DO NOT touch any neighboring garden or property.
${positionBlock}
${feature.edit_prompt}${analysis.pool_terrace_style ? ` Terrace and surroundings: ${analysis.pool_terrace_style}.` : ''}

STRICT RULES:
- Add ONLY the swimming pool and its immediate terrace. Nothing else.
- Do NOT add trees, plants, shrubs, or any vegetation.
- Do NOT modify the house, roof, walls, windows, or driveway.
- Do NOT modify neighboring properties.
- Do NOT change the framing, zoom level, or camera angle.
- Do NOT change the color or texture of any grass or lawn outside the terrace.
- Keep every pixel outside the pool and terrace area identical to the original.
- Match the visual style of the input image exactly.`;

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
  }, 180000);

  const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
  if (!imgUrl) throw new Error('No image returned from Nano Banana Pro');
  return imgUrl.replace(/^data:image\/\w+;base64,/, '');
}
