// The flight model: throttle, drag, lift and stall, coordinated turns, ring passes,
// touchdowns and crashes. One fixed step at a time; the caller decides how many steps
// a frame needs. All angles are radians, all speeds m/s, all distances metres.

export {
  EVENT_CRASH,
  EVENT_FUEL_LOW,
  EVENT_LAND,
  EVENT_NONE,
  EVENT_RING,
  EVENT_TAKEOFF,
  EVENT_TIMEOUT,
} from './world.js';

import { COURSE, FUEL, GRAVITY, PLANE, SCORE } from './config.js';
import {
  EVENT_CRASH,
  EVENT_FUEL_LOW,
  EVENT_LAND,
  EVENT_NONE,
  EVENT_RING,
  EVENT_TAKEOFF,
  EVENT_TIMEOUT,
  announce,
  courseComplete,
  nextRing,
  onRunway,
  runwayAt,
  terrainHeightAt,
} from './world.js';

/** Clamp a value into a range. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Shortest signed difference between two headings, in (-PI, PI]. */
function headingDifference(target, current) {
  let difference = target - current;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference <= -Math.PI) difference += Math.PI * 2;
  return difference;
}

/** Advance the flight by one fixed step. Returns the events that fired this step. */
export function stepFlight(state, input, dt) {
  const plane = state.plane;
  let events = EVENT_NONE;
  state.time += dt;
  if (state.messageTimer > 0) state.messageTimer -= dt;

  // --- Controls: throttle, roll and pitch chase the stick, at limited rates. ---
  if (plane.fuel > 0) {
    plane.throttle = clamp(plane.throttle + input.throttle * 0.9 * dt, 0, 1);
  } else {
    plane.throttle = 0;
  }
  const targetRoll = input.roll * PLANE.maxRoll;
  const rollStep = PLANE.rollRate * dt;
  plane.roll += clamp(targetRoll - plane.roll, -rollStep, rollStep);
  const targetPitch = input.pitch * PLANE.maxPitch;
  const pitchStep = PLANE.pitchRate * dt;
  plane.pitch += clamp(targetPitch - plane.pitch, -pitchStep, pitchStep);

  // --- Speed: thrust against drag, climbing bleeds speed, diving gains it. ---
  const onGround = !plane.airborne;
  let acceleration = plane.throttle * PLANE.thrust - PLANE.baseDrag - PLANE.drag * plane.speed * plane.speed;
  acceleration -= GRAVITY * Math.sin(plane.pitch);
  if (input.brake) acceleration -= PLANE.brakeDrag;
  if (onGround) acceleration -= 2.5; // rolling resistance on the strip
  plane.speed = clamp(plane.speed + acceleration * dt, 0, PLANE.maxSpeed);

  // --- Attitude: a banked wing turns the nose; a slow wing stops lifting. ---
  if (plane.airborne) {
    const turnRate = (GRAVITY * Math.tan(plane.roll)) / Math.max(plane.speed, 12);
    plane.heading += turnRate * dt;
  }
  const forwardX = Math.sin(plane.heading) * Math.cos(plane.pitch);
  const forwardY = Math.sin(plane.pitch);
  const forwardZ = Math.cos(plane.heading) * Math.cos(plane.pitch);
  plane.verticalSpeed = plane.speed * forwardY;
  plane.groundSpeed = plane.speed * Math.cos(plane.pitch);

  // A wing below stall speed cannot hold the nose up: it sinks, faster the slower it is.
  let sink = 0;
  if (plane.airborne && plane.speed < PLANE.stallSpeed) {
    sink = (PLANE.stallSpeed - plane.speed) * 0.55;
  }

  plane.x += forwardX * plane.speed * dt;
  plane.y += (plane.verticalSpeed - sink) * dt;
  plane.z += forwardZ * plane.speed * dt;

  // --- Takeoff: fast enough on the strip and the wheels leave the ground. ---
  const ground = terrainHeightAt(state.seed, plane.x, plane.z);
  if (!plane.airborne) {
    plane.y = ground + PLANE.gearHeight;
    if (plane.speed >= PLANE.rotateSpeed && plane.pitch > 0.04) {
      plane.airborne = true;
      events |= EVENT_TAKEOFF;
      announce(state, 'AIRBORNE — fly the rings!', 3);
    }
  }

  // --- Fuel: full throttle burns fastest; empty tanks mean a glide, not a flameout. ---
  if (plane.airborne || plane.speed > 1) {
    plane.fuel = Math.max(0, plane.fuel - plane.throttle * FUEL.burnPerSecond * dt);
  }
  if (plane.fuel <= FUEL.lowWarning && !state.fuelWarned) {
    state.fuelWarned = true;
    events |= EVENT_FUEL_LOW;
    announce(state, 'LOW FUEL — mind the tanks', 4);
  }

  // --- Rings: crossing a ring's plane inside its circle scores it. The plane
  // approaches from the negative side of the ring's plane (the normal points
  // along the course), so a pass is the step where the signed distance changes
  // from below zero to zero or above; coming within the ring's radius of its
  // centre at any moment counts too, for a gate clipped at its edge.
  const ring = nextRing(state);
  if (ring) {
    const side = signedDistanceToRingPlane(state, ring);
    const previousSide = ring.previousSide;
    const distance = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
    const crossed = previousSide !== undefined && previousSide < 0 && side >= 0 && distance <= ring.radius;
    const clipped = distance <= ring.radius * 0.9;
    if (crossed || clipped) {
      ring.passed = true;
      state.ringsPassed += 1;
      state.score += SCORE.ring;
      events |= EVENT_RING;
      announce(state, `RING ${state.ringsPassed}/${COURSE.ringCount}  +${SCORE.ring}`, 2.5);
      if (courseComplete(state)) {
        announce(state, 'COURSE CLEAR — land on runway B!', 4);
      }
    }
    ring.previousSide = side;
  }

  // --- The ground: a gentle touchdown on the strip is a landing, anything else a crash.
  // Only a plane that is descending (or level) can touch: one climbing away from the
  // strip after rotation is leaving the ground, not landing on it.
  const descending = plane.verticalSpeed - sink <= 0.5;
  if (plane.airborne && descending && plane.y <= ground + PLANE.gearHeight) {
    const strip = runwayAt(plane.x, plane.z);
    const sinkRate = -(plane.verticalSpeed - sink);
    const gentle = sinkRate < 7 && plane.speed < 62 && Math.abs(plane.roll) < 0.4;
    if (strip === 'B' && gentle && courseComplete(state)) {
      landPlane(state, sinkRate, strip);
      events |= EVENT_LAND;
    } else if (strip && gentle) {
      // A soft touch on a strip mid-sortie: a touch-and-go, roll on, no harm done.
      plane.airborne = false;
      plane.y = ground + PLANE.gearHeight;
    } else {
      crashPlane(state, describeCrash(state, ground, sinkRate, strip));
      events |= EVENT_CRASH;
    }
  }

  // --- The clock: the sortie ends when the time runs out. ---
  if (state.time >= state.timeLimit && state.status === 'flying') {
    state.status = 'timeout';
    state.crashReason = 'Out of time — the sortie ended before you landed.';
    events |= EVENT_TIMEOUT;
  }

  return events;
}

/** Signed distance of the plane from a ring's plane, along the course direction. */
function signedDistanceToRingPlane(state, ring) {
  const plane = state.plane;
  const target = nextTargetAfter(state, ring);
  const nx = target.x - ring.x;
  const ny = target.y - ring.y;
  const nz = target.z - ring.z;
  const length = Math.hypot(nx, ny, nz) || 1;
  return ((plane.x - ring.x) * nx + (plane.y - ring.y) * ny + (plane.z - ring.z) * nz) / length;
}

/** The point the ring faces: the next ring, or the runway threshold after the last. */
function nextTargetAfter(state, ring) {
  const next = state.rings[ring.index + 1];
  if (next) return next;
  return { x: 60, y: 12, z: 2140 };
}

/** Settle the plane onto runway B and score the landing. */
function landPlane(state, sinkRate, strip) {
  const plane = state.plane;
  plane.airborne = false;
  plane.y = terrainHeightAt(state.seed, plane.x, plane.z) + PLANE.gearHeight;
  plane.pitch = 0;
  plane.roll *= 0.4;
  const centreOffset = Math.abs(plane.x - 60);
  const centreScore = Math.max(0, 1 - centreOffset / 15);
  const sinkScore = Math.max(0, 1 - Math.max(0, sinkRate - 1.5) / 5.5);
  const speedScore = Math.max(0, 1 - Math.max(0, plane.speed - 38) / 24);
  const quality = Math.round(SCORE.landingQualityMax * (centreScore * 0.5 + sinkScore * 0.3 + speedScore * 0.2));
  const timeBonus = Math.max(0, Math.round((COURSE.parTimeSeconds - state.time) * SCORE.timeBonusPerSecond));
  state.score += SCORE.landingBase + quality + timeBonus;
  state.status = 'landed';
  state.landing = {
    strip,
    centreOffset: Math.round(centreOffset * 10) / 10,
    sinkRate: Math.round(sinkRate * 10) / 10,
    speed: Math.round(plane.speed * 3.6),
    quality,
    timeBonus,
    time: Math.round(state.time),
  };
  announce(state, 'TOUCHDOWN — welcome back!', 4);
}

/** End the flight in a crash, with the reason the pilot will read. */
function crashPlane(state, reason) {
  state.status = 'crashed';
  state.crashReason = reason;
}

/** One plain sentence for why the flight ended. */
function describeCrash(state, ground, sinkRate, strip) {
  const plane = state.plane;
  if (plane.y <= 1 && ground < 0.5) return 'Ditched in the river — water is not a runway.';
  if (strip && sinkRate >= 7) return 'Too hard on the runway — the landing gear gave way.';
  if (strip && plane.speed >= 62) return 'Too fast for the strip — you ran out of runway.';
  if (Math.abs(plane.roll) >= 0.4 && strip) return 'Landed banked — a wing caught the ground.';
  if (plane.speed < PLANE.stallSpeed) return 'Stalled into the hillside — keep your speed up.';
  return 'Flew into the terrain — watch the hills ahead.';
}

/** Heading (radians) from the plane toward a point, for the autopilot and the HUD. */
export function headingTo(plane, x, z) {
  return Math.atan2(x - plane.x, z - plane.z);
}

/** Distance in metres from the plane to a point. */
export function distanceTo(plane, x, y, z) {
  return Math.hypot(x - plane.x, y - plane.y, z - plane.z);
}

export { clamp, headingDifference };
