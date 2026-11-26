// Keyboard and mouse input for Skyline Courier. The keyboard flies the plane directly
// (arrows/WASD for pitch and roll, W/S or Shift/Ctrl for throttle, Space for the airbrake);
// the mouse steers by position when the pointer is held down over the canvas.
// Actions are edge-triggered and consumed once, so a held key never double-fires a menu.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

const KEY_ROLL_LEFT = ['ArrowLeft', 'a', 'A'];
const KEY_ROLL_RIGHT = ['ArrowRight', 'd', 'D'];
const KEY_PITCH_UP = ['ArrowUp'];
const KEY_PITCH_DOWN = ['ArrowDown'];
const KEY_THROTTLE_UP = ['w', 'W'];
const KEY_THROTTLE_DOWN = ['s', 'S'];
const KEY_THROTTLE_BOOST = ['Shift'];
const KEY_THROTTLE_IDLE = ['Control'];
const KEY_BRAKE = [' '];
const KEY_CONFIRM = ['Enter'];
const KEY_PAUSE = ['p', 'P', 'Escape'];
const KEY_MUTE = ['m', 'M'];
const KEY_RESTART = ['r', 'R'];

/** A tiny seeded generator (mulberry32) so the same seed always builds the same valley. */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create the input state for one canvas and wire its listeners. */
export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  function isDown(list) {
    for (let index = 0; index < list.length; index += 1) {
      if (keys.has(list[index])) return true;
    }
    return false;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.key);
    if (KEY_CONFIRM.includes(event.key) || KEY_BRAKE.includes(event.key)) actions |= ACTION_CONFIRM;
    if (KEY_PAUSE.includes(event.key)) actions |= ACTION_PAUSE;
    if (KEY_MUTE.includes(event.key)) actions |= ACTION_MUTE;
    if (KEY_RESTART.includes(event.key)) actions |= ACTION_RESTART;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key);
  }

  function onPointerDown(event) {
    mouseDown = true;
    updateMouse(event);
    actions |= ACTION_CONFIRM;
  }

  function onPointerMove(event) {
    updateMouse(event);
  }

  function onPointerUp() {
    mouseDown = false;
  }

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(1, rect.width);
    mouseY = (event.clientY - rect.top) / Math.max(1, rect.height);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Roll command from the stick: -1 (left) to +1 (right). */
    rollCommand() {
      let value = 0;
      if (isDown(KEY_ROLL_LEFT)) value -= 1;
      if (isDown(KEY_ROLL_RIGHT)) value += 1;
      if (mouseDown) value += clampMouseSteer(mouseX);
      return clampCommand(value);
    },

    /** Pitch command from the stick: +1 pulls the nose up. */
    pitchCommand() {
      let value = 0;
      if (isDown(KEY_PITCH_UP)) value += 1;
      if (isDown(KEY_PITCH_DOWN)) value -= 1;
      if (mouseDown) value += clampMouseSteer(0.5 - mouseY);
      return clampCommand(value);
    },

    /** Throttle change per second: +1 opens it, -1 closes it. */
    throttleCommand() {
      let value = 0;
      if (isDown(KEY_THROTTLE_UP) || isDown(KEY_THROTTLE_BOOST)) value += 1;
      if (isDown(KEY_THROTTLE_DOWN) || isDown(KEY_THROTTLE_IDLE)) value -= 1;
      return value;
    },

    /** True while the airbrake (Space) is held. */
    brakeHeld() {
      return isDown(KEY_BRAKE);
    },

    /** True while the pointer is held down on the canvas. */
    mouseSteering() {
      return mouseDown;
    },

    /** Take and clear the edge-triggered actions since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },

    /** Release every listener (used only by tests). */
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}

/** Map a pointer offset (0..1 across the canvas) to a -1..1 steer with a dead zone. */
function clampMouseSteer(offset) {
  const centred = (offset - 0.5) * 2;
  if (Math.abs(centred) < 0.12) return 0;
  return Math.max(-1, Math.min(1, centred * 1.4));
}

function clampCommand(value) {
  return Math.max(-1, Math.min(1, value));
}
