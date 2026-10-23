// Pure pattern logic: no DOM or audio, so it can be tested with node --test.
export const STEPS = 16;
export const PATTERNS = ['A', 'B', 'C', 'D'];
export const TRACKS = [
 {id: 'kick', name: 'Kick', short: 'KCK'},
 {id: 'snare', name: 'Snare', short: 'SNR'},
 {id: 'clap', name: 'Clap', short: 'CLP'},
 {id: 'closed', name: 'Closed hat', short: 'CH'},
 {id: 'open', name: 'Open hat', short: 'OH'},
 {id: 'tom', name: 'Low tom', short: 'TOM'},
 {id: 'rim', name: 'Rimshot', short: 'RIM'},
 {id: 'bell', name: 'Cowbell', short: 'BEL'}
];
// A step is 0 (off), 1 (on) or 2 (accent).
export const OFF = 0, ON = 1, ACCENT = 2;
export const LIMITS = {bpm: [60, 180], swing: [0, 100], volume: [0, 100]};

export const clamp = (value, [min, max]) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
export const emptyGrid = () => TRACKS.map(() => Array(STEPS).fill(OFF));
export const cloneGrid = grid => grid.map(row => row.slice());
export const isEmpty = grid => grid.every(row => row.every(step => step === OFF));
export const nextState = step => (step + 1) % 3;

// Bjorklund-style even distribution of `pulses` hits across `steps`, rotated by `rotation`.
export function euclid(pulses, steps = STEPS, rotation = 0) {
 const k = Math.max(0, Math.min(steps, Math.round(pulses)));
 // Hit where the running count i*k wraps past a multiple of steps; this starts on step one.
 const row = Array.from({length: steps}, (_, i) => (k && (i * k) % steps < k ? ON : OFF));
 return rotate(row, rotation);
}

export function rotate(row, by) {
 const n = row.length, shift = ((by % n) + n) % n;
 return row.map((_, i) => row[(i - shift + n) % n]);
}

// Seconds from the start of the bar to `step`. Swing delays off-beat sixteenths;
// 100% swing pushes them a third of a sixteenth later, a triplet feel.
export function stepOffset(step, bpm, swing = 0) {
 const sixteenth = 60 / bpm / 4;
 return step * sixteenth + (step % 2 ? sixteenth * swing / 300 : 0);
}
export const barLength = bpm => 60 / bpm * 4;

// Solo wins over mute; with no solos, every unmuted track is heard.
export function audible(mixer) {
 const soloed = mixer.some(track => track.solo);
 return mixer.map(track => (soloed ? Boolean(track.solo) : !track.muted));
}

// In chain mode, step to the next pattern that has notes, skipping blanks.
export function nextPattern(current, patterns, chain) {
 if (!chain) return current;
 const start = PATTERNS.indexOf(current);
 for (let i = 1; i <= PATTERNS.length; i++) {
  const key = PATTERNS[(start + i) % PATTERNS.length];
  if (!isEmpty(patterns[key])) return key;
 }
 return current;
}

// Share format: v1.bpm.swing.volumes.mutes.A.B.C.D
// Each track row is a 16-digit base-3 number written as 5 base-36 characters.
const ROW_CHARS = 5, MAX_ROW = 3 ** STEPS;
const encodeRow = row => row.reduce((value, step) => value * 3 + step, 0).toString(36).padStart(ROW_CHARS, '0');
function decodeRow(text) {
 if (!/^[0-9a-z]{5}$/.test(text)) return null;
 let value = parseInt(text, 36);
 if (value >= MAX_ROW) return null;
 const row = Array(STEPS);
 for (let i = STEPS - 1; i >= 0; i--) { row[i] = value % 3; value = Math.floor(value / 3); }
 return row;
}

export function encode(song) {
 const volumes = song.mixer.map(track => clamp(track.volume, LIMITS.volume).toString(36).padStart(2, '0')).join('');
 const mutes = song.mixer.reduce((bits, track, i) => bits | (track.muted ? 1 << i : 0), 0).toString(16).padStart(2, '0');
 const patterns = PATTERNS.map(key => song.patterns[key].map(encodeRow).join(''));
 return ['v1', clamp(song.bpm, LIMITS.bpm), clamp(song.swing, LIMITS.swing), volumes, mutes, ...patterns].join('.');
}

// Returns null for anything malformed so a bad link never half-loads.
export function decode(text) {
 const parts = String(text || '').replace(/^#/, '').split('.');
 if (parts.length !== 9 || parts[0] !== 'v1') return null;
 const [, bpm, swing, volumes, mutes, ...rows] = parts;
 if (!/^\d{1,3}$/.test(bpm) || !/^\d{1,3}$/.test(swing) || !/^[0-9a-f]{2}$/.test(mutes)) return null;
 if (!new RegExp(`^[0-9a-z]{${TRACKS.length * 2}}$`).test(volumes)) return null;
 const mask = parseInt(mutes, 16);
 const mixer = TRACKS.map((_, i) => ({volume: clamp(parseInt(volumes.slice(i * 2, i * 2 + 2), 36), LIMITS.volume), muted: Boolean(mask & 1 << i), solo: false}));
 const patterns = {};
 for (const [index, key] of PATTERNS.entries()) {
  const block = rows[index];
  if (block.length !== TRACKS.length * ROW_CHARS) return null;
  const grid = TRACKS.map((_, t) => decodeRow(block.slice(t * ROW_CHARS, (t + 1) * ROW_CHARS)));
  if (grid.includes(null)) return null;
  patterns[key] = grid;
 }
 return {bpm: clamp(bpm, LIMITS.bpm), swing: clamp(swing, LIMITS.swing), mixer, patterns};
}

const row = text => [...text].map(c => (c === 'x' ? ACCENT : c === 'o' ? ON : OFF));
const grid = rows => TRACKS.map(track => row(rows[track.id] || '................'));
export function starter() {
 return {
  bpm: 96, swing: 30,
  mixer: TRACKS.map(track => ({volume: {closed: 55, open: 50, bell: 45, rim: 60}[track.id] ?? 80, muted: false, solo: false})),
  patterns: {
   A: grid({kick: 'x.....o...x.....', snare: '....x.......x...', closed: 'o.o.o.o.o.o.o.oo', open: '..............o.', rim: '.......o.......o'}),
   B: grid({kick: 'x.....o...x..o..', snare: '....x.......x..o', clap: '............x...', closed: 'o.ooo.o.o.ooo.o.', open: '......o.......o.', tom: '.............ox.', bell: 'o...............'}),
   C: grid({kick: 'x.......x.......', snare: '........x.......', closed: 'o...o...o...o...', rim: '...o.......o..o.', bell: '..o.......o.....'}),
   D: emptyGrid()
  }
 };
}

// 16-bit PCM WAV from Float32 channel data.
export function wav(channels, sampleRate) {
 const frames = channels[0].length, count = channels.length, bytes = frames * count * 2;
 const view = new DataView(new ArrayBuffer(44 + bytes));
 const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
 text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt ');
 view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
 view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true);
 view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true);
 let offset = 44;
 for (let i = 0; i < frames; i++) {
  for (const channel of channels) {
   const sample = Math.max(-1, Math.min(1, channel[i]));
   view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
   offset += 2;
  }
 }
 return view.buffer;
}
