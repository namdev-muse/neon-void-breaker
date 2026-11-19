// Neon Void Breaker — auto-play bot harness (backlog #45).
// Headless playtest: loads game.js in a stubbed DOM + FakeAudioContext,
// plays full runs with a tracking-paddle bot, and reports coverage plus
// bug detectors: ball tunneling through the paddle (#47), stuck balls,
// NaN positions/velocities (#48) and per-frame speed violations.
// Usage: node tests/bot-harness.js [attempts] [maxFramesPerAttempt]
//   node tests/bot-harness.js            # 2 attempts, 160k frames each
//   node tests/bot-harness.js 3 200000   # 3 attempts, 200k frames each
// Exit 0 when the run is clean, 1 when a detector fires or no progress.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'game.js');
const HTML = path.join(ROOT, 'index.html');
const SRC = fs.readFileSync(GAME, 'utf8');
// Block 12 test-only patches (in-memory only, never written to game.js):
// every broken brick drops a capsule, types cycle laser/slow/shield/multi/wide/fire,
// and capsules home hard to the paddle so catches are deterministic.
// NVB_REAL_DROPS=1 skips the drop/magnet patches (keeps the 2s regen
// delay) so the human bot (NVB_HUMAN_BOT=1) measures the real game's
// difficulty — the 12% drop rate and straight-falling capsules —
// instead of the harness's guaranteed powerup flood.
const REAL_DROPS = process.env.NVB_REAL_DROPS === '1';
const SRC12 = REAL_DROPS ? SRC
  .replace("const REGEN_DELAY = 20;", "const REGEN_DELAY = 2;")
  : SRC
  .replace("if (Math.random() >= (chance || POWERUP_DROP_CHANCE)) return;", "")
  .replace("const type = r < 0.20 ? 'multi' : r < 0.36 ? 'wide' : r < 0.52 ? 'laser' : r < 0.64 ? 'slow' : r < 0.76 ? 'shield' : r < 0.88 ? 'fire' : 'bomb';",
    "const type = ['laser','slow','shield','multi','wide','fire','bomb'][(global.__pu = (global.__pu || 0) + 1) % 7];")
  .replace("const mag = upgradesOwned.magnet || 0;", "const mag = 3;")
  // Block 17 (#23): regen bricks return after 2s in the harness (20s
  // in the real game) so a respawn is observable inside one level.
  .replace("const REGEN_DELAY = 20;", "const REGEN_DELAY = 2;");
if (SRC12 === SRC || SRC12.indexOf("REGEN_DELAY = 2") < 0
  || (!REAL_DROPS && SRC12.indexOf("global.__pu") < 0)) { console.log('PATCH FAILED'); process.exit(2); }

const ATTEMPTS = parseInt(process.argv[2] || '2', 10) || 2;
const MAX_FRAMES = parseInt(process.argv[3] || '160000', 10) || 160000;
// Block 18 (#62): NVB_HUMAN_BOT=1 drives the paddle like a human — the
// target only updates every 8 frames (~133ms reaction), aims ±24px off,
// and holds still while the ball is rising. The run then prints a
// difficulty report (levels reached, balls lost) instead of the check
// suite, so a balance change can be measured before/after.
const HUMAN = process.env.NVB_HUMAN_BOT === '1';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

// ---------- timer patching (music interval + intro timeout) ----------
const realSetInterval = global.setInterval, realSetTimeout = global.setTimeout;
const intervals = [], timeouts = [];
global.setInterval = (fn, ms, ...a) => { const id = realSetInterval(fn, ms, ...a); intervals.push(id); return id; };
global.setTimeout = (fn, ms, ...a) => { const id = realSetTimeout(fn, ms, ...a); timeouts.push(id); return id; };

// ---------- fake audio ----------
let audioNow = 0;
class FakeParam { setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} }
class FakeNode { constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); } connect() {} start() {} stop() {} }
class FakeAudioContext {
  constructor() { this.state = 'running'; this.destination = {}; }
  get currentTime() { return audioNow; }
  resume() {}
  createGain() { const n = new FakeNode(); n.gain = new FakeParam(); n.gain.value = 0; return n; }
  createOscillator() { const n = new FakeNode(); n.frequency = new FakeParam(); return n; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { const n = new FakeNode(); n.buffer = null; return n; }
}

// ---------- stub DOM ----------
function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c), remove: (c) => s.delete(c),
    contains: (c) => s.has(c), toggle: (c) => (s.has(c) ? s.delete(c) : s.add(c), s.has(c)),
    _set: s,
  };
}
const elementsById = {};
let bodyEl = null;
function makeEl(tag, id) {
  const el = {
    tagName: tag, id: id || '', parent: null, children: [],
    classList: makeClassList(), style: {}, listeners: {},
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; if (v === '') this.children = []; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    appendChild(child) { child.parent = this; this.children.push(child); return child; },
    // Block 14 (#51): draft cards set aria-labels — the stub needs the API.
    setAttribute(name, value) { (this._attrs = this._attrs || {})[name] = String(value); },
    getAttribute(name) { return (this._attrs && this._attrs[name]) || null; },
    dispatch(type, ev) {
      const e = Object.assign({ target: this, preventDefault() { this._pd = true; }, _pd: false }, ev || {});
      for (const fn of (this.listeners[type] || [])) fn(e);
      return e;
    },
    focus() { document.activeElement = this; },
    blur() { if (document.activeElement === this) document.activeElement = bodyEl; },
    click() { document.activeElement = this; this.dispatch('click'); },
    closest(sel) {
      let n = this;
      while (n) { if (sel.startsWith('.') && n.classList.contains(sel.slice(1))) return n; n = n.parent; }
      return null;
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 720, height: 540 }; },
  };
  let _tc = '';
  Object.defineProperty(el, 'textContent', {
    get() { return _tc; }, set(v) { _tc = v == null ? '' : String(v); },
  });
  if (id) elementsById[id] = el;
  return el;
}

// Canvas ctx: records arcs (ball = r 8 with shadowBlur 18/26, well core =
// r 15) and floating texts, so the bot and the detectors can see the game.
let frameArcs = [], frameTexts = [], frameFills = new Set(), frameRects = [];
const ctxState = { shadowBlur: 0, fillStyle: '' };
const ctxStack = [];
const ctx = {
  setTransform() {}, clearRect() {}, save() { ctxStack.push(ctxState.shadowBlur); },
  restore() { ctxState.shadowBlur = ctxStack.pop() || 0; },
  translate() {}, rotate() {}, fillRect(x, y, w, h) { frameRects.push({ x, y, w, h, fill: ctxState.fillStyle }); }, strokeRect() {}, beginPath() {},
  arc(x, y, r) { frameArcs.push({ x, y, r, shadowBlur: ctxState.shadowBlur }); },
  fill() {}, arcTo() {}, moveTo() {}, closePath() {},
  fillText(str) { frameTexts.push(String(str)); },
  stroke() {}, createLinearGradient() { return { addColorStop() {} }; },
  setLineDash() {},
};
Object.defineProperty(ctx, 'shadowBlur', {
  get() { return ctxState.shadowBlur; }, set(v) { ctxState.shadowBlur = v; },
});
Object.defineProperty(ctx, 'fillStyle', {
  get() { return ctxState.fillStyle; },
  set(v) { ctxState.fillStyle = v; if (typeof v === 'string') frameFills.add(v); },
});
const canvasEl = makeEl('CANVAS', 'game');
canvasEl.getContext = () => ctx;
canvasEl.width = 720; canvasEl.height = 540;

const IDS = ['score', 'best', 'level', 'lives', 'combo', 'power', 'menuOverlay',
  'pauseOverlay', 'levelOverlay', 'gameOverOverlay', 'introOverlay', 'draftOverlay',
  'draftCards', 'introLevel', 'introName', 'introFlavor', 'levelTitle', 'levelStats',
  'gameOverTitle', 'gameOverStats', 'nextLevelBtn', 'muteBtn', 'pauseBtn', 'pauseStats',
  'menuScores', 'gameOverScores', 'playBtn', 'resumeBtn', 'restartBtnPause',
  'quitBtnPause', 'againBtn', 'menuBtnOver', 'srStatus', 'seedLine',
  // Block 18 (#49): the menu's CONTINUE button for a saved run.
  'continueBtn',
  // Block 16 (#39 how-to, #35/#36/#44 settings, achievements): every id the
  // game reads must exist in the stub or the load throws on addEventListener.
  'howtoOverlay', 'settingsOverlay', 'achOverlay', 'achToast',
  'achBtn', 'howtoBtn', 'settingsBtn', 'volumeSlider', 'volumeVal',
  'musicToggle', 'sfxToggle', 'shakeToggle', 'motionToggle',
  'achList', 'achCount', 'lifetimeStats',
  'closeHowtoBtn', 'closeSettingsBtn', 'closeAchBtn', 'playFromHowtoBtn'];
for (const id of IDS) {
  const tag = /Btn$/.test(id) ? 'BUTTON' : (id.endsWith('Overlay') || id === 'draftCards' ? 'DIV' : 'SPAN');
  makeEl(tag, id);
}
const stageEl = makeEl('DIV'); stageEl.classList.add('stage');
canvasEl.parent = stageEl;
bodyEl = makeEl('BODY');
for (const id of IDS) elementsById[id].parent = bodyEl;
for (const id of ['menuOverlay', 'pauseOverlay', 'levelOverlay', 'gameOverOverlay', 'introOverlay', 'draftOverlay']) {
  elementsById[id].parent = stageEl;
}

const winListeners = {};
const docListeners = {};
global.window = {
  AudioContext: FakeAudioContext, webkitAudioContext: undefined,
  devicePixelRatio: 1,
  // Block 15 (#12): NVB_SEED=<code> loads the game with ?seed=<code>, so a
  // second process run can prove a different seed builds a different wall.
  // Without it, location is undefined and the game falls back to the daily seed.
  location: process.env.NVB_SEED ? { search: '?seed=' + process.env.NVB_SEED } : undefined,
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
};
global.document = {
  getElementById: (id) => elementsById[id] || null,
  createElement: (tag) => makeEl(tag.toUpperCase()),
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  hidden: false, activeElement: bodyEl,
};
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

// requestAnimationFrame queue, driven manually by pump().
let rafQ = [];
global.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
let nowMs = 1000; // start ahead of performance.now() so the first dt is sane

// ---------- observations (reset per attempt, accumulated globally) ----------
const PADDLE_LINE = 495; // ball center reaching the paddle top (bounce places it at 495.5)
const MAX_SPEED = 680, DT = 0.0167, MAX_STEP = MAX_SPEED * DT + 2; // ~13.4px/frame
const obs = {
  frames: 0, swallows: 0, pullWarns: 0, powerupsCaught: 0,
  bossAwaken: false, bossDestroyed: false, fireSeen: false,
  maxCombo: 1, bend: 0, bendSamples: 0,
  // Block 12 observations (#6 fireball, #8 HUD chips, #29 confetti)
  fireSeen: false, fireHud: false, firePierced: false, chipsSeen: false,
  confettiRects: 0,
  // Block 11 powerup observations (#3, #4, #5)
  laserSeen: false, slowSeen: false, shieldSeen: false, shieldSaved: 0,
  laserBolts: 0, laserFireOk: false, shieldSaveLivesOk: false,
  shieldHudCleared: false, shieldSaveTimeout: false,
  shieldSaves: 0, droppedCrossings: 0,
  hudLaser: false, hudSlow: false, hudShield: false,
  slowStepSum: 0, slowStepN: 0, normalStepSum: 0, normalStepN: 0,
  // bug detectors (#45, #47, #48)
  tunnelBugs: [], stuckEvents: 0, nanEvents: [], speedViolations: 0,
  maxStep: 0, maxStepClean: 0, crossings: 0, bounces: 0, unresolvedCrossings: 0, lostDespiteTracking: 0,
  // Block 14 observations (#46 FPS guard, #51 accessibility)
  srAnnounced: false,
  levelsCleared: [], maxLevel: 1, finalScore: 0,
  // Block 15 observations (#12 seeds, #16 void bomb)
  bombSeen: false, bombBroke: false, bombMaxDelta: 0, bombCount: 0,
  bootSig: '', brickSigs: [],
  // Block 16 observations (achievements + settings)
  achToastSeen: false, maxShakeSeen: 0, lastGameOverHtml: '',
  // Block 17 observations (#21 moving, #22 exploding, #23 regen bricks)
  kindsSeen: { moving: false, explosive: false, regen: false },
  moverMoved: false, chains: 0, chainKills: 0, regens: 0,
};
let prevBall = null, prevLives = 3, prevScore = 0, prevAngle = null, prevInZone = false;
let fireCheckFrame = -1, fireAngleBefore = 0; // Block 12: pierce check state
let frozenFrames = 0, pendingCrossing = null, prevLevelOverlay = false;
let prevTexts = new Set();
let prevLevelObs = 1;
// Block 17: the signature from the previous observe() call, for the
// mover proof (a sliding x is the only thing that can change it while
// the level, the score and the brick count all stay put).
let prevSig17 = '', prevSigLevel17 = 0, prevSigScore17 = 0;
// Called at the start of every attempt: a fresh run resets the score and
// the level, so the monotonic-score and motion trackers must not carry
// the previous run's values across the reset.
function resetRunTracking() {
  fireCheckFrame = -1;
  prevScore = 0; prevLevelObs = level(); prevLives = lives();
  prevBall = null; prevAngle = null; prevInZone = false; pendingCrossing = null;
  frozenFrames = 0; prevTexts = new Set();
}

function ballArcs() {
  return frameArcs.filter((a) => a.r === 8 && (a.shadowBlur === 18 || a.shadowBlur === 26));
}
function ballPos() {
  const b = ballArcs();
  return b.length ? { x: b[0].x, y: b[0].y, count: b.length } : null;
}
function wellCores() {
  return frameArcs.filter((a) => a.r === 15);
}
function overlayVisible(id) { return !elementsById[id].classList.contains('hidden'); }
function anyOverlay() {
  return ['pauseOverlay', 'levelOverlay', 'gameOverOverlay', 'draftOverlay', 'menuOverlay',
    // Block 16: the new modals also block play while open.
    'howtoOverlay', 'settingsOverlay', 'achOverlay']
    .some((id) => overlayVisible(id));
}
function powerHTML() { const el = elementsById.power; return (el.innerHTML || el.textContent || ''); }
function score() { return parseInt(elementsById.score.textContent, 10) || 0; }
function level() { return parseInt(elementsById.level.textContent, 10) || 0; }
function lives() { return (elementsById.lives.textContent.match(/●/g) || []).length; }

function observe() {
  const b = ballPos();
  const lv = level(), sc = score(), lvN = lives();
  // Block 14 (#51): latch any screen-reader announcement the game made.
  const sr = elementsById.srStatus && elementsById.srStatus.textContent;
  if (sr) obs.srAnnounced = true;
  // Block 16: latch the achievement toast + the biggest effective shake
  // seen (the shake toggle check needs a max, not a snapshot — and the
  // toast text persists after the toast hides, so this latches once).
  const toast = elementsById.achToast && elementsById.achToast.textContent;
  if (toast) obs.achToastSeen = true;
  const perf = global.window.__nvbPerf;
  if (perf && typeof perf.shake === 'number' && perf.shake > obs.maxShakeSeen) obs.maxShakeSeen = perf.shake;
  // Block 17 (#21/#22/#23): latch the new brick kinds and the chain /
  // regen counters from __nvbMeta (max across attempts, since the
  // counters reset per run). Mover proof: the layout signature changes
  // with no score change, no level change and no brick-count change —
  // only a sliding x can do that. A regen respawn changes the count and
  // a break changes the score, so neither can fake it; the y:hp
  // multiset comparison pins it down to an x-only shift.
  const meta17 = global.window.__nvbMeta;
  if (meta17) {
    const k = meta17.kinds;
    if (k) {
      if (k.moving > 0) obs.kindsSeen.moving = true;
      if (k.explosive > 0) obs.kindsSeen.explosive = true;
      if (k.regen > 0) obs.kindsSeen.regen = true;
    }
    if (typeof meta17.chains === 'number') obs.chains = Math.max(obs.chains, meta17.chains);
    if (typeof meta17.chainKills === 'number') obs.chainKills = Math.max(obs.chainKills, meta17.chainKills);
    if (typeof meta17.regens === 'number') obs.regens = Math.max(obs.regens, meta17.regens);
    const sig17 = meta17.levelSig || '';
    if (sig17 && prevSig17 && sig17 !== prevSig17 && lv === prevSigLevel17 && sc === prevSigScore17) {
      const a = prevSig17.split(',').map((s) => s.split(':'));
      const b2 = sig17.split(',').map((s) => s.split(':'));
      const yh = (arr) => arr.map((e) => e[1] + ':' + e[2]).sort().join('|');
      if (a.length === b2.length && yh(a) === yh(b2)) obs.moverMoved = true;
    }
    prevSig17 = sig17; prevSigLevel17 = lv; prevSigScore17 = sc;
  }
  if (lv > obs.maxLevel) obs.maxLevel = lv;
  const scoreJump = sc > prevScore;
  if (sc < prevScore) obs.nanEvents.push('score decreased ' + prevScore + ' -> ' + sc);
  const scBefore = prevScore; // Block 15: score before this frame, so a bomb
  // detonation's same-frame score delta proves the blast broke bricks.
  prevScore = sc;
  const c = parseInt((elementsById.combo.textContent || '×1').replace('×', ''), 10) || 1;
  if (c > obs.maxCombo) obs.maxCombo = c;
  // Level-clear rising edge.
  const lo = overlayVisible('levelOverlay');
  if (lo && !prevLevelOverlay) obs.levelsCleared.push(lv);
  prevLevelOverlay = lo;
  // Floating-text events — count only on the rising edge (a text renders
  // every frame for ~1s while it floats, so a raw per-frame count inflates).
  for (const t of frameTexts) {
    if (prevTexts.has(t)) continue;
    if (t === 'SWALLOWED!') obs.swallows++;
    else if (t === 'VOID PULL!') obs.pullWarns++;
    else if (t === 'MULTI-BALL!' || t === 'WIDE PADDLE!' || t === 'LASER PADDLE!' || t === 'SLOW-MO!' || t === 'SHIELD UP!' || t === 'FIREBALL!' || t === 'VOID BOMB!') obs.powerupsCaught++;
    // Block 15 (#16): the bomb's blast damage lands in the same frame as
    // the announcement (damage first, text second), so a same-frame score
    // jump of >= 50 proves the blast shattered at least one brick. The
    // ball can add to the same frame's delta, never subtract from it.
    if (t === 'VOID BOMB!') {
      obs.bombSeen = true; obs.bombCount++;
      const d = sc - scBefore;
      if (d > obs.bombMaxDelta) obs.bombMaxDelta = d;
      if (d >= 50) obs.bombBroke = true;
    }
    // Seen flags are independent ifs, not else-ifs: the combined branch
    // above already matches these texts, so an else-if here never fires.
    if (t === 'LASER PADDLE!') obs.laserSeen = true;
    if (t === 'SLOW-MO!') obs.slowSeen = true;
    if (t === 'SHIELD UP!') obs.shieldSeen = true;
    if (t === 'FIREBALL!') obs.fireSeen = true;
    if (t === 'SHIELD SAVED!') obs.shieldSaved++;
    else if (t === 'VOID CORE AWAKENS!') obs.bossAwaken = true;
    else if (t === 'VOID CORE DESTROYED!') obs.bossDestroyed = true;
    else if (t.startsWith('ON FIRE!')) obs.fireSeen = true;
  }
  prevTexts = new Set(frameTexts);
  // Laser bolts are 4x18 red rects; the shield net is a full-width 3px green rect.
  for (const r of frameRects) {
    if (r.w === 4 && r.h === 18 && r.fill === '#ff5c5c') obs.laserBolts++;
  }
  // HUD powerup flags (rising-edge not needed — these are latched).
  // #8: the HUD is chips in innerHTML now, not a text line.
  const pw = powerHTML();
  if (pw.indexOf('LASER') >= 0) obs.hudLaser = true;
  if (pw.indexOf('SLOW') >= 0) obs.hudSlow = true;
  if (pw.indexOf('SHIELD') >= 0) obs.hudShield = true;
  if (pw.indexOf('FIRE') >= 0) obs.fireHud = true;
  if (pw.indexOf('pw-chip') >= 0 && pw.indexOf('pw-bar') >= 0) obs.chipsSeen = true;
  // #29: confetti pieces are small rotating rects (w 5-9, h 8-14) that
  // only exist after a level clear — count them per frame.
  for (const r of frameRects) {
    if (r.w >= 5 && r.w <= 9 && r.h >= 8 && r.h <= 14) obs.confettiRects++;
  }
  // NaN scan: every drawn arc and the HUD must stay finite.
  for (const a of frameArcs) {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
      obs.nanEvents.push('non-finite arc x=' + a.x + ' y=' + a.y);
    }
  }
  if (elementsById.score.textContent === 'NaN') obs.nanEvents.push('HUD score NaN');
  // Teleports: a level change (nextLevel resets the ball to the paddle)
  // or a life change (loseBall resets the ball, and a swallow recenters
  // the paddle) move the ball discontinuously — skip the motion checks
  // this frame or the teleport reads as a 300px+ speed violation.
  const levelChanged = lv !== prevLevelObs;
  const livesChanged = lvN !== prevLives;
  prevLevelObs = lv;
  if (levelChanged || livesChanged) {
    // A life lost while a paddle-line crossing was pending means the ball
    // crossed and never came back: the paddle failed to catch it.
    if (pendingCrossing && lvN < pendingCrossing.lives) {
      obs.lostDespiteTracking++;
      obs.tunnelBugs.push('frame ' + obs.frames + ': ball crossed paddle line and a life was lost (lives '
        + pendingCrossing.lives + ' -> ' + lvN + ')');
    } else if (pendingCrossing) {
      obs.unresolvedCrossings++;
    }
    prevBall = b; prevAngle = null; prevInZone = false; pendingCrossing = null;
    prevLives = lvN;
    return;
  }
  // Playing = a ball is live, no overlay up, and the ball is not glued to
  // the paddle (serving). The glued check needs the ball's motion: a ball
  // parked at y>490 that does not move between frames is serving, not
  // falling — without this, the serving ball sits exactly on the paddle
  // line and would fake a crossing every serve.
  const stepFromPrev = (b && prevBall)
    ? Math.hypot(b.x - prevBall.x, b.y - prevBall.y) : null;
  const glued = b && b.y > 490 && (stepFromPrev === null || stepFromPrev < 0.5);
  // The serve hint only renders while mode is 'serving': a serving ball is
  // glued to the paddle, so its motion is paddle motion (a mouse teleport
  // can legitimately move it 40px/frame) — never ballistic speed.
  const servingHint = frameTexts.some((t) => t.indexOf('SPACE / TAP to launch') >= 0);
  const playing = b && !anyOverlay() && !glued && !servingHint;
  if (!playing) {
    // Serving / menu / overlay: reset the motion trackers. A crossing left
    // pending by a mode change (level cleared, run ended, new serve) has
    // no verdict — count it as dropped, not as a bounce or a loss.
    if (pendingCrossing) { obs.droppedCrossings++; pendingCrossing = null; }
    prevBall = b; prevAngle = null; prevInZone = false;
    prevLives = lvN;
    return;
  }
  // --- #47 tunneling detector: the bot parks the paddle under the ball
  // every frame, so a downward crossing of the paddle line MUST bounce.
  // Only runs with exactly one ball (multi-ball balls are not tracked).
  if (b.count === 1 && prevBall && prevBall.count === 1) {
    const step = Math.hypot(b.x - prevBall.x, b.y - prevBall.y);
    if (step > 0.5) {
      if (powerHTML().indexOf('SLOW') >= 0) { obs.slowStepSum += step; obs.slowStepN++; }
      else { obs.normalStepSum += step; obs.normalStepN++; }
    }
    // --- Block 12 fireball pierce check: while FIRE is on the HUD, a
    // brick break (score jump) must NOT flip the ball's direction — the
    // ball smashes through instead of bouncing. Compare the travel angle
    // on the break frame with the next frame's angle; a real bounce flips
    // one velocity component and swings the angle by ~160 degrees.
    const fireOn = powerHTML().indexOf('FIRE') >= 0;
    if (fireOn && scoreJump && step > 0.5) {
      fireAngleBefore = Math.atan2(b.y - prevBall.y, b.x - prevBall.x);
      fireCheckFrame = obs.frames;
    } else if (fireCheckFrame >= 0 && obs.frames === fireCheckFrame + 1 && step > 0.5) {
      const a = Math.atan2(b.y - prevBall.y, b.x - prevBall.x);
      let d = a - fireAngleBefore;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.4) obs.firePierced = true;
      fireCheckFrame = -1;
    } else if (fireCheckFrame >= 0 && obs.frames > fireCheckFrame + 1) {
      fireCheckFrame = -1;
    }
    if (step > obs.maxStep) obs.maxStep = step;
    // Block 13: a brick-break frame legitimately shows a bigger apparent
    // step — reflectOffBrick snaps the ball out of the brick it overlapped
    // (up to BALL_R + 0.5px of de-penetration on top of the frame's travel),
    // so the speed verdict only counts non-scoring frames.
    if (!scoreJump) {
      if (step > obs.maxStepClean) obs.maxStepClean = step;
      if (step > MAX_STEP) obs.speedViolations++;
    }
    if (prevBall.y < PADDLE_LINE && b.y >= PADDLE_LINE) {
      obs.crossings++;
      pendingCrossing = { frame: obs.frames, lives: lvN, shieldSaved: obs.shieldSaved };
    }
    if (pendingCrossing) {
      // A shield save resolves the crossing: the net caught the ball the
      // paddle missed, which is the shield doing its job, not a tunnel.
      if (obs.shieldSaved > pendingCrossing.shieldSaved) {
        obs.shieldSaves++;
        pendingCrossing = null;
      } else if (b.y < prevBall.y) {
        // Ball is moving up again: it bounced. (Direction, not position:
        // a near-horizontal bounce rises slowly, so a fixed "back above
        // the line" test would miss it and expire the crossing.)
        obs.bounces++;
        pendingCrossing = null;
      } else if (lvN < pendingCrossing.lives || b.y > 545) {
        // 545, not 520: the shield net catches a falling ball at y>=532
        // and bounces it back up, so a saved ball legitimately passes 520.
        // A truly lost ball keeps falling past 545 and off the bottom.
        // Ball kept falling past the paddle, or a life was lost while the
        // paddle was parked under it: the paddle failed to catch it.
        obs.lostDespiteTracking++;
        obs.tunnelBugs.push('frame ' + obs.frames + ': ball crossed paddle line at x='
          + Math.round(b.x) + ' and was lost (lives ' + pendingCrossing.lives + ' -> ' + lvN + ')');
        pendingCrossing = null;
      } else if (obs.frames - pendingCrossing.frame > 10) {
        // Still neither up nor lost after 10 frames (e.g. the run ended
        // mid-flight): unresolved, reported but not a tunnel by itself.
        obs.unresolvedCrossings++;
        pendingCrossing = null;
      }
    }
    // --- stuck-ball detector: a live ball that does not move for 2s.
    if (step < 0.05) {
      if (++frozenFrames === 120) obs.stuckEvents++;
    } else frozenFrames = 0;
    // --- well bend measurement: in the open zone (below the bricks, above
    // the paddle, away from the walls) only a well can turn the ball.
    const cores = wellCores();
    let near = Infinity;
    for (const w of cores) near = Math.min(near, Math.hypot(w.x - b.x, w.y - b.y));
    const inZone = b.y > 310 && b.y < 480 && b.x > 40 && b.x < 680 && near < 150;
    if (prevAngle !== null && inZone && prevInZone && step > 0.5) {
      const a = Math.atan2(b.y - prevBall.y, b.x - prevBall.x);
      let d = a - prevAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      obs.bend += Math.abs(d);
      obs.bendSamples++;
    }
    if (inZone) prevAngle = Math.atan2(b.y - prevBall.y, b.x - prevBall.x);
    else if (!inZone) prevAngle = null;
    prevInZone = inZone;
  } else {
    // Multi-ball (or a fresh serve) drops a pending crossing without a
    // verdict — count it as dropped, not as a bounce or a loss.
    fireCheckFrame = -1;
    if (pendingCrossing) { obs.droppedCrossings++; pendingCrossing = null; }
    frozenFrames = 0; prevAngle = null; prevInZone = false;
  }
  prevBall = b;
  prevLives = lvN;
}

function pump(frames) {
  for (let i = 0; i < frames; i++) {
    nowMs += 16.7; audioNow += 0.0167;
    frameArcs = []; frameTexts = []; frameFills = new Set(); frameRects = [];
    const cbs = rafQ; rafQ = [];
    for (const cb of cbs) cb(nowMs);
    obs.frames++;
    observe();
  }
}

// Block 14 (#46): pump frames at a fixed slow cadence WITHOUT observe() —
// a 40ms frame moves the ball up to 22px (dt caps at 33ms), which would
// trip the 60fps speed detector; this probe only cares about the FPS guard
// engaging and the renderer dropping shadowBlur, so it reads frameArcs
// directly and never touches the motion detectors.
function pumpSlow(frames) {
  for (let i = 0; i < frames; i++) {
    nowMs += 40; audioNow += 0.04;
    frameArcs = []; frameTexts = []; frameFills = new Set(); frameRects = [];
    const cbs = rafQ; rafQ = [];
    for (const cb of cbs) cb(nowMs);
  }
}

// Serving = ball glued to the paddle: same position 6 frames running, low
// on the screen, no overlay up. (6 frames > the longest hit-stop freeze.)
let frozenRun = 0, lastBall = null;
function servingNow() {
  const b = ballPos();
  if (!b) { frozenRun = 0; lastBall = null; return false; }
  if (lastBall && Math.abs(b.x - lastBall.x) < 0.5 && Math.abs(b.y - lastBall.y) < 0.5) frozenRun++;
  else frozenRun = 0;
  lastBall = b;
  return frozenRun >= 5 && b.y > 480 && !anyOverlay();
}

function key(code, target, type) {
  const e = { code, repeat: false, target: target || document.activeElement || bodyEl,
    preventDefault() { this._pd = true; }, _pd: false };
  for (const fn of (winListeners[type || 'keydown'] || [])) fn(e);
  if (!type && e.target && e.target.tagName === 'BUTTON' && (code === 'Space' || code === 'Enter')) {
    e.target.click();
  }
  return e;
}
function keyup(code) {
  const e = { code, target: document.activeElement || bodyEl };
  for (const fn of (winListeners.keyup || [])) fn(e);
}

function advanceLevel() {
  // From the level-clear overlay: Space -> draft -> Digit2 picks card 2.
  key('Space', bodyEl); pump(2);
  if (!overlayVisible('draftOverlay')) return false;
  if (elementsById.draftCards.children.length !== 3) return false;
  key('Digit2'); pump(3);
  return !overlayVisible('draftOverlay');
}

// Block 11 interactive tests, driven from inside aiPlay:
// - laser: once LASER is on the HUD, press Space and confirm bolts draw.
// - shield: once SHIELD is armed (level 1 only — no wells to confound the
//   lives check), park the paddle on the far side from the ball and let it
//   fall; the net must save it without costing a life.
let laserTested = false, shieldTested = false, dropTest = false;
let dropFrames = 0, shieldLivesBefore = 0;

// Play one attempt until game over, level 10 cleared, or the frame budget
// runs out. Returns 'clear' | 'over' | 'timeout' | 'menu'.
function aiPlay(maxFrames) {
  let frames = 0;
  // Block 18 (#62): human-bot state — the paddle target the sloppy bot
  // is chasing, a short history of the ball's positions for its landing
  // prediction, and a correction-rate counter.
  let humanTarget = null, humanHist = [], humanTick = 0;
  while (frames < maxFrames) {
    if (overlayVisible('menuOverlay')) return 'menu';
    if (overlayVisible('gameOverOverlay')) return 'over';
    if (overlayVisible('levelOverlay')) { dropTest = false; return 'clear'; }
    if (overlayVisible('pauseOverlay')) { key('KeyR'); pump(2); frames += 2; continue; }
    if (overlayVisible('draftOverlay')) return 'draft';
    const pw = powerHTML();
    if (!HUMAN && !laserTested && pw.indexOf('LASER') >= 0) {
      laserTested = true;
      const before = obs.laserBolts;
      key('Space', bodyEl); pump(5); frames += 5;
      obs.laserFireOk = obs.laserBolts > before;
    }
    if (!HUMAN && !shieldTested && level() === 1 && pw.indexOf('SHIELD') >= 0 && !dropTest) {
      shieldTested = true; dropTest = true; dropFrames = 0;
      shieldLivesBefore = lives();
    }
    const b = ballPos();
    if (dropTest) {
      dropFrames++;
      // Park on the opposite side from the ball so it cannot land on us.
      const cx = b && b.x < 360 ? 720 : 0;
      canvasEl.dispatch('pointermove', { clientX: cx, pointerType: 'touch' });
      if (obs.shieldSaved > 0) {
        obs.shieldSaveLivesOk = lives() === shieldLivesBefore;
        obs.shieldHudCleared = powerHTML().indexOf('SHIELD') < 0;
        dropTest = false;
      } else if (dropFrames > 4000) {
        obs.shieldSaveTimeout = true;
        dropTest = false;
      }
    } else if (HUMAN) {
      // Block 18 (#62): human-like control — predict where the falling
      // ball will cross the paddle line from its recent velocity (a
      // human extrapolates, not chases the past), correct the aim every
      // 6 frames (~100ms) with ±25px of error, and hold still while the
      // ball rises. A bot that still wins says the game is too easy; one
      // that dies on level 2 says the first well + the speed ramp spike
      // too hard together.
      if (b) {
        humanHist.push({ x: b.x, y: b.y });
        if (humanHist.length > 12) humanHist.shift();
        humanTick++;
        if (humanHist.length >= 6 && humanTick % 6 === 0) {
          const a = humanHist[humanHist.length - 6], c = humanHist[humanHist.length - 1];
          const vx = (c.x - a.x) / 5, vy = (c.y - a.y) / 5; // px per frame
          if (vy > 0.5) {
            const t = (PADDLE_LINE - c.y) / vy; // frames to the paddle line
            let px = c.x + vx * t;
            // One wall bounce in the prediction: reflect back into play.
            if (px < 8) px = 16 - px;
            else if (px > 712) px = 1424 - px;
            humanTarget = Math.max(0, Math.min(720, px + (Math.random() * 50 - 25)));
          }
        }
      }
      if (humanTarget !== null) canvasEl.dispatch('pointermove', { clientX: humanTarget, pointerType: 'touch' });
    } else if (b) {
      canvasEl.dispatch('pointermove', { clientX: b.x, pointerType: 'touch' });
    }
    pump(1); frames++;
    if (servingNow()) {
      canvasEl.dispatch('pointerdown', { clientX: (ballPos() || { x: 360 }).x, pointerType: 'touch' });
      pump(2); frames += 2;
    }
  }
  return 'timeout';
}

// ---------- load the game ----------
eval(SRC12); // eslint-disable-line no-eval
pump(5);
// Block 15 (#12): the pristine boot signature — level 1, menu mode, no
// brick broken yet. The determinism check compares the first attempt's
// fresh level-1 signature against this one; attempt 2 may start mid-run
// after a timeout, so its signature is informational only.
obs.bootSig = global.window.__nvbMeta ? global.window.__nvbMeta.levelSig : 'n/a';

console.log('== boot ==');
check('boot: menu overlay visible', overlayVisible('menuOverlay'));
// Block 16 (#39): a first visit opens the how-to overlay over the menu,
// so focus lands on its GOT IT — PLAY button instead of PLAY.
check('boot: PLAY (or how-to PLAY) button focused',
  document.activeElement === elementsById.playBtn
  || document.activeElement === elementsById.playFromHowtoBtn);

console.log('== Block 16 interactive (#39 how-to, #35/#36/#44 settings) ==');
// #39: first visit auto-shows the how-to overlay over the menu.
check('howto: auto-shows on first visit', overlayVisible('howtoOverlay'));
// #39: CLOSE dismisses it and marks it seen, so it never auto-shows again.
elementsById.closeHowtoBtn.click(); pump(2);
check('howto: CLOSE hides it + marks seen',
  !overlayVisible('howtoOverlay')
  && global.localStorage.getItem('nvb-seen-howto') === '1');
// #39: reopening from the menu and pressing GOT IT — PLAY starts a run.
elementsById.howtoBtn.click(); pump(2);
check('howto: menu button reopens it', overlayVisible('howtoOverlay'));
elementsById.playFromHowtoBtn.click(); pump(3);
check('howto: GOT IT — PLAY starts a run',
  !overlayVisible('howtoOverlay') && !overlayVisible('menuOverlay'));
// Back to the menu so the playtest starts clean: pause, then quit.
key('KeyP'); pump(2);
check('howto: run pauses after the how-to start', overlayVisible('pauseOverlay'));
key('KeyQ'); pump(2);
check('howto: Q quits back to the menu', overlayVisible('menuOverlay'));
// #44/#35/#36: settings open, volume persists, toggles stick.
elementsById.settingsBtn.click(); pump(2);
check('settings: gear opens the panel', overlayVisible('settingsOverlay'));
elementsById.volumeSlider.value = '50';
elementsById.volumeSlider.dispatch('input'); pump(1);
check('settings: volume slider persists 0.5',
  global.window.__nvbPerf.settings.volume === 0.5
  && JSON.parse(global.localStorage.getItem('nvb-settings') || '{}').volume === 0.5,
  'volume=' + global.window.__nvbPerf.settings.volume);
elementsById.musicToggle.checked = false;
elementsById.musicToggle.dispatch('change'); pump(1);
check('settings: music toggle off persists',
  global.window.__nvbPerf.settings.music === false);
elementsById.musicToggle.checked = true;
elementsById.musicToggle.dispatch('change'); pump(1);
// #44: shake off before the playtest — the post-playtest check proves no
// shake value ever rendered while it was off (maxShakeSeen stays 0).
elementsById.shakeToggle.checked = false;
elementsById.shakeToggle.dispatch('change'); pump(1);
check('settings: shake toggle off persists',
  global.window.__nvbPerf.settings.shake === false);
// #44: reduce-motion toggle on flips the perf flag; off again so the
// confetti check below still sees its burst.
elementsById.motionToggle.checked = true;
elementsById.motionToggle.dispatch('change'); pump(1);
check('settings: reduce-motion toggle flips the flag',
  global.window.__nvbPerf.reducedMotion === true);
elementsById.motionToggle.checked = false;
elementsById.motionToggle.dispatch('change'); pump(1);
check('settings: reduce-motion toggle restores the flag',
  global.window.__nvbPerf.reducedMotion === false);
elementsById.closeSettingsBtn.click(); pump(2);
check('settings: DONE closes the panel', !overlayVisible('settingsOverlay'));

console.log('== tunnel audit, source level (#47, #48) ==');
// The audit's static leg: the substep must be <= 1/3 of the thinnest
// collider (paddle, 12px) so no collider can be jumped in one substep,
// and the swept paddle test + NaN guard must be present in the code.
check('audit: substep STEP_PX = BALL_R / 2 (4px)', SRC.includes('const STEP_PX = BALL_R / 2'));
check('audit: swept paddle crossing test present', SRC.includes('crossX') && SRC.includes('swept'));
check('audit: NaN velocity guard present', SRC.includes('Number.isFinite(ball.vx)'));

console.log('== HTML ==');
const html = fs.readFileSync(HTML, 'utf8');
check('HTML: version v0.21.0', html.includes('v0.21.0'));

// Block 19 (#50, #53, #54): PWA-lite polish — real favicon, manifest,
// social meta, offline service worker.
check('PWA: favicon.svg linked', html.includes('rel="icon" type="image/svg+xml" href="favicon.svg"'));
check('PWA: apple-touch-icon linked', html.includes('rel="apple-touch-icon" href="apple-touch-icon.png"'));
check('PWA: manifest linked', html.includes('rel="manifest" href="manifest.webmanifest"'));
check('PWA: og:image + twitter card meta', html.includes('og:image') && html.includes('docs/screenshot-gameplay.png') && html.includes('twitter:card') && html.includes('summary_large_image'));
check('PWA: no inline data-URI favicon left', !html.includes('data:image/svg+xml'));
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); } catch (e) { /* fail below */ }
check('PWA: manifest parses + name/icons/theme', !!manifest && manifest.name === 'Neon Void Breaker'
  && manifest.theme_color === '#0b0620' && manifest.display === 'standalone'
  && manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'));
const pngMagic = (p) => fs.readFileSync(p).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
check('PWA: icon PNGs exist + valid (192/512/180)', ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].every((f) => { try { return pngMagic(path.join(ROOT, f)); } catch (e) { return false; } }));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('PWA: sw.js caches shell + versioned cache', sw.includes("const CACHE = 'nvb-v0.21.0'") && ['index.html', 'style.css', 'game.js', 'favicon.svg', 'manifest.webmanifest'].every((a) => sw.includes("'" + a + "'")));
check('PWA: SW registration guarded in game.js', SRC.includes("'serviceWorker' in navigator") && SRC.includes("navigator.serviceWorker.register('sw.js')") && SRC.includes("protocol.startsWith('http')"));

console.log('== bot playtest (#45) ==');
let attemptResults = [];
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  // Re-baseline BEFORE the restart keypress: startRun zeroes the score
  // synchronously, so a reset after the pump would already have recorded
  // a bogus "score decreased" event.
  resetRunTracking();
  if (overlayVisible('menuOverlay')) { elementsById.playBtn.click(); pump(3); }
  else if (overlayVisible('gameOverOverlay')) { key('Enter', bodyEl); pump(3); }
  // else: already in a run (restarted at the end of the previous attempt)
  // Block 15 (#12): snapshot the level-1 layout signature right after the
  // serve starts — no brick can be broken yet, so two attempts with the
  // same seed must produce identical signatures.
  pump(2);
  obs.brickSigs.push(global.window.__nvbMeta ? global.window.__nvbMeta.levelSig : 'n/a');
  // Regression checks on the first attempt, once play has started.
  if (attempt === 1) {
    pump(30);
    key('KeyP'); pump(2);
    check('regression: P pauses', overlayVisible('pauseOverlay'));
    key('KeyR'); pump(2);
    check('regression: R resumes', !overlayVisible('pauseOverlay'));
    const muteBefore = elementsById.muteBtn.textContent;
    key('KeyM'); pump(1);
    check('regression: M toggles mute', elementsById.muteBtn.textContent !== muteBefore);
    key('KeyM'); pump(1);
  }
  const clearedBefore = obs.levelsCleared.length;
  let result = aiPlay(MAX_FRAMES);
  let guard = 0;
  // Block 15: 10 levels need up to 9 advances per attempt (was 8 for 6).
  while (result === 'clear' && guard++ < 12) {
    if (!advanceLevel()) {
      // No draft opened: either the final level was cleared (Space advanced
      // straight to the win screen — a win, not a failure) or the draft
      // genuinely failed to open.
      result = overlayVisible('gameOverOverlay') ? 'won' : 'draft-fail';
      break;
    }
    pump(10);
    result = aiPlay(MAX_FRAMES);
  }
  if (result === 'draft') { // draft open without a clear overlay: pick a card
    key('Digit2'); pump(3);
    result = aiPlay(MAX_FRAMES);
  }
  attemptResults.push({ attempt, result, levelsCleared: obs.levelsCleared.length - clearedBefore,
    score: score(), maxLevel: obs.maxLevel });
  // Block 16: keep the FIRST game-over screen's HTML — later attempts may
  // unlock nothing new (everything already unlocked), so their screen has
  // no "Unlocked:" line to check.
  if (overlayVisible('gameOverOverlay') && !obs.lastGameOverHtml) {
    obs.lastGameOverHtml = elementsById.gameOverStats.innerHTML || '';
  }
  console.log('  attempt ' + attempt + ': ' + result + ' levelsCleared='
    + (obs.levelsCleared.length - clearedBefore) + ' score=' + score()
    + ' maxLevel=' + obs.maxLevel);
  obs.finalScore = score();
  if (result !== 'over' && result !== 'clear' && result !== 'won') break;
  if (attempt < ATTEMPTS && overlayVisible('gameOverOverlay')) {
    resetRunTracking(); // re-baseline before the restart zeroes the score
    key('Enter', bodyEl); pump(3);
  }
}

// Block 18 (#62): human-bot mode reports difficulty and stops — the
// full check suite assumes the perfect bot wins every level, so it
// would fail on a human-like run by design.
if (HUMAN) {
  console.log('\n== human-bot difficulty report (#62) ==');
  console.log('attempts: ' + JSON.stringify(attemptResults));
  console.log('levels cleared: ' + JSON.stringify(obs.levelsCleared) + ' (max level reached ' + obs.maxLevel + ')');
  console.log('final score: ' + obs.finalScore + ' · max combo ×' + obs.maxCombo);
  console.log('powerups caught: ' + obs.powerupsCaught + ' · swallows: ' + obs.swallows
    + ' · VOID PULL warnings: ' + obs.pullWarns);
  console.log('paddle crossings: ' + obs.crossings + ' · bounces: ' + obs.bounces
    + ' · lost despite tracking: ' + obs.lostDespiteTracking
    + ' · unresolved: ' + obs.unresolvedCrossings + ' · dropped: ' + obs.droppedCrossings);
  console.log('frames simulated: ' + obs.frames);
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  if (failures.length) console.log('failures: ' + failures.join(' | '));
  for (const id of intervals) clearInterval(id);
  for (const id of timeouts) clearTimeout(id);
  process.exit(fail ? 1 : 0);
}

console.log('== Block 11 powerups (#3 laser, #4 slow-mo, #5 shield) ==');
const slowAvg = obs.slowStepN ? obs.slowStepSum / obs.slowStepN : 0;
const normalAvg = obs.normalStepN ? obs.normalStepSum / obs.normalStepN : 0;
check('laser: LASER PADDLE! announced', obs.laserSeen);
check('laser: HUD shows LASER timer', obs.hudLaser);
check('laser: Space fires bolts (4x18 red rects drawn)', obs.laserFireOk === true && obs.laserBolts > 0, 'bolts=' + obs.laserBolts);
check('slow-mo: SLOW-MO! announced', obs.slowSeen);
check('slow-mo: HUD shows SLOW timer', obs.hudSlow);
check('slow-mo: ball actually slower (avg step ' + slowAvg.toFixed(2) + 'px vs normal ' + normalAvg.toFixed(2) + 'px)',
  obs.slowStepN >= 30 && obs.normalStepN >= 30 && slowAvg < normalAvg * 0.75,
  'slowSamples=' + obs.slowStepN + ' normalSamples=' + obs.normalStepN);
check('shield: SHIELD UP! announced', obs.shieldSeen);
check('shield: HUD shows SHIELD', obs.hudShield);
check('shield: net saved a ball (SHIELD SAVED! seen)', obs.shieldSaved > 0, 'saved=' + obs.shieldSaved);
check('shield: save cost no life', obs.shieldSaveLivesOk === true);
check('shield: HUD cleared after the save', obs.shieldHudCleared === true);
check('shield: no save timeout (4000-frame drop test)', !obs.shieldSaveTimeout);

console.log('== Block 12 (#6 fireball, #8 HUD chips, #29 confetti) ==');
check('fireball: FIREBALL! announced', obs.fireSeen);
check('fireball: HUD shows FIRE chip', obs.fireHud);
check('fireball: chips render with countdown bar', obs.chipsSeen);
check('fireball: ball pierced a brick without bouncing', obs.firePierced);
check('confetti: burst drawn on level clear (>50 small rects)', obs.confettiRects > 50, 'rects=' + obs.confettiRects);

console.log('== bug detectors ==');
check('detector: AI cleared level 1', obs.levelsCleared.includes(1), 'cleared=' + JSON.stringify(obs.levelsCleared));
check('detector: total levels cleared >= 2', obs.levelsCleared.length >= 2, 'cleared=' + JSON.stringify(obs.levelsCleared));
check('detector: paddle-line crossings were exercised', obs.crossings >= 15,
  // Block 13: crossings vary run to run (20–103 seen — multi-ball phases
  // skip the single-ball detector), so the guard sits at 15, not 20:
  // enough to prove the tunneling verdict was exercised, low enough that
  // a healthy run never trips it. The verdict check below is the real gate.
  'crossings=' + obs.crossings + ' bounces=' + obs.bounces);
check('detector: every crossing bounced, none lost (crossings=' + obs.crossings + ', bounces=' + obs.bounces + ', shieldSaves=' + obs.shieldSaves + ', dropped=' + obs.droppedCrossings + ', unresolved=' + obs.unresolvedCrossings + ')',
  obs.crossings > 0 && obs.bounces + obs.shieldSaves >= obs.crossings - obs.unresolvedCrossings - obs.droppedCrossings - 1 && obs.tunnelBugs.length === 0 && obs.lostDespiteTracking === 0,
  obs.tunnelBugs.slice(0, 3).join(' | ') || ('lostDespiteTracking=' + obs.lostDespiteTracking));
check('detector: no stuck balls', obs.stuckEvents === 0, 'stuckEvents=' + obs.stuckEvents);
check('detector: no NaN observations', obs.nanEvents.length === 0, obs.nanEvents.slice(0, 3).join(' | '));
check('detector: max per-frame ball step <= ' + MAX_STEP.toFixed(1) + 'px (max speed 680, non-scoring frames)',
  obs.maxStepClean <= MAX_STEP, 'maxStepClean=' + obs.maxStepClean.toFixed(2) + 'px, raw maxStep=' + obs.maxStep.toFixed(2) + 'px, violations=' + obs.speedViolations);

console.log('== Block 14 (#46 FPS guard, #51 accessibility) ==');
check('a11y: live region #srStatus present (role=status, aria-live=polite)',
  html.includes('id="srStatus"') && html.includes('role="status"') && html.includes('aria-live="polite"'));
check('a11y: all 5 overlays are dialogs', (html.match(/role="dialog"/g) || []).length >= 5);
check('a11y: canvas has role="img"', html.includes('role="img"'));
check('a11y: draft cards get aria-labels', SRC.includes("setAttribute('aria-label'"));
const draftCards = elementsById.draftCards.children || [];
check('a11y: draft cards carry a real aria-label at runtime',
  draftCards.length === 3 && draftCards.every((c) => (c.getAttribute('aria-label') || '').indexOf('Press') >= 0),
  'cards=' + draftCards.length);
check('a11y: announce() wired to key events', (SRC.match(/announce\(/g) || []).length >= 7 && SRC.includes('srStatus'));
check('a11y: screen-reader announcements fired during the run', obs.srAnnounced === true);
check('perf: FPS EMA + low-perf degrade present', SRC.includes('fpsEma') && SRC.includes('lowPerf') && SRC.includes('glow('));
check('perf: all shadowBlur writes gated through glow()', (SRC.match(/shadowBlur = glow\(/g) || []).length >= 8);
check('perf: particle/confetti caps adapt to low-perf', SRC.includes('PARTICLE_CAP') && SRC.includes('CONFETTI_CAP'));
check('perf: reduced-motion honored (matchMedia + no shake/confetti)', SRC.includes('prefers-reduced-motion') && SRC.includes('REDUCED_MOTION'));
const perf = global.window.__nvbPerf;
check('perf: window.__nvbPerf exposed, FPS sane at 60fps sim', !!perf && perf.fps > 50 && perf.fps < 70 && perf.lowPerf === false,
  'fps=' + (perf && perf.fps.toFixed(1)));
// Slow-frame probe: get to a fresh serve (ball glued, no motion detectors
// to trip), drive 200 frames at 40ms, and confirm the guard engages and
// the renderer drops shadowBlur. Then 400 normal frames must recover it.
if (overlayVisible('gameOverOverlay')) { resetRunTracking(); key('Enter', bodyEl); pump(3); }
else if (overlayVisible('menuOverlay')) { elementsById.playBtn.click(); pump(3); }
else if (overlayVisible('levelOverlay')) { advanceLevel(); pump(3); }
else if (overlayVisible('draftOverlay')) { key('Digit2'); pump(3); }
else if (overlayVisible('pauseOverlay')) {
  key('KeyQ'); pump(3);
  if (overlayVisible('menuOverlay')) { elementsById.playBtn.click(); pump(3); }
} else { // mid-run: pause, quit to menu, start fresh
  key('KeyP'); pump(2);
  if (overlayVisible('pauseOverlay')) { key('KeyQ'); pump(3); }
  if (overlayVisible('menuOverlay')) { elementsById.playBtn.click(); pump(3); }
}
pump(10);
pumpSlow(200);
const perfSlow = global.window.__nvbPerf;
const slowBallArcs = frameArcs.filter((a) => a.r === 8);
check('perf: 40ms frames engage low-perf', !!perfSlow && perfSlow.lowPerf === true && perfSlow.fps < 45,
  'fps=' + (perfSlow && perfSlow.fps.toFixed(1)));
check('perf: low-perf render drops shadowBlur on the ball',
  slowBallArcs.length > 0 && slowBallArcs.every((a) => a.shadowBlur === 0),
  'ballArcs=' + slowBallArcs.length + ' shadowBlur=' + (slowBallArcs[0] && slowBallArcs[0].shadowBlur));
pump(400);
const perfRec = global.window.__nvbPerf;
check('perf: 60fps frames recover low-perf', !!perfRec && perfRec.lowPerf === false && perfRec.fps > 55,
  'fps=' + (perfRec && perfRec.fps.toFixed(1)));

console.log('== Block 15 (#12 seeds, #16 void bomb, #19 levels 7-10) ==');
const meta = global.window.__nvbMeta;
const _d = new Date();
const todayStr = String(_d.getFullYear()) + String(_d.getMonth() + 1).padStart(2, '0') + String(_d.getDate()).padStart(2, '0');
const expectSeed = process.env.NVB_SEED ? process.env.NVB_SEED.toUpperCase() : todayStr;
check('levels: 10 levels in the run', !!meta && meta.levels === 10, 'levels=' + (meta && meta.levels));
check('levels: names 7-10 present', SRC.includes("'VOID MAZE'") && SRC.includes("'TWIN PEAKS'")
  && SRC.includes("'THE GAUNTLET'") && SRC.includes("'EVENT HORIZON'"));
check('levels: wells defined for levels 7-10', (SRC.match(/VOID_WELLS = \[([\s\S]*?)\];/) || ['', ''])[1].split('\n').filter((l) => l.trim().startsWith('[{') || l.trim().startsWith('[]')).length >= 10);
check('levels: level-10 boss (VOID CORE PRIME, 16 HP) present',
  SRC.includes('VOID CORE PRIME') && SRC.includes('BOSS_LEVELS') && SRC.includes('10: { hp: 16'));
check('seed: __nvbMeta exposed with seed + levelSig',
  !!meta && typeof meta.seed === 'string' && meta.seed.length > 0 && typeof meta.levelSig === 'string' && meta.levelSig.length > 0,
  'seed=' + (meta && meta.seed));
check('seed: seed is ' + expectSeed + (process.env.NVB_SEED ? ' (NVB_SEED)' : ' (daily)'),
  !!meta && meta.seed === expectSeed, 'seed=' + (meta && meta.seed));
check('seed: menu shows the seed line', (elementsById.seedLine.textContent || '').indexOf(expectSeed) >= 0,
  'seedLine=' + JSON.stringify(elementsById.seedLine.textContent));
check('seed: same seed builds the same level-1 layout (boot vs attempt 1)',
  obs.bootSig !== 'n/a' && obs.brickSigs.length >= 1 && obs.bootSig === obs.brickSigs[0],
  'bootLen=' + obs.bootSig.length + ' attempt1Len=' + (obs.brickSigs[0] && obs.brickSigs[0].length));
check('bomb: VOID BOMB! announced', obs.bombSeen, 'detonations=' + obs.bombCount);
check('bomb: blast broke bricks (max same-frame score delta ' + obs.bombMaxDelta + ')',
  obs.bombBroke, 'detonations=' + obs.bombCount + ' maxDelta=' + obs.bombMaxDelta);
check('bomb: capsule type in the drop pool', SRC.includes("bomb: { label: 'VOID BOMB'"));
check('bomb: detonateBomb damages in a radius via damageBrick',
  SRC.includes('function detonateBomb') && SRC.includes('BOMB_RADIUS') && SRC.includes('damageBrick(br)'));

console.log('== Block 16 (achievements + stats, #35/#36/#39/#44) ==');
const ach = global.window.__nvbAch;
check('achievements: __nvbAch exposed (14 total)', !!ach && ach.total === 14, 'total=' + (ach && ach.total));
check('achievements: first-blood unlocked', !!ach && ach.unlocked.indexOf('first-blood') >= 0);
check('achievements: first-contact (level 1 clear) unlocked', !!ach && ach.unlocked.indexOf('first-contact') >= 0);
check('achievements: combo ×3 unlocked', !!ach && ach.unlocked.indexOf('combo-3') >= 0, 'maxCombo=×' + obs.maxCombo);
check('achievements: combo ×5 unlocked', !!ach && ach.unlocked.indexOf('combo-5') >= 0, 'maxCombo=×' + obs.maxCombo);
check('achievements: five-ball frenzy unlocked', !!ach && ach.unlocked.indexOf('five-ball') >= 0);
check('achievements: powerup hoarder (10 in a run) unlocked', !!ach && ach.unlocked.indexOf('hoarder') >= 0, 'caught=' + obs.powerupsCaught);
check('achievements: shield savior unlocked', !!ach && ach.unlocked.indexOf('shield-savior') >= 0, 'saved=' + obs.shieldSaved);
check('achievements: core breaker unlocked', !!ach && ach.unlocked.indexOf('core-breaker') >= 0, 'bossDestroyed=' + obs.bossDestroyed);
check('achievements: void conquered (all 10 levels) unlocked', !!ach && ach.unlocked.indexOf('void-conquered') >= 0);
check('achievements: high roller (50k in a run) unlocked', !!ach && ach.unlocked.indexOf('high-roller') >= 0, 'finalScore=' + obs.finalScore);
check('achievements: brick barrage (100 in a run) unlocked', !!ach && ach.unlocked.indexOf('brick-barrage') >= 0);
check('achievements: thousand cut (1,000 lifetime) unlocked', !!ach && ach.unlocked.indexOf('thousand-cut') >= 0, 'lifetimeBricks=' + (ach && ach.lifetime.bricks));
check('achievements: gravity\'s end (level 5 clear) unlocked', !!ach && ach.unlocked.indexOf('gravitys-end') >= 0);
check('achievements: flawless level unlocked', !!ach && ach.unlocked.indexOf('flawless') >= 0);
check('achievements: unlock toast shown', obs.achToastSeen === true);
check('achievements: game-over screen lists this run\'s unlocks',
  (obs.lastGameOverHtml || '').indexOf('Unlocked') >= 0,
  'html=' + JSON.stringify((obs.lastGameOverHtml || '').slice(0, 120)));
// Panel: get back to the menu (whatever state the perf probe left), open
// it, count rows, close it again.
if (overlayVisible('draftOverlay')) { key('Digit2'); pump(3); }
if (overlayVisible('levelOverlay')) { advanceLevel(); pump(3); }
if (overlayVisible('pauseOverlay')) { key('KeyQ'); pump(3); }
else if (overlayVisible('gameOverOverlay')) { key('KeyQ'); pump(3); }
else if (!overlayVisible('menuOverlay')) { key('KeyP'); pump(2); if (overlayVisible('pauseOverlay')) { key('KeyQ'); pump(3); } }
if (overlayVisible('menuOverlay')) {
  elementsById.achBtn.click(); pump(2);
  check('achievements: panel opens from the menu', overlayVisible('achOverlay'));
  const rows = elementsById.achList.children || [];
  check('achievements: panel lists all 14', rows.length === 14, 'rows=' + rows.length);
  const unlockedRows = rows.filter((r) => r.classList.contains('unlocked')).length;
  check('achievements: panel marks unlocked rows',
    unlockedRows === (ach ? ach.unlocked.length : -1),
    'unlockedRows=' + unlockedRows + ' unlocked=' + (ach && ach.unlocked.length));
  check('achievements: panel shows the unlock count',
    (elementsById.achCount.textContent || '').indexOf(String(ach ? ach.unlocked.length : -1)) >= 0,
    'count=' + JSON.stringify(elementsById.achCount.textContent));
  check('achievements: lifetime stats line rendered',
    (elementsById.lifetimeStats.textContent || '').indexOf('Runs') >= 0,
    'stats=' + JSON.stringify((elementsById.lifetimeStats.textContent || '').slice(0, 80)));
  elementsById.closeAchBtn.click(); pump(2);
  check('achievements: CLOSE hides the panel', !overlayVisible('achOverlay'));
} else {
  check('achievements: panel opens from the menu', false, 'not on menu at check time');
  check('achievements: panel lists all 14', false, 'not on menu at check time');
  check('achievements: panel marks unlocked rows', false, 'not on menu at check time');
  check('achievements: panel shows the unlock count', false, 'not on menu at check time');
  check('achievements: lifetime stats line rendered', false, 'not on menu at check time');
  check('achievements: CLOSE hides the panel', false, 'not on menu at check time');
}
// Lifetime stats persisted across the run.
const life = JSON.parse(global.localStorage.getItem('nvb-lifetime') || '{}');
check('stats: lifetime runs recorded', (life.runs || 0) >= 1, 'runs=' + life.runs);
check('stats: lifetime bricks recorded', (life.bricks || 0) > 100, 'bricks=' + life.bricks);
check('stats: lifetime best combo recorded', (life.bestCombo || 0) >= 3, 'bestCombo=' + life.bestCombo);
check('stats: achievements persisted in localStorage',
  (JSON.parse(global.localStorage.getItem('nvb-achievements') || '[]').length || 0) >= 10,
  'unlocked=' + JSON.parse(global.localStorage.getItem('nvb-achievements') || '[]').length);
// #44: shake stayed off for the whole playtest (toggled off pre-playtest).
check('settings: shake off means zero shake all run (max ' + obs.maxShakeSeen.toFixed(2) + ')',
  obs.maxShakeSeen === 0, 'maxShake=' + obs.maxShakeSeen.toFixed(2));
check('settings: volume/music/shake persisted after the run',
  global.window.__nvbPerf.settings.volume === 0.5
  && global.window.__nvbPerf.settings.music === true
  && global.window.__nvbPerf.settings.shake === false);

console.log('== Block 17 (#21 moving, #22 exploding, #23 regen bricks + boss music) ==');
check('bricks: moving bricks appear in the run (kinds seen)', obs.kindsSeen.moving);
check('bricks: exploding bricks appear in the run (kinds seen)', obs.kindsSeen.explosive);
check('bricks: regen bricks appear in the run (kinds seen)', obs.kindsSeen.regen);
check('movers: a moving brick actually slid (x-only signature shift, score/level/count unchanged)',
  obs.moverMoved);
check('movers: slide range + speed + home columns in source',
  SRC.includes('MOVER_SPEED') && SRC.includes('MOVER_RANGE') && SRC.includes('homeX')
  && SRC.includes('moveDir'));
check('explosive: a chain explosion fired (chains=' + obs.chains + ')', obs.chains > 0,
  'chains=' + obs.chains);
check('explosive: the chain destroyed extra bricks (chainKills=' + obs.chainKills + ')',
  obs.chainKills > 0, 'chainKills=' + obs.chainKills);
check('explosive: chain damages neighbours via damageBrick',
  SRC.includes('function explodeBrick') && SRC.includes('CHAIN_GAP') && SRC.includes('damageBrick(br)'));
check('explosive: chain that clears the level returns early (no double clear)',
  SRC.includes("explodeBrick(b) === 'clear'"));
check('regen: a brick regenerated (regens=' + obs.regens + ', 2s harness delay)',
  obs.regens > 0, 'regens=' + obs.regens);
check('regen: respawn capped at 2 per brick in source',
  SRC.includes('REGEN_MAX = 2') && SRC.includes('respawnsLeft'));
check('regen: ghost outline + refill bar render while counting down',
  SRC.includes('respawnIn') && SRC.includes('REGENERATED!'));
check('music: boss fight uses darker chords (BOSS_CHORDS Am-F-E-G)',
  SRC.includes('BOSS_CHORDS') && SRC.includes('[52, 56, 59]'));
check('music: boss fight holds intensity at ×3 or higher',
  SRC.includes("(boss && boss.alive) ? 3 : 1"));
check('bricks: kinds + counters exposed via __nvbMeta',
  SRC.includes('get kinds()') && SRC.includes('get chains()') && SRC.includes('get regens()'));

console.log('== Block 18 (#49 save/restore, #62 human-bot balance) ==');
check('save: __nvbSave exposed (has/save/restore/clear/read/refresh)',
  !!global.window.__nvbSave && typeof global.window.__nvbSave.has === 'function'
  && typeof global.window.__nvbSave.save === 'function'
  && typeof global.window.__nvbSave.restore === 'function'
  && typeof global.window.__nvbSave.clear === 'function'
  && typeof global.window.__nvbSave.read === 'function'
  && typeof global.window.__nvbSave.refresh === 'function');
check('save: saveRun + restoreSave + versioned key + beforeunload in source',
  SRC.includes('function saveRun') && SRC.includes('function restoreSave')
  && SRC.includes("SAVE_KEY = 'nvb-save'") && SRC.includes('SAVE_VERSION = 1')
  && SRC.includes("beforeunload"));
check('save: fresh run clears the save, game over clears the save (source)',
  SRC.includes('clearSave(); // #49: a fresh run abandons any saved run')
  && SRC.includes('clearSave(); // #49: the run is over'));
check('save: pause checkpoints, fresh level checkpoints, 5s autosave (source)',
  SRC.includes('saveRun(); // #49: pausing checkpoints the run')
  && SRC.includes('saveRun(); // #49: a fresh level is a clean restore point')
  && SRC.includes('if (saveTimer >= 5)'));
check('save: CONTINUE button in the menu HTML',
  html.includes('id="continueBtn"') && html.includes('CONTINUE'));
check('save: CONTINUE button hides by class (style rule present)',
  fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').includes('#continueBtn.hidden'));
check('balance: speed ramp saturates over ~2 levels, not inside level 1',
  SRC.includes('Math.min(120, bricksBrokenRun * 1)')
  && !SRC.includes('Math.min(120, bricksBrokenRun * 2)'));
check('balance: level 2 first well bends gently (0.6)',
  SRC.includes("{ x: 200, y: 340, bend: 0.6 }"));
// Runtime save/restore: start a run, play until some bricks are broken,
// checkpoint, quit to the menu, and CONTINUE back into the same run.
let saveOk = false, savedScore = 0, savedLevel = 0, savedAlive = 0, savedJson = '';
if (overlayVisible('menuOverlay')) {
  // Re-baseline BEFORE the restart keypress (same reason as the main
  // loop): startRun zeroes the score, which the NaN detector would
  // otherwise read as a bogus "score decreased" event.
  resetRunTracking();
  elementsById.playBtn.click(); pump(3);
  let r18 = aiPlay(2500);
  let g18 = 0;
  while ((r18 === 'clear' || r18 === 'draft') && g18++ < 12) {
    if (r18 === 'clear') { if (!advanceLevel()) break; }
    else key('Digit2');
    pump(10);
    r18 = aiPlay(2500);
  }
  if (!overlayVisible('menuOverlay') && !overlayVisible('gameOverOverlay')
    && !overlayVisible('draftOverlay') && !overlayVisible('levelOverlay')) {
    saveOk = global.window.__nvbSave.save();
    const s18 = global.window.__nvbSave.read();
    savedScore = score(); savedLevel = level();
    savedAlive = s18 ? s18.bricks.filter((b) => b.alive).length : -1;
    savedJson = global.localStorage.getItem('nvb-save') || '';
  }
}
check('save: checkpoint writes a v1 save to localStorage',
  saveOk === true && savedJson.indexOf('"v":1') >= 0 && savedScore > 0,
  'score=' + savedScore + ' level=' + savedLevel + ' alive=' + savedAlive);
check('save: CONTINUE button shows the saved level + score',
  !elementsById.continueBtn.classList.contains('hidden')
  && (elementsById.continueBtn.textContent || '').indexOf('LEVEL ' + savedLevel) >= 0,
  'label=' + JSON.stringify(elementsById.continueBtn.textContent));
// A corrupt save must be rejected (button hides) and the good save must
// come back when it is written again — the menu never offers a bad run.
global.localStorage.setItem('nvb-save', 'not-json{{{');
global.window.__nvbSave.refresh();
check('save: a corrupt save is rejected and hides CONTINUE',
  global.window.__nvbSave.has() === false
  && elementsById.continueBtn.classList.contains('hidden'));
global.localStorage.setItem('nvb-save', savedJson);
global.window.__nvbSave.refresh();
check('save: the good save is recognised again after the corrupt one',
  global.window.__nvbSave.has() === true
  && !elementsById.continueBtn.classList.contains('hidden'));
// Quit to the menu (P pauses, Q quits), then CONTINUE back in. The quit
// zeroes the score on purpose — re-baseline AFTER the pause pumps and
// immediately before the Q, because observe() re-syncs its prevScore on
// every pumped frame (a reset before the pumps is already stale by Q).
key('KeyP'); pump(2);
const paused18 = overlayVisible('pauseOverlay');
if (paused18) { resetRunTracking(); key('KeyQ'); pump(2); }
const onMenu18 = overlayVisible('menuOverlay') && score() === 0;
elementsById.continueBtn.click(); pump(5);
const meta18 = global.window.__nvbMeta;
const restoredAlive = meta18 ? meta18.levelSig.split(',').filter(Boolean).length : -1;
check('save: P pauses, Q quits to the menu', paused18 && onMenu18);
check('save: CONTINUE restores the run (score/level/bricks)',
  !overlayVisible('menuOverlay') && score() === savedScore && level() === savedLevel
  && restoredAlive === savedAlive,
  'score=' + score() + '/' + savedScore + ' level=' + level() + '/' + savedLevel
  + ' alive=' + restoredAlive + '/' + savedAlive);
let serving18 = false;
for (let i = 0; i < 10; i++) { pump(1); serving18 = servingNow(); }
check('save: restored run is serving (ball glued to the paddle)', serving18 === true,
  'ball=' + JSON.stringify(ballPos()));
// The restored run must actually play: drive it briefly, then start a
// fresh run and confirm the save is gone (PLAY abandons the old run).
let r18b = aiPlay(2500);
let g18b = 0;
while ((r18b === 'clear' || r18b === 'draft') && g18b++ < 12) {
  if (r18b === 'clear') { if (!advanceLevel()) break; } else key('Digit2');
  pump(10);
  r18b = aiPlay(2500);
}
check('save: restored run plays on (no new tunnel/NaN events)',
  obs.tunnelBugs.length === 0 && obs.nanEvents.length === 0,
  'tunnel=' + obs.tunnelBugs.length + ' nan=' + obs.nanEvents.length
  + (obs.nanEvents.length ? ' (' + obs.nanEvents.slice(0, 2).join(' | ') + ')' : ''));
key('KeyP'); pump(2);
if (overlayVisible('pauseOverlay')) { resetRunTracking(); elementsById.restartBtnPause.click(); pump(3); }
else if (overlayVisible('gameOverOverlay')) { resetRunTracking(); elementsById.againBtn.click(); pump(3); }
else if (overlayVisible('menuOverlay')) { elementsById.playBtn.click(); pump(3); }
check('save: starting a fresh run clears the save',
  global.window.__nvbSave.has() === false
  && elementsById.continueBtn.classList.contains('hidden'));

console.log('\n== coverage report ==');
console.log('attempts: ' + JSON.stringify(attemptResults));
console.log('levels cleared: ' + JSON.stringify(obs.levelsCleared) + ' (max level reached ' + obs.maxLevel + ')');
console.log('final score: ' + obs.finalScore + ' · max combo ×' + obs.maxCombo);
console.log('powerups: caught=' + obs.powerupsCaught + ' laser=' + obs.laserSeen + ' slow=' + obs.slowSeen
  + ' shield=' + obs.shieldSeen + ' saved=' + obs.shieldSaved + ' bolts=' + obs.laserBolts
  + ' slowAvg=' + slowAvg.toFixed(2) + 'px normalAvg=' + normalAvg.toFixed(2) + 'px');
console.log('block 12: fire=' + obs.fireSeen + ' fireHud=' + obs.fireHud + ' pierced=' + obs.firePierced
  + ' chips=' + obs.chipsSeen + ' confettiRects=' + obs.confettiRects);
console.log('powerups caught: ' + obs.powerupsCaught + ' · swallows: ' + obs.swallows
  + ' · VOID PULL warnings: ' + obs.pullWarns);
console.log('well bend: ' + obs.bend.toFixed(2) + ' rad over ' + obs.bendSamples + ' in-zone samples');
console.log('boss: awakened=' + obs.bossAwaken + ' destroyed=' + obs.bossDestroyed
  + ' · fire seen=' + obs.fireSeen);
console.log('block 14: srAnnounced=' + obs.srAnnounced
  + ' · perf fps=' + (global.window.__nvbPerf && global.window.__nvbPerf.fps.toFixed(1))
  + ' lowPerf=' + (global.window.__nvbPerf && global.window.__nvbPerf.lowPerf));
console.log('block 15: seed=' + (global.window.__nvbMeta && global.window.__nvbMeta.seed)
  + ' daily=' + (global.window.__nvbMeta && global.window.__nvbMeta.dailySeed)
  + ' levels=' + (global.window.__nvbMeta && global.window.__nvbMeta.levels)
  + ' · bomb seen=' + obs.bombSeen + ' detonations=' + obs.bombCount
  + ' maxDelta=' + obs.bombMaxDelta + ' broke=' + obs.bombBroke);
console.log('block 16: achievements unlocked=' + (global.window.__nvbAch && global.window.__nvbAch.unlocked.length)
  + '/' + (global.window.__nvbAch && global.window.__nvbAch.total)
  + ' · toastSeen=' + obs.achToastSeen + ' · maxShake=' + obs.maxShakeSeen.toFixed(2)
  + ' · lifetime=' + JSON.stringify(global.window.__nvbAch && global.window.__nvbAch.lifetime));
console.log('block 17: kinds seen=' + JSON.stringify(obs.kindsSeen)
  + ' · moverMoved=' + obs.moverMoved + ' · chains=' + obs.chains
  + ' chainKills=' + obs.chainKills + ' · regens=' + obs.regens);
console.log('block 18: save=' + JSON.stringify(global.window.__nvbSave && global.window.__nvbSave.read() ? { level: global.window.__nvbSave.read().level, score: global.window.__nvbSave.read().score } : null)
  + ' · continueBtn=' + JSON.stringify(elementsById.continueBtn.textContent));
console.log('brick signatures: boot=' + JSON.stringify(obs.bootSig)
  + ' attempts=' + JSON.stringify(obs.brickSigs));
console.log('paddle crossings: ' + obs.crossings + ' · bounces: ' + obs.bounces
  + ' · unresolved: ' + obs.unresolvedCrossings + ' · lost despite tracking: ' + obs.lostDespiteTracking);
console.log('frames simulated: ' + obs.frames);

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
if (failures.length) console.log('failures: ' + failures.join(' | '));
for (const id of intervals) clearInterval(id);
for (const id of timeouts) clearTimeout(id);
process.exit(fail ? 1 : 0);
