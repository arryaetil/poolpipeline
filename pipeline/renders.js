import { chromium } from 'playwright';

export async function renderAll({ lat, lng, pitch, range, googleKey, serverHost = '127.0.0.1', serverPort, onProgress }) {
  const headings = [0, 90, 180, 270];
  const browser = await chromium.launch({ headless: true });

  try {
    const results = await Promise.all(headings.map(async (heading) => {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });

      const url = `http://${serverHost}:${serverPort}/cesium.html` +
        `?key=${googleKey}&lat=${lat}&lng=${lng}` +
        `&heading=${heading}&pitch=${pitch}&range=${range}`;

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => window.__ready === true, { timeout: 30000 })
        .catch(() => { /* tile timeout — screenshot what we have */ });

      const buf = await page.screenshot({ type: 'png' });
      await page.close();

      const b64 = buf.toString('base64');
      onProgress(heading, b64);
      return { heading, image: b64 };
    }));

    return results;
  } finally {
    await browser.close();
  }
}
