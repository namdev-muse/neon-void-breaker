# Neon Void Breaker — Release notes v1.0

> **DRAFT — prepared in Sprint Block 20 (2026-11-19). Do not publish until the
> v1.0 tag lands in Block 23.** When v1.0 ships, remove this banner, confirm
> the version number and the final feature list below against the live build,
> and paste this into the GitHub release for the `v1.0.0` tag.

## Neon Void Breaker v1.0 — break bricks, dodge the void

Our first complete game is live. Neon Void Breaker is a neon brick-breaker
roguelite you can play free in the browser — no install, no account, no
build step. Break bricks, build combos, dodge black holes, and draft an
upgrade after every level until the Void Core Prime falls.

**Play it now:** https://namdev-muse.github.io/neon-void-breaker/

## What's in v1.0

- **10 hand-designed levels** — from the gentle opening walls of Level 1 to
  Event Horizon, the final gauntlet around the 16-HP Void Core Prime.
- **Void gravity wells (the signature mechanic)** — from Level 2, black
  holes bend the ball's path inside a telegraphed pull ring and swallow any
  ball that crosses the event horizon. Each well wakes for 2.5s of every 8s
  cycle and stirs visibly for 1s first, so you can time your shots around
  it. A well eats at most one ball per level.
- **Three new brick types** — green movers slide sideways across their row,
  orange exploders chain-damage all 8 neighbours when destroyed (and chain
  into each other), and sky-blue regenerators come back 20s after being
  broken — twice each — unless you clear the level first.
- **Two mini-bosses** — clearing Level 5 wakes the 12-HP Void Core; clearing
  Level 10 wakes the 16-HP Void Core Prime. Each must be destroyed to
  advance.
- **7 powerups** — multi-ball, wide paddle, laser paddle (Space to shoot),
  slow-mo, shield (bottom net saves one lost ball), fireball (piercing
  ball), and void bomb (160px blast). Capsules drop from broken bricks —
  catch one to activate; active timers show as coloured chips in the HUD.
- **Roguelite upgrade draft** — after every level clear, pick 1 of 3
  upgrades (extra life, wider paddle, ball control, score boost, magnet
  paddle, twin launch). They stack and last the whole run.
- **Seeded level variations** — layouts vary by seed: everyone plays the
  same walls each day, and `?seed=XXXX` in the URL shares one. The seed
  shows on the menu.
- **Achievements** — 14 to unlock, from FIRST BLOOD to VOID CONQUERED, with
  lifetime stats on the menu and your run's unlocks on the game-over screen.
- **Save / continue** — your run auto-saves every 5s, on pause, and when the
  tab closes. Refresh or come back later and CONTINUE picks up the same
  level, score, lives, upgrades and brick layout.
- **Full game feel** — particles, screen shake that scales with break size
  and combo, hit-stop freeze frames, impact flashes, shockwave rings, a long
  ball trail, floating score popups, level-clear confetti, and a combo
  multiplier with a decay timer and on-screen bar.
- **Synthesized audio** — Web Audio sound effects (zero audio files) and a
  synth arpeggio music loop that intensifies as your combo climbs — and
  turns darker while a Void Core lives. Volume, music and SFX controls in
  the settings panel (gear icon, top right).
- **Play anywhere** — mouse, touch (drag to move, tap to launch) and full
  keyboard-only play; responsive down to small phones; installable as a PWA
  and playable offline after the first visit.
- **Accessibility** — screen-reader announcements for key events, all
  overlays are real dialogs, keyboard focus is managed, and
  prefers-reduced-motion is honoured.

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch drag | Move paddle |
| ← → / A D | Move paddle (keyboard) |
| Space | Launch ball / fire laser / pause & resume |
| P / Esc | Pause / resume |
| M | Mute |
| R / N / Q | Restart / next / quit (in the pause menu) |

## How a run works

1. Launch the ball and break every brick to clear the level.
2. Chain breaks without losing the ball to raise your combo multiplier.
3. Catch falling capsules for powerups; dodge the void wells.
4. After each clear, draft 1 of 3 upgrades.
5. Beat all 10 levels and destroy the Void Core Prime to win the run.
   Lose all your lives and the run ends — your best score is saved locally.

## Known limitations (v1.0)

- High scores and achievements live in your browser's local storage — they
  don't sync between devices or browsers.
- The game is English-only for now.
- Best experienced in a modern desktop or mobile browser (Chrome, Firefox,
  Safari, Edge).

## Credits

Built in a 12-hour sprint by [Iggy](https://github.com/namdev-muse) with
[Nam](https://github.com/namdev-muse) — vanilla HTML/CSS/JS, Canvas 2D and
the Web Audio API. No dependencies, no build step. The full build story is
in [docs/devlog.md](devlog.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) (lands with the v1.0 tag, Block 23).
