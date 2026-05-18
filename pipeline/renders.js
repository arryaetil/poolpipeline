import puppeteer from 'puppeteer';

const HEADINGS = [0, 90, 180, 270];

function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // set on Railway if using system Chromium
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
}

async function renderGoogle({ lat, lng, pitch, range, ionToken, serverHost, serverPort, onProgress }) {
  const browser = await launchBrowser();

  try {
    const results = await Promise.all(HEADINGS.map(async (heading) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });

      page.on('console', (msg) => console.log(`[cesium:${heading}] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', (err) => console.error(`[cesium:${heading}] pageerror:`, err.message));
      page.on('requestfailed', (req) => console.warn(`[cesium:${heading}] requestfailed: ${req.url().slice(0, 120)} — ${req.failure()?.errorText}`));

      const url = `http://${serverHost}:${serverPort}/cesium.html?ionToken=${ionToken}&lat=${lat}&lng=${lng}&heading=${heading}&pitch=${pitch}&range=${range}`;
      console.log(`[renders] heading ${heading}: navigating to cesium.html`);
      await page.goto(url, { waitUntil: 'load', timeout: 300000 });
      console.log(`[renders] heading ${heading}: page loaded, waiting for __ready`);
      await page.waitForFunction(() => window.__ready === true, { timeout: 300000 });
      console.log(`[renders] heading ${heading}: __ready, taking screenshot`);
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      await page.close();
      onProgress(heading, screenshot);
      return { heading, image: screenshot, mimeType: 'image/png' };
    }));
    return results;
  } finally {
    await browser.close();
  }
}

export async function renderMapbox({ lat, lng, pitch, mapboxToken, onProgress }) {
  const mapboxPitch = Math.min(60, Math.max(0, 90 + pitch + 15));
  const zoom = 17.5 + mapboxPitch / 30;

  const results = await Promise.all(HEADINGS.map(async (heading) => {
    const bearing = (heading + 180) % 360;
    const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static` +
      `/${lng},${lat},${zoom.toFixed(2)},${bearing},${mapboxPitch}` +
      `/1280x720?access_token=${mapboxToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox render ${heading}° failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    onProgress(heading, b64);
    return { heading, image: b64, mimeType: 'image/jpeg' };
  }));
  return results;
}

export async function renderGoogleDiagnostic({ lat, lng, pitch, range, ionToken, serverPort }) {
  const timings = {};
  const pageConsole = [];
  const pageErrors = [];
  const mark = (label) => { const s = Date.now(); return () => { timings[label] = Date.now() - s; }; };

  const stopLaunch = mark('launch_ms');
  const browser = await launchBrowser();
  stopLaunch();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('console', (msg) => pageConsole.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const url = `http://127.0.0.1:${serverPort}/cesium.html?ionToken=${ionToken}&lat=${lat}&lng=${lng}&heading=180&pitch=${pitch}&range=${range}`;

    const stopGoto = mark('goto_ms');
    await page.goto(url, { waitUntil: 'load', timeout: 300000 });
    stopGoto();

    const stopReady = mark('ready_ms');
    await page.waitForFunction(() => window.__ready === true, { timeout: 300000 });
    stopReady();

    const stopShot = mark('screenshot_ms');
    const image = await page.screenshot({ encoding: 'base64', fullPage: false });
    stopShot();

    await page.close();
    return { success: true, timings, pageConsole, pageErrors, image: `data:image/png;base64,${image}` };
  } finally {
    await browser.close();
  }
}

export async function renderAll(opts) {
  const googleRender = opts._googleRender ?? renderGoogle;
  console.log('[renders] using Google 3D Tiles');
  return googleRender(opts);
}
