import { orHeaders } from './utils.js';

const OR_BASE = 'https://openrouter.ai/api/v1';

export async function generateVideo(editedB64, feature, analysis, outputPath, orKey) {
  const prompt = `Cinematic real-estate drone shot of the EXACT property shown in the reference image. The house architecture, roof, walls, windows, trees, driveway, fences, neighbors, and ${(feature.label_en ?? feature.label).toLowerCase()} shape/position MUST remain faithful to the input image — do not invent a different house, do not restyle, do not move the feature.

Camera move: starts as a high-angle drone shot matching the reference image (~55° looking down). Smoothly pushes in and gently descends toward the backyard, ending closer to the ${(feature.label_en ?? feature.label).toLowerCase()} with the back of the house as backdrop. Single continuous shot — no cuts, no orbit, no whip pans.

Atmosphere: ${feature.video_prompt} High-end real-estate listing style. ${analysis.render_prompt}`;

  // Start generation
  const startRes = await fetch(`${OR_BASE}/videos`, {
    method: 'POST',
    headers: orHeaders(orKey),
    body: JSON.stringify({
      model: 'google/veo-3.1',
      prompt,
      input_references: [{
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${editedB64}` },
      }],
      aspect_ratio: '16:9',
      duration: 8,
      resolution: '720p',
    }),
  });
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error(`Veo start failed ${startRes.status}: ${t.slice(0, 300)}`);
  }
  const { id } = await startRes.json();

  // Poll until completed
  let status = 'pending';
  while (status !== 'completed') {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${OR_BASE}/videos/${id}`, { headers: orHeaders(orKey) });
    if (!pollRes.ok) throw new Error(`Veo poll failed: ${pollRes.status}`);
    const poll = await pollRes.json();
    status = poll.status;
    if (status === 'failed') throw new Error(`Veo generation failed: ${JSON.stringify(poll)}`);
  }

  // Download via authenticated content endpoint (NOT unsigned_urls — they return 401)
  const dlRes = await fetch(`${OR_BASE}/videos/${id}/content`, { headers: orHeaders(orKey) });
  if (!dlRes.ok) throw new Error(`Veo download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());

  const { writeFileSync } = await import('node:fs');
  writeFileSync(outputPath, buf);
  return outputPath;
}
