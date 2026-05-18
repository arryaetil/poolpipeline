import 'dotenv/config';
import express from 'express';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFeatures, makeSlug, sseEvent } from './pipeline/utils.js';
import { geocode } from './pipeline/geocode.js';
import { fetchSatellite } from './pipeline/satellite.js';
import { analyse } from './pipeline/analysis.js';
import { renderAll, renderGoogleDiagnostic, renderMapbox } from './pipeline/renders.js';
import { selectView } from './pipeline/viewSelect.js';
import { editImage, enhanceImage } from './pipeline/edit.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CESIUM_ION_TOKEN = process.env.CESIUM_ION_TOKEN;
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const OR_KEY = process.env.OPENROUTER_KEY;
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const features = loadFeatures();
const poolCatalog = JSON.parse(
  readFileSync(join(__dirname, 'aquapura-pools.json'), 'utf-8')
);
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use('/output', express.static(join(__dirname, 'output')));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.get('/cesium.html', (_req, res) => {
  res.sendFile(join(__dirname, 'cesium.html'));
});

app.get('/features', (_req, res) => {
  res.json(features);
});

app.get('/demo-runs', (_req, res) => {
  const outputDir = join(__dirname, 'output');
  if (!existsSync(outputDir)) return res.json([]);
  const runs = readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(outputDir, name, 'edited.png')));
  res.json(runs);
});

app.get('/test-renders', async (req, res) => {
  const lat = parseFloat(req.query.lat ?? '51.2194');
  const lng = parseFloat(req.query.lng ?? '4.4025');

  const diag = {
    env: {
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH ?? 'not set',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD ?? 'not set',
      CESIUM_ION_TOKEN: CESIUM_ION_TOKEN ? 'set' : 'NOT SET',
      MAPBOX_TOKEN: MAPBOX_TOKEN ? 'set' : 'NOT SET',
    },
  };

  if (!CESIUM_ION_TOKEN) {
    return res.json({ ...diag, error: 'CESIUM_ION_TOKEN not set — cannot test Cesium Ion renders' });
  }

  try {
    const googleResult = await renderGoogleDiagnostic({
      lat, lng, pitch: -50, range: 130,
      ionToken: CESIUM_ION_TOKEN,
      serverPort: PORT,
    });
    return res.json({ ...diag, provider: 'google', ...googleResult });
  } catch (googleErr) {
    if (!MAPBOX_TOKEN) {
      return res.status(500).json({ ...diag, googleError: googleErr.message, error: 'MAPBOX_TOKEN not set — cannot test fallback' });
    }
    try {
      const start = Date.now();
      let firstImage = null;
      await renderMapbox({
        lat, lng, pitch: -50, mapboxToken: MAPBOX_TOKEN,
        onProgress: (_, b64) => { if (!firstImage) firstImage = b64; },
      });
      return res.json({
        ...diag,
        provider: 'mapbox',
        fallback: true,
        googleError: googleErr.message,
        mapbox_ms: Date.now() - start,
        image: firstImage ? `data:image/png;base64,${firstImage}` : null,
      });
    } catch (mapboxErr) {
      return res.status(500).json({ ...diag, googleError: googleErr.message, mapboxError: mapboxErr.message });
    }
  }
});

app.post('/enhance', async (req, res) => {
  const { image } = req.body ?? {};
  if (!image) return res.status(400).json({ error: 'image is required' });
  if (!OR_KEY) return res.status(500).json({ error: 'OPENROUTER_KEY must be set' });
  try {
    const enhanced = await enhanceImage(image, OR_KEY);
    res.json({ image: enhanced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/run', async (req, res) => {
  const { address, feature: featureId, renderMode = '3d' } = req.body ?? {};
  if (!address || !featureId) {
    return res.status(400).json({ error: 'address and feature are required' });
  }

  const feature = features.find((item) => item.id === featureId);
  if (!feature) {
    return res.status(400).json({ error: `Unknown feature: ${featureId}` });
  }

  if (!CESIUM_ION_TOKEN || !GOOGLE_KEY || !MAPBOX_TOKEN || !OR_KEY) {
    return res.status(500).json({ error: 'CESIUM_ION_TOKEN, GOOGLE_KEY, MAPBOX_TOKEN, and OPENROUTER_KEY must be set in .env' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emit = (event, data) => sseEvent(res, event, data);
  let currentStep = 'geocode';

  try {
    const geo = await geocode(address, GOOGLE_KEY);
    emit('step', { step: 'geocode', status: 'done', value: geo });

    const slug = makeSlug(geo.formatted, featureId);
    const outDir = join(__dirname, 'output', slug);
    mkdirSync(outDir, { recursive: true });

    currentStep = 'satellite';
    const satB64 = await fetchSatellite(geo.lat, geo.lng, MAPBOX_TOKEN);
    writeFileSync(join(outDir, 'satellite.png'), Buffer.from(satB64, 'base64'));
    emit('step', { step: 'satellite', status: 'done', value: `data:image/png;base64,${satB64}` });

    currentStep = 'analysis';
    const analysis = await analyse(satB64, feature, OR_KEY, feature.id === 'pool' ? poolCatalog : [], geo.country);
    if (feature.id === 'pool' && analysis.recommended_pool) {
      const matched = poolCatalog.find((p) => p.name === analysis.recommended_pool);
      if (matched) {
        analysis.pool_size_label = matched.size_label;
        analysis.pool_max_dimensions = matched.dimensions_m;
        const material = 'dark grey natural stone arduin (bluestone) slabs';
        const furniture = matched.terrace_style.includes('sunlounger')
          ? matched.terrace_style.split(',').filter(s => s.includes('lounger')).join(',').trim()
          : '2 white minimal sunloungers';
        analysis.pool_terrace_style = `${material} surrounding the pool flush with the coping. ${furniture}.`;
      }
    }
    writeFileSync(join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));
    emit('step', { step: 'analysis', status: 'done', value: analysis });

    currentStep = 'renders';
    const renderFn = renderMode === '2d' ? renderMapbox : renderAll;
    const renders = await renderFn({
      lat: geo.lat,
      lng: geo.lng,
      pitch: feature.camera_pitch,
      range: feature.camera_range,
      mapboxToken: MAPBOX_TOKEN,
      ionToken: CESIUM_ION_TOKEN,
      serverHost: '127.0.0.1',
      serverPort: PORT,
      onProgress: (heading, b64) => {
        writeFileSync(join(outDir, `render-${heading}.png`), Buffer.from(b64, 'base64'));
        emit('step', {
          step: 'renders',
          status: 'progress',
          value: { heading, image: `data:image/png;base64,${b64}` },
        });
      },
    });
    emit('step', { step: 'renders', status: 'done', value: { count: renders.length } });

    currentStep = 'view_select';
    const viewResult = await selectView(renders, satB64, analysis, OR_KEY);
    emit('step', { step: 'view_select', status: 'done', value: viewResult });
    writeFileSync(join(outDir, 'chosen.json'), JSON.stringify({ heading: viewResult.chosen_heading, reason: viewResult.reason }, null, 2));

    const chosenRender = renders.find((item) => item.heading === viewResult.chosen_heading) ?? renders[0];

    currentStep = 'edit';
    const editResults = {};
    await Promise.all([1, 2, 3, 4].map((n) =>
      editImage(chosenRender.image, feature, analysis, OR_KEY, geo.country)
        .then((img) => {
          editResults[n] = img;
          writeFileSync(join(outDir, `edited-${n}.png`), Buffer.from(img, 'base64'));
          emit('step', { step: 'edit', status: 'option', value: { option: n, image: `data:image/png;base64,${img}` } });
        })
        .catch((err) => console.warn(`[edit${n}] failed: ${err.message}`))
    ));
    if (Object.keys(editResults).length === 0) throw new Error('Both edit attempts failed');
    const firstResult = editResults[1] ?? editResults[2];
    writeFileSync(join(outDir, 'edited.png'), Buffer.from(firstResult, 'base64'));
    emit('step', { step: 'edit', status: 'done' });

    emit('done', {});
  } catch (err) {
    console.error(err);
    emit('error', { step: currentStep, message: err.message });
  } finally {
    res.end();
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, HOST, () => {
    console.log(`BackyardAI running at http://${HOST}:${PORT}`);
  });
}

export { app };
