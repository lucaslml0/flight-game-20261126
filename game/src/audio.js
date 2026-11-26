// All sound is synthesised with WebAudio — no audio files. A low engine drone follows
// the throttle, and short beeps mark rings, warnings, touchdowns and crashes. The
// context is created on the first user gesture, so browsers never block it.

/** Build the sound engine; call unlock() from a user gesture before playing. */
export function createAudio() {
  let context = null;
  let engineOscillator = null;
  let engineGain = null;
  let muted = false;
  let engineOn = false;

  /** Create the context (safe to call more than once). */
  function unlock() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      engineOscillator = context.createOscillator();
      engineOscillator.type = 'sawtooth';
      engineOscillator.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOscillator.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOscillator.start();
    } catch {
      context = null;
    }
  }

  /** A short tone: frequency, seconds, shape and loudness. */
  function beep(frequency, seconds, type, volume, when) {
    if (!context || muted) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.value = frequency;
      const start = context.currentTime + (when || 0);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume ?? 0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + seconds + 0.05);
    } catch {
      // A failed beep never stops the game.
    }
  }

  /** A burst of filtered noise, for the crash. */
  function noiseBurst(seconds, volume) {
    if (!context || muted) return;
    try {
      const length = Math.floor(context.sampleRate * seconds);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();
    } catch {
      // Silence is better than a thrown error.
    }
  }

  return {
    unlock,
    /** Toggle sound on and off; returns the new muted state. */
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.05;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Start the engine drone (called when a sortie begins). */
    startEngine() {
      unlock();
      engineOn = true;
      if (engineGain && !muted) engineGain.gain.value = 0.05;
    },
    /** Stop the engine drone (called on crash or landing). */
    stopEngine() {
      engineOn = false;
      if (engineGain) engineGain.gain.value = 0;
    },
    /** Follow the throttle and speed: the drone rises as the plane spools up. */
    updateEngine(throttle, speed) {
      if (!context || !engineOscillator || !engineOn || muted) return;
      const targetFrequency = 42 + throttle * 68 + speed * 0.35;
      engineOscillator.frequency.setTargetAtTime(targetFrequency, context.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.03 + throttle * 0.05, context.currentTime, 0.1);
    },
    /** Two-note chime when the plane threads a ring. */
    ringChime() {
      beep(880, 0.16, 'sine', 0.14);
      beep(1318, 0.24, 'sine', 0.12, 0.09);
    },
    /** Low warning tone for fuel and stalls. */
    warnBeep() {
      beep(220, 0.2, 'square', 0.07);
      beep(220, 0.2, 'square', 0.07, 0.22);
    },
    /** Rising arpeggio for a good landing. */
    landingFanfare() {
      beep(523, 0.18, 'triangle', 0.14);
      beep(659, 0.18, 'triangle', 0.14, 0.14);
      beep(784, 0.18, 'triangle', 0.14, 0.28);
      beep(1046, 0.4, 'triangle', 0.16, 0.42);
    },
    /** Noise and a falling tone for a crash. */
    crashSound() {
      noiseBurst(0.7, 0.3);
      beep(160, 0.6, 'sawtooth', 0.12);
    },
    /** A soft click for menu actions. */
    click() {
      beep(660, 0.06, 'sine', 0.08);
    },
  };
}
