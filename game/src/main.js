// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there, with the HUD on top. The game moves between five screens: title, play, paused,
// game over and landed.
//
// ?seed=N fixes the valley and the ring course. ?shot=start|play|land|crash (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createFlightState, resetFlight } from './world.js';
import { EVENT_CRASH, EVENT_FUEL_LOW, EVENT_LAND, EVENT_RING, EVENT_TAKEOFF, EVENT_TIMEOUT, stepFlight } from './physics.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createFlightState(seed);
/** The shots module stages scenes through this small world handle. */
const world = {
  state,
  reset() {
    resetFlight(state);
  },
};
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best);
    if (scene.screen === SCREEN_PLAY || scene.screen === SCREEN_TITLE) hud.draw(state, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetFlight(state);
    state.status = 'flying';
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startEngine();
    audio.click();
    announce('Playing. Fly the rings, then land on runway B.');
  }

  function endGame() {
    audio.stopEngine();
    if (state.status === 'landed') {
      screen = SCREEN_LANDED;
      audio.landingFanfare();
      announce(`Landed. Score ${state.score}.`);
    } else {
      screen = SCREEN_OVER;
      audio.crashSound();
      announce(`Game over. ${state.crashReason} Score ${state.score}.`);
    }
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      audio.startEngine();
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen idles on the strip: a little engine warm-up, no takeoff.
      return;
    }
    const events = stepFlight(
      state,
      {
        roll: input.rollCommand(),
        pitch: input.pitchCommand(),
        throttle: input.throttleCommand(),
        brake: input.brakeHeld(),
      },
      STEP,
    );
    audio.updateEngine(state.plane.throttle, state.plane.speed);
    if (events & EVENT_RING) audio.ringChime();
    if (events & EVENT_FUEL_LOW) audio.warnBeep();
    if (events & EVENT_TAKEOFF) announce('Airborne. Fly the rings.');
    if (events & (EVENT_CRASH | EVENT_LAND | EVENT_TIMEOUT)) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, best);
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) hud.draw(state, screen);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.stopEngine();
      announce('Paused.');
    }
  });

  // The first click or keypress unlocks audio in this browser.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Skyline Courier. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
