// Browser check for the slider ghost thumb (jsdom cannot lay out a range input), issue #29.
//
// With the shared `styles.css`, for each renderer (vanilla, shadcn) in Chromium and Firefox, and a
// saved value at min, middle and max: find the native thumb's centre in a screenshot, press it, drag
// it away, and check that the ghost's centre equals the thumb's pre-drag centre within 0.5px.
//
// Run: pnpm build && pnpm test:browser (needs Playwright's browsers once:
// `pnpm exec playwright-core install chromium firefox`; CI adds `--with-deps`).
// BROWSERS=chromium limits the engines.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const TOLERANCE_PX = 0.5;
const DRAG_PX = 60;
const RENDERERS = ['vanilla', 'shadcn'];
const SAVED = [
  { name: 'min', value: 0, dx: DRAG_PX },
  { name: 'middle', value: 50, dx: DRAG_PX },
  { name: 'max', value: 100, dx: -DRAG_PX },
];
const ENGINES = { chromium, firefox };
const wanted = (process.env.BROWSERS ?? 'chromium,firefox').split(',').map((s) => s.trim()).filter(Boolean);

const styles = readFileSync(join(here, '../../packages/dials-ui-vanilla/styles.css'), 'utf8');
const { outputFiles } = await build({
  entryPoints: [join(here, 'ghost-thumb.page.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const script = outputFiles[0].text;

// The accent is pure red here so the thumb's fill is the only red in a screenshot of the range.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
  :root { --zodal-dials-accent: rgb(255, 0, 0); color: rgb(20, 20, 20); background: rgb(255, 255, 255); }
  body { margin: 40px; }
  #root { width: 360px; }
</style></head><body><div id="root"></div></body></html>`;

let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures += 1;
};

/** The red thumb fill's centre, in page px, read from a screenshot of the range input. */
async function thumbCentre(page, input) {
  const box = await input.boundingBox();
  const png = (await input.screenshot()).toString('base64');
  const span = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
    }
    return { x0, x1, y0, y1 };
  }, png);
  if (!Number.isFinite(span.x0)) throw new Error('thumb not found in the screenshot');
  return { x: box.x + (span.x0 + span.x1 + 1) / 2, y: box.y + (span.y0 + span.y1 + 1) / 2 };
}

for (const engine of wanted) {
  const type = ENGINES[engine];
  if (!type) throw new Error(`unknown browser "${engine}" (known: ${Object.keys(ENGINES).join(', ')})`);
  const browser = await type.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 200 }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.addScriptTag({ content: script });
    for (const renderer of RENDERERS) {
      for (const { name, value, dx } of SAVED) {
        const where = `${engine} ${renderer} at ${name}`;
        await page.evaluate(([r, v]) => window.__mount(r, v), [renderer, value]);
        const input = page.locator('input.zodal-dials-slider');
        const ghost = page.locator('.zodal-dials-slider-ghost:not([hidden])');
        const thumb = await thumbCentre(page, input);
        await page.mouse.move(thumb.x, thumb.y);
        await page.mouse.down();
        await page.mouse.move(thumb.x + dx, thumb.y, { steps: 6 });
        const g = (await ghost.count()) === 1 ? await ghost.boundingBox() : null;
        await page.mouse.up();
        if (!g) {
          check(false, `${where}: no ghost while the thumb is away from the saved value`);
          continue;
        }
        const gx = g.x + g.width / 2;
        const gy = g.y + g.height / 2;
        check(
          Math.abs(gx - thumb.x) <= TOLERANCE_PX && Math.abs(gy - thumb.y) <= TOLERANCE_PX,
          `${where}: ghost centre (${gx.toFixed(2)}, ${gy.toFixed(2)}) vs thumb centre (${thumb.x.toFixed(2)}, ${thumb.y.toFixed(2)})`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all browser checks passed');
