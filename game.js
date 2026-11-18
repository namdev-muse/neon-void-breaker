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
  const MAX_SPEED = 640;
  const COMBO_WINDOW = 2.5;
  const BEST_KEY = 'nvb-best';
  const MUTE_KEY = 'nvb-muted';

  // '1' = 50pts hp1 cyan, '2' = 100pts hp2 pink, '3' = 150pts hp3 amber, '.' = empty
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
  ];
  const BRICK_COLORS = { 1: '#00f0ff', 2: '#ff2d95', 3: '#ffb300' };
  const BRICK_SCORE = { 1: 50, 2: 100, 3: 150 };

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), bestEl = $('best'), levelEl = $('level');
  const livesEl = $('lives'), comboEl = $('combo');
  const menuOverlay = $('menuOverlay'), pauseOverlay = $('pauseOverlay');
  const levelOverlay = $('levelOverlay'), gameOverOverlay = $('gameOverOverlay');
  const levelTitle = $('levelTitle'), levelStats = $('levelStats');
  const gameOverTitle = $('gameOverTitle'), gameOverStats = $('gameOverStats');
  const nextLevelBtn = $('nextLevelBtn');
  const muteBtn = $('muteBtn'), pauseBtn = $('pauseBtn');

  // Crisp rendering on high-DPI screens.
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();

  // ---------- State ----------
  let mode = 'menu'; // menu | serving | playing | paused | levelclear | gameover
  let pausedFrom = 'playing';
  let score = 0, best = 0, lives = 3, level = 1;
  let combo = 0, comboTimer = 0, bricksBrokenRun = 0;
  let runStart = 0;
  let bricks = [];
  let particles = [];
  let texts = [];
  let shake = 0;
  let paddleVel = 0;

  const paddle = { x: (W - 96) / 2, w: 96, targetX: null };
  const ball = { x: W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, trail: [] };

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
    } catch (e) { actx = null; }
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
    clear() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.16, type: 'triangle', gain: 0.32, delay: i * 0.09 }));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, { dur: 0.24, type: 'triangle', gain: 0.3, delay: i * 0.14 }));
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { dur: 0.2, type: 'triangle', gain: 0.32, delay: i * 0.1 }));
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
  const ballSpeed = () => Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * 30 + Math.min(120, bricksBrokenRun * 2));

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
  }

  function updateHUD() {
    scoreEl.textContent = score;
    bestEl.textContent = Math.max(best, score);
    levelEl.textContent = level;
    livesEl.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives));
    comboEl.textContent = '×' + mult();
    comboEl.style.color = combo > 0 ? '#b6ff00' : '';
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
    }
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------- Level setup ----------
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
        const hp = parseInt(ch, 10);
        bricks.push({
          x: margin + c * (bw + gap), y: top + r * (bh + gap),
          w: bw, h: bh, hp, maxHp: hp, alive: true,
        });
      }
    }
  }

  function resetBall() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = PADDLE_Y - BALL_R - 1;
    ball.vx = 0; ball.vy = 0;
    ball.trail = [];
  }

  function launch() {
    if (mode !== 'serving') return;
    const speed = ballSpeed();
    const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    mode = 'playing';
    sfx.launch();
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

  // ---------- Flow ----------
  function startRun() {
    ensureAudio();
    score = 0; lives = 3; level = 1;
    combo = 0; comboTimer = 0; bricksBrokenRun = 0;
    paddle.w = 96;
    paddle.x = (W - paddle.w) / 2;
    runStart = performance.now();
    buildLevel(level);
    resetBall();
    particles = []; texts = []; shake = 0;
    hideOverlays();
    mode = 'serving';
    updateHUD();
  }

  function pauseGame() {
    if (mode !== 'playing' && mode !== 'serving') return;
    pausedFrom = mode;
    mode = 'paused';
    pauseOverlay.classList.remove('hidden');
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    mode = pausedFrom;
    pauseOverlay.classList.add('hidden');
  }

  function togglePause() {
    if (mode === 'paused') resumeGame();
    else pauseGame();
  }

  function onLevelClear() {
    saveBest();
    mode = 'levelclear';
    sfx.clear();
    const last = level >= LEVELS.length;
    levelTitle.textContent = last ? 'YOU BEAT THE VOID!' : 'LEVEL ' + level + ' CLEAR!';
    levelStats.innerHTML = 'Score <strong>' + score + '</strong> &nbsp;·&nbsp; Best <strong>' + Math.max(best, score) + '</strong><br>Time ' + fmtTime(performance.now() - runStart);
    nextLevelBtn.textContent = last ? 'SEE RESULTS ▶' : 'NEXT LEVEL ▶';
    levelOverlay.classList.remove('hidden');
    updateHUD();
  }

  function nextLevel() {
    if (level >= LEVELS.length) { gameOver(true); return; }
    level++;
    buildLevel(level);
    resetBall();
    combo = 0; comboTimer = 0;
    levelOverlay.classList.add('hidden');
    mode = 'serving';
    updateHUD();
  }

  function gameOver(win) {
    saveBest();
    mode = 'gameover';
    if (win) sfx.win(); else sfx.over();
    gameOverTitle.textContent = win ? 'VOID CONQUERED!' : 'GAME OVER';
    gameOverStats.innerHTML = (win ? 'You cleared all ' + LEVELS.length + ' levels.' : 'The void claims another run.')
      + '<br>Score <strong>' + score + '</strong> &nbsp;·&nbsp; Best <strong>' + best + '</strong>'
      + '<br>Level reached: <strong>' + level + '</strong> &nbsp;·&nbsp; Time ' + fmtTime(performance.now() - runStart);
    hideOverlays();
    gameOverOverlay.classList.remove('hidden');
    updateHUD();
  }

  function loseBall() {
    lives--;
    combo = 0; comboTimer = 0;
    shake = 12;
    sfx.lose();
    burst(ball.x, H - 12, '#ff2d95', 26, 300);
    updateHUD();
    if (lives <= 0) { gameOver(false); return; }
    resetBall();
    mode = 'serving';
  }

  // ---------- Physics ----------
  function reflectOffBrick(b) {
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
    // Never let the ball go near-horizontal (boring endless loops).
    const sp = Math.hypot(ball.vx, ball.vy) || ballSpeed();
    if (Math.abs(ball.vy) < sp * 0.22) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * sp * 0.22;
      const s2 = Math.hypot(ball.vx, ball.vy);
      ball.vx = ball.vx / s2 * sp;
      ball.vy = ball.vy / s2 * sp;
    }
    return true;
  }

  function stepBall(dt) {
    const speed = Math.hypot(ball.vx, ball.vy) || ballSpeed();
    const dist = speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 4));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;

      // Walls.
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); sfx.wall(); burst(ball.x, ball.y, '#00f0ff', 3, 120); }
      if (ball.y - BALL_R > H) { loseBall(); return; }

      // Paddle (only while moving down).
      if (ball.vy > 0
        && ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + PADDLE_H
        && ball.x >= paddle.x - BALL_R && ball.x <= paddle.x + paddle.w + BALL_R) {
        const hit = clamp((ball.x - paddle.x) / paddle.w, 0, 1) - 0.5;
        const angle = hit * Math.PI * 0.78; // max ~70 degrees
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(angle) * sp + paddleVel * 0.12;
        ball.vy = -Math.cos(angle) * sp;
        const s2 = Math.hypot(ball.vx, ball.vy) || sp;
        ball.vx = ball.vx / s2 * sp;
        ball.vy = ball.vy / s2 * sp;
        ball.y = PADDLE_Y - BALL_R - 0.5;
        sfx.paddle();
        burst(ball.x, PADDLE_Y, '#00f0ff', 6, 160);
      }

      // Bricks: one hit per substep.
      for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (!b.alive) continue;
        if (ball.x + BALL_R < b.x || ball.x - BALL_R > b.x + b.w
          || ball.y + BALL_R < b.y || ball.y - BALL_R > b.y + b.h) continue;
        if (!reflectOffBrick(b)) continue;
        b.hp--;
        const color = BRICK_COLORS[b.maxHp];
        if (b.hp <= 0) {
          b.alive = false;
          combo++;
          comboTimer = COMBO_WINDOW;
          bricksBrokenRun++;
          const pts = BRICK_SCORE[b.maxHp] * mult();
          score += pts;
          floatText(b.x + b.w / 2, b.y, '+' + pts + (mult() > 1 ? ' ×' + mult() : ''), color);
          burst(b.x + b.w / 2, b.y + b.h / 2, color, 14, 260);
          shake = Math.min(8, shake + 1.5 + b.maxHp);
          sfx.brick(combo);
          updateHUD();
          if (bricks.every((bb) => !bb.alive)) { onLevelClear(); return; }
        } else {
          score += 10;
          burst(b.x + b.w / 2, b.y + b.h / 2, color, 5, 160);
          sfx.damage();
          updateHUD();
        }
        break;
      }
      if (mode !== 'playing') return;
    }
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
    shake *= Math.pow(0.001, dt);
    if (shake < 0.05) shake = 0;

    if (mode === 'playing') {
      if (combo > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 0; updateHUD(); }
      }
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
      stepBall(dt);
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();
    } else if (mode === 'serving') {
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
      ball.x = paddle.x + paddle.w / 2;
      ball.y = PADDLE_Y - BALL_R - 1;
      ball.trail = [];
    }
  }

  // ---------- Render ----------
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
      const w = (comboTimer / COMBO_WINDOW) * (W - 72);
      ctx.fillStyle = 'rgba(182,255,0,0.25)';
      ctx.fillRect(36, 56, W - 72, 4);
      ctx.fillStyle = '#b6ff00';
      ctx.fillRect(36, 56, Math.max(0, w), 4);
    }

    // Bricks.
    for (const b of bricks) {
      if (!b.alive) continue;
      const color = BRICK_COLORS[b.hp];
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.92;
      rr(b.x, b.y, b.w, b.h, 5);
      ctx.fill();
      ctx.restore();
      // Top highlight + hp pips.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(b.x + 2, b.y + 2, b.w - 4, 6, 3);
      ctx.fill();
      if (b.hp > 1) {
        ctx.fillStyle = 'rgba(7,3,18,0.75)';
        for (let p = 0; p < b.hp; p++) {
          ctx.beginPath();
          ctx.arc(b.x + b.w / 2 + (p - (b.hp - 1) / 2) * 10, b.y + b.h - 6, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

    // Ball trail + ball.
    for (let i = 0; i < ball.trail.length; i++) {
      const tp = ball.trail[i];
      ctx.globalAlpha = (i / ball.trail.length) * 0.3;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, BALL_R * (0.4 + 0.6 * i / ball.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (mode !== 'menu') {
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R - 3, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.fillText('SPACE  or  TAP  to launch', W / 2, H - 110);
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
    paddle.targetX = clamp(canvasX(e.clientX) - paddle.w / 2, 8, W - paddle.w - 8);
    if (mode === 'serving') launch();
  });

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    ensureAudio();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') {
      if (mode === 'serving') launch();
      else if (mode === 'playing') pauseGame();
      else if (mode === 'paused') resumeGame();
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Enter') {
      if (mode === 'menu') startRun();
      else if (mode === 'gameover') startRun();
      else if (mode === 'levelclear') nextLevel();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (mode === 'playing' || mode === 'serving')) pauseGame();
  });

  // ---------- Buttons ----------
  $('playBtn').addEventListener('click', startRun);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtnPause').addEventListener('click', startRun);
  nextLevelBtn.addEventListener('click', nextLevel);
  $('againBtn').addEventListener('click', startRun);
  pauseBtn.addEventListener('click', () => { ensureAudio(); togglePause(); });
  muteBtn.addEventListener('click', () => { ensureAudio(); toggleMute(); });

  // ---------- Boot ----------
  buildLevel(1);
  resetBall();
  updateHUD();
  updateMuteBtn();
  hideOverlays();
  menuOverlay.classList.remove('hidden');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render(now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
