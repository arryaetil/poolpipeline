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
import { fetchParcel, fetchBuilding, annotateImage, annotateRender, gardenCentroid } from './pipeline/parcel.js';
import { selectView } from './pipeline/viewSelect.js';
import { editImage } from './pipeline/edit.js';
import { generateVideo } from './pipeline/video.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CESIUM_ION_TOKEN = process.env.CESIUM_ION_TOKEN;
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const OR_KEY = process.env.OPENROUTER_KEY;
const BAG_KEY = process.env.BAG_KEY;
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ENABLE_VIDEO = process.env.ENABLE_VIDEO === 'true';

const features = loadFeatures();
const poolCatalog = JSON.parse(
  readFileSync(join(__dirname, 'aquapura-pools.json'), 'utf-8')
);
const app = express();

app.use(express.json({ limit: '2mb' }));
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

    // Parcel + building lookup (NL + BE — degrades gracefully for other countries)
    let parcel = null;
    let renderLat = geo.lat;
    let renderLng = geo.lng;
    let renderRange = feature.camera_range;
    let satForAnalysis = satB64;
    try {
      parcel = await fetchParcel(geo.lat, geo.lng, geo.country);
      const building = await fetchBuilding(geo.lat, geo.lng, BAG_KEY, geo.country);
      satForAnalysis = await annotateImage(satB64, parcel, building, geo.lat, geo.lng);
      writeFileSync(join(outDir, 'satellite-annotated.png'), Buffer.from(satForAnalysis, 'base64'));
      emit('step', { step: 'satellite', status: 'annotated', value: `data:image/png;base64,${satForAnalysis}` });
      const target = building ? gardenCentroid(parcel.coords, building) : parcel.centroid;
      renderLat = target.lat;
      renderLng = target.lng;
      renderRange = parcel.range;
      console.log(`[parcel] ${parcel.width_m}m × ${parcel.depth_m}m → target ${renderLat.toFixed(6)},${renderLng.toFixed(6)} range=${renderRange}m${building ? ' (garden centroid)' : ' (parcel centroid)'}`);
    } catch (err) {
      console.warn('[parcel] lookup failed, using geocoded point:', err.message);
    }

    currentStep = 'analysis';
    const analysis = await analyse(satForAnalysis, feature, OR_KEY, feature.id === 'pool' ? poolCatalog : [], geo.country, parcel);
    if (feature.id === 'pool' && analysis.recommended_pool) {
      const matched = poolCatalog.find((p) => p.name === analysis.recommended_pool);
      if (matched) {
        analysis.pool_dimensions = matched.dimensions_m;
        // Build terrace style from analysis material choice + model furniture
        const materialMap = {
          'arduin':             'dark grey natural stone arduin (bluestone) slabs',
          'composiet':          'grey-brown composite wood-look decking boards',
          'tropisch hardhout':  'warm natural ipé tropical hardwood deck',
          'keramische tegels':  'large light grey ceramic tiles',
        };
        const material = materialMap[analysis.terrace_material] || materialMap['arduin'];
        const furniture = matched.terrace_style.includes('sunlounger')
          ? matched.terrace_style.split(',').filter(s => s.includes('lounger')).join(',').trim()
          : '2 white minimal sunloungers';
        const covrex = matched.id.startsWith('la_plage') || ['zenn','city','city_plus','style','carre','xl','xl_plus'].includes(matched.id)
          ? ' An anthracite Covrex rolluik (automatic pool cover) sits partially retracted at one short end of the pool.'
          : '';
        analysis.pool_terrace_style = `${material} surrounding the pool flush with the coping. ${furniture}.${covrex}`;
      }
    }
    writeFileSync(join(outDir, 'analysis.json'), JSON.stringify(analysis, null, 2));
    emit('step', { step: 'analysis', status: 'done', value: analysis });

    currentStep = 'renders';
    const renderFn = renderMode === '2d' ? renderMapbox : renderAll;
    const renders = await renderFn({
      lat: renderLat,
      lng: renderLng,
      pitch: feature.camera_pitch,
      range: renderRange,
      backyardHeading: analysis.backyard_camera_heading ?? null,
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
    const markedRender = await annotateRender(chosenRender.image);
    writeFileSync(join(outDir, 'render-marked.png'), Buffer.from(markedRender, 'base64'));

    currentStep = 'edit';
    const editedB64 = await editImage(markedRender, feature, analysis, OR_KEY, geo.country);
    writeFileSync(join(outDir, 'edited.png'), Buffer.from(editedB64, 'base64'));
    emit('step', { step: 'edit', status: 'done', value: `data:image/png;base64,${editedB64}` });

    currentStep = 'video';
    if (!ENABLE_VIDEO) {
      emit('step', {
        step: 'video',
        status: 'skipped',
        value: { reason: 'Video generation is disabled for demo mode.' },
      });
    } else {
      const videoPath = join(outDir, 'hero.mp4');
      await generateVideo(editedB64, feature, analysis, videoPath, OR_KEY);
      emit('step', { step: 'video', status: 'done', value: `/output/${slug}/hero.mp4` });
    }

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
