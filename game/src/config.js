// Skyline Courier — every tuning number, colour and course constant in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Gravity, m/s^2, used by the turn and climb equations. */
export const GRAVITY = 9.81;

export const PLANE = {
  /** Top speed, m/s. */
  maxSpeed: 108,
  /** Below this speed the wing stops lifting and the nose drops. */
  stallSpeed: 26,
  /** Full-throttle acceleration, m/s^2, before drag. */
  thrust: 40,
  /** Quadratic drag coefficient. */
  drag: 0.011,
  /** Base drag, m/s^2. */
  baseDrag: 3.5,
  /** Extra drag while the airbrake is held. */
  brakeDrag: 26,
  /** Fastest the pilot can roll, rad/s. */
  rollRate: 2.4,
  /** Fastest the pilot can pitch, rad/s. */
  pitchRate: 1.1,
  /** Hardest bank the stick commands, rad. */
  maxRoll: 1.05,
  /** Hardest pitch the stick commands, rad. */
  maxPitch: 0.5,
  /** Speed at which the wheels leave the runway, m/s. */
  rotateSpeed: 30,
  /** Height of the wheels above the ground when parked, m. */
  gearHeight: 1.4,
};

export const FUEL = {
  /** Fuel at takeoff, units. */
  start: 100,
  /** Units burned per second at full throttle. */
  burnPerSecond: 0.85,
  /** Warn the pilot below this many units. */
  lowWarning: 25,
};

/** The ring course: eight glowing gates down the valley, then the far runway. */
export const COURSE = {
  ringCount: 8,
  ringRadius: 20,
  ringPoints: 100,
  /** Seconds of flight time the score bonus is measured against. */
  parTimeSeconds: 150,
};

/** Mission clock: run out of time and the sortie is scored as it stands. */
export const TIME_LIMIT_SECONDS = 300;

export const SCORE = {
  ring: 100,
  landingBase: 200,
  landingQualityMax: 300,
  timeBonusPerSecond: 2,
};

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-courier.best';

export const PALETTE = {
  skyTop: '#2f6fb8',
  skyMid: '#7fb2e5',
  skyLow: '#cfe6f7',
  haze: '#d8e8f5',
  sun: '#fff3c4',
  sunGlow: 'rgba(255, 240, 180, 0.45)',
  mountainFar: '#8fa8c8',
  mountainNear: '#6d86a8',
  grassLow: '#5d8a3c',
  grassHigh: '#7da653',
  grassDry: '#a8a35e',
  forest: '#3e6b2f',
  sand: '#cbb98a',
  water: '#3f7fb8',
  waterDeep: '#2c5f8f',
  rock: '#8d8578',
  runway: '#4a4d52',
  runwayEdge: '#e8e8e8',
  runwayMark: '#f5d54a',
  treeTrunk: '#5d4126',
  treeTop: '#2f6b2a',
  treeTopLight: '#4c8a3a',
  cloud: 'rgba(255, 255, 255, 0.92)',
  cloudShade: 'rgba(210, 225, 240, 0.85)',
  ring: '#ffb400',
  ringGlow: 'rgba(255, 180, 0, 0.35)',
  ringDone: '#37d67a',
  planeBody: '#e8eef4',
  planeBelly: '#c65a3a',
  planeWing: '#dfe7ee',
  planeCanopy: '#1e3a5f',
  planeTrim: '#c65a3a',
  panel: 'rgba(16, 24, 36, 0.72)',
  panelBorder: 'rgba(140, 200, 255, 0.55)',
  text: '#eef4fa',
  textDim: '#9fb4c8',
  warn: '#ffb400',
  danger: '#ff5a4e',
  good: '#37d67a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';
