// Block 21 (#52): cross-browser smoke test — Neon Void Breaker.
//
// Drives the real game in headless Chromium AND Firefox via Playwright:
// loads the page over HTTP, starts a run, sweeps the paddle, pauses,
// toggles mute + settings, and asserts the game plays with no console
// or page errors in each browser. Also probes CSS/JS feature support
// (backdrop-filter, dvh, mask-image, AudioContext, Pointer Events) so
// Safari-only gaps show up as missing support rather than silent breakage.
//
// Requires Playwright once, anywhere on disk:
//   npm install playwright && npx playwright install chromium firefox
// Then run from the repo root, e.g.:
//   NODE_PATH=/path/to/playwright/node_modules node tests/xbrowser.js
// (or run from inside a folder that has playwright installed, so a
// plain require('playwright') resolves).
//
// Serves the game itself on 127.0.0.1:8137 via `python3 -m http.server`
// (service worker + fetch need http, not file://). Screenshots land in
// /tmp/nvb-xbrowser/ for a visual once-over.
//
// Exit code 0 = every check passed in every browser.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium, firefox;
try {
  ({ chromium, firefox } = require('playwright'));
} catch (e) {
  console.log('FAIL playwright not installed — npm install playwright first');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const PORT = 8137;
const SHOT_DIR = '/tmp/nvb-xbrowser';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

function serve() {
  // Minimal static server (no dependency): serves ROOT over http.
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webmanifest': 'application/manifest+json' };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

async function driveBrowser(label, launcher) {
  console.log('\n=== ' + label + ' ===');
  const browser = await launcher.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const boot = await page.evaluate(() => ({
    version: (document.getElementById('version') || {}).textContent,
    canvas: !!document.getElementById('game'),
    menuVisible: !document.getElementById('menuOverlay').classList.contains('hidden'),
    seedLine: (document.getElementById('seedLine') || {}).textContent,
    audio: !!(window.AudioContext || window.webkitAudioContext),
    pointerEvents: 'PointerEvent' in window,
    css: {
      backdrop: CSS.supports('backdrop-filter', 'blur(4px)'),
      webkitBackdrop: CSS.supports('-webkit-backdrop-filter', 'blur(4px)'),
      dvh: CSS.supports('height', '100dvh'),
      mask: CSS.supports('mask-image', 'radial-gradient(circle, black, transparent)'),
      webkitMask: CSS.supports('-webkit-mask-image', 'radial-gradient(circle, black, transparent)'),
      touchAction: CSS.supports('touch-action', 'none'),
    },
    sw: 'serviceWorker' in navigator,
  }));
  check(label + ': version v0.21.0', boot.version && boot.version.includes('v0.21.0'), boot.version);
  check(label + ': canvas + menu render', boot.canvas && boot.menuVisible);
  check(label + ': seed line shown', /SEED/i.test(boot.seedLine || ''), boot.seedLine);
  check(label + ': AudioContext available', boot.audio);
  check(label + ': PointerEvent available', boot.pointerEvents);
  check(label + ': serviceWorker API present', boot.sw);
  check(label + ': backdrop-filter supported', boot.css.backdrop || boot.css.webkitBackdrop,
    JSON.stringify(boot.css));

  // First visit auto-opens the how-to over the menu; start from there.
  const howtoVisible = await page.evaluate(() =>
    !document.getElementById('howtoOverlay').classList.contains('hidden'));
  if (howtoVisible) {
    await page.click('#playFromHowtoBtn');
  } else {
    await page.click('#playBtn');
  }
  await page.waitForTimeout(400);
  const started = await page.evaluate(() =>
    document.getElementById('menuOverlay').classList.contains('hidden'));
  check(label + ': PLAY starts a run (menu hides)', started);

  // Settings round-trip from the topbar.
  await page.click('#settingsBtn');
  await page.waitForTimeout(200);
  const settingsOpen = await page.evaluate(() =>
    !document.getElementById('settingsOverlay').classList.contains('hidden'));
  check(label + ': settings overlay opens', settingsOpen);
  await page.click('#closeSettingsBtn');
  await page.waitForTimeout(200);

  // Launch the ball, then sweep the paddle across the canvas.
  await page.keyboard.press('Space');
  const box = await (await page.$('#game')).boundingBox();
  const cx = box.x, cy = box.y + box.height / 2, w = box.width;
  const t0 = Date.now();
  let score0 = 0, scoreMax = 0, livesMin = 3, paused = false;
  while (Date.now() - t0 < 25000) {
    const t = (Date.now() - t0) / 1000;
    const x = cx + w * (0.5 + 0.48 * Math.sin(t * 1.1));
    await page.mouse.move(x, cy, { steps: 3 });
    await page.waitForTimeout(120);
    const hud = await page.evaluate(() => ({
      score: +document.getElementById('score').textContent,
      lives: document.getElementById('lives').textContent.length,
      level: +document.getElementById('level').textContent,
      bricks: window.__nvbMeta ? window.__nvbMeta.levelSig.split(',').length : -1,
    }));
    if (score0 === 0) score0 = hud.score;
    scoreMax = Math.max(scoreMax, hud.score);
    livesMin = Math.min(livesMin, hud.lives);
    // Mid-run pause/resume check once, ~10s in.
    if (!paused && Date.now() - t0 > 10000) {
      paused = true;
      await page.keyboard.press('p');
      await page.waitForTimeout(250);
      const pauseVisible = await page.evaluate(() =>
        !document.getElementById('pauseOverlay').classList.contains('hidden'));
      check(label + ': P pauses mid-run', pauseVisible);
      await page.click('#resumeBtn');
      await page.waitForTimeout(250);
      await page.keyboard.press('Space');
    }
  }
  check(label + ': score rises while sweeping', scoreMax > 0, 'max score ' + scoreMax);
  check(label + ': run still alive (lives left)', livesMin > 0, 'min lives ' + livesMin);

  // Mute toggle round-trip.
  const muteBefore = await page.textContent('#muteBtn');
  await page.click('#muteBtn');
  const muteAfter = await page.textContent('#muteBtn');
  check(label + ': mute toggle flips label', muteBefore !== muteAfter, muteBefore + ' -> ' + muteAfter);
  await page.click('#muteBtn');

  const perf = await page.evaluate(() => ({
    fps: window.__nvbPerf ? Math.round(window.__nvbPerf.fps) : -1,
    lowPerf: window.__nvbPerf ? window.__nvbPerf.lowPerf : null,
    levels: window.__nvbMeta ? window.__nvbMeta.levels : -1,
    seed: window.__nvbMeta ? window.__nvbMeta.seed : '',
  }));
  check(label + ': 10 levels defined', perf.levels === 10, 'levels ' + perf.levels);
  check(label + ': FPS sane while playing', perf.fps > 20, 'fps ~' + perf.fps);
  await page.screenshot({ path: path.join(SHOT_DIR, 'shot-' + label + '.png') });

  check(label + ': no console/page errors', errors.length === 0,
    errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
  await browser.close();
}

(async () => {
  const srv = await serve();
  try {
    await driveBrowser('chromium', chromium);
    await driveBrowser('firefox', firefox);
  } finally {
    srv.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nCross-browser: ${results.length - failed.length}/${results.length} checks PASS`);
  if (failed.length) { console.log('FAILED: ' + failed.map((r) => r.name).join('; ')); process.exit(1); }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
