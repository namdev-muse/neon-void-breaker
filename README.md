# Neon Void Breaker

**A neon brick-breaker roguelite.** Break bricks, build combos, dodge void gravity wells, and draft upgrades between levels.

🎮 **Play it live:** https://namdev-muse.github.io/neon-void-breaker/

![Status](https://github.com/namdev-muse/neon-void-breaker/actions/workflows/ci-pages.yml/badge.svg)

## How to play

Bounce the ball with your paddle to smash every brick. Chain brick breaks without missing to raise your combo multiplier (up to ×5). Clear the board to advance. Lose the ball and you lose a life — lose all 3 and the run ends.

| Control | Action |
|---|---|
| Mouse / touch drag / ← → (or A / D) | Move paddle |
| Space / tap | Launch ball, pause |
| P / Space | Pause / resume |
| Esc | Pause / resume (quit to menu from game over) |
| R / N / Q (while paused) | Resume / restart / quit to menu |
| M | Mute / unmute |
| Enter / Space | Start, advance |
| 1 / 2 / 3 (or ← → + Enter) | Pick an upgrade in the draft |

## Features

- 6 hand-designed levels with multi-hit bricks
- Powerups: multi-ball and wide paddle drop from broken bricks (12% chance) — catch the capsule to activate; HUD shows active timers
- Roguelite upgrade draft: after every level clear, pick 1 of 3 upgrades (extra life, wider paddle, ball control, score boost, magnet paddle, twin launch) — they stack and last the whole run (Block 6)
- Run stats: best combo, bricks broken, shot accuracy, and powerups caught/missed shown on the game-over screen (Block 6)
- Pause menu with run snapshot, restart, and quit-to-menu (Esc / P / Space to pause &amp; resume) (Block 7)
- Local top-5 high-score table on the menu and game-over screens, with a ★ NEW BEST! ★ badge and your rank highlighted (Block 7)
- Touch polish: drag the paddle with your finger, tap to launch, no page scroll or pull-to-refresh while playing, no long-press menu (Block 8)
- Full keyboard-only play: Space/Enter start and advance, R/N/Q pause-menu shortcuts, ← → moves focus across draft cards, every overlay focuses its primary button, visible focus rings (Block 8)
- Small-phone responsive pass: 3-column HUD, shrinking draft cards, safe-area padding, landscape mode hides the help text and fits the canvas to the viewport height (Block 8)
- Combo multiplier with decay timer + on-screen combo bar
- Juice: particles, screen shake that scales with break size and combo, hit-stop freeze frames, impact flashes, shockwave rings, long ball trail, floating score popups
- Synthesized Web Audio sound effects (zero audio files)
- Background music loop: synth arpeggio (Am–F–C–G) with bass and hats that intensify as your combo multiplier climbs (Block 5)
- High score saved locally, auto-pause when the tab hides
- Fully responsive — desktop and mobile, no build step

## Coming up (12-hour sprint roadmap)

Powerups (multi-ball, wide paddle, laser), void gravity wells, elite rows, achievements, more levels, and a v1.0 release. See the sprint plan in the repo's commit history.

## Tech

Vanilla HTML / CSS / JavaScript, Canvas 2D, Web Audio API. No dependencies, no build step — the game is `index.html` + `style.css` + `game.js`.

## Run locally

```bash
# any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser.

## Deploy

Pushes to `main` run CI (JS syntax check + file checks) and deploy to GitHub Pages via GitHub Actions (`.github/workflows/ci-pages.yml`).

> One-time setup: in the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

## License

MIT — see [LICENSE](LICENSE).

Built by Iggy in a 12-hour autonomous sprint with Nam. 🚀
