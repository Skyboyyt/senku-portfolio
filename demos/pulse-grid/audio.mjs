// Every sound is synthesised with Web Audio nodes; there are no samples to load.
// Voices take any BaseAudioContext so the same code plays live and renders WAV offline.
const noiseCache = new WeakMap();
function noise(ctx) {
 if (!noiseCache.has(ctx)) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
 }
 const source = ctx.createBufferSource();
 source.buffer = noiseCache.get(ctx);
 return source;
}

function envelope(ctx, out, time, level, decay, attack = 0.002) {
 const gain = ctx.createGain();
 gain.gain.setValueAtTime(0.0001, time);
 gain.gain.exponentialRampToValueAtTime(level, time + attack);
 gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
 gain.connect(out);
 return gain;
}

function tone(ctx, out, time, {type = 'sine', from, to = from, glide = 0.05, level, decay}) {
 const osc = ctx.createOscillator();
 osc.type = type;
 osc.frequency.setValueAtTime(from, time);
 if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, time + glide);
 osc.connect(envelope(ctx, out, time, level, decay));
 osc.start(time);
 osc.stop(time + decay + 0.05);
}

function hiss(ctx, out, time, {type, frequency, q = 0.7, level, decay, attack}) {
 const source = noise(ctx), filter = ctx.createBiquadFilter();
 filter.type = type;
 filter.frequency.value = frequency;
 filter.Q.value = q;
 const gain = envelope(ctx, out, time, level, decay, attack);
 source.connect(filter).connect(gain);
 source.start(time, Math.random() * 0.5);
 source.stop(time + decay + 0.05);
 return gain;
}

export const voices = {
 kick: (ctx, out, t) => {
  tone(ctx, out, t, {from: 160, to: 42, glide: 0.12, level: 1, decay: 0.45});
  tone(ctx, out, t, {type: 'triangle', from: 900, to: 120, glide: 0.01, level: 0.18, decay: 0.02});
 },
 snare: (ctx, out, t) => {
  tone(ctx, out, t, {type: 'triangle', from: 220, to: 160, glide: 0.04, level: 0.45, decay: 0.09});
  hiss(ctx, out, t, {type: 'highpass', frequency: 1400, level: 0.5, decay: 0.2});
 },
 clap: (ctx, out, t) => {
  // Three tight bursts and a tail, like several hands landing slightly apart.
  [0, 0.011, 0.022].forEach(offset => hiss(ctx, out, t + offset, {type: 'bandpass', frequency: 1300, q: 1.4, level: 0.55, decay: 0.012}));
  hiss(ctx, out, t + 0.03, {type: 'bandpass', frequency: 1200, q: 1.1, level: 0.4, decay: 0.16});
 },
 closed: (ctx, out, t, chokes) => {
  hiss(ctx, out, t, {type: 'highpass', frequency: 7500, level: 0.35, decay: 0.045});
  chokes.open?.(t);
 },
 open: (ctx, out, t, chokes) => {
  const gain = hiss(ctx, out, t, {type: 'highpass', frequency: 7000, level: 0.3, decay: 0.38, attack: 0.004});
  // A following closed hat cuts the open hat short, as on a real kit.
  chokes.open = time => {
   if (time <= t) return;
   gain.gain.cancelScheduledValues(time);
   gain.gain.setTargetAtTime(0.0001, time, 0.008);
  };
 },
 tom: (ctx, out, t) => tone(ctx, out, t, {from: 140, to: 82, glide: 0.18, level: 0.8, decay: 0.32}),
 rim: (ctx, out, t) => {
  tone(ctx, out, t, {type: 'square', from: 1650, level: 0.16, decay: 0.03});
  tone(ctx, out, t, {type: 'triangle', from: 480, level: 0.3, decay: 0.035});
 },
 bell: (ctx, out, t) => {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.9;
  filter.connect(out);
  tone(ctx, filter, t, {type: 'square', from: 545, level: 0.28, decay: 0.28});
  tone(ctx, filter, t, {type: 'square', from: 815, level: 0.22, decay: 0.24});
 }
};

// Master chain: per-track gains → bus → gentle compressor → output (and an analyser when live).
export function mixer(ctx, trackIds, destination = ctx.destination) {
 const bus = ctx.createGain();
 bus.gain.value = 0.8;
 const compressor = ctx.createDynamicsCompressor();
 compressor.threshold.value = -14;
 compressor.ratio.value = 4;
 compressor.attack.value = 0.003;
 compressor.release.value = 0.15;
 bus.connect(compressor).connect(destination);
 const tracks = Object.fromEntries(trackIds.map(id => {
  const gain = ctx.createGain();
  gain.connect(bus);
  return [id, gain];
 }));
 return {bus, compressor, tracks, chokes: {}};
}

// Accent plays louder; a plain step sits a little below.
export function trigger(ctx, mix, id, time, step) {
 const accent = ctx.createGain();
 accent.gain.value = step === 2 ? 1 : 0.62;
 accent.connect(mix.tracks[id]);
 voices[id](ctx, accent, time, mix.chokes);
 // Live playback releases the accent node once its voice has finished; offline renders are discarded whole.
 if (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext) setTimeout(() => accent.disconnect(), Math.max(0, (time - ctx.currentTime + 1) * 1000));
}
