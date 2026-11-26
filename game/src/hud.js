// The cockpit instruments, painted over the chase view: altitude, speed, a compass
// tape for heading, throttle and fuel gauges, the mission clock, the score and the
// ring counter — plus the warnings that keep a pilot out of the hills.

import { COURSE, FUEL, PALETTE, VIEW } from './config.js';
import { nextRing } from './world.js';

/** Build the HUD painter for one canvas; it shares the renderer's 2D context. */
export function createHud(canvas) {
  const ctx = canvas.getContext('2d');

  /** Read the canvas size in CSS pixels (the renderer sets the transform). */
  function size() {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.max(320, rect.width), height: Math.max(240, rect.height) };
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function label(text, x, y, colour) {
    ctx.fillStyle = colour || PALETTE.textDim;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  function value(text, x, y, colour, font) {
    ctx.fillStyle = colour || PALETTE.text;
    ctx.font = font || '700 22px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function compassHeading(degrees) {
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return `${String(Math.round(degrees)).padStart(3, '0')}° ${names[index]}`;
  }

  /** Paint the instruments for the current flight state. */
  function draw(state, screen) {
    const { width, height } = size();
    const plane = state.plane;
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    const speedKmh = Math.round(plane.speed * 3.6);
    const altitude = Math.max(0, Math.round(plane.y));
    const headingDegrees = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
    const ring = nextRing(state);

    // --- Top-left: altitude, speed and heading. ---
    panel(14, 14, 250, 86);
    label('ALTITUDE', 26, 34);
    value(`${altitude} m`, 26, 60);
    label('SPEED', 140, 34);
    value(`${speedKmh}`, 140, 60, speedKmh < 95 ? PALETTE.danger : PALETTE.text);
    label('km/h', 196, 60, PALETTE.textDim, '600 12px system-ui, sans-serif');
    label('HEADING', 26, 88);
    value(compassHeading(headingDegrees), 96, 88, PALETTE.text, '700 15px "SF Mono", Consolas, monospace');

    // --- Top-centre: compass tape with the heading under the lubber line. ---
    const tapeWidth = 300 * scale + 120;
    const tapeX = (width - tapeWidth) / 2;
    panel(tapeX, 14, tapeWidth, 34);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tapeX, 14, tapeWidth, 34);
    ctx.clip();
    for (let offset = -90; offset <= 90; offset += 15) {
      const tickDegrees = Math.round((headingDegrees + offset) / 15) * 15;
      const delta = ((tickDegrees - headingDegrees + 540) % 360) - 180;
      const x = tapeX + tapeWidth / 2 + (delta / 90) * (tapeWidth / 2 - 10);
      const major = tickDegrees % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.text : PALETTE.textDim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, major ? 34 : 28);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = PALETTE.text;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
        ctx.fillText(names[((tickDegrees % 360) + 360) % 360] ?? String(tickDegrees), x, 46);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.warn;
    ctx.beginPath();
    ctx.moveTo(tapeX + tapeWidth / 2, 14);
    ctx.lineTo(tapeX + tapeWidth / 2 - 5, 24);
    ctx.lineTo(tapeX + tapeWidth / 2 + 5, 24);
    ctx.closePath();
    ctx.fill();

    // --- Top-right: score, rings, clock and fuel. ---
    panel(width - 264, 14, 250, 86);
    label('SCORE', width - 252, 34);
    value(String(state.score), width - 252, 60);
    label('RINGS', width - 150, 34);
    value(`${state.ringsPassed}/${COURSE.ringCount}`, width - 150, 60);
    label('TIME', width - 252, 88);
    const timeLeft = state.timeLimit - state.time;
    value(formatTime(timeLeft), width - 208, 88, timeLeft < 60 ? PALETTE.danger : PALETTE.text, '700 15px "SF Mono", Consolas, monospace');
    label('FUEL', width - 150, 88);
    const fuelColour = plane.fuel <= FUEL.lowWarning ? PALETTE.danger : PALETTE.good;
    value(`${Math.ceil(plane.fuel)}`, width - 104, 88, fuelColour, '700 15px "SF Mono", Consolas, monospace');

    // --- Bottom-left: throttle bar and fuel gauge. ---
    panel(14, height - 74, 250, 60);
    label('THROTTLE', 26, height - 54);
    drawBar(26, height - 46, 226, 10, plane.throttle, PALETTE.warn);
    label('FUEL', 26, height - 28);
    drawBar(26, height - 20, 226, 8, plane.fuel / FUEL.start, fuelColour);

    // --- Bottom-right: next objective. ---
    const objective = ring
      ? `NEXT RING ${ring.index + 1} — ${Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z))} m`
      : 'LAND ON RUNWAY B — follow the strip lights';
    const objectiveWidth = ctx.measureText(objective).width + 28;
    panel(width - 14 - Math.max(300, objectiveWidth), height - 74, Math.max(300, objectiveWidth), 60);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(objective, width - Math.max(300, objectiveWidth), height - 38);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 12px system-ui, sans-serif';
    const hint = plane.airborne
      ? `ALT ${altitude} m  •  V/S ${Math.round(plane.verticalSpeed)} m/s  •  ${plane.speed < 26 ? 'STALL WARNING' : 'WINGS LEVEL'}`
      : plane.speed > 1
        ? 'ROLLING — rotate at 108 km/h'
        : 'ON THE STRIP — hold W to spool up';
    ctx.fillText(hint, width - Math.max(300, objectiveWidth), height - 20);

    // --- Centre reticle, only while flying. ---
    if (screen === 'play') {
      ctx.strokeStyle = 'rgba(238, 244, 250, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.42, 14, 0, Math.PI * 2);
      ctx.moveTo(width / 2 - 22, height * 0.42);
      ctx.lineTo(width / 2 - 16, height * 0.42);
      ctx.moveTo(width / 2 + 16, height * 0.42);
      ctx.lineTo(width / 2 + 22, height * 0.42);
      ctx.stroke();
    }

    // --- Flash messages and warnings. ---
    if (state.messageTimer > 0 && state.message) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 ${Math.round(20 * scale + 8)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, width / 2, height * 0.24);
    }
    if (screen === 'play' && plane.airborne && plane.y < 18) {
      drawWarning(width, height, 'PULL UP — TERRAIN', PALETTE.danger);
    } else if (screen === 'play' && plane.airborne && plane.speed < 26) {
      drawWarning(width, height, 'STALL — LOWER THE NOSE', PALETTE.warn);
    }
  }

  function drawBar(x, y, w, h, fraction, colour) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, fraction))), h, h / 2);
    ctx.fill();
  }

  function drawWarning(width, height, text, colour) {
    ctx.fillStyle = colour;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    if (blink) ctx.fillText(text, width / 2, height * 0.62);
  }

  return { draw };
}
