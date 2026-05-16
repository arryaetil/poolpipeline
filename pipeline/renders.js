import puppeteer from 'puppeteer';

const HEADINGS = [0, 90, 180, 270];

async function renderGoogle({ lat, lng, pitch, range, googleKey, serverHost, serverPort, onProgress }) {
  const results = await Promise.all(HEADINGS.map(async (heading) => {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const url = `http://${serverHost}:${serverPort}/cesium.html?key=${googleKey}&lat=${lat}&lng=${lng}&heading=${heading}&pitch=${pitch}&range=${range}`;
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      onProgress(heading, screenshot);
      return { heading, image: screenshot };
    } finally {
      await browser.close();
    }
  }));
  return results;
}

async function renderMapbox({ lat, lng, pitch, mapboxToken, onProgress }) {
  const mapboxPitch = Math.min(60, Math.max(0, 90 + pitch + 15));
  const zoom = 17.5 + mapboxPitch / 30;

  const results = await Promise.all(HEADINGS.map(async (heading) => {
    const bearing = (heading + 180) % 360;
    const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static` +
      `/${lng},${lat},${zoom.toFixed(2)},${bearing},${mapboxPitch}` +
      `/1280x720?access_token=${mapboxToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Render ${heading}° failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    onProgress(heading, b64);
    return { heading, image: b64 };
  }));
  return results;
}

export async function renderAll(opts) {
  if (opts.googleKey) {
    try {
      console.log('[renders] using Google 3D Tiles');
      return await renderGoogle(opts);
    } catch (err) {
      console.warn('[renders] Google failed, falling back to Mapbox:', err.message);
    }
  }
  console.log('[renders] using Mapbox Static API');
  return await renderMapbox(opts);
}
