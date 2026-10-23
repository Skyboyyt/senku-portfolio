import test from 'node:test';
import assert from 'node:assert/strict';
import {encode, decode, starter, euclid, rotate, stepOffset, barLength, audible, nextPattern, emptyGrid, wav, STEPS, TRACKS} from '../model.mjs';

const hits = row => row.flatMap((step, i) => (step ? [i] : []));

test('share links round-trip tempo, swing, mixer and all four patterns', () => {
 const song = starter();
 song.mixer[2] = {volume: 7, muted: true, solo: true};
 song.patterns.D[7][15] = 2;
 const decoded = decode('#' + encode(song));
 assert.equal(decoded.bpm, 96);
 assert.equal(decoded.swing, 30);
 assert.deepEqual(decoded.patterns, song.patterns);
 // Solo is a performance control and is not shared.
 assert.deepEqual(decoded.mixer[2], {volume: 7, muted: true, solo: false});
});

test('a fully accented row stays within the five-character row encoding', () => {
 const song = starter();
 song.patterns.A = emptyGrid().map(row => row.fill(2));
 assert.deepEqual(decode(encode(song)).patterns.A, song.patterns.A);
});

test('malformed or out-of-range links are rejected instead of half-loading', () => {
 const good = encode(starter());
 assert.equal(decode(''), null);
 assert.equal(decode('v2' + good.slice(2)), null);
 assert.equal(decode(good.slice(0, -1)), null);
 assert.equal(decode(good.replace(/\.[^.]+$/, '.zzzzz' + 'a'.repeat(35))), null);
 const parts = good.split('.');
 parts[1] = '999';
 assert.equal(decode(parts.join('.')).bpm, 180);
});

test('euclidean fills spread hits evenly and start on the downbeat', () => {
 assert.deepEqual(hits(euclid(4)), [0, 4, 8, 12]);
 assert.deepEqual(hits(euclid(3, 8)), [0, 3, 6]);
 assert.equal(hits(euclid(5)).length, 5);
 assert.deepEqual(hits(euclid(0)), []);
 assert.deepEqual(hits(euclid(4, 16, 2)), [2, 6, 10, 14]);
 assert.deepEqual(rotate([1, 0, 0, 2], -1), [0, 0, 2, 1]);
});

test('swing only delays off-beat sixteenths, never past the next step', () => {
 const sixteenth = 60 / 120 / 4;
 assert.equal(stepOffset(4, 120, 100), 4 * sixteenth);
 assert.equal(stepOffset(1, 120, 0), sixteenth);
 assert.ok(Math.abs(stepOffset(1, 120, 100) - sixteenth * 4 / 3) < 1e-12);
 assert.ok(stepOffset(STEPS - 1, 120, 100) < barLength(120));
});

test('solo overrides mute, and chain mode skips empty patterns', () => {
 assert.deepEqual(audible([{muted: true}, {muted: false}]), [false, true]);
 assert.deepEqual(audible([{muted: true, solo: true}, {muted: false}]), [true, false]);
 const {patterns} = starter();
 assert.equal(nextPattern('C', patterns, true), 'A');
 assert.equal(nextPattern('A', patterns, false), 'A');
});

test('WAV export writes a valid 16-bit PCM header and clips samples', () => {
 const buffer = wav([new Float32Array([0, 2, -2]), new Float32Array([0.5, 0, 0])], 44100);
 const view = new DataView(buffer);
 const text = (o, n) => String.fromCharCode(...new Uint8Array(buffer, o, n));
 assert.equal(text(0, 4), 'RIFF');
 assert.equal(text(8, 4), 'WAVE');
 assert.equal(view.getUint16(22, true), 2);
 assert.equal(view.getUint32(40, true), 12);
 assert.equal(view.getInt16(46, true), 16383);
 assert.equal(view.getInt16(48, true), 32767);
 assert.equal(view.getInt16(52, true), -32768);
 assert.equal(TRACKS.length * 5, encode(starter()).split('.')[5].length);
});
