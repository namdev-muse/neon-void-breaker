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
const SRC12 = SRC
  .replace("if (Math.random() >= (chance || POWERUP_DROP_CHANCE)) return;", "")
  .replace("const type = r < 0.22 ? 'multi' : r < 0.40 ? 'wide' : r < 0.58 ? 'laser' : r < 0.71 ? 'slow' : r < 0.85 ? 'shield' : 'fire';",
    "const type = ['laser','slow','shield','multi','wide','fire'][(global.__pu = (global.__pu || 0) + 1) % 6];")
  .replace("const mag = upgradesOwned.magnet || 0;", "const mag = 3;");
if (SRC12 === SRC || SRC12.indexOf("global.__pu") < 0) { console.log('PATCH FAILED'); process.exit(2); }

const ATTEMPTS = parseInt(process.argv[2] || '2', 10) || 2;
const MAX_FRAMES = parseInt(process.argv[3] || '160000', 10) || 160000;

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
  'quitBtnPause', 'againBtn', 'menuBtnOver'];
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
  maxStep: 0, crossings: 0, bounces: 0, unresolvedCrossings: 0, lostDespiteTracking: 0,
  levelsCleared: [], maxLevel: 1, finalScore: 0,
};
let prevBall = null, prevLives = 3, prevScore = 0, prevAngle = null, prevInZone = false;
let fireCheckFrame = -1, fireAngleBefore = 0; // Block 12: pierce check state
let frozenFrames = 0, pendingCrossing = null, prevLevelOverlay = false;
let prevTexts = new Set();
let prevLevelObs = 1;
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
  return ['pauseOverlay', 'levelOverlay', 'gameOverOverlay', 'draftOverlay', 'menuOverlay']
    .some((id) => overlayVisible(id));
}
function powerHTML() { const el = elementsById.power; return (el.innerHTML || el.textContent || ''); }
function score() { return parseInt(elementsById.score.textContent, 10) || 0; }
function level() { return parseInt(elementsById.level.textContent, 10) || 0; }
function lives() { return (elementsById.lives.textContent.match(/●/g) || []).length; }

function observe() {
  const b = ballPos();
  const lv = level(), sc = score(), lvN = lives();
  if (lv > obs.maxLevel) obs.maxLevel = lv;
  const scoreJump = sc > prevScore;
  if (sc < prevScore) obs.nanEvents.push('score decreased ' + prevScore + ' -> ' + sc);
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
    else if (t === 'MULTI-BALL!' || t === 'WIDE PADDLE!' || t === 'LASER PADDLE!' || t === 'SLOW-MO!' || t === 'SHIELD UP!' || t === 'FIREBALL!') obs.powerupsCaught++;
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
    if (step > MAX_STEP) obs.speedViolations++;
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

// Play one attempt until game over, level 6 cleared, or the frame budget
// runs out. Returns 'clear' | 'over' | 'timeout' | 'menu'.
function aiPlay(maxFrames) {
  let frames = 0;
  while (frames < maxFrames) {
    if (overlayVisible('menuOverlay')) return 'menu';
    if (overlayVisible('gameOverOverlay')) return 'over';
    if (overlayVisible('levelOverlay')) { dropTest = false; return 'clear'; }
    if (overlayVisible('pauseOverlay')) { key('KeyR'); pump(2); frames += 2; continue; }
    if (overlayVisible('draftOverlay')) return 'draft';
    const pw = powerHTML();
    if (!laserTested && pw.indexOf('LASER') >= 0) {
      laserTested = true;
      const before = obs.laserBolts;
      key('Space', bodyEl); pump(5); frames += 5;
      obs.laserFireOk = obs.laserBolts > before;
    }
    if (!shieldTested && level() === 1 && pw.indexOf('SHIELD') >= 0 && !dropTest) {
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

console.log('== boot ==');
check('boot: menu overlay visible', overlayVisible('menuOverlay'));
check('boot: PLAY button focused', document.activeElement === elementsById.playBtn);

console.log('== tunnel audit, source level (#47, #48) ==');
// The audit's static leg: the substep must be <= 1/3 of the thinnest
// collider (paddle, 12px) so no collider can be jumped in one substep,
// and the swept paddle test + NaN guard must be present in the code.
check('audit: substep STEP_PX = BALL_R / 2 (4px)', SRC.includes('const STEP_PX = BALL_R / 2'));
check('audit: swept paddle crossing test present', SRC.includes('crossX') && SRC.includes('swept'));
check('audit: NaN velocity guard present', SRC.includes('Number.isFinite(ball.vx)'));

console.log('== HTML ==');
const html = fs.readFileSync(HTML, 'utf8');
check('HTML: version v0.12.0', html.includes('v0.12.0'));

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
  while (result === 'clear' && guard++ < 8) {
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
check('detector: paddle-line crossings were exercised', obs.crossings > 20,
  'crossings=' + obs.crossings + ' bounces=' + obs.bounces);
check('detector: every crossing bounced, none lost (crossings=' + obs.crossings + ', bounces=' + obs.bounces + ', shieldSaves=' + obs.shieldSaves + ', dropped=' + obs.droppedCrossings + ', unresolved=' + obs.unresolvedCrossings + ')',
  obs.crossings > 0 && obs.bounces + obs.shieldSaves >= obs.crossings - obs.unresolvedCrossings - obs.droppedCrossings - 1 && obs.tunnelBugs.length === 0 && obs.lostDespiteTracking === 0,
  obs.tunnelBugs.slice(0, 3).join(' | ') || ('lostDespiteTracking=' + obs.lostDespiteTracking));
check('detector: no stuck balls', obs.stuckEvents === 0, 'stuckEvents=' + obs.stuckEvents);
check('detector: no NaN observations', obs.nanEvents.length === 0, obs.nanEvents.slice(0, 3).join(' | '));
check('detector: max per-frame ball step <= ' + MAX_STEP.toFixed(1) + 'px (max speed 680)',
  obs.maxStep <= MAX_STEP, 'maxStep=' + obs.maxStep.toFixed(2) + 'px, violations=' + obs.speedViolations);

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
console.log('paddle crossings: ' + obs.crossings + ' · bounces: ' + obs.bounces
  + ' · unresolved: ' + obs.unresolvedCrossings + ' · lost despite tracking: ' + obs.lostDespiteTracking);
console.log('frames simulated: ' + obs.frames);

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
if (failures.length) console.log('failures: ' + failures.join(' | '));
for (const id of intervals) clearInterval(id);
for (const id of timeouts) clearTimeout(id);
process.exit(fail ? 1 : 0);
