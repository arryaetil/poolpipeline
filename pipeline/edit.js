import { orPost } from './utils.js';

export async function editImage(chosenRenderB64, feature, analysis, orKey, country = null) {
  const sizeLine = analysis.pool_size_label
    ? `This is a ${analysis.pool_size_label}-sized pool — size it accordingly relative to the garden.\n`
    : '';
  const terraceStyle = analysis.pool_terrace_style
    ? `${analysis.pool_terrace_style}\n`
    : '';
  const renderPrompt = analysis.render_prompt
    ? `${analysis.render_prompt}\n`
    : '';

  const prompt = `Add a realistic inground swimming pool to the backyard of the TARGET HOUSE in this oblique aerial photo.

HOW TO IDENTIFY THE CORRECT SPOT:
- The target house is the one closest to the center of the frame.
- This photo was taken from a drone hovering OVER THE BACKYARD, looking across the backyard toward the house.
- The BACKYARD is the grass/lawn area in the FOREGROUND of the image (between the bottom edge of the photo and the target house).
- The FRONT of the house (driveway, street, road) is BEHIND the house, in the BACKGROUND — often partially hidden by the house itself.
- Place the pool ONLY in the foreground grass/lawn area. NEVER between the house and any road/driveway in the background. NEVER on a neighbour's lot.

The pool must be strictly rectangular — no curved or round shapes.
${sizeLine}${renderPrompt}${terraceStyle}
Keep the rest of the image pixel-identical — same house, roof, windows, trees, driveway, neighbours, fences, camera angle, lighting, and shadows. Match the existing perspective and lighting direction. Do not change framing, zoom, or camera angle.`;

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
        { type: 'image_url', image_url: { url: `data:${chosenRenderB64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${chosenRenderB64}` } },
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

export async function enhanceImage(imageB64, orKey) {
  const mimeType = imageB64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
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
        { type: 'text', text: 'Enhance the lighting and atmosphere of this aerial image to look like a professional real estate drone photo taken during golden hour. Add warm sunlight with soft directional shadows. Make vegetation — trees, grass, hedges — richer and more vibrant. CRITICAL: Do NOT add, remove, or move any buildings, roads, pools, gardens, cars, or any other element. Do NOT invent new structures or features. Every building, garden, pool and road must remain in exactly the same position, shape and size. Only the lighting, color grading and visual atmosphere may change.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageB64}` } },
      ],
    }],
    modalities: ['image', 'text'],
  });

  let lastErr;
  for (const model of models) {
    try {
      const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, body(model), 180000);
      const imgUrl = data.choices[0].message.images?.[0]?.image_url?.url;
      if (!imgUrl) throw new Error('No image in response');
      console.log(`[enhance] success with ${model}`);
      return imgUrl.replace(/^data:image\/\w+;base64,/, '');
    } catch (err) {
      lastErr = err;
      console.warn(`[enhance] ${model} failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error(`Enhance failed on all models: ${lastErr.message}`);
}
