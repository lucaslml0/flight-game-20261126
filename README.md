# flight-game-20261126

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/lucaslml0/flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/lucaslml0/flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Skyline Courier — a chase-view flight game in vanilla JavaScript and canvas: no libraries, no network requests, everything procedural. Take off from runway A, thread eight glowing rings down a river valley, then bring the plane home to runway B before the fuel or the clock runs out.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Or serve the `game/` folder with any static server and open `index.html`.

| Control | What it does |
| --- | --- |
| Arrow keys / WASD | Pitch and roll (arrows pitch, A/D roll) |
| W / S or Shift / Ctrl | Throttle up / down |
| Space | Airbrake |
| Mouse | Hold and steer by pointer position |
| Enter / click | Start, restart |
| P or Esc | Pause |
| M | Sound on/off |
| R | Restart the sortie |

## The mission

- **Take off** from runway A: hold W to spool up, rotate past 108 km/h.
- **Fly the rings**: 8 glowing gates weave down the valley — 100 points each.
- **Mind the fuel**: full throttle burns fastest; empty tanks mean a glide.
- **Mind the hills**: below stall speed the wing stops lifting; terrain and water end
  the flight.
- **Land on runway B**: gentle sink, low speed, wings level. Landing quality and the
  time left both pay a bonus.

## Screenshots

Deterministic scenes, reproducible with `?shot=start|play|land|crash&seed=1` — the
autopilot flies the real rules forward from a fresh world, so every frame is a frame
a real game produces.

## Files

- `game/index.html` — the page, canvas and status line.
- `game/src/config.js` — every tuning number, colour and course constant.
- `game/src/input.js` — keyboard and mouse input, plus the seeded random generator.
- `game/src/world.js` — procedural terrain, river, lake, runways, rings, trees, clouds.
- `game/src/physics.js` — the flight model: thrust, drag, stall, turns, landings, crashes.
- `game/src/render.js` — the chase camera and everything it sees.
- `game/src/hud.js` — altitude, speed, compass, throttle, fuel, score, timer, warnings.
- `game/src/audio.js` — synthesised WebAudio sound: engine drone, chimes, fanfare.
- `game/src/shots.js` — deterministic screenshot scenes with an autopilot.
- `game/src/main.js` — boot, the fixed-step loop and the five screens.

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=w8dfntsk&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
