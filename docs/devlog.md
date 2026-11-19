# Neon Void Breaker — Devlog

A neon brick-breaker roguelite built in a single 12-hour sprint
(Thu 2026-11-19, 00:10–12:10 Asia/Bangkok), in 24 half-hour blocks.
Vanilla HTML/CSS/JS, Canvas 2D, Web Audio synth — no build step, no
dependencies. Play it live:
https://namdev-muse.github.io/neon-void-breaker/

![Gameplay](screenshot-gameplay.png)

## The game in one paragraph

Break bricks, build combos, dodge void gravity wells, and draft upgrades
between levels. Six hand-designed levels, a mini-boss at the end of level 5,
six powerups, and a 1-of-3 upgrade draft after every clear. Lose the ball,
lose a life; lose all three and the run ends. Your best runs live in a local
top-5 table.

## Block by block

### Block 1 — Core engine
Paddle, ball, bricks, collision, score, lives. Repo created, GitHub Pages
live within the first half hour.

### Block 2 — Levels + progression
Levels 1–6 with hand-designed layouts, a speed/HP difficulty ramp, and
named level-intro cards ("FIRST CONTACT" and friends).

### Block 3 — Powerups
Capsules drop from broken bricks: multi-ball (up to 5 balls), wide paddle.
Caught by the paddle, lost if they fall past it.

### Block 4 — Juice pass 1
Particles, screen shake scaled to break size and combo, hit-stop freeze
frames on big breaks, impact flashes, shockwave rings, a long ball trail.
Also fixed the first real bug the juice exposed: a vertical-loop where the
ball could bounce straight up and down forever.

### Block 5 — Audio
Synthesized Web Audio SFX (zero audio files) and a synth-arpeggio music
loop (Am–F–C–G) with bass and hats that intensify as the combo multiplier
climbs. M mutes.

### Block 6 — Roguelite draft
After every level clear, pick 1 of 3 upgrades: extra life, wider paddle,
ball control, score boost, magnet paddle, twin launch. They stack for the
whole run. Run stats tracked: best combo, bricks broken, shot accuracy,
powerups caught/missed.

### Block 7 — UI
Pause menu with run snapshot, restart, and quit-to-menu. Game-over screen
with stats, a ★ NEW BEST! ★ badge, and the local top-5 high-score table.

### Block 8 — Mobile + keyboard
Touch drag to move, tap to launch, no scroll or pull-to-refresh while
playing. Full keyboard-only play: menus navigable by keys, draft picks by
1/2/3 or arrow keys + Enter, visible focus rings. Small-phone responsive
pass, including a landscape mode that fits the canvas to the viewport.

### Block 9 — The signature mechanic: void gravity wells
From level 2, black holes bend the ball's path inside a telegraphed pull
ring and swallow any ball that crosses the event horizon — then go sated
for 5s. Each well wakes for 2.5s of every 8s cycle and stirs visibly for
1s first, so you can time shots around it. A well eats at most one ball
per level. Serves are shielded for 1.2s and the paddle recenters after a
swallow. Balancing this took three full probes: always-on wells ate all
three AI lives on level 2; pulsing wells still did; the final recipe —
gentle bend, launch shield, paddle recenter, one meal per level — lets the
bot clear with one swallow and two lives left.

### Block 10 — Elites + mini-boss
Elite armored brick rows (high HP, big score) and a mini-boss at the end
of level 5: a big brick core with an HP bar. Combo fire effects at high
multiplier — the ball glows and throws flame particles.

### Block 11 — Playtest + bugfix pass 1
Laser paddle (Space to shoot), slow-mo (0.6× ball speed), and shield
(bottom net saves one lost ball) powerups. The headless bot harness caught
two real bugs before they shipped: slow-mo re-catch compounded the speed
cut, and a 4px laser bolt could sail through a 6px gap between bricks.
Both fixed; bolts now collide 8px wide. Also closed the ball-tunneling
audit (4px substeps) and the NaN/zero-velocity guard.

### Block 12 — Fireball + confetti
Fireball powerup: a piercing ball that smashes through bricks instead of
bouncing. Powerup HUD chips with draining countdown bars. Level-clear
confetti burst. The bot harness moved into the repo as
`tests/bot-harness.js` and now runs 33 checks, three times per block.

### Block 13 — README + repo polish
Real gameplay screenshots and an animated GIF, captured by driving the
live game in headless Chromium with the same ball-tracking bot the harness
uses. This devlog, issue templates, and a contributing guide.

### Block 14 — Perf + accessibility + live smoke test
The game now watches its own frame rate: sustained sub-45 FPS switches
to a low-perf mode (no `shadowBlur`, fewer particles, shorter ball
trails) and recovers when the frame rate comes back, so a weak machine
gets a smooth game instead of a stuttering one. Screen-reader players
get a polite live region announcing level clears, lost balls, powerups
and game over; every overlay is a proper dialog and draft cards carry
full aria-labels. `prefers-reduced-motion` turns off shake and confetti.
A new `tests/live-smoke.js` checks the deployed site after every push —
page, bundle and stylesheet all answer 200 and carry the current version
— and retries while GitHub Pages finishes deploying.

### Block 15 — Levels 7–10, seeded layouts, void bomb
The run is now ten levels: Void Maze, Twin Peaks, The Gauntlet, and
Event Horizon join the first six, each with its own void wells — and
clearing level 10 wakes a second boss, the 16-HP Void Core Prime. Layouts
vary by seed: every day plays the same walls, and `?seed=XXXX` shares a
layout with a friend (the seed shows on the menu, and the same seed
always builds the same wall — the harness proves it by comparing layout
signatures). New powerup: the Void Bomb, a capsule that detonates at the
ball nearest the bricks and shatters everything in a 160px radius.

### Block 17 — Moving, exploding and regenerating bricks + boss music

Three new brick types join the walls on levels 2–10. Green ↔ movers
slide sideways around their home column (±28px at 36px/s, alternating
direction by column so a row doesn't march in lockstep); orange ✸
exploders chain-damage all 8 neighbours for 1 HP when destroyed, and a
neighbour that dies as an exploder detonates in turn — the chain only
runs downhill, because damage is only ever dealt to live bricks, and a
chain that finishes the wall clears the level exactly once (the clear
check returns early if the blast already fired it). Sky-blue ↻
regenerators take 2 hits and come back 20 seconds after being broken,
at most twice each — clear the rest of the wall fast enough and the
level still ends before they return; a faint ghost outline with a
refill bar and a rising shimmer SFX mark where one is about to heal.
Movers only slide while playing, never on the serve, so the seeded
layout signature the harness compares at serve time stays
deterministic. For the block's audio theme, a live Void Core swaps the
music to a darker Am–F–E–G progression and holds the intensity at ×3
for the whole boss fight.

## How the game is tested

Every block runs `node tests/bot-harness.js` before pushing: a headless
bot plays full runs in a stubbed DOM, tracking the ball with the paddle,
drafting upgrades, and reporting coverage (levels cleared, powerups,
wells, boss, max combo) plus bug detectors for ball tunneling, stuck
balls, and NaN velocities. It exits non-zero if any detector fires.
The harness has caught three shipping bugs so far — the level-4 bleed-out
balance bug, the slow-mo compounding bug, and the laser gap-tunneling bug.
A second script, `tests/live-smoke.js`, checks the deployed site after
every push: the page, bundle and stylesheet answer 200 and carry the
current version, retrying while GitHub Pages finishes deploying.

## Block 18 — save &amp; continue, playtest pass 2

Mid-run saves landed: the run checkpoints to localStorage every 5s of
live play, on pause, on entering a fresh level, and when the tab closes,
and the menu offers a CONTINUE button (level + score in the label) that
restores the whole run — bricks with their HP and kind state, well
phases and meals, falling capsules, powerup timers, upgrades, stats and
the run clock. The ball is re-served glued to the paddle instead of
restored mid-flight, so a refresh can never resume on top of a brick or
inside a well. A corrupt save is rejected and hides CONTINUE; a fresh
run or a game over clears the save.

The same block ran playtest pass 2 with a human-like bot: a version that
predicts the ball's landing spot from its velocity (correcting every
100ms with ±25px of aim error) wins the whole game even at the real 12%
drop rate, while versions that merely chase the ball die on levels 1–2.
The probe's real finding was in the curve, not the bot: the ball-speed
ramp saturated (+120) inside level 1, so level 2 — the first void well —
arrived at 536px/s, 40% faster than the 380 the player had just learned
on. The ramp now saturates over ~2 levels (level 2 starts at 476) and
the first well bends at 0.6 instead of 0.8; the endgame cap (680) and
later wells are untouched.

The screenshots in this repo were captured the same way: the bot played
the real game in headless Chromium (Playwright) while screenshots were
taken mid-flight. No staged mockups — every pixel is the live game.

## Block 19 — favicon, meta &amp; PWA-lite polish

The game now has a real identity outside the tab. A proper `favicon.svg`
replaces the inline data-URI icon, with matching 192px / 512px PNG icons
and a 180px Apple touch icon, all drawn from the same neon design: pink
brick, violet void ring, cyan ball, lime paddle on the deep-space
background. `manifest.webmanifest` makes the game installable —
standalone display, portrait orientation, theme colour `#0b0620` — and
Open Graph / Twitter meta tags point at the real gameplay screenshot, so
a shared link shows the game instead of a blank card.

Offline works too: `sw.js` caches the whole app shell (page, styles,
game, icons, manifest, screenshot) on first visit, with a versioned
cache name (`nvb-v0.19.0`) so each release replaces the old shell, and
old caches are deleted on activation. Registration is guarded — it only
runs over HTTP(S) in browsers with service-worker support, and a failed
registration is silently ignored, so the game never depends on the
worker to play.

## Block 20 — launch copy drafts

With the game essentially complete, Block 20 wrote the words that will
announce it. `docs/release-notes-v1.0.md` is the full v1.0 release notes —
what's in the game, how a run works, controls, known limitations — marked
DRAFT until the v1.0 tag lands in Block 23, when the banner comes off and
the notes go into the GitHub release. `docs/launch-copy.md` is the launch
pack: a devlog launch post, three short social posts, an itch.io page
description, a GitHub release blurb and a one-line tagline, plus a
pre-flight checklist. Nothing in either file has been posted anywhere;
posting is a human decision, and the sprint never auto-posts.

## Block 21 — cross-browser check

Block 21 closed backlog item #52. A new test, `tests/xbrowser.js`
(Playwright), drives the real game in headless Chromium and Firefox:
load, start a run, sweep the paddle for 25 seconds, pause and resume
with P, open and close settings, flip the mute toggle — and asserts no
console or page errors in either browser. Result: 32/32 checks PASS.
Both browsers render the game identically (screenshots compared by eye:
same neon wall, HUD, paddle and serving hint), score rises while
sweeping, the run stays alive, FPS ~60 in Chromium and ~33 in headless
Firefox (software rasterizer; the in-game FPS guard engages below 45
as designed).

Safari has no Linux binary, so it got a static audit instead: the game
uses only broadly supported APIs — Canvas 2D, Web Audio with a
`webkitAudioContext` fallback, Pointer Events, `localStorage` wrapped in
try/catch, service-worker registration guarded to HTTP(S) — and no
post-2020 JS (`roundRect`, `replaceAll`, `findLast`, `structuredClone`
all absent). The audit did find three real gaps, all fixed in this
block: `backdrop-filter` and `mask-image` had no `-webkit-` prefix (old
Safari needs it), and the landscape `100dvh` cap had no `100vh`
fallback. The bot harness still passes 143/143 on three runs, so
nothing regressed.

## What's next

A final bugfix pass, then the v1.0 tag. See the roadmap in the README.
