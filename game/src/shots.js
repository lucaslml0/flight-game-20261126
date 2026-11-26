// The deterministic screenshot scenes behind ?shot=start|play|land|crash. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (point the nose at the next ring, hold a cruise speed, flare for the
// strip), so the frame is what a short game really looks like and the same seed always
// gives the same frame.

import { COURSE, STEP } from './config.js';
import { EVENT_CRASH, EVENT_LAND, courseComplete, nextRing, runwayAt, terrainHeightAt } from './world.js';
import { distanceTo, headingDifference, headingTo, stepFlight } from './physics.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 18;
const SCENE_LIMIT_SECONDS = 420;
const SAMPLE = STEP;

/** The autopilot's stick: where to point, how fast to go, when to brake. */
function autopilotInput(state, cautious) {
  const plane = state.plane;
  const ring = nextRing(state);
  let targetX;
  let targetY;
  let targetZ;
  let targetSpeed = 50;
  if (ring) {
    // Two-phase approach: first fly to a fixed point 300 m before the gate on the
    // line from the last gate, so the plane arrives lined up; only once it is
    // close to that point (or already past it) does it aim straight through the
    // gate. Chasing a moving point near the gate makes a banked plane orbit it.
    const previous = state.rings[ring.index - 1] || { x: 0, y: 12, z: -60 };
    let ax = ring.x - previous.x;
    let ay = ring.y - previous.y;
    let az = ring.z - previous.z;
    const aLength = Math.hypot(ax, ay, az) || 1;
    ax /= aLength;
    ay /= aLength;
    az /= aLength;
    const lineUpX = ring.x - ax * 300;
    const lineUpY = ring.y - ay * 300;
    const lineUpZ = ring.z - az * 300;
    const lineUpDistance = Math.hypot(lineUpX - plane.x, lineUpY - plane.y, lineUpZ - plane.z);
    const ringDistance = Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z);
    if (lineUpDistance > 60 && ringDistance > 260) {
      targetX = lineUpX;
      targetY = lineUpY;
      targetZ = lineUpZ;
    } else {
      targetX = ring.x;
      targetY = ring.y;
      targetZ = ring.z;
    }
  } else if (courseComplete(state)) {
    // Final approach: once the plane is lined up on the centreline, heading
    // north and low, the approach latches onto final and stays there until the
    // wheels touch or the plane flies past the strip (a go-around); flipping
    // back to the lineup point mid-final turns the plane around over the runway.
    // Until then, fly back out to a point 600 m before the threshold and come
    // in straight. Aiming at the threshold from off-centreline ends in the
    // grass beside the strip.
    if (!state.approachFinal) {
      state.approachFinal =
        Math.abs(plane.x - 60) < 120 &&
        Math.abs(headingDifference(0, plane.heading)) < 0.6 &&
        plane.z < 1950 &&
        plane.y < 80;
    } else if (plane.z > 2520) {
      state.approachFinal = false;
    }
    if (!state.approachFinal) {
      targetX = 60;
      targetZ = 1540;
      targetY = 30;
      targetSpeed = 45;
    } else {
      // Glide down the centreline, aiming 200 m ahead of the plane so it flies
      // on past the threshold instead of turning back to a fixed point, and keep
      // sinking once over the strip so the touchdown check can fire.
      targetX = 60;
      targetZ = Math.max(2260, plane.z + 200);
      const alongTrack = Math.max(0, 2140 - plane.z);
      targetY = plane.z > 2080 ? 2 : Math.max(2, 2 + alongTrack * 0.05);
      targetSpeed = 42;
    }
  } else {
    targetX = plane.x;
    targetY = plane.y;
    targetZ = plane.z + 100;
  }
  const wantedHeading = headingTo(plane, targetX, targetZ);
  const headingError = headingDifference(wantedHeading, plane.heading);
  const roll = Math.max(-1, Math.min(1, headingError * 1.6));
  const altitudeError = targetY - plane.y;
  const pitch = Math.max(-1, Math.min(1, altitudeError * 0.03 - plane.verticalSpeed * 0.04));
  // Slow down for a tight turn or a close gate: a slow plane turns in a much
  // smaller circle, so it can come back around a gate it overshot.
  if (ring) {
    const distance = Math.hypot(targetX - plane.x, targetY - plane.y, targetZ - plane.z);
    if (distance < 300) targetSpeed = 44;
    if (Math.abs(headingError) > 1.0) targetSpeed = 32;
  } else if (courseComplete(state) && Math.abs(headingError) > 1.0) {
    targetSpeed = 34;
  }
  let throttle = 0;
  if (plane.speed < targetSpeed - 3) throttle = 1;
  else if (plane.speed > targetSpeed + 3) throttle = -1;
  if (!plane.airborne) throttle = 1;
  const brake = courseComplete(state) && plane.z > 2050 && plane.speed > 40;
  return { roll, pitch, throttle, brake };
}

/** A reckless pilot for the crash scene: full throttle, nose down, no pull-up. */
function recklessInput(state) {
  const plane = state.plane;
  const ring = nextRing(state);
  const wantedHeading = ring ? headingTo(plane, ring.x, ring.z) : plane.heading;
  const headingError = headingDifference(wantedHeading, plane.heading);
  return {
    roll: Math.max(-1, Math.min(1, headingError * 1.2)),
    pitch: plane.y > 90 ? -0.9 : 0.2,
    throttle: 1,
    brake: false,
  };
}

/** Fly the world forward with the given pilot until the limit, or until it ends. */
function flyForward(state, seconds, pilot) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let index = 0; index < steps; index += 1) {
    const events = stepFlight(state, pilot(state), SAMPLE);
    if (events & (EVENT_CRASH | EVENT_LAND)) return events;
    if (state.status === 'timeout') return events;
  }
  return 0;
}

/**
 * Set the world to the named scene (start, play, land or crash; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'land' && name !== 'crash') {
    // Title: the plane sits on runway A, engines idling, valley ahead.
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      stepFlight(state, { roll: 0, pitch: 0, throttle: 0, brake: false }, STEP);
    }
    state.status = 'title';
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'crash') {
    flyForward(state, SCENE_LIMIT_SECONDS, recklessInput);
    return { screen: SCREEN_OVER, best: state.score };
  }
  if (name === 'land') {
    flyForward(state, SCENE_LIMIT_SECONDS, (current) => autopilotInput(current, true));
    if (state.status === 'landed') return { screen: SCREEN_LANDED, best: state.score };
    return { screen: state.status === 'crashed' ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  flyForward(state, PLAY_SECONDS, (current) => autopilotInput(current, false));
  return { screen: SCREEN_PLAY, best: state.score };
}

/** Expose the helpers the main loop's autopilot-free scenes use. */
export { distanceTo, runwayAt, terrainHeightAt };
