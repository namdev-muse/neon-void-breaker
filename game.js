'use strict';
/* Neon Void Breaker — core engine (Sprint Block 1)
   Vanilla Canvas 2D + Web Audio synth. No dependencies, no build step.
   Paddle / ball / bricks, combos, particles, screen shake, levels, lives. */
(() => {
  // ---------- Config ----------
  const W = 720, H = 540;
  const PADDLE_H = 12, PADDLE_Y = H - 36;
  const PADDLE_SPEED = 560;
  const BALL_R = 8;
  const BASE_SPEED = 380;
  const MAX_SPEED = 680;
  const COMBO_WINDOW = 2.5;
  const BEST_KEY = 'nvb-best';
  const MUTE_KEY = 'nvb-muted';

  // '1' = 50pts hp1 cyan, '2' = 100pts hp2 pink, '3' = 150pts hp3 amber, '.' = empty
  // 'E' = 300pts hp5 elite violet (backlog #20: armored elite rows)
  const LEVELS = [
    [
      '111111111111',
      '122222222221',
      '123333333321',
      '122222222221',
      '111111111111',
    ],
    [
      '1..333333..1',
      '.1222222221.',
      '..13333333..',
      '..13333333..',
      '.1222222221.',
      '1..333333..1',
    ],
    [
      '.....33.....',
      '....3333....',
      '...322223...',
      '..32222223..',
      '.3222222223.',
      '333333333333',
      '111111111111',
    ],
    // Level 4 — STARFORGE: an elite armored row (#20) over a soft core.
    [
      'EEEEEEEEEEEE',
      '2..........2',
      '211111111112',
      '212222222212',
      '212333333212',
      '212222222212',
      '211111111112',
    ],
    // Level 5 — GRAVITY WELL: concentric rings, the void pulls inward.
    [
      '333333333333',
      '3..........3',
      '3.22222222.3',
      '3.21111112.3',
      '3.21333312.3',
      '3.21111112.3',
      '3.22222222.3',
      '3..........3',
      '333333333333',
    ],
    // Level 6 — THE CORE: the densest wall in the void. Bring your best combo.
    [
      '333333333333',
      '222222222222',
      'E3333333333E',
      '231111111132',
      '231233332132',
      '231111111132',
      '233333333332',
      '222222222222',
    ],
  ];
  // Level names + flavor lines shown on the intro card (backlog #25).
  const LEVEL_NAMES = [
    'FIRST CONTACT', 'NEBULA CROSS', 'VOID SPIRE',
    'STARFORGE', 'GRAVITY WELL', 'THE CORE',
  ];
  const LEVEL_FLAVOR = [
    'Warm up your paddle. The void is watching.',
    'The nebula bends. Trust your angles.',
    'The spire hums with void energy.',
    'Armored shell, soft heart. Crack it open.',
    'Rings within rings — the pull grows stronger.',
    'The final wall. Break the Core, break the void.',
  ];
  const BRICK_COLORS = { 1: '#00f0ff', 2: '#ff2d95', 3: '#ffb300', 5: '#e040fb' };
  const BRICK_SCORE = { 1: 50, 2: 100, 3: 150, 5: 300 };
  // #20: elite bricks are armored (hp 5) and worth 300; they also drop
  // powerups twice as often as normal bricks.
  const ELITE_HP = 5;
  const ELITE_DROP_CHANCE = 0.25;

  // ---------- Mini-boss: the Void Core (backlog #24) ----------
  // At the end of level 5, once every normal brick is broken, the Void
  // Core awakens — one big brick (240x40) with 12 HP and a 1500-point
  // bounty. The level only clears when the Core is destroyed, so the
  // boss is the final gate of the level, not a brick you can skip past.
  // It sits at the top of a cleared field, pulses violet, and carries
  // its own HP bar above it (plus a top-of-screen boss bar).
  const BOSS_LEVEL = 5;
  const BOSS_HP = 12;
  const BOSS_W = 240, BOSS_H = 40;
  const BOSS_SCORE = 1500;
  const BOSS_COLOR = '#ff4d6d';
  const BOSS_NAME = 'VOID CORE';

  // ---------- Void wells (backlog #14, #15, #17) ----------
  // The signature mechanic: black holes that bend the ball's trajectory
  // (#14) and swallow it if it crosses the event horizon (#15). The bend
  // rotates the ball's velocity toward the center, strongest close in
  // (quadratic falloff, so distant passes barely bend), and is always
  // weaker than the turn rate a stable orbit would need, so a ball either
  // escapes or spirals in; it can never orbit forever. A well only hunts
  // while awake — it wakes for 2.5s of every 8s cycle, stirs visibly for
  // 1s before waking (the telegraph ring brightens), and sleeps dimmed
  // the rest of the time, so the player can time shots around it. After
  // a swallow the maw is sated for 5s (no pull, no swallow, dimmed) so
  // one bad bounce can't eat the whole run. Wells on the same level wake
  // on staggered phases so they never all fire at once. Level 1 has no
  // wells — the void hasn't woken up yet. Later levels place 1–2 wells
  // below the brick field, off the serve line except on level 5, GRAVITY
  // WELL, where one big maw sits dead center. Tuning note: the first
  // always-on version ate all 3 of a perfect-tracking AI's lives on
  // level 2 (bend 2.0 / horizon 18); the pulsing version still did
  // (bend 1.6 / horizon 14) — a well in the ball's transit corridor gets
  // dozens of capture chances per level, so the bend has to stay gentle
  // (0.8) with a small horizon (12) and a 1.2s launch shield, and the
  // serve respawns at center after a swallow. Even so the AI lost 2–3
  // balls per level-2 attempt, so each well eats at most one ball per
  // level (WELL_MAX_MEALS): once fed it only bends the ball, harmlessly,
  // for the rest of the level, and the hazard can never end a run alone.
  const WELL_PULL_R = 120;   // telegraph ring: gravity reaches this far
  const WELL_HORIZON = 12;   // event horizon: closer than this = swallowed
  const WELL_BEND = 0.8;     // max bend rate, radians per second (at core)
  const WELL_MAX_MEALS = 1;  // balls a well can swallow per level
  const WELL_CORE_R = 15;    // black core radius (drawn)
  const WELL_RING_R = 30;    // accretion ring radius (drawn)
  const WELL_SATED_SECS = 5; // cooldown after a swallow
  const WELL_CYCLE = 8;      // wake-cycle length, seconds
  const WELL_ACTIVE = 2.5;   // seconds awake per cycle (last part of it)
  const WELL_STIR = 1.0;     // seconds of visible stirring before waking
  const VOID_WELLS = [
    [],
    [{ x: 200, y: 340 }],
    [{ x: 520, y: 360 }],
    [{ x: 200, y: 350 }, { x: 520, y: 350 }],
    [{ x: 360, y: 380, pullR: 150, horizon: 12, bend: 1.2 }],
    [{ x: 180, y: 340 }, { x: 540, y: 340 }],
  ];

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), bestEl = $('best'), levelEl = $('level');
  const livesEl = $('lives'), comboEl = $('combo'), powerEl = $('power');
  const menuOverlay = $('menuOverlay'), pauseOverlay = $('pauseOverlay');
  const levelOverlay = $('levelOverlay'), gameOverOverlay = $('gameOverOverlay');
  const introOverlay = $('introOverlay');
  const draftOverlay = $('draftOverlay'), draftCardsEl = $('draftCards');
  const introLevel = $('introLevel'), introName = $('introName'), introFlavor = $('introFlavor');
  const levelTitle = $('levelTitle'), levelStats = $('levelStats');
  const gameOverTitle = $('gameOverTitle'), gameOverStats = $('gameOverStats');
  const nextLevelBtn = $('nextLevelBtn');
  const muteBtn = $('muteBtn'), pauseBtn = $('pauseBtn');
  const pauseStats = $('pauseStats');
  const menuScoresEl = $('menuScores'), gameOverScoresEl = $('gameOverScores');
  const playBtn = $('playBtn'), resumeBtn = $('resumeBtn');
  const againBtn = $('againBtn');

  // #41: keyboard focus helpers — overlays focus their primary action so a
  // keyboard-only player never has to hunt with Tab from the top of the page.
  function focusEl(el) { if (el && el.focus) el.focus(); }
  function blurActive() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // Crisp rendering on high-DPI screens.
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();

  // ---------- State ----------
  let mode = 'menu'; // menu | serving | playing | paused | levelclear | draft | gameover
  let pausedFrom = 'playing';
  let score = 0, best = 0, lives = 3, level = 1;
  let combo = 0, comboTimer = 0, bricksBrokenRun = 0;
  let runStart = 0;
  let bricks = [];
  let particles = [];
  let texts = [];
  let shake = 0;
  let hitStop = 0;   // #26: micro-freeze timer (seconds) after big breaks
  let rings = [];    // #28: expanding shockwave rings
  let flashes = [];  // #27: impact flashes over bricks just hit
  const HITSTOP_MAX = 0.09;
  const SHAKE_MAX = 14;
  let paddleVel = 0;

  const paddle = { x: (W - 96) / 2, w: 96, targetX: null };
  let balls = [];      // active balls (multi-ball can grow this to 5)
  let powerups = [];   // falling capsules {x, y, type, vy}
  let wells = [];      // active void wells for this level (#14, #15, #17)
  let boss = null;     // the live Void Core brick, once awakened (#24)
  let bossSpawned = false; // the Core woke this level (once per level)
  let fireAnnounced = false; // #31: 'ON FIRE!' shown once per hot streak
  let launchGrace = 0; // seconds after a launch during which wells can't
  // touch the ball — without this, a ball swallowed by the well respawns
  // on a paddle parked under the well and feeds itself straight back in.
  let wideTimer = 0;   // seconds of wide paddle remaining
  let lastPowerText = '—';

  // Powerup defs (backlog #1, #2, #7): glyph drawn on the capsule.
  const POWERUP_TYPES = {
    multi: { label: 'MULTI-BALL', color: '#b6ff00', glyph: 'M' },
    wide: { label: 'WIDE PADDLE', color: '#00f0ff', glyph: 'W' },
  };
  const POWERUP_DROP_CHANCE = 0.12; // per brick destroyed
  const MAX_BALLS = 5;
  const PADDLE_W = 96, WIDE_DURATION = 15;

  // Roguelite upgrade pool (backlog #9, #10): drafted 1-of-3 between levels.
  // life +1 life (max 5) · paddle +18px permanent width · control −8% ball
  // speed · score +25% brick score · magnet pulls capsules to the paddle ·
  // balls +1 ball served each level. 'bonus' fills the draft when the pool
  // runs dry: an instant +500 score cache.
  const MAX_LIVES = 5;
  const UPGRADES = {
    life: { name: 'EXTRA LIFE', glyph: '♥', desc: '+1 life, up to 5 total', color: '#ff2d95', max: 2 },
    paddle: { name: 'WIDE PADDLE', glyph: '═', desc: '+18px paddle width, permanent', color: '#00f0ff', max: 3 },
    control: { name: 'BALL CONTROL', glyph: '◐', desc: 'Ball flies 8% slower, easier angles', color: '#b6ff00', max: 3 },
    score: { name: 'SCORE BOOST', glyph: '★', desc: '+25% score from every brick', color: '#ffb300', max: 3 },
    magnet: { name: 'MAGNET PADDLE', glyph: '◎', desc: 'Powerup capsules drift toward you', color: '#8b5cff', max: 2 },
    balls: { name: 'TWIN LAUNCH', glyph: '●●', desc: 'Serve +1 ball at every level start', color: '#00ffa3', max: 2 },
  };
  const BONUS_UPGRADE = { name: 'VOID CACHE', glyph: '◆', desc: '+500 score, instantly', color: '#b6ff00' };
  let upgradesOwned = {};
  let draftChoices = [];

  // Run stats (backlog #11): best combo, bricks, paddle returns, shot
  // accuracy (a "shot" is a paddle return that then hits a brick), powerups.
  let stats = { bestCombo: 0, bricksBroken: 0, brickHits: 0, paddleHits: 0, ballsLost: 0, shotsTotal: 0, shotsHit: 0, powerupsCaught: 0, powerupsMissed: 0 };
  let shotPending = false;
  function resetStats() {
    stats = { bestCombo: 0, bricksBroken: 0, brickHits: 0, paddleHits: 0, ballsLost: 0, shotsTotal: 0, shotsHit: 0, powerupsCaught: 0, powerupsMissed: 0 };
    shotPending = false;
  }

  try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { best = 0; }

  // Starfield backdrop.
  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.6 + 0.4,
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.6,
  }));

  // ---------- Audio (Web Audio synth, no assets) ----------
  let actx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  function ensureAudio() {
    if (actx) {
      if (actx.state === 'suspended') actx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.32;
      master.connect(actx.destination);
      // #32: dedicated music bus (so SFX and music can be balanced separately).
      musicGain = actx.createGain();
      musicGain.gain.value = 0.42;
      musicGain.connect(master);
      // 1s white-noise buffer shared by hats, explosions and void whooshes.
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      startMusic();
    } catch (e) { actx = null; }
  }

  // ---------- Music engine (#32, #33) ----------
  // Lookahead scheduler: a 30ms timer schedules eighth-note steps ~0.15s
  // ahead, so the loop stays tight even when the frame rate wobbles.
  // Progression: Am – F – C – G, bass + arpeggio, all synthesized.
  let musicGain = null, noiseBuf = null;
  let musicTimer = null, musicStep = 0, musicNext = 0;
  const MUSIC_BPM = 116;
  const MUSIC_STEP = 60 / MUSIC_BPM / 2; // eighth notes
  const MUSIC_CHORDS = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 55, 60], // C
    [55, 59, 62], // G
  ];
  const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function musicNote(freq, when, dur, type, gain) {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(musicGain);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  function noiseHit(when, dur, gain, dest) {
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(g); g.connect(dest || musicGain);
    src.start(when); src.stop(when + dur + 0.05);
  }

  // #33: intensity follows the combo multiplier (×1–×5). Higher combos add
  // hats (×2), sparkle notes (×3) and a double-time arp echo (×4+), so the
  // music audibly heats up as the run heats up.
  function scheduleStep(step, when) {
    const bar = Math.floor(step / 8) % MUSIC_CHORDS.length;
    const chord = MUSIC_CHORDS[bar];
    const inBar = step % 8;
    const intensity = mult();
    // Bass: root an octave down on beats 1 and 3 of the bar.
    if (inBar === 0 || inBar === 4) {
      musicNote(midiToFreq(chord[0] - 12), when, 0.42, 'triangle', 0.30);
    }
    // Arpeggio: one chord tone per eighth note, one octave up.
    const arpTone = chord[ARP_PATTERN[inBar]];
    musicNote(midiToFreq(arpTone + 12), when, 0.2, 'triangle', 0.11);
    if (intensity >= 2 && inBar % 2 === 1) {
      noiseHit(when, 0.04, 0.05); // hats on the offbeats
    }
    if (intensity >= 3 && (inBar === 2 || inBar === 6)) {
      musicNote(midiToFreq(arpTone + 24), when, 0.14, 'sine', 0.07); // sparkle
    }
    if (intensity >= 4) {
      // Double-time echo: the next arp tone lands halfway through the step.
      const nextTone = chord[ARP_PATTERN[(inBar + 1) % 8]];
      musicNote(midiToFreq(nextTone + 12), when + MUSIC_STEP / 2, 0.14, 'triangle', 0.06);
    }
  }

  function scheduleMusic() {
    if (!actx || !musicGain) return;
    if (mode === 'paused') { musicNext = actx.currentTime + 0.05; return; }
    if (muted) { musicNext = actx.currentTime + 0.05; return; }
    while (musicNext < actx.currentTime + 0.15) {
      scheduleStep(musicStep, musicNext);
      musicStep++;
      musicNext += MUSIC_STEP;
    }
  }

  function startMusic() {
    if (musicTimer || !actx) return;
    musicStep = 0;
    musicNext = actx.currentTime + 0.06;
    musicTimer = setInterval(scheduleMusic, 30);
  }

  function tone(freq, opts) {
    if (!actx || muted) return;
    const o = opts || {};
    const dur = o.dur || 0.12;
    const type = o.type || 'sine';
    const gain = o.gain || 0.5;
    const when = actx.currentTime + (o.delay || 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(master);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  const sfx = {
    paddle() { tone(240, { dur: 0.09, type: 'square', gain: 0.28, slideTo: 380 }); },
    wall() { tone(180, { dur: 0.05, type: 'triangle', gain: 0.2 }); },
    launch() { tone(330, { dur: 0.14, type: 'sine', gain: 0.35, slideTo: 660 }); },
    brick(c) {
      const base = 520 + Math.min(c, 20) * 22;
      tone(base, { dur: 0.1, type: 'triangle', gain: 0.4, slideTo: base * 1.5 });
      tone(base * 2, { dur: 0.07, type: 'sine', gain: 0.18 });
    },
    damage() { tone(300, { dur: 0.07, type: 'square', gain: 0.22, slideTo: 220 }); },
    lose() {
      tone(320, { dur: 0.22, type: 'sawtooth', gain: 0.3, slideTo: 90 });
      tone(160, { dur: 0.3, type: 'triangle', gain: 0.25, slideTo: 60, delay: 0.08 });
    },
    // #34: the void swallows a lost ball — a long downward whoosh.
    voidSwallow() {
      tone(620, { dur: 0.6, type: 'sine', gain: 0.4, slideTo: 55 });
      tone(310, { dur: 0.5, type: 'triangle', gain: 0.2, slideTo: 40, delay: 0.05 });
      if (actx && !muted) noiseHit(actx.currentTime, 0.45, 0.16, master);
    },
    // #34: laser zap — reserved for the laser paddle powerup (#3).
    laser() {
      tone(1500, { dur: 0.12, type: 'square', gain: 0.22, slideTo: 190 });
      tone(2900, { dur: 0.07, type: 'sawtooth', gain: 0.1, slideTo: 900 });
    },
    // #34: explosion — noise burst plus a low sub drop.
    explosion() {
      if (actx && !muted) noiseHit(actx.currentTime, 0.5, 0.3, master);
      tone(130, { dur: 0.5, type: 'sawtooth', gain: 0.4, slideTo: 38 });
      tone(65, { dur: 0.55, type: 'sine', gain: 0.35, slideTo: 30, delay: 0.03 });
    },
    clear() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.16, type: 'triangle', gain: 0.32, delay: i * 0.09 }));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, { dur: 0.24, type: 'triangle', gain: 0.3, delay: i * 0.14 }));
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { dur: 0.2, type: 'triangle', gain: 0.32, delay: i * 0.1 }));
    },
    powerup() {
      // #34: brighter rising arpeggio so a catch reads instantly.
      [660, 880, 1320, 1760].forEach((f, i) => tone(f, { dur: 0.12, type: 'triangle', gain: 0.3, delay: i * 0.06 }));
    },
  };

  function updateMuteBtn() {
    muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    updateMuteBtn();
  }

  // ---------- Helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mult = () => Math.min(5, 1 + Math.floor(combo / 6));
  // Difficulty curve (backlog #13): ball speed ramps steeply with level and
  // with bricks broken this run; the combo window tightens on later levels.
  // #10: BALL CONTROL stacks slow the ball 8% each (max 3).
  const ballSpeed = () => Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * 36 + Math.min(120, bricksBrokenRun * 2)) * (1 - 0.08 * (upgradesOwned.control || 0));
  const comboWindow = () => Math.max(1.8, COMBO_WINDOW - (level - 1) * 0.12);
  const levelClearBonus = () => 100 * level;
  // #10: permanent paddle width from WIDE PADDLE stacks (+18px each, max 3).
  const paddleBaseW = () => PADDLE_W + 18 * (upgradesOwned.paddle || 0);
  // #10: SCORE BOOST stacks add +25% brick score each (max 3).
  const scoreMult = () => 1 + 0.25 * (upgradesOwned.score || 0);
  // #11: share of paddle returns that went on to hit a brick.
  const accuracy = () => (stats.shotsTotal ? Math.round((100 * stats.shotsHit) / stats.shotsTotal) : 100);

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hideOverlays() {
    menuOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    levelOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    introOverlay.classList.add('hidden');
    draftOverlay.classList.add('hidden');
  }

  // Level intro card (backlog #25): named card, auto-dismisses after 1.7s.
  // Non-blocking — the player can still launch while it fades.
  let introTimer = null;
  function showIntro(n) {
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    introLevel.textContent = 'LEVEL ' + n;
    introName.textContent = LEVEL_NAMES[n - 1] || ('LEVEL ' + n);
    introFlavor.textContent = LEVEL_FLAVOR[n - 1] || '';
    introOverlay.classList.remove('hidden');
    introTimer = setTimeout(() => {
      introOverlay.classList.add('hidden');
      introTimer = null;
    }, 1700);
  }

  // Active-powerup line for the HUD (backlog #7): wide timer + ball count.
  function powerText() {
    const parts = [];
    if (wideTimer > 0) parts.push('WIDE ' + Math.ceil(wideTimer) + 's');
    if (balls.length > 1) parts.push('×' + balls.length + ' BALLS');
    return parts.length ? parts.join(' · ') : '—';
  }

  function updateHUD() {
    scoreEl.textContent = score;
    bestEl.textContent = Math.max(best, score);
    levelEl.textContent = level;
    livesEl.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, MAX_LIVES - lives));
    comboEl.textContent = '×' + mult();
    comboEl.style.color = combo > 0 ? '#b6ff00' : '';
    lastPowerText = powerText();
    powerEl.textContent = lastPowerText;
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
    }
  }

  // ---------- Local top-5 high scores (backlog #43) ----------
  // Stored as [{s: score, l: level, d: dateMs}] under 'nvb-scores', best first.
  // Shown on the menu and on the game-over screen; the run's own entry is
  // highlighted on the game-over table.
  const SCORES_KEY = 'nvb-scores';
  const MAX_SCORES = 5;
  let lastScoreRank = -1; // rank of this run's score in the table, -1 = unranked

  function loadScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((e) => e && typeof e.s === 'number').slice(0, MAX_SCORES);
    } catch (e) { return []; }
  }

  function saveScore() {
    if (score <= 0) { lastScoreRank = -1; return -1; }
    const list = loadScores();
    const entry = { s: score, l: level, d: Date.now() };
    list.push(entry);
    list.sort((a, b) => b.s - a.s);
    const trimmed = list.slice(0, MAX_SCORES);
    lastScoreRank = trimmed.indexOf(entry);
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(trimmed)); } catch (e) { /* ignore */ }
    return lastScoreRank;
  }

  function fmtScoreDate(ms) {
    try {
      const d = new Date(ms);
      return (d.getMonth() + 1) + '/' + d.getDate();
    } catch (e) { return ''; }
  }

  function renderScores(highlightRank) {
    const list = loadScores();
    const html = list.length
      ? '<div class="scores-title">TOP RUNS</div>' + list.map((e, i) =>
          '<div class="score-row' + (i === highlightRank ? ' score-hl' : '') + '">'
          + '<span class="score-rank">' + (i + 1) + '</span>'
          + '<span class="score-val">' + e.s + '</span>'
          + '<span class="score-meta">LV ' + e.l + ' · ' + fmtScoreDate(e.d) + '</span>'
          + '</div>').join('')
      : '<div class="scores-title">TOP RUNS</div><div class="scores-empty">No runs yet — be the first.</div>';
    if (menuScoresEl) menuScoresEl.innerHTML = html;
    if (gameOverScoresEl) gameOverScoresEl.innerHTML = html;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- Level setup ----------
  // #14: per-level void wells from the VOID_WELLS table. Each well tracks
  // `warned` (telegraph shown once per entry into the pull zone), `danger`
  // (0..1, how close the nearest ball is to the maw), `cool` (seconds of
  // post-swallow dormancy left) and `phase` (position in the wake cycle;
  // wells on a level start staggered so they never all wake at once, and
  // each starts dormant so the player gets a grace period).
  function buildWells(n) {
    const defs = VOID_WELLS[n - 1] || [];
    wells = defs.map((w, i) => ({
      x: w.x, y: w.y,
      pullR: w.pullR || WELL_PULL_R,
      horizon: w.horizon || WELL_HORIZON,
      bend: w.bend || WELL_BEND,
      phase: (i * WELL_CYCLE) / Math.max(1, defs.length),
      meals: 0, // balls swallowed this level (cap: WELL_MAX_MEALS)
      warned: false,
      danger: 0,
      cool: 0,
    }));
  }

  // A well only bends and swallows while awake (the last ACTIVE seconds of
  // its cycle) and not sated from a recent swallow.
  function wellAwake(w) {
    return w.cool <= 0 && w.phase >= WELL_CYCLE - WELL_ACTIVE;
  }

  // A fed well (ate its one meal this level) can no longer swallow — it
  // only bends the ball, harmlessly, for the rest of the level.
  function wellCanSwallow(w) {
    return w.meals < WELL_MAX_MEALS;
  }

  // Stirring: the 1s before waking, when the telegraph ring brightens.
  function wellStirring(w) {
    return w.cool <= 0 && w.phase >= WELL_CYCLE - WELL_ACTIVE - WELL_STIR;
  }

  // Advances the wake cycle and the sated cooldown; called from the
  // playing and serving branches (never while paused or in menus).
  function tickWells(dt) {
    for (const w of wells) {
      w.phase += dt;
      if (w.phase >= WELL_CYCLE) w.phase -= WELL_CYCLE;
      if (w.cool > 0) w.cool -= dt;
    }
  }

  function buildLevel(n) {
    const map = LEVELS[n - 1];
    const rows = map.length;
    const cols = map[0].length;
    const margin = 36, gap = 6, top = 78, bh = 22;
    const bw = (W - margin * 2 - gap * (cols - 1)) / cols;
    bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = map[r][c];
        if (ch === '.' || ch === undefined) continue;
        const hp = ch === 'E' ? ELITE_HP : parseInt(ch, 10);
        bricks.push({
          x: margin + c * (bw + gap), y: top + r * (bh + gap),
          w: bw, h: bh, hp, maxHp: hp, alive: true, elite: ch === 'E',
        });
      }
    }
    buildWells(n);
    boss = null; bossSpawned = false; // #24: the Core only wakes on level 5
  }

  // #24: the Void Core awakens — one big 12-HP brick at the top of the
  // cleared field, with fanfare. It joins `bricks`, so the normal hit,
  // reflect and clear logic all apply to it (with boss special-casing).
  function spawnBoss() {
    bossSpawned = true;
    boss = {
      x: (W - BOSS_W) / 2, y: 78, w: BOSS_W, h: BOSS_H,
      hp: BOSS_HP, maxHp: BOSS_HP, alive: true, boss: true,
    };
    bricks.push(boss);
    floatText(W / 2, 200, BOSS_NAME + ' AWAKENS!', BOSS_COLOR);
    floatText(W / 2, 224, 'BREAK THE CORE TO CLEAR THE LEVEL', '#f2ecff');
    ringBurst(W / 2, 98, BOSS_COLOR, 260);
    burst(W / 2, 98, BOSS_COLOR, 40, 420);
    shake = Math.min(SHAKE_MAX, shake + 8);
    sfx.explosion();
    updateHUD();
  }

  function newBall(x, y, vx, vy) {
    return { x, y, vx, vy, trail: [] };
  }

  function resetBall() {
    // #10: TWIN LAUNCH serves one extra ball per stack, fanned out from
    // the paddle center (ox offsets ride along in serving mode).
    const n = 1 + (upgradesOwned.balls || 0);
    balls = [];
    for (let i = 0; i < n; i++) {
      const b = newBall(paddle.x + paddle.w / 2, PADDLE_Y - BALL_R - 1, 0, 0);
      b.ox = (i - (n - 1) / 2) * 22;
      balls.push(b);
    }
  }

  function launch() {
    if (mode !== 'serving') return;
    const speed = ballSpeed();
    const n = balls.length;
    balls.forEach((b, i) => {
      const angle = -Math.PI / 2 + (i - (n - 1) / 2) * 0.18 + (Math.random() * 0.5 - 0.25);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
    });
    launchGrace = 1.2; // #14: the serve is shielded from the wells
    mode = 'playing';
    sfx.launch();
  }

  // ---------- Powerups (backlog #1, #2, #7) ----------
  // Destroyed bricks have a 12% chance to drop a falling capsule; catch it
  // with the paddle to activate. Capsules missed fall off the bottom.
  function maybeDropPowerup(x, y, chance) {
    if (powerups.length >= 3) return;
    if (Math.random() >= (chance || POWERUP_DROP_CHANCE)) return;
    const type = Math.random() < 0.5 ? 'multi' : 'wide';
    powerups.push({ x, y, type, vy: 150 });
  }

  function activatePowerup(type) {
    const def = POWERUP_TYPES[type];
    if (!def) return;
    if (type === 'multi') {
      // Split: two extra balls fan out from the first live ball.
      const src = balls[0];
      if (src) {
        const sp = Math.hypot(src.vx, src.vy) || ballSpeed();
        const base = Math.atan2(src.vy, src.vx);
        for (const da of [-0.45, 0.45]) {
          if (balls.length >= MAX_BALLS) break;
          balls.push(newBall(src.x, src.y, Math.cos(base + da) * sp, Math.sin(base + da) * sp));
        }
      }
      floatText(paddle.x + paddle.w / 2, PADDLE_Y - 24, 'MULTI-BALL!', def.color);
    } else if (type === 'wide') {
      // Wide capsule: +48px over the (possibly upgraded) base width.
      paddle.w = paddleBaseW() + 48;
      paddle.x = clamp(paddle.x - 24, 8, W - paddle.w - 8);
      wideTimer = WIDE_DURATION;
      floatText(paddle.x + paddle.w / 2, PADDLE_Y - 24, 'WIDE PADDLE!', def.color);
    }
    burst(paddle.x + paddle.w / 2, PADDLE_Y, def.color, 16, 240);
    sfx.powerup();
    updateHUD();
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      // #10: MAGNET PADDLE pulls falling capsules toward the paddle.
      const mag = upgradesOwned.magnet || 0;
      if (mag > 0) {
        const cx = paddle.x + paddle.w / 2;
        p.x += clamp(cx - p.x, -1, 1) * 130 * mag * dt;
      }
      if (p.y + 10 >= PADDLE_Y && p.y - 10 <= PADDLE_Y + PADDLE_H
        && p.x >= paddle.x - 6 && p.x <= paddle.x + paddle.w + 6) {
        powerups.splice(i, 1);
        stats.powerupsCaught++; // #11
        activatePowerup(p.type);
        continue;
      }
      if (p.y - 12 > H) { powerups.splice(i, 1); stats.powerupsMissed++; } // #11
    }
    if (wideTimer > 0) {
      wideTimer -= dt;
      if (wideTimer <= 0) {
        wideTimer = 0;
        paddle.w = paddleBaseW();
        paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
      }
    }
  }

  // ---------- Juice ----------
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random() * 0.7) * (speed || 220);
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.5 + Math.random() * 0.5, maxLife: 1,
        color, size: 1.5 + Math.random() * 2.5,
      });
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function floatText(x, y, str, color) {
    texts.push({ x, y, str, color: color || '#fff', life: 1 });
    if (texts.length > 24) texts.shift();
  }

  // #27: white-hot impact flash over a brick that was just hit.
  function flashBrick(b, color) {
    flashes.push({ x: b.x, y: b.y, w: b.w, h: b.h, color, life: 0.12, maxLife: 0.12 });
    if (flashes.length > 24) flashes.shift();
  }

  // #28: expanding shockwave ring from a break point.
  function ringBurst(x, y, color, maxR) {
    rings.push({ x, y, r: 6, maxR, life: 0.4, maxLife: 0.4, color });
    if (rings.length > 24) rings.shift();
  }

  // ---------- Flow ----------
  function startRun() {
    ensureAudio();
    blurActive(); // #41: a clicked PLAY must not stay focused — Space would
    // re-click it and restart the run instead of launching the ball.
    score = 0; lives = 3; level = 1;
    combo = 0; comboTimer = 0; bricksBrokenRun = 0;
    upgradesOwned = {};
    draftChoices = [];
    lastScoreRank = -1;
    boss = null; bossSpawned = false; fireAnnounced = false; // #24, #31
    resetStats();
    paddle.w = paddleBaseW();
    wideTimer = 0;
    powerups = [];
    paddle.x = (W - paddle.w) / 2;
    runStart = performance.now();
    buildLevel(level);
    resetBall();
    particles = []; texts = []; shake = 0; hitStop = 0; rings = []; flashes = [];
    hideOverlays();
    showIntro(level);
    mode = 'serving';
    updateHUD();
  }

  function pauseGame() {
    if (mode !== 'playing' && mode !== 'serving') return;
    pausedFrom = mode;
    mode = 'paused';
    // #37: the pause menu shows a snapshot of the run so far.
    pauseStats.textContent = 'Score ' + score + ' · Level ' + level + ' · Time ' + fmtTime(performance.now() - runStart) + ' · Best combo ×' + Math.max(1, stats.bestCombo);
    pauseOverlay.classList.remove('hidden');
    focusEl(resumeBtn); // #41: keyboard focus lands on RESUME
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    blurActive(); // #41: don't leave RESUME focused under the Space key
    mode = pausedFrom;
    pauseOverlay.classList.add('hidden');
  }

  function togglePause() {
    if (mode === 'paused') resumeGame();
    else pauseGame();
  }

  // #37: quit to the menu from the pause screen (or the game-over screen).
  // Resets the run to the attract state; the top-5 table keeps the run's score.
  function quitToMenu() {
    blurActive(); // #41: a focused QUIT button must not eat the next Space
    score = 0; lives = 3; level = 1;
    combo = 0; comboTimer = 0; bricksBrokenRun = 0;
    upgradesOwned = {};
    draftChoices = [];
    boss = null; bossSpawned = false; fireAnnounced = false; // #24, #31
    resetStats();
    paddle.w = paddleBaseW();
    wideTimer = 0;
    powerups = [];
    paddle.x = (W - paddle.w) / 2;
    buildLevel(level);
    resetBall();
    particles = []; texts = []; shake = 0; hitStop = 0; rings = []; flashes = [];
    lastScoreRank = -1;
    hideOverlays();
    renderScores(-1);
    menuOverlay.classList.remove('hidden');
    mode = 'menu';
    updateHUD();
  }

  function onLevelClear() {
    saveBest();
    mode = 'levelclear';
    sfx.clear();
    // Juice finale for the clear: big shockwave, a beat of hit-stop, heavy shake.
    ringBurst(W / 2, 200, '#b6ff00', 240);
    burst(W / 2, 200, '#b6ff00', 40, 420);
    sfx.explosion(); // #34: the clear lands with a low boom under the fanfare
    hitStop = HITSTOP_MAX;
    shake = Math.min(SHAKE_MAX, shake + 8);
    const bonus = levelClearBonus();
    score += bonus;
    // Block 10 difficulty balance: clearing a level restores +1 life (up
    // to MAX_LIVES). The wells can swallow ~1 ball per level, so without
    // this a perfect-tracking AI bled out across levels 2-4 (4 swallows
    // vs 3 starting lives) without ever missing a ball — the hazard alone
    // could end a run. The restore keeps the wells threatening but never
    // run-ending by attrition alone.
    const lifeRestored = lives < MAX_LIVES;
    if (lifeRestored) lives++;
    const last = level >= LEVELS.length;
    levelTitle.textContent = last ? 'YOU BEAT THE VOID!' : 'LEVEL ' + level + ' CLEAR!';
    levelStats.innerHTML = '“' + (LEVEL_NAMES[level - 1] || '') + '” cleared &nbsp;·&nbsp; Clear bonus <strong>+' + bonus + '</strong>' + (lifeRestored ? ' &nbsp;·&nbsp; <strong>+1 LIFE</strong>' : '') + '<br>Score <strong>' + score + '</strong> &nbsp;·&nbsp; Best <strong>' + Math.max(best, score) + '</strong><br>Time ' + fmtTime(performance.now() - runStart);
    nextLevelBtn.textContent = last ? 'SEE RESULTS ▶' : 'DRAFT UPGRADE ▶';
    levelOverlay.classList.remove('hidden');
    focusEl(nextLevelBtn); // #41: keyboard focus lands on the continue button
    updateHUD();
  }

  function nextLevel() {
    blurActive(); // #41: don't leave the continue button focused under Space
    if (level >= LEVELS.length) { gameOver(true); return; }
    level++;
    buildLevel(level);
    resetBall();
    combo = 0; comboTimer = 0;
    paddle.w = paddleBaseW();
    wideTimer = 0;
    powerups = [];
    levelOverlay.classList.add('hidden');
    showIntro(level);
    mode = 'serving';
    updateHUD();
  }

  // ---------- Upgrade draft (backlog #9, #10) ----------
  // After a level clear (not the final one), the void offers 3 upgrades;
  // pick 1 to keep for the rest of the run, then the next level starts.
  // Click a card or press 1 / 2 / 3. Maxed-out upgrades leave the pool;
  // when fewer than 3 remain, VOID CACHE (+500 score) fills the gaps.
  function advanceFromClear() {
    if (mode !== 'levelclear') return;
    if (level >= LEVELS.length) { gameOver(true); return; }
    openDraft();
  }

  function openDraft() {
    const avail = Object.keys(UPGRADES).filter((id) => (upgradesOwned[id] || 0) < UPGRADES[id].max);
    for (let i = avail.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = avail[i]; avail[i] = avail[j]; avail[j] = t;
    }
    draftChoices = avail.slice(0, 3);
    while (draftChoices.length < 3) draftChoices.push('bonus');
    draftCardsEl.innerHTML = '';
    let firstCard = null;
    draftChoices.forEach((id, i) => {
      const def = id === 'bonus' ? BONUS_UPGRADE : UPGRADES[id];
      const owned = id === 'bonus' ? 0 : (upgradesOwned[id] || 0);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'draft-card';
      card.style.borderColor = def.color;
      card.innerHTML = '<span class="draft-key">' + (i + 1) + '</span>'
        + '<span class="draft-glyph" style="color:' + def.color + '">' + def.glyph + '</span>'
        + '<span class="draft-name">' + def.name + '</span>'
        + '<span class="draft-desc">' + def.desc + '</span>'
        + (owned ? '<span class="draft-owned">OWNED ×' + owned + '</span>' : '');
      card.addEventListener('click', () => applyUpgrade(id));
      draftCardsEl.appendChild(card);
      if (!firstCard) firstCard = card;
    });
    levelOverlay.classList.add('hidden');
    mode = 'draft';
    draftOverlay.classList.remove('hidden');
    focusEl(firstCard); // #41: keyboard focus lands on the first card
  }

  // #41: ← → moves keyboard focus across the draft cards (Tab works too).
  function moveDraftFocus(dir) {
    const cards = draftCardsEl.children ? Array.from(draftCardsEl.children) : [];
    if (!cards.length) return;
    let i = cards.indexOf(document.activeElement);
    if (i < 0) i = dir > 0 ? -1 : 0;
    focusEl(cards[(i + dir + cards.length) % cards.length]);
  }

  function applyUpgrade(id) {
    if (mode !== 'draft') return;
    blurActive(); // #41: a clicked card must not stay focused under Space
    if (id === 'bonus') {
      score += 500;
      floatText(W / 2, H / 2 - 40, '+500 VOID CACHE', BONUS_UPGRADE.color);
    } else {
      upgradesOwned[id] = (upgradesOwned[id] || 0) + 1;
      const def = UPGRADES[id];
      if (id === 'life') lives = Math.min(MAX_LIVES, lives + 1);
      if (id === 'paddle') paddle.w = wideTimer > 0 ? paddleBaseW() + 48 : paddleBaseW();
      floatText(W / 2, H / 2 - 40, def.name + '!', def.color);
      burst(W / 2, H / 2 - 20, def.color, 24, 300);
    }
    sfx.powerup();
    updateHUD();
    draftOverlay.classList.add('hidden');
    nextLevel();
  }

  function gameOver(win) {
    // #38: a run that beats the previous best gets a NEW BEST badge, and
    // its score joins the local top-5 table (#43) with its rank highlighted.
    const prevBest = best;
    const isNewBest = score > prevBest && score > 0;
    saveBest();
    saveScore();
    mode = 'gameover';
    if (win) sfx.win(); else sfx.over();
    gameOverTitle.textContent = win ? 'VOID CONQUERED!' : 'GAME OVER';
    gameOverStats.innerHTML = (isNewBest ? '<span class="new-best">★ NEW BEST! ★</span><br>' : '')
      + (win ? 'You cleared all ' + LEVELS.length + ' levels.' : 'The void claims another run.')
      + '<br>Score <strong>' + score + '</strong> &nbsp;·&nbsp; Best <strong>' + best + '</strong>'
      + '<br>Level reached: <strong>' + level + '</strong> &nbsp;·&nbsp; Time ' + fmtTime(performance.now() - runStart)
      // #11: run stats — best combo, bricks broken, shot accuracy, powerups.
      + '<br>Best combo <strong>×' + Math.max(1, stats.bestCombo) + '</strong> &nbsp;·&nbsp; Bricks <strong>' + stats.bricksBroken + '</strong> &nbsp;·&nbsp; Accuracy <strong>' + accuracy() + '%</strong>'
      + '<br>Powerups caught <strong>' + stats.powerupsCaught + '</strong> &nbsp;·&nbsp; missed <strong>' + stats.powerupsMissed + '</strong>';
    hideOverlays();
    renderScores(lastScoreRank);
    gameOverOverlay.classList.remove('hidden');
    focusEl(againBtn); // #41: keyboard focus lands on PLAY AGAIN
    updateHUD();
  }

  // `swallowed` skips the bottom-loss effects — the maw already burst,
  // shook and whooshed at the well, so a second copy would double up.
  // The paddle also respawns at center after a swallow, so the next serve
  // doesn't start parked under the maw that just ate the ball.
  function loseBall(swallowed) {
    lives--;
    combo = 0; comboTimer = 0;
    stats.ballsLost++;
    shotPending = false; // the pending shot died with the ball
    if (!swallowed) {
      shake = 12;
      sfx.voidSwallow(); // #34: the void swallows the ball, not a plain buzz
      burst(paddle.x + paddle.w / 2, H - 12, '#ff2d95', 26, 300);
    } else {
      paddle.x = (W - paddle.w) / 2;
      paddle.targetX = null;
    }
    updateHUD();
    if (lives <= 0) { gameOver(false); return; }
    resetBall();
    mode = 'serving';
  }

  // ---------- Physics ----------
  function reflectOffBrick(b, ball) {
    const cx = clamp(ball.x, b.x, b.x + b.w);
    const cy = clamp(ball.y, b.y, b.y + b.h);
    let dx = ball.x - cx, dy = ball.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) return false;
    let nx, ny;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d;
    } else {
      // Center inside the brick: use minimum-penetration axis.
      const pl = ball.x - b.x, pr = b.x + b.w - ball.x;
      const pt = ball.y - b.y, pb = b.y + b.h - ball.y;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) { nx = -1; ny = 0; } else if (m === pr) { nx = 1; ny = 0; }
      else if (m === pt) { nx = 0; ny = -1; } else { nx = 0; ny = 1; }
    }
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }
    ball.x = cx + nx * (BALL_R + 0.5);
    ball.y = cy + ny * (BALL_R + 0.5);
    // Never let the ball go near-horizontal (boring endless loops) or
    // near-vertical (clears one column, then loops forever) — #48.
    const sp = Math.hypot(ball.vx, ball.vy) || ballSpeed();
    if (Math.abs(ball.vy) < sp * 0.22) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * sp * 0.22;
      const s2 = Math.hypot(ball.vx, ball.vy);
      ball.vx = ball.vx / s2 * sp;
      ball.vy = ball.vy / s2 * sp;
    }
    if (Math.abs(ball.vx) < sp * 0.12) {
      ball.vx = (ball.vx < 0 ? -1 : 1) * sp * 0.12;
      const s3 = Math.hypot(ball.vx, ball.vy);
      ball.vx = ball.vx / s3 * sp;
      ball.vy = ball.vy / s3 * sp;
    }
    return true;
  }

  // Steps one ball; returns 'lost' if it fell off the bottom, 'clear' if the
  // last brick broke, 'stop' if the mode changed mid-step, else 'ok'.
  function stepBall(dt, ball) {
    const speed = Math.hypot(ball.vx, ball.vy) || ballSpeed();
    const dist = speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;

      // #14/#15: void wells bend the ball and swallow it at the horizon.
      // A dormant or sated well neither pulls nor swallows, and a ball
      // inside its launch grace is shielded from all wells.
      for (let wi = 0; wi < wells.length; wi++) {
        const w = wells[wi];
        if (!wellAwake(w) || launchGrace > 0) continue;
        const dx = w.x - ball.x, dy = w.y - ball.y;
        const d = Math.hypot(dx, dy);
        if (d < w.horizon && wellCanSwallow(w)) { swallowBall(w); return 'swallowed'; }
        if (d < w.pullR) {
          // Rotate the velocity toward the well center, stronger the
          // closer the ball gets (quadratic falloff, so distant passes
          // barely bend); speed is preserved, only direction bends.
          const falloff = 1 - d / w.pullR;
          const bend = w.bend * falloff * falloff * sdt;
          const ang = Math.atan2(ball.vy, ball.vx);
          let diff = Math.atan2(dy, dx) - ang;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = clamp(diff, -bend, bend);
          const sp = Math.hypot(ball.vx, ball.vy) || ballSpeed();
          const na = ang + turn;
          ball.vx = Math.cos(na) * sp;
          ball.vy = Math.sin(na) * sp;
        }
      }

      // Walls.
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.y - BALL_R > H) return 'lost';

      // Paddle (only while moving down).
      if (ball.vy > 0
        && ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + PADDLE_H
        && ball.x >= paddle.x - BALL_R && ball.x <= paddle.x + paddle.w + BALL_R) {
        const hit = clamp((ball.x - paddle.x) / paddle.w, 0, 1) - 0.5;
        let angle = hit * Math.PI * 0.78; // max ~70 degrees
        // #48: never launch dead-vertical — a centered hit would loop the
        // ball up and down one column forever. Keep its incoming drift.
        if (Math.abs(angle) < 0.14) angle = 0.14 * (ball.vx >= 0 ? 1 : -1);
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(angle) * sp + paddleVel * 0.12;
        ball.vy = -Math.cos(angle) * sp;
        const s2 = Math.hypot(ball.vx, ball.vy) || sp;
        ball.vx = ball.vx / s2 * sp;
        ball.vy = ball.vy / s2 * sp;
        ball.y = PADDLE_Y - BALL_R - 0.5;
        stats.paddleHits++; stats.shotsTotal++; shotPending = true; // #11
        sfx.paddle();
        burst(ball.x, PADDLE_Y, '#00f0ff', 6, 160);
      }

      // Bricks: one hit per substep.
      for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (!b.alive) continue;
        if (ball.x + BALL_R < b.x || ball.x - BALL_R > b.x + b.w
          || ball.y + BALL_R < b.y || ball.y - BALL_R > b.y + b.h) continue;
        if (!reflectOffBrick(b, ball)) continue;
        b.hp--;
        // #11: every brick contact counts; a pending paddle shot is a hit.
        stats.brickHits++;
        if (shotPending) { stats.shotsHit++; shotPending = false; }
        // #20 / #24: elite bricks glow violet, the Void Core glows red.
        const color = b.boss ? BOSS_COLOR : BRICK_COLORS[b.maxHp];
        if (b.hp <= 0) {
          b.alive = false;
          combo++;
          stats.bestCombo = Math.max(stats.bestCombo, combo); // #11
          comboTimer = comboWindow();
          bricksBrokenRun++;
          stats.bricksBroken++; // #11
          // #20: elite bricks drop powerups twice as often.
          maybeDropPowerup(b.x + b.w / 2, b.y + b.h / 2, b.elite ? ELITE_DROP_CHANCE : undefined);
          // #24: the Core is worth 1500; everything else uses its table score.
          const pts = b.boss
            ? Math.round(BOSS_SCORE * mult() * scoreMult())
            : Math.round(BRICK_SCORE[b.maxHp] * mult() * scoreMult()); // #10 score stacks
          score += pts;
          floatText(b.x + b.w / 2, b.y, '+' + pts + (mult() > 1 ? ' ×' + mult() : ''), color);
          burst(b.x + b.w / 2, b.y + b.h / 2, color, 14, 260);
          flashBrick(b, color); // #27 impact flash
          ringBurst(b.x + b.w / 2, b.y + b.h / 2, color, 60 + b.maxHp * 30); // #28 shockwave
          hitStop = Math.min(HITSTOP_MAX, 0.03 + 0.015 * b.maxHp); // #26 micro freeze
          // #30: shake scales with brick toughness and the combo multiplier.
          shake = Math.min(SHAKE_MAX, shake + (1.5 + b.maxHp) * (1 + 0.25 * (mult() - 1)));
          if (b.boss) {
            // #24: breaking the Core is the run's biggest moment so far.
            sfx.explosion();
            ringBurst(b.x + b.w / 2, b.y + b.h / 2, '#ffffff', 300);
            burst(b.x + b.w / 2, b.y + b.h / 2, '#ffffff', 40, 480);
            floatText(W / 2, 200, 'VOID CORE DESTROYED!', BOSS_COLOR);
            boss = null;
          } else {
            sfx.brick(combo);
          }
          updateHUD();
          if (bricks.every((bb) => !bb.alive)) {
            // #24: on level 5 the Core wakes instead of clearing — the
            // level only ends once the boss itself is destroyed.
            if (level === BOSS_LEVEL && !bossSpawned) { spawnBoss(); }
            else { onLevelClear(); return 'clear'; }
          }
        } else {
          score += 10;
          burst(b.x + b.w / 2, b.y + b.h / 2, color, 5, 160);
          flashBrick(b, color); // #27: even a chip gets a flash
          shake = Math.min(SHAKE_MAX, shake + 0.5);
          sfx.damage();
          updateHUD();
        }
        break;
      }
      if (mode !== 'playing') return 'stop';
    }
    return 'ok';
  }

  // Steps every live ball; losing one ball only costs a life when it's the last.
  function stepBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const res = stepBall(dt, balls[i]);
      if (res === 'lost' || res === 'swallowed') {
        balls.splice(i, 1);
        if (balls.length === 0) { loseBall(res === 'swallowed'); return; }
      } else if (res === 'clear' || res === 'stop') {
        return;
      }
    }
  }

  // #15: the maw takes the ball — purple burst, shockwave, a shake, and
  // the void-swallow whoosh — then goes sated for a few seconds. The life
  // itself is only lost by the caller, when this was the last ball.
  function swallowBall(w) {
    w.meals++;
    w.cool = WELL_SATED_SECS;
    w.danger = 0;
    w.warned = false;
    burst(w.x, w.y, '#8b5cff', 30, 380);
    burst(w.x, w.y, '#ff2d95', 18, 260);
    ringBurst(w.x, w.y, '#8b5cff', 130);
    floatText(w.x, w.y - 36, 'SWALLOWED!', '#ff2d95');
    shake = Math.min(SHAKE_MAX, shake + 6);
    sfx.voidSwallow();
  }

  // ---------- Update ----------
  const keys = new Set();

  function update(dt) {
    // Particles + floating texts always animate (menus stay alive).
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 320 * dt;
      p.vx *= (1 - 1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt * 0.9;
      t.y -= 34 * dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    // #28: rings expand to full radius over their life; #27: flashes fade fast.
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      r.r = 6 + (1 - Math.max(0, r.life) / r.maxLife) * (r.maxR - 6);
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].life -= dt;
      if (flashes[i].life <= 0) flashes.splice(i, 1);
    }
    shake *= Math.pow(0.001, dt);
    if (shake < 0.05) shake = 0;

    if (mode === 'playing') {
      if (combo > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 0; updateHUD(); }
      }
      if (launchGrace > 0) launchGrace -= dt; // #14: serve shield ticks down
      // Keyboard paddle.
      const prevX = paddle.x;
      let dir = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) dir -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) dir += 1;
      if (dir !== 0) {
        paddle.x = clamp(paddle.x + dir * PADDLE_SPEED * dt, 8, W - paddle.w - 8);
      } else if (paddle.targetX !== null) {
        paddle.x += (paddle.targetX - paddle.x) * Math.min(1, dt * 30);
        paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
      }
      paddleVel = (paddle.x - prevX) / Math.max(dt, 0.001);
      updatePowerups(dt);
      stepBalls(dt);
      tickWells(dt);
      // #17: telegraph — track how close the nearest ball is to each awake
      // well that can still swallow. First entry into the pull zone flashes
      // a one-time VOID PULL! warning above the telegraph ring. A fed well
      // only bends, so it never warns.
      for (const w of wells) {
        if (!wellAwake(w) || !wellCanSwallow(w)) { w.danger = 0; w.warned = false; continue; }
        let near = Infinity;
        for (const b of balls) near = Math.min(near, Math.hypot(w.x - b.x, w.y - b.y));
        w.danger = near === Infinity ? 0 : clamp(1 - (near - w.horizon) / (w.pullR - w.horizon), 0, 1);
        if (near < w.pullR && !w.warned) {
          w.warned = true;
          floatText(w.x, w.y - w.pullR - 8, 'VOID PULL!', '#b46bff');
        } else if (near >= w.pullR) {
          w.warned = false;
        }
      }
      for (const b of balls) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 18) b.trail.shift(); // #27: longer trail
      }
      // #31: at multiplier ×3+ the ball is ON FIRE — flame particles
      // stream off every live ball, announced once per hot streak.
      const m = mult();
      if (m >= 3) {
        if (!fireAnnounced) {
          fireAnnounced = true;
          floatText(W / 2, H / 2 - 60, 'ON FIRE! ×' + m, '#ff7b00');
        }
        for (const b of balls) {
          for (let f = 0; f < 2 && particles.length < 400; f++) {
            particles.push({
              x: b.x + (Math.random() - 0.5) * 14, y: b.y + (Math.random() - 0.5) * 14,
              vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 90,
              life: 0.25 + Math.random() * 0.25, maxLife: 0.5,
              color: ['#ff7b00', '#ffb300', '#ff2d95'][Math.floor(Math.random() * 3)],
              size: 1.5 + Math.random() * 2,
            });
          }
        }
      } else {
        fireAnnounced = false;
      }
      // Wide-paddle countdown ticks in the HUD once per second.
      const pt = powerText();
      if (pt !== lastPowerText) { lastPowerText = pt; powerEl.textContent = pt; }
    } else if (mode === 'serving') {
      tickWells(dt);
      const prevX = paddle.x;
      let dir = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) dir -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) dir += 1;
      if (dir !== 0) {
        paddle.x = clamp(paddle.x + dir * PADDLE_SPEED * dt, 8, W - paddle.w - 8);
      } else if (paddle.targetX !== null) {
        paddle.x += (paddle.targetX - paddle.x) * Math.min(1, dt * 30);
        paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
      }
      paddleVel = (paddle.x - prevX) / Math.max(dt, 0.001);
      for (const b of balls) {
        b.x = paddle.x + paddle.w / 2 + (b.ox || 0);
        b.y = PADDLE_Y - BALL_R - 1;
        b.trail = [];
      }
    }
  }

  // ---------- Render ----------
  // #17: black-hole visuals — a dashed telegraph ring at the pull radius
  // (faint while dormant, brightening as the maw stirs, pulsing pink
  // while awake and a ball is inside), a rotating dashed accretion ring,
  // orbiting wisps being sucked in, and a black core with a violet rim
  // that flares pink at high danger. A dormant well renders dimmed and
  // slow; a sated well (just swallowed a ball) renders dimmed and dormant;
  // a fed well (ate its one meal this level) renders grey and quiet — it
  // only bends the ball now, it can no longer swallow.
  function drawWells(t) {
    for (const w of wells) {
      const awake = wellAwake(w);
      const sated = w.cool > 0;
      const fed = !wellCanSwallow(w) && !sated;
      // Stir progress 0..1 in the second before the maw wakes.
      const stir = (!awake && !sated && !fed && wellStirring(w))
        ? (w.phase - (WELL_CYCLE - WELL_ACTIVE - WELL_STIR)) / WELL_STIR : 0;
      const hot = w.danger > 0;
      const dim = sated ? 0.3 : (fed ? 0.35 : (awake ? 1 : 0.45 + 0.35 * stir));
      // Telegraph ring: the danger zone, faint until the maw stirs.
      ctx.save();
      ctx.globalAlpha = (fed ? 0.04 : (awake
        ? 0.10 + 0.30 * w.danger + (hot ? 0.06 * Math.sin(t * 10) : 0)
        : 0.05 + 0.25 * stir)) * dim;
      ctx.strokeStyle = w.danger > 0.75 ? '#ff2d95' : '#8b5cff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.pullR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Accretion ring: rotating dashes around the core, slow when dormant.
      ctx.save();
      ctx.globalAlpha = dim;
      ctx.shadowColor = fed ? '#555566' : '#b46bff';
      ctx.shadowBlur = awake ? 16 : 6;
      ctx.strokeStyle = fed ? '#777788' : '#c9a7ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 9]);
      ctx.lineDashOffset = -t * (awake ? 46 : 12);
      ctx.beginPath();
      ctx.arc(w.x, w.y, WELL_RING_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Orbiting wisps: three dots spiralling in, only while awake and hungry.
      if (awake && !fed) {
        for (let i = 0; i < 3; i++) {
          const a = t * (0.9 + i * 0.35) + i * 2.1;
          const r = WELL_RING_R + 14 + 10 * Math.sin(t * 1.7 + i);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#b46bff';
          ctx.beginPath();
          ctx.arc(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Black core with a rim that flares pink when a ball is about to die.
      ctx.save();
      ctx.shadowColor = fed ? '#555566' : (w.danger > 0.6 ? '#ff2d95' : '#8b5cff');
      ctx.shadowBlur = (awake ? 18 + 18 * w.danger : 6 + 10 * stir) * dim;
      ctx.fillStyle = sated ? '#1a1030' : (fed ? '#1a1a26' : (awake ? '#05010f' : '#0d0820'));
      ctx.beginPath();
      ctx.arc(w.x, w.y, WELL_CORE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fed ? '#777788' : (w.danger > 0.6 ? '#ff2d95' : '#b46bff');
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // Background.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0524');
    bg.addColorStop(0.6, '#070312');
    bg.addColorStop(1, '#0a0618');
    ctx.fillStyle = bg;
    ctx.fillRect(-14, -14, W + 28, H + 28);

    // Stars.
    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe9ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Combo timer bar (only while a combo is alive).
    if (mode === 'playing' && combo > 0) {
      const w = (comboTimer / comboWindow()) * (W - 72);
      ctx.fillStyle = 'rgba(182,255,0,0.25)';
      ctx.fillRect(36, 56, W - 72, 4);
      ctx.fillStyle = '#b6ff00';
      ctx.fillRect(36, 56, Math.max(0, w), 4);
    }

    // Void wells (#14, #15, #17) — drawn under the bricks, over the stars.
    drawWells(t);

    // Bricks.
    for (const b of bricks) {
      if (!b.alive) continue;
      // #20 / #24: elite bricks glow violet, the Void Core glows red and
      // pulses; everything else uses its HP table color.
      const color = b.boss ? BOSS_COLOR : BRICK_COLORS[b.hp];
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = b.boss ? 18 + 8 * Math.sin(t * 5) : 10;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.92;
      rr(b.x, b.y, b.w, b.h, 5);
      ctx.fill();
      ctx.restore();
      // Top highlight + hp pips (the Core gets a bar instead of pips).
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(b.x + 2, b.y + 2, b.w - 4, 6, 3);
      ctx.fill();
      if (b.boss) {
        // #24: HP bar floating just below the Core (above would hit the
        // combo timer bar).
        const bw = b.w;
        ctx.fillStyle = 'rgba(7,3,18,0.8)';
        ctx.fillRect(b.x, b.y + b.h + 8, bw, 7);
        ctx.fillStyle = BOSS_COLOR;
        ctx.fillRect(b.x, b.y + b.h + 8, bw * (b.hp / b.maxHp), 7);
        ctx.fillStyle = '#ffd7de';
        ctx.font = '800 10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(BOSS_NAME + '  ' + b.hp + '/' + b.maxHp, b.x + bw / 2, b.y + b.h + 28);
      } else if (b.hp > 1) {
        ctx.fillStyle = 'rgba(7,3,18,0.75)';
        for (let p = 0; p < b.hp; p++) {
          ctx.beginPath();
          ctx.arc(b.x + b.w / 2 + (p - (b.hp - 1) / 2) * 10, b.y + b.h - 6, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // #24: top-of-screen boss bar while the Core lives — the player can
    // read the fight at a glance without looking up at the brick.
    if (boss && boss.alive) {
      const bw = 260;
      ctx.fillStyle = 'rgba(7,3,18,0.7)';
      ctx.fillRect((W - bw) / 2, 62, bw, 8);
      ctx.fillStyle = BOSS_COLOR;
      ctx.fillRect((W - bw) / 2, 62, bw * (boss.hp / boss.maxHp), 8);
      ctx.strokeStyle = 'rgba(255,77,109,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect((W - bw) / 2, 62, bw, 8);
    }

    // Falling powerup capsules (backlog #7).
    for (const p of powerups) {
      const def = POWERUP_TYPES[p.type];
      ctx.save();
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = def.color;
      rr(p.x - 13, p.y - 10, 26, 20, 8);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#070312';
      ctx.font = '800 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(def.glyph, p.x, p.y + 5);
    }

    // Paddle.
    ctx.save();
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    const pg = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    pg.addColorStop(0, '#00f0ff');
    pg.addColorStop(0.5, '#e8feff');
    pg.addColorStop(1, '#8b5cff');
    ctx.fillStyle = pg;
    rr(paddle.x, PADDLE_Y, paddle.w, PADDLE_H, 6);
    ctx.fill();
    ctx.restore();

    // Ball trails + balls (multi-ball draws every live ball).
    // #27: longer, brighter trail — fades from the ball back to a ghost.
    // #31: at ×3+ the ball burns orange — hot trail, hot glow, hot core.
    const hot = mode === 'playing' && mult() >= 3;
    if (mode !== 'menu') {
      for (const b of balls) {
        for (let i = 0; i < b.trail.length; i++) {
          const tp = b.trail[i];
          const f = i / b.trail.length;
          ctx.globalAlpha = f * 0.45;
          ctx.fillStyle = hot ? '#ff7b00' : '#00f0ff';
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, BALL_R * (0.35 + 0.65 * f), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.shadowColor = hot ? '#ff7b00' : '#ffffff';
        ctx.shadowBlur = hot ? 26 : 18;
        ctx.fillStyle = hot ? '#ffe9b0' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = hot ? '#ff7b00' : '#00f0ff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R - 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Particles.
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // #27: impact flashes — additive glow over the brick just hit.
    if (flashes.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flashes) {
        const a = Math.max(0, f.life / f.maxLife);
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = f.color;
        rr(f.x - 2, f.y - 2, f.w + 4, f.h + 4, 6);
        ctx.fill();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#ffffff';
        rr(f.x + 2, f.y + 2, f.w - 4, f.h - 4, 4);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // #28: shockwave rings — expanding, thinning outlines.
    for (const r of rings) {
      const a = Math.max(0, r.life / r.maxLife);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1 + 3 * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Floating texts.
    ctx.textAlign = 'center';
    ctx.font = '800 15px "Segoe UI", system-ui, sans-serif';
    for (const ft of texts) {
      ctx.globalAlpha = Math.max(0, ft.life);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.str, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // Serve hint.
    if (mode === 'serving') {
      ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = '#f2ecff';
      ctx.font = '800 16px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DRAG or ← → to move · SPACE / TAP to launch', W / 2, H - 110);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---------- Input ----------
  function canvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  }

  canvas.addEventListener('pointermove', (e) => {
    paddle.targetX = clamp(canvasX(e.clientX) - paddle.w / 2, 8, W - paddle.w - 8);
  });
  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    // #40: stop double-tap zoom / compatibility mouse events on touch;
    // the tap itself is the launch gesture in serving mode.
    if (e.preventDefault) e.preventDefault();
    paddle.targetX = clamp(canvasX(e.clientX) - paddle.w / 2, 8, W - paddle.w - 8);
    if (mode === 'serving') launch();
  });
  // #40: a long press on the canvas must not pop the browser context menu.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', (e) => e.preventDefault());
  // #40: dragging on the game stage must never scroll the page or trigger
  // pull-to-refresh — the paddle owns every touch that starts on the stage.
  document.addEventListener('touchmove', (e) => {
    if (e.target && e.target.closest && e.target.closest('.stage')) e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    ensureAudio();
    if (e.repeat) return;
    keys.add(e.code);
    // #41: a focused button owns Space/Enter — let it activate natively
    // instead of a game action firing underneath it at the same time.
    const onButton = e.target && e.target.tagName === 'BUTTON';
    if (onButton && (e.code === 'Space' || e.code === 'Enter')) return;
    // #41: ← → moves keyboard focus across the draft cards (Tab works too).
    if (mode === 'draft' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      moveDraftFocus(e.code === 'ArrowRight' ? 1 : -1);
      return;
    }
    // #9: draft picks by number key (1 / 2 / 3).
    if (mode === 'draft') {
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (idx >= 0 && draftChoices[idx]) applyUpgrade(draftChoices[idx]);
      return;
    }
    if (e.code === 'Space') {
      if (mode === 'serving') launch();
      else if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
      else if (mode === 'menu' || mode === 'gameover') startRun();
      else if (mode === 'levelclear') advanceFromClear();
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'Escape') {
      if (mode === 'paused') resumeGame();
      else if (mode === 'gameover') quitToMenu();
      else if (mode === 'playing' || mode === 'serving') pauseGame();
    }
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Enter') {
      if (mode === 'menu') startRun();
      else if (mode === 'gameover') startRun();
      else if (mode === 'levelclear') advanceFromClear();
      else if (mode === 'paused') resumeGame();
    }
    // #41: pause-menu shortcuts — R resume, N restart, Q quit to menu.
    if (mode === 'paused') {
      if (e.code === 'KeyR') resumeGame();
      else if (e.code === 'KeyN') startRun();
      else if (e.code === 'KeyQ') quitToMenu();
    }
    if (mode === 'gameover' && e.code === 'KeyQ') quitToMenu();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (mode === 'playing' || mode === 'serving')) pauseGame();
  });

  // ---------- Buttons ----------
  playBtn.addEventListener('click', startRun);
  resumeBtn.addEventListener('click', resumeGame);
  $('restartBtnPause').addEventListener('click', startRun);
  $('quitBtnPause').addEventListener('click', quitToMenu);
  nextLevelBtn.addEventListener('click', advanceFromClear);
  againBtn.addEventListener('click', startRun);
  $('menuBtnOver').addEventListener('click', quitToMenu);
  pauseBtn.addEventListener('click', () => { ensureAudio(); togglePause(); });
  muteBtn.addEventListener('click', () => { ensureAudio(); toggleMute(); });

  // ---------- Boot ----------
  buildLevel(1);
  resetBall();
  updateHUD();
  renderScores(-1);
  updateMuteBtn();
  hideOverlays();
  menuOverlay.classList.remove('hidden');
  focusEl(playBtn); // #41: keyboard players start on PLAY, no Tab hunt

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (hitStop > 0) {
      // #26: freeze the simulation for a beat; keep rendering so the
      // flash/ring/shake read as one frozen impact frame.
      hitStop -= dt;
      render(now / 1000);
      requestAnimationFrame(frame);
      return;
    }
    update(dt);
    render(now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
