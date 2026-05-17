import puppeteer from 'puppeteer';

const HEADINGS = [0, 90, 180, 270];

async function renderGoogle({ lat, lng, pitch, range, googleKey, serverHost, serverPort, onProgress }) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const results = await Promise.all(HEADINGS.map(async (heading) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      const url = `http://${serverHost}:${serverPort}/cesium.html?key=${googleKey}&lat=${lat}&lng=${lng}&heading=${heading}&pitch=${pitch}&range=${range}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 35000 });
      await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
      const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      await page.close();
      onProgress(heading, screenshot);
      return { heading, image: screenshot };
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
    return { heading, image: b64 };
  }));
  return results;
}

export async function renderAll(opts) {
  const googleRender = opts._googleRender ?? renderGoogle;
  if (opts.googleKey) {
    try {
      console.log('[renders] trying Google 3D Tiles');
      const result = await googleRender(opts);
      console.log('[renders] Google 3D Tiles succeeded');
      return result;
    } catch (err) {
      console.warn('[renders] Google 3D Tiles failed, falling back to Mapbox:', err.message);
    }
  }
  console.log('[renders] using Mapbox Static API');
  return renderMapbox(opts);
}
