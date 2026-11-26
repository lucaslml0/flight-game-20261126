// The chase camera and everything it sees: sky, sun, distant mountains, clouds, the
// valley floor drawn as projected strips, trees, the river, both runways, the glowing
// rings and the aircraft itself, banking in front of the lens. All drawing is plain
// canvas 2D; the "3D" is a small perspective projector the renderer owns.

import { PALETTE, VIEW } from './config.js';
import { WATER_LEVEL, riverCentreX, terrainHeightAt } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

/** How far the camera sits behind the plane, and how high above it. */
const CAMERA_BACK = 15;
const CAMERA_UP = 4.6;
/** The camera looks this far ahead of the plane. */
const CAMERA_AHEAD = 34;
/** Closest distance a point can be and still project. */
const NEAR = 0.6;
/** How far the terrain strips reach, metres. */
const VIEW_DISTANCE = 760;

/** A 1-D hash for deterministic speckle in the grass. */
function hash2i(x, z) {
  let value = Math.imul((x * 374761393 + z * 668265263) ^ 0x9e3779b9, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

/** Build the renderer for one canvas; it owns the projector and the paint order. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = VIEW.width;
  let height = VIEW.height;
  let scale = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(320, Math.floor(rect.width));
    height = Math.max(240, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(width / VIEW.width, height / VIEW.height);
  }

  resize();
  window.addEventListener('resize', resize);

  /** Camera basis for this frame, from the plane's position and attitude. */
  function cameraBasis(plane) {
    const heading = plane.heading;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);
    const eye = {
      x: plane.x - fwdX * CAMERA_BACK,
      y: plane.y + CAMERA_UP + plane.pitch * 6,
      z: plane.z - fwdZ * CAMERA_BACK,
    };
    const look = {
      x: plane.x + fwdX * CAMERA_AHEAD,
      y: plane.y + plane.pitch * 26 + 1.2,
      z: plane.z + fwdZ * CAMERA_AHEAD,
    };
    let fx = look.x - eye.x;
    let fy = look.y - eye.y;
    let fz = look.z - eye.z;
    const fLength = Math.hypot(fx, fy, fz) || 1;
    fx /= fLength;
    fy /= fLength;
    fz /= fLength;
    // right = world-up x forward (screen right when facing forward); up = forward x right.
    let rx = fz;
    let rz = -fx;
    const rLength = Math.hypot(rx, rz) || 1;
    rx /= rLength;
    rz /= rLength;
    const ux = fy * rz - fz * 0;
    const uy = fz * rx - fx * rz;
    const uz = fx * 0 - fy * rx;
    const uLength = Math.hypot(ux, uy, uz) || 1;
    return {
      eye,
      fwd: { x: fx, y: fy, z: fz },
      right: { x: rx, y: 0, z: rz },
      up: { x: ux / uLength, y: uy / uLength, z: uz / uLength },
      focal: height * 0.92,
    };
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(camera, point) {
    const dx = point.x - camera.eye.x;
    const dy = point.y - camera.eye.y;
    const dz = point.z - camera.eye.z;
    const z = dx * camera.fwd.x + dy * camera.fwd.y + dz * camera.fwd.z;
    if (z < NEAR) return null;
    const x = dx * camera.right.x + dz * camera.right.z;
    const y = dx * camera.up.x + dy * camera.up.y + dz * camera.up.z;
    const cx = width / 2;
    const cy = height / 2;
    return {
      x: cx + (x * camera.focal) / z,
      y: cy - (y * camera.focal) / z,
      z,
      scale: camera.focal / z,
    };
  }

  /** Screen y of the horizon: a far point at the camera's own height. */
  function horizonY(camera) {
    const far = project(camera, {
      x: camera.eye.x + camera.fwd.x * 5000,
      y: camera.eye.y,
      z: camera.eye.z + camera.fwd.z * 5000,
    });
    return far ? far.y : height * 0.42;
  }

  function drawSky(camera, plane) {
    const horizon = horizonY(camera);
    const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(horizon + 2, height));
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, Math.max(horizon + 2, 0));
    // The sun hangs off the pilot's left shoulder.
    const sunAngle = plane.heading - 0.9;
    const sunDirection = { x: Math.sin(sunAngle), z: Math.cos(sunAngle) };
    const sunPoint = project(camera, {
      x: camera.eye.x + sunDirection.x * 3000,
      y: camera.eye.y + 620,
      z: camera.eye.z + sunDirection.z * 3000,
    });
    if (sunPoint && sunPoint.x > -80 && sunPoint.x < width + 80 && sunPoint.y > -80) {
      ctx.fillStyle = PALETTE.sunGlow;
      ctx.beginPath();
      ctx.arc(sunPoint.x, sunPoint.y, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sunPoint.x, sunPoint.y, 30, 0, Math.PI * 2);
      ctx.fill();
    }
    drawMountains(camera, plane, horizon);
    // Haze below the horizon so the terrain fades into the distance.
    const haze = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 140);
    haze.addColorStop(0, 'rgba(216, 232, 245, 0)');
    haze.addColorStop(1, 'rgba(216, 232, 245, 0.55)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 60, width, 200);
  }

  /** Two ridges of mountains on the horizon, shifting with the heading. */
  function drawMountains(camera, plane, horizon) {
    for (let layer = 0; layer < 2; layer += 1) {
      const base = layer === 0 ? 34 : 78;
      const amplitude = layer === 0 ? 46 : 92;
      const seed = layer === 0 ? 7 : 23;
      ctx.fillStyle = layer === 0 ? PALETTE.mountainFar : PALETTE.mountainNear;
      ctx.beginPath();
      ctx.moveTo(-4, horizon + 2);
      for (let sx = -4; sx <= width + 8; sx += 8) {
        const angle = plane.heading + ((sx - width / 2) / camera.focal) * 0.9 + layer * 1.3;
        const peak = noiseAt(seed, angle * 2.4) * amplitude + base;
        ctx.lineTo(sx, horizon - peak);
      }
      ctx.lineTo(width + 4, horizon + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function noiseAt(seed, x) {
    const xi = Math.floor(x);
    const frac = x - xi;
    const u = frac * frac * (3 - 2 * frac);
    return hash1(seed, xi) * (1 - u) + hash1(seed, xi + 1) * u;
  }

  function hash1(seed, n) {
    let value = Math.imul(n ^ seed, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function drawClouds(camera, state) {
    ctx.save();
    for (let index = 0; index < state.clouds.length; index += 1) {
      const cloud = state.clouds[index];
      const point = project(camera, { x: cloud.x, y: cloud.y, z: cloud.z });
      if (!point || point.z < 60 || point.z > 2400) continue;
      const radius = cloud.radius * point.scale;
      if (radius < 3 || radius > 420) continue;
      if (point.x < -radius * 1.6 || point.x > width + radius * 1.6) continue;
      if (point.y < -radius || point.y > height + radius) continue;
      ctx.fillStyle = PALETTE.cloudShade;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y + radius * 0.18, radius * 1.25, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.cloud;
      ctx.beginPath();
      ctx.ellipse(point.x - radius * 0.55, point.y, radius * 0.7, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(point.x + radius * 0.5, point.y - radius * 0.12, radius * 0.75, radius * 0.52, 0, 0, Math.PI * 2);
      ctx.ellipse(point.x, point.y - radius * 0.28, radius * 0.7, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Colour of the ground at one sample, by height, water, sand and runway. */
  function groundColour(seed, x, z, groundHeight) {
    if (Math.abs(x) < 15.5 && z > -160 && z < 260) return PALETTE.runway;
    if (Math.abs(x - 60) < 15.5 && z > 2080 && z < 2500) return PALETTE.runway;
    if (groundHeight < WATER_LEVEL) return groundHeight < -2 ? PALETTE.waterDeep : PALETTE.water;
    const riverDistance = Math.abs(x - riverCentreX(z));
    if (riverDistance < 40 && groundHeight < 4.5) return PALETTE.sand;
    const patch = hash2i(Math.floor(x / 14), Math.floor(z / 14));
    const shade = 0.82 + patch * 0.36;
    const high = groundHeight > 26;
    const base = high ? PALETTE.grassDry : groundHeight > 14 ? PALETTE.grassHigh : PALETTE.grassLow;
    return shadeColour(base, shade, patch > 0.86 ? PALETTE.forest : null, patch);
  }

  function shadeColour(hex, factor, blend, blendAmount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    let rr = Math.round(r * factor);
    let gg = Math.round(g * factor);
    let bb = Math.round(b * factor);
    if (blend && blendAmount > 0.86) {
      const br = parseInt(blend.slice(1, 3), 16);
      const bg = parseInt(blend.slice(3, 5), 16);
      const bb2 = parseInt(blend.slice(5, 7), 16);
      const t = (blendAmount - 0.86) / 0.14;
      rr = Math.round(rr * (1 - t) + br * t);
      gg = Math.round(gg * (1 - t) + bg * t);
      bb = Math.round(bb * (1 - t) + bb2 * t);
    }
    return `rgb(${rr},${gg},${bb})`;
  }

  /** The valley floor, drawn far-to-near as strips of projected quads. */
  function drawTerrain(camera, state) {
    const seed = state.seed;
    const plane = state.plane;
    const fwdX = Math.sin(plane.heading);
    const fwdZ = Math.cos(plane.heading);
    const rightX = fwdZ;
    const rightZ = -fwdX;
    const columns = 26;
    const rows = [];
    // Rows start just ahead of the camera lens and run out to the horizon, so the
    // ground fills the bottom of the frame instead of leaving sky-coloured canvas.
    let distance = 2.5;
    while (distance < VIEW_DISTANCE) {
      rows.push(distance);
      distance *= 1.16;
    }
    let previous = null;
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
      const d = rows[rowIndex];
      const halfWidth = d * 0.85 + 12;
      const centreX = camera.eye.x + fwdX * d;
      const centreZ = camera.eye.z + fwdZ * d;
      const samples = [];
      for (let col = 0; col <= columns; col += 1) {
        const lateral = -halfWidth + (2 * halfWidth * col) / columns;
        const x = centreX + rightX * lateral;
        const z = centreZ + rightZ * lateral;
        const groundHeight = terrainHeightAt(seed, x, z);
        const point = project(camera, { x, y: groundHeight, z });
        samples.push({ point, colour: groundColour(seed, x, z, groundHeight) });
      }
      if (previous) {
        for (let col = 0; col < columns; col += 1) {
          const a = samples[col];
          const b = samples[col + 1];
          const c = previous[col + 1];
          const e = previous[col];
          if (!a.point || !b.point || !c.point || !e.point) continue;
          ctx.fillStyle = a.colour;
          ctx.beginPath();
          ctx.moveTo(a.point.x, a.point.y);
          ctx.lineTo(b.point.x, b.point.y);
          ctx.lineTo(c.point.x, c.point.y);
          ctx.lineTo(e.point.x, e.point.y);
          ctx.closePath();
          ctx.fill();
        }
      }
      previous = samples;
    }
    drawRunwayLines(camera);
  }

  /** Centreline dashes and edge lines on both runways. */
  function drawRunwayLines(camera) {
    ctx.save();
    ctx.strokeStyle = PALETTE.runwayEdge;
    ctx.lineWidth = 2;
    for (const runway of [
      { x: 0, zStart: -160, zEnd: 260 },
      { x: 60, zStart: 2080, zEnd: 2500 },
    ]) {
      drawWorldLine(camera, [
        { x: runway.x - 14, y: 2.4, z: runway.zStart },
        { x: runway.x - 14, y: 2.4, z: runway.zEnd },
        { x: runway.x + 14, y: 2.4, z: runway.zStart },
        { x: runway.x + 14, y: 2.4, z: runway.zEnd },
      ]);
    }
    ctx.strokeStyle = PALETTE.runwayMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 18]);
    drawWorldLine(camera, [
      { x: 0, y: 2.4, z: -150 },
      { x: 0, y: 2.4, z: 250 },
    ]);
    drawWorldLine(camera, [
      { x: 60, y: 2.4, z: 2090 },
      { x: 60, y: 2.4, z: 2490 },
    ]);
    ctx.restore();
  }

  /** A polyline through world points, drawn as screen segments where visible. */
  function drawWorldLine(camera, points) {
    ctx.beginPath();
    let started = false;
    for (let index = 0; index < points.length; index += 1) {
      const point = project(camera, points[index]);
      if (!point) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(point.x, point.y);
        started = true;
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
  }

  function drawTrees(camera, state) {
    const visible = [];
    for (let index = 0; index < state.trees.length; index += 1) {
      const tree = state.trees[index];
      const point = project(camera, { x: tree.x, y: tree.y, z: tree.z });
      if (!point || point.z < 8 || point.z > 700) continue;
      if (point.x < -60 || point.x > width + 60 || point.y < -40 || point.y > height + 20) continue;
      visible.push({ tree, point });
    }
    visible.sort((a, b) => b.point.z - a.point.z);
    for (let index = 0; index < visible.length; index += 1) {
      const { tree, point } = visible[index];
      const treeHeight = tree.height * point.scale;
      if (treeHeight < 2) continue;
      const treeWidth = tree.width * point.scale;
      const topY = point.y - treeHeight;
      ctx.fillStyle = PALETTE.treeTrunk;
      ctx.fillRect(point.x - treeWidth * 0.08, point.y - treeHeight * 0.25, treeWidth * 0.16, treeHeight * 0.25);
      ctx.fillStyle = tree.shade > 0.5 ? PALETTE.treeTopLight : PALETTE.treeTop;
      ctx.beginPath();
      ctx.moveTo(point.x, topY);
      ctx.lineTo(point.x - treeWidth / 2, point.y - treeHeight * 0.3);
      ctx.lineTo(point.x + treeWidth / 2, point.y - treeHeight * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(point.x, topY + treeHeight * 0.22);
      ctx.lineTo(point.x - treeWidth * 0.42, point.y - treeHeight * 0.12);
      ctx.lineTo(point.x + treeWidth * 0.42, point.y - treeHeight * 0.12);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Each ring as a glowing circle facing the course, with a chevron pointing through it. */
  function drawRings(camera, state) {
    const plane = state.plane;
    const sorted = [...state.rings].sort((a, b) => {
      const da = Math.hypot(a.x - plane.x, a.y - plane.y, a.z - plane.z);
      const db = Math.hypot(b.x - plane.x, b.y - plane.y, b.z - plane.z);
      return db - da;
    });
    for (let index = 0; index < sorted.length; index += 1) {
      const ring = sorted[index];
      const target = state.rings[ring.index + 1] || { x: 60, y: 12, z: 2140 };
      let nx = target.x - ring.x;
      let ny = target.y - ring.y;
      let nz = target.z - ring.z;
      const nLength = Math.hypot(nx, ny, nz) || 1;
      nx /= nLength;
      ny /= nLength;
      nz /= nLength;
      // A vector across the ring's face, perpendicular to its normal.
      let ax = -nz;
      let ay = 0;
      let az = nx;
      const aLength = Math.hypot(ax, az) || 1;
      ax /= aLength;
      az /= aLength;
      const bx = ny * az - nz * ay;
      const by = nz * ax - nx * az;
      const bz = nx * ay - ny * ax;
      const segments = 26;
      const points = [];
      for (let step = 0; step <= segments; step += 1) {
        const angle = (step / segments) * Math.PI * 2;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        points.push(
          project(camera, {
            x: ring.x + (ax * ca + bx * sa) * ring.radius,
            y: ring.y + (ay * ca + by * sa) * ring.radius,
            z: ring.z + (az * ca + bz * sa) * ring.radius,
          }),
        );
      }
      const centre = project(camera, { x: ring.x, y: ring.y, z: ring.z });
      if (!centre) continue;
      const passed = ring.passed;
      const colour = passed ? PALETTE.ringDone : PALETTE.ring;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = passed ? 'rgba(55, 214, 122, 0.35)' : PALETTE.ringGlow;
      ctx.lineWidth = 9;
      strokeRing(points);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 3;
      strokeRing(points);
      if (!passed) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold ${Math.max(11, Math.min(20, centre.z > 0 ? 340 / centre.z : 20))}px ${'system-ui, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${ring.index + 1}`, centre.x, centre.y - ring.radius * centre.scale * 0.5 - 14);
      }
      ctx.restore();
    }
  }

  function strokeRing(points) {
    ctx.beginPath();
    let started = false;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(point.x, point.y);
        started = true;
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
  }

  /** The aircraft, seen from behind and above, banking with the roll. */
  function drawAircraft(camera, state) {
    const plane = state.plane;
    const nose = project(camera, {
      x: plane.x + Math.sin(plane.heading) * 3,
      y: plane.y + 0.4,
      z: plane.z + Math.cos(plane.heading) * 3,
    });
    if (!nose) return;
    const size = 74 * scale + 30;
    const cx = nose.x;
    const cy = nose.y + size * 0.42;
    // Shadow on the ground far below, shrinking as the plane climbs.
    const ground = project(camera, { x: plane.x, y: 2, z: plane.z });
    if (ground && plane.y < 220) {
      const shadowScale = Math.max(0.25, 1 - plane.y / 260);
      ctx.save();
      ctx.fillStyle = `rgba(20, 30, 20, ${0.22 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, 34 * shadowScale * scale + 10, 8 * shadowScale * scale + 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * 0.9);
    // Wings, swept back, with red tips.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-size * 0.52, size * 0.1);
    ctx.lineTo(-size * 0.12, -size * 0.02);
    ctx.lineTo(-size * 0.12, size * 0.16);
    ctx.lineTo(-size * 0.52, size * 0.3);
    ctx.closePath();
    ctx.moveTo(size * 0.52, size * 0.1);
    ctx.lineTo(size * 0.12, -size * 0.02);
    ctx.lineTo(size * 0.12, size * 0.16);
    ctx.lineTo(size * 0.52, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-size * 0.55, size * 0.08, size * 0.05, size * 0.2);
    ctx.fillRect(size * 0.5, size * 0.08, size * 0.05, size * 0.2);
    // Tailplane and fin.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, size * 0.34);
    ctx.lineTo(-size * 0.05, size * 0.28);
    ctx.lineTo(-size * 0.05, size * 0.38);
    ctx.lineTo(-size * 0.2, size * 0.44);
    ctx.closePath();
    ctx.moveTo(size * 0.2, size * 0.34);
    ctx.lineTo(size * 0.05, size * 0.28);
    ctx.lineTo(size * 0.05, size * 0.38);
    ctx.lineTo(size * 0.2, size * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.lineTo(-size * 0.05, size * 0.46);
    ctx.lineTo(size * 0.05, size * 0.46);
    ctx.closePath();
    ctx.fill();
    // Fuselage, tapering toward the nose, with a red belly stripe.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.34);
    ctx.quadraticCurveTo(size * 0.13, -size * 0.1, size * 0.11, size * 0.3);
    ctx.quadraticCurveTo(size * 0.08, size * 0.48, 0, size * 0.5);
    ctx.quadraticCurveTo(-size * 0.08, size * 0.48, -size * 0.11, size * 0.3);
    ctx.quadraticCurveTo(-size * 0.13, -size * 0.1, 0, -size * 0.34);
    ctx.fill();
    ctx.fillStyle = PALETTE.planeBelly;
    ctx.beginPath();
    ctx.moveTo(-size * 0.07, size * 0.28);
    ctx.lineTo(size * 0.07, size * 0.28);
    ctx.lineTo(size * 0.05, size * 0.46);
    ctx.lineTo(-size * 0.05, size * 0.46);
    ctx.closePath();
    ctx.fill();
    // Canopy.
    ctx.fillStyle = PALETTE.planeCanopy;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.12, size * 0.07, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights.
    ctx.fillStyle = '#ff5a4e';
    ctx.beginPath();
    ctx.arc(-size * 0.52, size * 0.18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.arc(size * 0.52, size * 0.18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Paint one frame: the world, the plane and the screen's overlay text. */
  function draw(state, screen, best) {
    const plane = state.plane;
    const camera = cameraBasis(plane);
    ctx.clearRect(0, 0, width, height);
    drawSky(camera, plane);
    drawClouds(camera, state);
    drawTerrain(camera, state);
    drawTrees(camera, state);
    drawRings(camera, state);
    if (screen !== SCREEN_TITLE || state.time > 0.1) drawAircraft(camera, state);
    if (screen === SCREEN_TITLE) drawTitleOverlay(state, best);
    if (screen === SCREEN_PAUSED) drawCentredPanel('PAUSED', 'Press P or Enter to keep flying');
    if (screen === SCREEN_OVER) drawOverOverlay(state, best);
    if (screen === SCREEN_LANDED) drawLandedOverlay(state, best);
  }

  function drawTitleOverlay(state, best) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10, 18, 30, 0.45)';
    ctx.fillRect(0, height * 0.12, width, height * 0.52);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 ${Math.round(54 * scale + 18)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('SKYLINE COURIER', width / 2, height * 0.26);
    ctx.font = `500 ${Math.round(17 * scale + 7)}px ${'system-ui, sans-serif'}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('Fly eight rings down the valley — then bring her home to runway B.', width / 2, height * 0.33);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `${Math.round(15 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('Arrows / WASD — pitch and roll      W / S — throttle      Space — airbrake', width / 2, height * 0.42);
    ctx.fillText('Mouse — hold and steer      P — pause      M — sound      R — restart', width / 2, height * 0.47);
    ctx.fillStyle = PALETTE.warn;
    ctx.font = `700 ${Math.round(18 * scale + 7)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', width / 2, height * 0.56);
    if (best > 0) {
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `${Math.round(14 * scale + 6)}px ${'system-ui, sans-serif'}`;
      ctx.fillText(`Best score: ${best}`, width / 2, height * 0.61);
    }
    ctx.restore();
  }

  function drawCentredPanel(title, subtitle) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 18, 30, 0.6)';
    ctx.fillRect(0, height * 0.36, width, height * 0.2);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 ${Math.round(40 * scale + 14)}px ${'system-ui, sans-serif'}`;
    ctx.fillText(title, width / 2, height * 0.46);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `${Math.round(15 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillText(subtitle, width / 2, height * 0.52);
    ctx.restore();
  }

  function drawOverOverlay(state, best) {
    ctx.save();
    ctx.fillStyle = 'rgba(30, 8, 8, 0.62)';
    ctx.fillRect(0, height * 0.3, width, height * 0.34);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `800 ${Math.round(44 * scale + 16)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('CRASHED', width / 2, height * 0.4);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `${Math.round(16 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillText(state.crashReason || 'The flight is over.', width / 2, height * 0.47);
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`Score ${state.score}   •   Rings ${state.ringsPassed}/${8}   •   Best ${best}`, width / 2, height * 0.53);
    ctx.fillStyle = PALETTE.warn;
    ctx.font = `700 ${Math.round(16 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('PRESS ENTER TO FLY AGAIN', width / 2, height * 0.59);
    ctx.restore();
  }

  function drawLandedOverlay(state, best) {
    const landing = state.landing || {};
    ctx.save();
    ctx.fillStyle = 'rgba(8, 26, 16, 0.62)';
    ctx.fillRect(0, height * 0.24, width, height * 0.46);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.good;
    ctx.font = `800 ${Math.round(44 * scale + 16)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('MISSION COMPLETE', width / 2, height * 0.34);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 ${Math.round(22 * scale + 8)}px ${'system-ui, sans-serif'}`;
    ctx.fillText(`Score ${state.score}`, width / 2, height * 0.42);
    ctx.font = `${Math.round(15 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`Landing quality +${landing.quality ?? 0}   •   Time bonus +${landing.timeBonus ?? 0}`, width / 2, height * 0.48);
    ctx.fillText(
      `Centreline off by ${landing.centreOffset ?? 0} m   •   Sink ${landing.sinkRate ?? 0} m/s   •   Touchdown ${landing.speed ?? 0} km/h   •   Time ${landing.time ?? 0}s`,
      width / 2,
      height * 0.54,
    );
    ctx.fillText(`Best ${best}   •   Rings ${state.ringsPassed}/8`, width / 2, height * 0.6);
    ctx.fillStyle = PALETTE.warn;
    ctx.font = `700 ${Math.round(16 * scale + 6)}px ${'system-ui, sans-serif'}`;
    ctx.fillText('PRESS ENTER TO FLY AGAIN', width / 2, height * 0.66);
    ctx.restore();
  }

  return { draw, resize, project, cameraBasis };
}
