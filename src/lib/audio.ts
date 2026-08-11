let ctx: AudioContext | null = null;
let enabled = () => {
  try { return localStorage.getItem('bd-sound') !== '0'; } catch { return true; }
};

const getCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

export const setSoundEnabled = (on: boolean) => {
  try { localStorage.setItem('bd-sound', on ? '1' : '0'); } catch {}
  if (on) getCtx();
};

export const isSoundEnabled = () => enabled();

interface NoiseBurst { duration: number; amplitude: number; filterFreq?: number; q?: number; }

const playNoise = ({ duration, amplitude, filterFreq = 1200, q = 0.6 }: NoiseBurst, gain: number) => {
  const c = getCtx(); if (!c) return;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duration)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * amplitude;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = filterFreq; filt.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(c.destination);
  src.start();
};

export const diceSfx = (sides: number) => {
  if (!enabled()) return;
  const c = getCtx(); if (!c) return;
  const baseFreq = sides === 4 ? 600 : sides === 6 ? 700 : sides === 8 ? 800 : sides === 10 ? 900 : sides === 12 ? 1000 : sides === 20 ? 1200 : 1500;
  const rumbles = 3 + Math.floor(Math.random() * 3);
  let t = 0;
  for (let i = 0; i < rumbles; i++) {
    const start = t;
    const dur = 0.05 + Math.random() * 0.05;
    playNoise({ duration: dur, amplitude: 0.45, filterFreq: baseFreq + (Math.random() - 0.5) * 400, q: 1.2 }, 0.18);
    t += dur + 0.02;
  }
  setTimeout(() => playNoise({ duration: 0.08, amplitude: 0.7, filterFreq: 2400, q: 1.6 }, 0.22), t * 1000);
};

export const coinSfx = () => {
  if (!enabled()) return;
  const c = getCtx(); if (!c) return;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'square'; o.frequency.value = 1500 + Math.random() * 400;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.14);
    }, i * 70);
  }
};

export const pageSfx = () => {
  if (!enabled()) return;
  playNoise({ duration: 0.15, amplitude: 0.3, filterFreq: 1800, q: 0.5 }, 0.12);
};

export const tapSfx = () => {
  if (!enabled()) return;
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.1);
};

export const successSfx = () => {
  if (!enabled()) return;
  const c = getCtx(); if (!c) return;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    setTimeout(() => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.14, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.26);
    }, i * 90);
  });
};

export const haptics = (pattern: number | number[]) => {
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch {}
};

export const primeAudio = () => { getCtx(); };

// ---------------------------------------------------------------------------
// AMBIENT ENGINE
// Procedural drone keyed to scene mood. No asset hosting (free + license-clean).
// All voices are detuned sine oscillators running through lowpass filters so the output
// is warm and low-energy. Volume is intentionally tiny (~0.025–0.04) so it sits well below
// dice/UI SFX and never competes with the player's attention.
// ---------------------------------------------------------------------------

export type AmbientMood = 'off' | 'default' | 'tavern' | 'forest' | 'dungeon' | 'city' | 'combat' | 'tense';

interface Preset {
  rootHz: number;
  detuneCents: number;
  filterHz: number;
  filterQ: number;
  lfoHz: number;    // rate at which filter opens/closes
  secondVoice: boolean; // add a fifth above for tavern/city lift
  sparkleRate: number;  // probability per second of soft pluck/ping
  rumble: boolean;
}

const PRESETS: Record<AmbientMood, Preset> = {
  off:      { rootHz: 110, detuneCents: 0, filterHz: 200, filterQ: 0.3, lfoHz: 0.07, secondVoice: false, sparkleRate: 0, rumble: false },
  default:  { rootHz: 138, detuneCents: 6, filterHz: 380, filterQ: 0.6, lfoHz: 0.09, secondVoice: false, sparkleRate: 0.05, rumble: false },
  tavern:   { rootHz: 196, detuneCents: 9, filterHz: 700, filterQ: 0.7, lfoHz: 0.18, secondVoice: true, sparkleRate: 0.6, rumble: false },
  forest:   { rootHz: 174, detuneCents: 11, filterHz: 520, filterQ: 0.5, lfoHz: 0.11, secondVoice: false, sparkleRate: 0.3, rumble: false },
  dungeon:  { rootHz: 92, detuneCents: 14, filterHz: 220, filterQ: 0.4, lfoHz: 0.06, secondVoice: false, sparkleRate: 0.02, rumble: true },
  city:     { rootHz: 220, detuneCents: 8, filterHz: 600, filterQ: 0.55, lfoHz: 0.13, secondVoice: true, sparkleRate: 0.25, rumble: false },
  combat:   { rootHz: 110, detuneCents: 5, filterHz: 480, filterQ: 0.7, lfoHz: 0.22, secondVoice: false, sparkleRate: 0.1, rumble: true },
  tense:    { rootHz: 138, detuneCents: 3, filterHz: 340, filterQ: 0.65, lfoHz: 0.16, secondVoice: false, sparkleRate: 0.04, rumble: false }
};

let ambientState: {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  droneA: OscillatorNode | null;
  droneB: OscillatorNode | null;
  droneC: OscillatorNode | null;  // upper fifth for tavern/city
  filter: BiquadFilterNode | null;
  lfo: OscillatorNode | null;
  lfoGain: GainNode | null;
  rumble: AudioBufferSourceNode | null;
  rumbleGain: GainNode | null;
  sparkleTimer: number | null;
  activeMood: AmbientMood;
  targetVolume: number;
  enabled: boolean;
} = {
  ctx: null, masterGain: null, droneA: null, droneB: null, droneC: null,
  filter: null, lfo: null, lfoGain: null, rumble: null, rumbleGain: null, sparkleTimer: null,
  activeMood: 'off', targetVolume: 0.035, enabled: false
};

const disposeAmbient = () => {
  if (ambientState.sparkleTimer) { clearInterval(ambientState.sparkleTimer); ambientState.sparkleTimer = null; }
  const stop = (n: OscillatorNode | AudioBufferSourceNode | null) => { try { n?.stop(); } catch {} };
  stop(ambientState.droneA); stop(ambientState.droneB); stop(ambientState.droneC);
  stop(ambientState.lfo); stop(ambientState.rumble);
  try { ambientState.rumble?.disconnect(); } catch {}
  try { ambientState.droneA?.disconnect(); } catch {}
  try { ambientState.droneB?.disconnect(); } catch {}
  try { ambientState.droneC?.disconnect(); } catch {}
  try { ambientState.filter?.disconnect(); } catch {}
  try { ambientState.lfo?.disconnect(); } catch {}
  try { ambientState.lfoGain?.disconnect(); } catch {}
  try { ambientState.masterGain?.disconnect(); } catch {}
  try { ambientState.rumbleGain?.disconnect(); } catch {}
  ambientState = {
    ctx: null, masterGain: null, droneA: null, droneB: null, droneC: null,
    filter: null, lfo: null, lfoGain: null, rumble: null, rumbleGain: null, sparkleTimer: null,
    activeMood: 'off', targetVolume: 0.035, enabled: false
  };
};

const startDroneVoice = (ctx: AudioContext, freq: number, detune: number): OscillatorNode => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
};

const ensureRumble = (ctx: AudioContext, master: GainNode): AudioBufferSourceNode => {
  const dur = 4;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Low-frequency pseudo-random rumble (brown-ish noise).
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const next = (Math.random() * 2 - 1) * 0.4 + last * 0.985;
    data[i] = next;
    last = next;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 90;
  filt.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = 0.18;
  src.connect(filt).connect(g).connect(master);
  src.start();
  return src;
};

const scheduleSparkle = (mood: AmbientMood) => {
  if (!ambientState.ctx || !ambientState.masterGain) return;
  const rate = PRESETS[mood].sparkleRate;
  if (rate <= 0) return;
  const intervalMs = Math.max(120, Math.floor(1000 / rate));
  if (ambientState.sparkleTimer) clearInterval(ambientState.sparkleTimer);
  ambientState.sparkleTimer = window.setInterval(() => {
    if (!enabled()) return;
    const c = ambientState.ctx!;
    const master = ambientState.masterGain!;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine';
    // Random pentatonic-ish note so nothing sounds harsh.
    const scale = mood === 'tavern' ? [392, 440, 494, 587, 659, 784] : mood === 'forest' ? [349, 392, 440, 523, 587] : [220, 247, 277, 311, 370];
    const note = scale[Math.floor(Math.random() * scale.length)];
    o.frequency.value = note + (Math.random() - 0.5) * 6;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + 0.55);
  }, intervalMs + Math.random() * intervalMs * 0.7);
};

/**
 * Starts (or crossfades to) a given mood. Must be called from a user gesture handler the first time,
 * but transitions between moods are safe at any time.
 */
export const setAmbientMood = (mood: AmbientMood, opts?: { fade?: number }) => {
  if (!isSoundEnabled()) {
    disposeAmbient();
    return;
  }
  if (mood === 'off' && ambientState.activeMood === 'off') return;
  if (mood === ambientState.activeMood && ambientState.masterGain) return;
  const fade = (opts?.fade ?? 1.4);
  const c = getCtx();
  if (!c) return;
  // Tear down prior engine first (cleanest crossfade; minimal overlaps).
  disposeAmbient();
  const preset = PRESETS[mood];
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(ambientState.targetVolume, c.currentTime + fade);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = preset.filterHz;
  filt.Q.value = preset.filterQ;
  // LFO that gently modulates the filter cutoff so the drone breathes.
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = preset.lfoHz;
  const lfoGain = c.createGain();
  lfoGain.gain.value = preset.filterHz * 0.25;
  lfo.connect(lfoGain).connect(filt.frequency);
  const droneA = startDroneVoice(c, preset.rootHz, -preset.detuneCents);
  const droneB = startDroneVoice(c, preset.rootHz, preset.detuneCents);
  droneA.connect(filt); droneB.connect(filt);
  let droneC: OscillatorNode | null = null;
  if (preset.secondVoice) {
    droneC = startDroneVoice(c, preset.rootHz * 1.5, preset.detuneCents * 0.5); // perfect fifth above
    const filtC = c.createBiquadFilter();
    filtC.type = 'lowpass'; filtC.frequency.value = preset.filterHz * 1.4; filtC.Q.value = preset.filterQ * 0.7;
    droneC.connect(filtC).connect(master);
  }
  filt.connect(master).connect(c.destination);
  droneA.start(); droneB.start(); lfo.start();
  if (droneC) droneC.start();
  let rumble: AudioBufferSourceNode | null = null;
  if (preset.rumble) rumble = ensureRumble(c, master);
  ambientState = {
    ...ambientState,
    ctx: c, masterGain: master, droneA, droneB, droneC,
    filter: filt, lfo, lfoGain,
    rumble, rumbleGain: rumble ? null : null,
    activeMood: mood,
    enabled: true
  };
  scheduleSparkle(mood);
};

/** Smoothly fade to silence and tear down. Safe to call repeatedly. */
export const stopAmbient = () => {
  if (!ambientState.masterGain || ambientState.activeMood === 'off') return;
  const c = ambientState.ctx; const g = ambientState.masterGain;
  if (!c || !g) { disposeAmbient(); return; }
  const now = c.currentTime;
  try { g.gain.cancelScheduledValues(now); } catch {}
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  if (ambientState.sparkleTimer) { clearInterval(ambientState.sparkleTimer); ambientState.sparkleTimer = null; }
  setTimeout(() => disposeAmbient(), 800);
};

/** Master kill switch: respects the sound-on toggle. Stops cleanly if disabled. */
export const setAmbientEnabled = (on: boolean) => {
  if (!on) {
    stopAmbient();
    return;
  }
  // If toggling on while not playing anything, do nothing — mood picker will start it.
};

/** Returns the currently playing mood (or 'off'). */
export const getAmbientMood = (): AmbientMood => ambientState.activeMood;

/**
 * Heuristic mood detector: scans recent narration AND world tone for salient keywords
 * and returns the AmbientMood most likely to fit. Used by StoryTab to Auto-pick mood as
 * the scene changes. Purely advisory — the user can override with a future Settings control.
 */
export const detectAmbientMood = (text: string, worldTone?: string): AmbientMood => {
  const t = (text || '').toLowerCase();
  const tone = (worldTone || '').toLowerCase();
  if (!t && !tone) return 'off';
  // Combat wins over everything else — if the AI just rolled initiative, switch.
  if (/\b(initiative|attack|swing|slash|strike|combat|fight|battle|charge|grapple|opportunity)\b/.test(t)) return 'combat';
  if (/\b(tavern|inn|barkeep|bartender|ale|mead|wine|grog|fireplace|minstrel|bard sings)\b/.test(t)) return 'tavern';
  if (/\b(forest|grove|thicket|canopy|pine|oak|leaves|branches|wilds|underbrush)\b/.test(t)) return 'forest';
  if (/\b(cave|dungeon|tomb|crypt|underground|cavern|sewer|catacomb|drip|echoes)\b/.test(t)) return 'dungeon';
  if (/\b(city|street|alley|marketplace|guild|plaza|crowd|merchant district|caravan)\b/.test(t)) return 'city';
  if (/\b(dark|shadow|ominous|malevolent|creep|dread|foreboding|whisper)\b/.test(t)) return 'tense';
  // Default by tone if no narration keywords matched.
  if (tone === 'dark' || tone === 'gritty') return 'dungeon';
  if (tone === 'light' || tone === 'whimsical') return 'default';
  return 'default';
};

