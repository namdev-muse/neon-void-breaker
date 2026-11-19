// Neon Void Breaker — live-site smoke test (backlog #59).
// Checks the deployed GitHub Pages site after every deploy: the page,
// game.js and style.css all answer 200, the page carries the current
// version string (read from the local index.html footer), and the JS
// bundle looks like the real game, not a placeholder. Retries while
// Pages finishes deploying, so the heartbeat and the sprint blocks can
// run this right after a push and get a verdict, not a false alarm.
// Usage: node tests/live-smoke.js [--wait-secs 120] [--live-url URL]
// Exit 0 when every check passes, 1 otherwise. No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE_DEFAULT = 'https://namdev-muse.github.io/neon-void-breaker/';

const args = process.argv.slice(2);
let waitSecs = 120, liveUrl = LIVE_DEFAULT;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wait-secs') waitSecs = parseInt(args[++i], 10) || 120;
  else if (args[i] === '--live-url') liveUrl = args[++i];
}
if (!liveUrl.endsWith('/')) liveUrl += '/';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } finally { clearTimeout(timer); }
}

(async () => {
  // Expected version comes from the local source of truth, so a stale
  // deploy (old version still served) fails the check instead of passing.
  const localHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const versionMatch = localHtml.match(/v\d+\.\d+\.\d+/);
  const version = versionMatch ? versionMatch[0] : null;
  if (!version) { console.log('FAIL cannot read version from local index.html'); process.exit(1); }
  console.log('live smoke test — expecting ' + version + ' at ' + liveUrl);

  // Pages deploys take ~20-30s; retry the version check until it matches
  // or the wait budget runs out. Other checks run on the last fetch.
  const deadline = Date.now() + waitSecs * 1000;
  let index = null, gameJs = null, css = null;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const bust = '?smoke=' + Date.now(); // bypass any CDN edge cache
    try {
      index = await fetchText(liveUrl + bust, 15000);
    } catch (e) {
      console.log('  attempt ' + attempt + ': index fetch failed (' + (e.name || e.message) + ')');
      await sleep(10000);
      continue;
    }
    if (index.ok && index.text.includes(version)) break;
    console.log('  attempt ' + attempt + ': index status ' + index.status
      + (index.ok ? ', version not yet ' + version : '') + ' — retrying');
    await sleep(10000);
  }

  console.log('== live page ==');
  check('index: HTTP 200', !!index && index.status === 200, index ? 'status=' + index.status : 'no response');
  check('index: serves ' + version, !!index && index.text.includes(version));
  check('index: game canvas present', !!index && index.text.includes('<canvas id="game"'));
  check('index: loads game.js', !!index && index.text.includes('src="game.js"'));
  check('index: live region present', !!index && index.text.includes('id="srStatus"'));

  console.log('== live assets ==');
  try { gameJs = await fetchText(liveUrl + 'game.js?smoke=' + Date.now(), 15000); } catch (e) { gameJs = null; }
  check('game.js: HTTP 200', !!gameJs && gameJs.status === 200, gameJs ? 'status=' + gameJs.status : 'fetch failed');
  check('game.js: real bundle (>50KB)', !!gameJs && gameJs.text.length > 50000, gameJs ? 'bytes=' + gameJs.text.length : '');
  check('game.js: game loop present', !!gameJs && gameJs.text.includes('requestAnimationFrame'));
  check('game.js: FPS guard present', !!gameJs && gameJs.text.includes('__nvbPerf'));
  try { css = await fetchText(liveUrl + 'style.css?smoke=' + Date.now(), 15000); } catch (e) { css = null; }
  check('style.css: HTTP 200', !!css && css.status === 200, css ? 'status=' + css.status : 'fetch failed');
  check('style.css: real stylesheet (>1KB)', !!css && css.text.length > 1000, css ? 'bytes=' + css.text.length : '');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  if (failures.length) console.log('failures: ' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL smoke test crashed: ' + (e && e.stack || e)); process.exit(1); });
