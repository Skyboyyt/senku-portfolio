import {TRACKS, PATTERNS, STEPS, LIMITS, clamp, cloneGrid, emptyGrid, isEmpty, nextState, euclid, rotate, stepOffset, audible, nextPattern, encode, decode, starter, wav} from './model.mjs';
import {mixer, trigger} from './audio.mjs';

const $ = selector => document.querySelector(selector);
const LOOKAHEAD = 0.12, TICK = 25, EXPORT_BARS = 4, SAMPLE_RATE = 44100;
const STATE_LABELS = ['off', 'on', 'accent'];

const fromLink = decode(location.hash);
const song = fromLink || starter();
let current = 'A', queued = null, chain = false, selected = 0, page = 0;
const undoStack = [];

// Audio graph is created on the first gesture to satisfy browser autoplay rules.
let ctx = null, live = null, analyser = null;
function ensureAudio() {
 if (!ctx) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) { say('This browser does not support the Web Audio API.'); return null; }
  ctx = new Context();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.connect(ctx.destination);
  live = mixer(ctx, TRACKS.map(t => t.id), analyser);
  applyMixer();
 }
 if (ctx.state === 'suspended') ctx.resume();
 return ctx;
}
function applyMixer(mix = live, target = ctx) {
 if (!mix) return;
 const heard = audible(song.mixer);
 TRACKS.forEach((track, i) => mix.tracks[track.id].gain.setTargetAtTime(heard[i] ? (song.mixer[i].volume / 100) ** 1.6 : 0, target.currentTime, 0.01));
}

// --- Scheduler -----------------------------------------------------------
// Timing runs on the audio clock; setInterval only tops up the next ~120ms of notes.
let playing = false, timer = 0, step = 0, gridTime = 0, playingPattern = 'A';
const visuals = [];

function scheduleAhead() {
 while (gridTime < ctx.currentTime + LOOKAHEAD) {
  const sixteenth = 60 / song.bpm / 4;
  const time = gridTime + (stepOffset(step, song.bpm, song.swing) - step * sixteenth);
  const grid = song.patterns[playingPattern];
  TRACKS.forEach((track, t) => { if (grid[t][step]) trigger(ctx, live, track.id, time, grid[t][step]); });
  visuals.push({step, time, pattern: playingPattern});
  gridTime += sixteenth;
  if (++step === STEPS) {
   step = 0;
   playingPattern = queued || nextPattern(playingPattern, song.patterns, chain);
   queued = null;
  }
 }
}

function start() {
 if (!ensureAudio()) return;
 playing = true;
 step = 0;
 playingPattern = current;
 queued = null;
 gridTime = ctx.currentTime + 0.06;
 scheduleAhead();
 timer = setInterval(scheduleAhead, TICK);
 paintTransport();
}
function stop() {
 playing = false;
 clearInterval(timer);
 visuals.length = 0;
 queued = null;
 paintPlayhead(-1);
 paintPatterns();
 paintTransport();
}

function frame() {
 if (ctx) {
  let latest = null;
  while (visuals.length && visuals[0].time <= ctx.currentTime) latest = visuals.shift();
  if (latest && playing) {
   if (latest.pattern !== current) { current = latest.pattern; renderGrid(); paintPatterns(); }
   paintPlayhead(latest.step);
  }
 }
 drawScope();
 requestAnimationFrame(frame);
}

// --- Grid ----------------------------------------------------------------
const gridEl = $('#grid');
let cells = [], columns = [], focusCell = {t: 0, s: 0};

function buildGrid() {
 gridEl.innerHTML = '';
 cells = TRACKS.map(() => []);
 columns = Array.from({length: STEPS}, () => []);
 const head = document.createElement('div');
 head.className = 'row head';
 head.setAttribute('aria-hidden', 'true');
 head.innerHTML = '<span class="track-spacer"></span>' + Array.from({length: STEPS}, (_, s) => `<span class="beat-number${s % 4 ? '' : ' downbeat'}" data-step="${s}">${s + 1}</span>`).join('');
 gridEl.append(head);
 TRACKS.forEach((track, t) => {
  const row = document.createElement('div');
  row.className = 'row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', track.name);
  row.innerHTML = `<div class="track">
   <button type="button" class="track-name" data-track="${t}" aria-pressed="false" aria-label="${track.name}"><span class="full">${track.name}</span><span class="short" aria-hidden="true">${track.short}</span></button>
   <button type="button" class="mute" data-track="${t}" aria-pressed="false" aria-label="Mute ${track.name}">M</button>
   <button type="button" class="solo" data-track="${t}" aria-pressed="false" aria-label="Solo ${track.name}">S</button>
   <input type="range" class="volume" data-track="${t}" min="0" max="100" step="1" aria-label="${track.name} volume">
  </div>`;
  for (let s = 0; s < STEPS; s++) {
   const cell = document.createElement('button');
   cell.type = 'button';
   cell.className = 'cell' + (Math.floor(s / 4) % 2 ? ' alt' : '');
   cell.dataset.track = t;
   cell.dataset.step = s;
   cell.tabIndex = -1;
   row.append(cell);
   cells[t].push(cell);
   columns[s].push(cell);
  }
  gridEl.append(row);
 });
 cells[0][0].tabIndex = 0;
 columns.forEach((column, s) => column.push(head.children[s + 1]));
}

function renderGrid() {
 const grid = song.patterns[current];
 TRACKS.forEach((track, t) => cells[t].forEach((cell, s) => {
  const value = grid[t][s];
  cell.dataset.state = value;
  cell.setAttribute('aria-label', `${track.name}, step ${s + 1}, ${STATE_LABELS[value]}`);
 }));
 renderMixer();
}

function renderMixer() {
 const heard = audible(song.mixer);
 TRACKS.forEach((track, t) => {
  const row = gridEl.children[t + 1];
  row.classList.toggle('silent', !heard[t]);
  row.querySelector('.mute').setAttribute('aria-pressed', String(song.mixer[t].muted));
  row.querySelector('.solo').setAttribute('aria-pressed', String(song.mixer[t].solo));
  row.querySelector('.track-name').setAttribute('aria-pressed', String(t === selected));
  const volume = row.querySelector('.volume');
  volume.value = song.mixer[t].volume;
  volume.setAttribute('aria-valuetext', `${song.mixer[t].volume}%`);
 });
 $('#tools-track').textContent = TRACKS[selected].name;
 $('#track-volume').value = song.mixer[selected].volume;
 $('#track-volume-value').textContent = `${song.mixer[selected].volume}%`;
}

let lastPlayhead = -1;
function paintPlayhead(s) {
 if (lastPlayhead >= 0) columns[lastPlayhead].forEach(cell => cell.classList.remove('now'));
 if (s >= 0) columns[s].forEach(cell => cell.classList.add('now'));
 lastPlayhead = s;
 // Follow the playhead between halves on narrow screens.
 if (s >= 0 && phoneLayout.matches && Math.floor(s / 8) !== page && !gridEl.contains(document.activeElement)) setPage(Math.floor(s / 8));
}

function edit(change, message) {
 undoStack.push({key: current, grid: cloneGrid(song.patterns[current])});
 if (undoStack.length > 100) undoStack.shift();
 change(song.patterns[current]);
 renderGrid();
 paintPatterns();
 save();
 $('#undo').disabled = false;
 if (message) say(message);
}

gridEl.addEventListener('click', event => {
 const cell = event.target.closest('.cell');
 if (cell) {
  const t = Number(cell.dataset.track), s = Number(cell.dataset.step);
  edit(grid => { grid[t][s] = nextState(grid[t][s]); });
  moveFocus(t, s);
  return;
 }
 const button = event.target.closest('button[data-track]');
 if (!button) return;
 const t = Number(button.dataset.track);
 if (button.classList.contains('track-name')) {
  selected = t;
  renderMixer();
  if (ensureAudio()) trigger(ctx, live, TRACKS[t].id, ctx.currentTime + 0.01, 2);
 } else {
  const key = button.classList.contains('mute') ? 'muted' : 'solo';
  song.mixer[t][key] = !song.mixer[t][key];
  renderMixer();
  applyMixer();
  save();
 }
});
function setVolume(t, value) {
 song.mixer[t].volume = clamp(value, LIMITS.volume);
 renderMixer();
 applyMixer();
 save();
}
gridEl.addEventListener('input', event => {
 if (event.target.matches('.volume')) setVolume(Number(event.target.dataset.track), event.target.value);
});
$('#track-volume').addEventListener('input', event => setVolume(selected, event.target.value));

function moveFocus(t, s) {
 cells[focusCell.t][focusCell.s].tabIndex = -1;
 focusCell = {t, s};
 const cell = cells[t][s];
 cell.tabIndex = 0;
 if (phoneLayout.matches && Math.floor(s / 8) !== page) setPage(Math.floor(s / 8));
 cell.focus();
}
gridEl.addEventListener('keydown', event => {
 const cell = event.target.closest('.cell');
 if (!cell) return;
 const t = Number(cell.dataset.track), s = Number(cell.dataset.step);
 const moves = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Home: [0, -s], End: [0, STEPS - 1 - s]};
 if (!moves[event.key]) return;
 event.preventDefault();
 const [dt, ds] = moves[event.key];
 moveFocus((t + dt + TRACKS.length) % TRACKS.length, (s + ds + STEPS) % STEPS);
});

// --- Narrow screens show eight steps at a time ----------------------------
const phoneLayout = matchMedia('(max-width: 720px)');
function setPage(value) {
 page = value;
 gridEl.dataset.page = value;
 document.querySelectorAll('.pages button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.page) === value)));
}
document.querySelectorAll('.pages button').forEach(button => button.addEventListener('click', () => setPage(Number(button.dataset.page))));

// --- Transport and patterns -----------------------------------------------
const patternsEl = $('#patterns');
patternsEl.innerHTML = PATTERNS.map(key => `<button type="button" data-pattern="${key}" aria-pressed="false" aria-label="Pattern ${key}"><span>${key}</span></button>`).join('');
patternsEl.addEventListener('click', event => {
 const button = event.target.closest('[data-pattern]');
 if (button) choosePattern(button.dataset.pattern);
});
function choosePattern(key) {
 if (playing && key !== current) {
  queued = key;
  say(`Pattern ${key} starts at the next bar.`);
 } else {
  current = key;
  renderGrid();
 }
 paintPatterns();
}
function paintPatterns() {
 patternsEl.querySelectorAll('button').forEach(button => {
  const key = button.dataset.pattern;
  button.setAttribute('aria-pressed', String(key === current));
  button.classList.toggle('queued', key === queued);
  button.classList.toggle('empty', isEmpty(song.patterns[key]));
  button.setAttribute('aria-label', `Pattern ${key}${isEmpty(song.patterns[key]) ? ', empty' : ''}${key === queued ? ', queued' : ''}`);
 });
}

const playButton = $('#play');
playButton.addEventListener('click', () => (playing ? stop() : start()));
function paintTransport() {
 playButton.setAttribute('aria-pressed', String(playing));
 playButton.querySelector('.play-label').textContent = playing ? 'Stop' : 'Play';
}

const bpmInput = $('#bpm');
function setBpm(value) {
 song.bpm = clamp(value, LIMITS.bpm);
 bpmInput.value = song.bpm;
 save();
}
bpmInput.addEventListener('change', () => setBpm(bpmInput.value));
document.querySelectorAll('.nudge').forEach(button => button.addEventListener('click', () => setBpm(song.bpm + Number(button.dataset.nudge))));

const swingInput = $('#swing');
swingInput.addEventListener('input', () => {
 song.swing = clamp(swingInput.value, LIMITS.swing);
 $('#swing-value').textContent = `${song.swing}%`;
 save();
});

$('#chain').addEventListener('change', event => {
 chain = event.target.checked;
 say(chain ? 'Chain on: patterns with notes play in turn.' : 'Chain off: the current pattern loops.');
});

// --- Track and pattern tools ----------------------------------------------
const hitsInput = $('#hits');
const hitsLabel = () => `${hitsInput.value} ${hitsInput.value === '1' ? 'hit' : 'hits'}`;
hitsInput.addEventListener('input', () => { $('#hits-value').textContent = hitsLabel(); });
$('#apply-euclid').addEventListener('click', () => edit(grid => { grid[selected] = euclid(Number(hitsInput.value)); }, `${TRACKS[selected].name}: ${hitsLabel()} spread evenly.`));
$('#shift-left').addEventListener('click', () => edit(grid => { grid[selected] = rotate(grid[selected], -1); }));
$('#shift-right').addEventListener('click', () => edit(grid => { grid[selected] = rotate(grid[selected], 1); }));
$('#clear-track').addEventListener('click', () => edit(grid => { grid[selected].fill(0); }, `${TRACKS[selected].name} cleared.`));
$('#clear-pattern').addEventListener('click', () => edit(grid => grid.forEach(row => row.fill(0)), `Pattern ${current} cleared. Undo restores it.`));
$('#copy-pattern').addEventListener('click', () => {
 const target = PATTERNS[(PATTERNS.indexOf(current) + 1) % PATTERNS.length];
 undoStack.push({key: target, grid: cloneGrid(song.patterns[target])});
 song.patterns[target] = cloneGrid(song.patterns[current]);
 $('#undo').disabled = false;
 paintPatterns();
 save();
 say(`Pattern ${current} copied to ${target}.`);
});
$('#reset').addEventListener('click', () => {
 if (!confirm('Replace all four patterns, tempo and mixer with the starter beats?')) return;
 Object.assign(song, starter());
 undoStack.length = 0;
 $('#undo').disabled = true;
 syncControls();
 applyMixer();
 save();
 say('Starter beats loaded.');
});

function undo() {
 const last = undoStack.pop();
 if (!last) return;
 song.patterns[last.key] = last.grid;
 if (!playing) current = last.key;
 $('#undo').disabled = !undoStack.length;
 renderGrid();
 paintPatterns();
 save();
 say(`Undone in pattern ${last.key}.`);
}
$('#undo').addEventListener('click', undo);

// --- Saving, sharing and export -------------------------------------------
// The URL fragment is the save file; it never leaves the browser unless shared.
let saveTimer = 0;
function save() {
 clearTimeout(saveTimer);
 saveTimer = setTimeout(() => history.replaceState(null, '', '#' + encode(song)), 150);
}
$('#share').addEventListener('click', async () => {
 history.replaceState(null, '', '#' + encode(song));
 try {
  await navigator.clipboard.writeText(location.href);
  say('Share link copied. Anyone who opens it hears this beat.');
 } catch {
  prompt('Copy this link to share your beat:', location.href);
 }
});

$('#export').addEventListener('click', async () => {
 const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
 if (!Offline) return say('This browser cannot render audio offline.');
 const button = $('#export');
 button.disabled = true;
 say('Rendering four bars…');
 try {
  // Walk the same pattern order playback would follow, then leave a short tail.
  const sixteenth = 60 / song.bpm / 4, length = Math.ceil((EXPORT_BARS * STEPS * sixteenth + 1.2) * SAMPLE_RATE);
  const offline = new Offline(2, length, SAMPLE_RATE);
  const mix = mixer(offline, TRACKS.map(t => t.id));
  const heard = audible(song.mixer);
  TRACKS.forEach((track, i) => { mix.tracks[track.id].gain.value = heard[i] ? (song.mixer[i].volume / 100) ** 1.6 : 0; });
  let key = current;
  for (let bar = 0; bar < EXPORT_BARS; bar++) {
   const grid = song.patterns[key];
   for (let s = 0; s < STEPS; s++) {
    const time = 0.02 + bar * STEPS * sixteenth + stepOffset(s, song.bpm, song.swing);
    TRACKS.forEach((track, t) => { if (grid[t][s]) trigger(offline, mix, track.id, time, grid[t][s]); });
   }
   key = nextPattern(key, song.patterns, chain);
  }
  const rendered = await offline.startRendering();
  const blob = new Blob([wav([rendered.getChannelData(0), rendered.getChannelData(1)], SAMPLE_RATE)], {type: 'audio/wav'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pulse-grid-${song.bpm}bpm.wav`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  say(`Exported ${EXPORT_BARS} bars at ${song.bpm} BPM.`);
 } catch {
  say('Export failed in this browser. Playback still works.');
 } finally {
  button.disabled = false;
 }
});

// --- Oscilloscope -----------------------------------------------------------
const scope = $('#scope'), scopeCtx = scope.getContext('2d');
let samples = null;
function drawScope() {
 const ratio = window.devicePixelRatio || 1, width = scope.clientWidth, height = scope.clientHeight;
 if (!width) return;
 if (scope.width !== Math.round(width * ratio)) { scope.width = Math.round(width * ratio); scope.height = Math.round(height * ratio); }
 scopeCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
 scopeCtx.clearRect(0, 0, width, height);
 const styles = getComputedStyle(document.documentElement);
 scopeCtx.strokeStyle = styles.getPropertyValue('--accent').trim();
 scopeCtx.lineWidth = 1.5;
 scopeCtx.beginPath();
 if (analyser && playing) {
  samples ||= new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  for (let i = 0; i < samples.length; i += 4) {
   const x = i / samples.length * width, y = height / 2 - samples[i] * height * 0.45;
   i ? scopeCtx.lineTo(x, y) : scopeCtx.moveTo(x, y);
  }
 } else {
  scopeCtx.moveTo(0, height / 2);
  scopeCtx.lineTo(width, height / 2);
 }
 scopeCtx.stroke();
}

// --- Shortcuts, status, theme and menu -------------------------------------
document.addEventListener('keydown', event => {
 if (event.target.closest('input, textarea, select, dialog[open]')) return;
 if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
 if (event.ctrlKey || event.metaKey || event.altKey) return;
 if (event.key === ' ' && !event.target.closest('button, a')) { event.preventDefault(); playing ? stop() : start(); }
 if (/^[1-4]$/.test(event.key)) choosePattern(PATTERNS[Number(event.key) - 1]);
});

let statusTimer = 0;
function say(message) {
 const status = $('#status');
 status.textContent = message;
 clearTimeout(statusTimer);
 statusTimer = setTimeout(() => { status.textContent = ''; }, 4000);
}

const themeButton = $('.theme-toggle');
function paintTheme() {
 const dark = document.documentElement.dataset.theme === 'dark';
 themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
 themeButton.setAttribute('aria-pressed', String(dark));
 $('meta[name="theme-color"]').setAttribute('content', dark ? '#141414' : '#f3f1ec');
}
themeButton.addEventListener('click', () => {
 const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
 document.documentElement.dataset.theme = next;
 try { localStorage.setItem('pulse-grid-theme', next); } catch {}
 paintTheme();
});

const menu = $('#mobile-menu'), openMenu = $('#open-menu');
openMenu.addEventListener('click', () => { menu.showModal(); openMenu.setAttribute('aria-expanded', 'true'); });
$('#close-menu').addEventListener('click', () => menu.close());
menu.addEventListener('close', () => openMenu.setAttribute('aria-expanded', 'false'));
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => menu.close()));
menu.addEventListener('click', event => { if (event.target === menu) menu.close(); });

function syncControls() {
 bpmInput.value = song.bpm;
 swingInput.value = song.swing;
 $('#swing-value').textContent = `${song.swing}%`;
 renderGrid();
 paintPatterns();
}

buildGrid();
syncControls();
paintTheme();
setPage(0);
requestAnimationFrame(frame);
if (location.hash && !fromLink) say('That link could not be read, so the starter beats are loaded.');
else if (fromLink) say('Beat loaded from the link.');
