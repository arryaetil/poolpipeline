import { extractJson, orPost } from './utils.js';

export async function selectView(renders, satB64, analysis, orKey) {
  const headings = renders.map(r => r.heading);
  const prompt = `I have ${renders.length} oblique 3D aerial views of the same target house, captured at compass headings ${headings.join('°, ')}°. Each view is aimed directly at the backyard of the target property.

Backyard description (from satellite): ${analysis.backyard}.
Front (street) description: ${analysis.front_side}.

Pick which view best shows the backyard of the target house — clearest view of the garden, pool placement area most visible, fewest obstructions.

Respond in JSON only: { "chosen_heading": <${headings.join('|')}>, "reason": "..." }`;

  const imageContent = renders.map(r => ({
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${r.image}` },
  }));

  const data = await orPost('https://openrouter.ai/api/v1/chat/completions', orKey, {
    model: 'anthropic/claude-opus-4.5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${satB64}` } },
        ...imageContent,
      ],
    }],
  });

  return extractJson(data.choices[0].message.content);
}
