import { extractJson, orPost } from './utils.js';

export async function selectView(renders, satB64, analysis, orKey) {
  const prompt = `I have 4 oblique 3D aerial views of the same target house, captured at compass headings 0° (camera north), 90° (camera east), 180° (camera south), and 270° (camera west). The camera looks BACK at the target in each view — so heading 180 shows the north side of the house, heading 0 shows the south side.

Backyard description (from satellite): ${analysis.backyard}.
Front (street) description: ${analysis.front_side}.

Pick which of the 4 views best shows the BACK of the target house — the view where the backyard/back wall is in the foreground and the front door/driveway/street are hidden behind or beside the house.

Respond in JSON only: { "chosen_heading": <0|90|180|270>, "reason": "..." }`;

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
