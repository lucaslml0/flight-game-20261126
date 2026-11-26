// The valley Skyline Courier flies through: procedural terrain, a river and lake, two
// runways, a ring course, trees and clouds — all built from one seed, so the same seed
// always builds the same world. World units are metres: x east, z south, y up. The pilot
// takes off from runway A at the south end and lands on runway B two kilometres north.

import { COURSE, FUEL, PLANE, TIME_LIMIT_SECONDS } from './config.js';
import { createSeededRandom } from './input.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LAND = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL_LOW = 8;
export const EVENT_TIMEOUT = 16;
export const EVENT_TAKEOFF = 32;

/** Runway A: takeoff strip, centred on x = 0, running north from z = -160 to z = 260. */
export const RUNWAY_A = { x: 0, zStart: -160, zEnd: 260, halfWidth: 15 };
/** Runway B: landing strip, centred on x = 60, running north from z = 2080 to z = 2500. */
export const RUNWAY_B = { x: 60, zStart: 2080, zEnd: 2500, halfWidth: 15 };

/** Water sits at this height; terrain below it is riverbed or lakebed. */
export const WATER_LEVEL = 0.5;

/** The river meanders through the valley; its centreline x at a given z. */
export function riverCentreX(z) {
  return 170 * Math.sin(z * 0.0016) + 60 * Math.sin(z * 0.0042 + 1.7) - 40;
}

/** Smoothstep between two edges, 0 below the first and 1 above the second. */
export function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A 1-D value-noise field: hash the lattice, interpolate smoothly. */
function noise1(seed, x) {
  const xi = Math.floor(x);
  const frac = x - xi;
  const a = hash1(seed, xi);
  const b = hash1(seed, xi + 1);
  const u = frac * frac * (3 - 2 * frac);
  return a + (b - a) * u;
}

function hash1(seed, n) {
  let value = Math.imul(n ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

/** Two-dimensional value noise, built from the same hash. */
function noise2(seed, x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(seed, xi, zi);
  const b = hash2(seed, xi + 1, zi);
  const c = hash2(seed, xi, zi + 1);
  const d = hash2(seed, xi + 1, zi + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function hash2(seed, x, z) {
  let value = Math.imul((x * 374761393 + z * 668265263) ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

/** Fractal noise: three octaves of value noise, centred near 0.5. */
function fbm(seed, x, z) {
  return (
    noise2(seed, x, z) * 0.55 +
    noise2(seed + 101, x * 2.1, z * 2.1) * 0.3 +
    noise2(seed + 207, x * 4.3, z * 4.3) * 0.15
  );
}

/** Distance from a point to a runway rectangle, 0 inside it. */
function distanceToRunway(runway, x, z) {
  const dx = Math.abs(x - runway.x) - runway.halfWidth;
  const dz = Math.max(runway.zStart - z, 0, z - runway.zEnd);
  const outsideX = Math.max(dx, 0);
  const outsideZ = Math.max(dz, 0);
  if (dx <= 0 && dz === 0) return 0;
  return Math.hypot(outsideX, outsideZ);
}

/** True when the point is on (or just beside) either runway's strip. */
export function onRunway(x, z) {
  return distanceToRunway(RUNWAY_A, x, z) <= 2 || distanceToRunway(RUNWAY_B, x, z) <= 2;
}

/** Which runway, if any, the point sits on: 'A', 'B' or null. */
export function runwayAt(x, z) {
  if (distanceToRunway(RUNWAY_A, x, z) <= 2) return 'A';
  if (distanceToRunway(RUNWAY_B, x, z) <= 2) return 'B';
  return null;
}

/** Ground height at (x, z): rolling hills, a carved river and lake, flat runways. */
export function terrainHeightAt(seed, x, z) {
  // Rolling hills, growing rougher away from the valley floor.
  const rough = 0.6 + 0.4 * smoothstep(150, 500, Math.abs(x));
  let height = 4 + (fbm(seed, x * 0.004, z * 0.004) - 0.5) * 46 * rough;
  height += (fbm(seed + 31, x * 0.016, z * 0.016) - 0.5) * 7;
  // A ridge of high ground far to the east and west, framing the valley.
  const side = Math.abs(x);
  height += smoothstep(420, 700, side) * 55;
  // The river carves a channel down to below the waterline.
  const riverDistance = Math.abs(x - riverCentreX(z));
  const riverDepth = 1 - smoothstep(8, 34, riverDistance);
  height = height * (1 - riverDepth) + (-4) * riverDepth;
  // A lake widens the river around z = 1500.
  const lakeDistance = Math.hypot((x + 150) * 0.8, (z - 1500) * 0.45);
  const lakeDepth = 1 - smoothstep(90, 190, lakeDistance);
  height = height * (1 - lakeDepth) + (-5) * lakeDepth;
  // Both runways sit on flat aprons.
  const flatA = 1 - smoothstep(0, 70, distanceToRunway(RUNWAY_A, x, z));
  const flatB = 1 - smoothstep(0, 70, distanceToRunway(RUNWAY_B, x, z));
  const flat = Math.max(flatA, flatB);
  height = height * (1 - flat) + 2 * flat;
  return height;
}

/** True when the ground at (x, z) is under water. */
export function isWaterAt(seed, x, z) {
  return terrainHeightAt(seed, x, z) < WATER_LEVEL;
}

/** Build the ring course: eight gates weaving down the valley toward runway B. */
export function buildRingCourse(seed) {
  const random = createSeededRandom(seed ^ 0x5eed);
  const rings = [];
  for (let index = 0; index < COURSE.ringCount; index += 1) {
    const progress = (index + 1) / (COURSE.ringCount + 1);
    const z = 420 + progress * 1620;
    const x = Math.sin(progress * Math.PI * 1.6) * 135 + (random() - 0.5) * 40;
    const y = 55 + 75 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 2.2 + 0.8)) + random() * 15;
    rings.push({ x, y, z, radius: COURSE.ringRadius, passed: false, index });
  }
  return rings;
}

/** Scatter trees across the valley floor, clear of runways, river and rings. */
export function buildTreeField(seed, rings) {
  const random = createSeededRandom(seed ^ 0x7ee5);
  const trees = [];
  for (let attempt = 0; attempt < 5200 && trees.length < 620; attempt += 1) {
    const x = (random() - 0.5) * 1100;
    const z = -220 + random() * 2800;
    const height = terrainHeightAt(seed, x, z);
    if (height < 3.5 || height > 42) continue;
    if (Math.abs(x - riverCentreX(z)) < 42) continue;
    if (distanceToRunway(RUNWAY_A, x, z) < 30 || distanceToRunway(RUNWAY_B, x, z) < 30) continue;
    let nearRing = false;
    for (let index = 0; index < rings.length; index += 1) {
      if (Math.hypot(x - rings[index].x, z - rings[index].z) < 40) {
        nearRing = true;
        break;
      }
    }
    if (nearRing) continue;
    trees.push({
      x,
      z,
      y: height,
      height: 7 + random() * 7,
      width: 4 + random() * 3,
      shade: random(),
    });
  }
  return trees;
}

/** Puffs of cloud drifting above the valley, placed once per seed. */
export function buildCloudField(seed) {
  const random = createSeededRandom(seed ^ 0xc10d);
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: (random() - 0.5) * 1600,
      z: -300 + random() * 3000,
      y: 230 + random() * 130,
      radius: 26 + random() * 42,
      drift: 1.5 + random() * 2,
    });
  }
  return clouds;
}

/** Fresh flight state for a new sortie. */
export function createFlightState(seed) {
  const rings = buildRingCourse(seed);
  return {
    seed,
    rings,
    trees: buildTreeField(seed, rings),
    clouds: buildCloudField(seed),
    plane: {
      x: RUNWAY_A.x,
      y: terrainHeightAt(seed, RUNWAY_A.x, -60) + PLANE.gearHeight,
      z: -60,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      fuel: FUEL.start,
      airborne: false,
      verticalSpeed: 0,
      groundSpeed: 0,
    },
    score: 0,
    ringsPassed: 0,
    time: 0,
    timeLimit: TIME_LIMIT_SECONDS,
    status: 'title',
    message: '',
    messageTimer: 0,
    landing: null,
    crashReason: '',
    fuelWarned: false,
    events: EVENT_NONE,
    /** The screenshot autopilot's approach phase: false while lining up, true on final. */
    approachFinal: false,
  };
}

/** Put the plane back on runway A and clear the score, keeping the same world. */
export function resetFlight(state) {
  const fresh = createFlightState(state.seed);
  state.rings = fresh.rings;
  state.trees = fresh.trees;
  state.clouds = fresh.clouds;
  state.plane = fresh.plane;
  state.score = 0;
  state.ringsPassed = 0;
  state.time = 0;
  state.status = 'title';
  state.message = '';
  state.messageTimer = 0;
  state.landing = null;
  state.crashReason = '';
  state.fuelWarned = false;
  state.events = EVENT_NONE;
  state.approachFinal = false;
}

/** The next ring the pilot has to fly through, or null once the course is done. */
export function nextRing(state) {
  for (let index = 0; index < state.rings.length; index += 1) {
    if (!state.rings[index].passed) return state.rings[index];
  }
  return null;
}

/** True when every ring has been flown. */
export function courseComplete(state) {
  return state.ringsPassed >= COURSE.ringCount;
}

/** Show a short message on the HUD (seconds it stays up). */
export function announce(state, text, seconds) {
  state.message = text;
  state.messageTimer = seconds;
}
