// Runs in Node, without a browser. A synthetic take with known deviations goes through
// grid placement and timing analysis, and the result is checked with assertions.
import assert from 'assert';
import { placeGrid } from '../js/core/align.js';
import { computeOnsetFunction } from '../js/core/onset.js';
import { analyzeTake } from '../js/core/timing.js';

const SR = 48000, BPM = 120, BEAT = 60 / BPM;
const CLICK_DELAY = 0.11;  // seconds between a scheduled click and the click in the recording
const REC_START = 3;       // audio-clock time at which the recording started
const TOLERANCE_MS = 5;
// Deviation of every exercise note in ms (null = not played): one bar of quarters, then one of eighths
const DEVS = [40, -35, 30, -30, 5, 0, -5, 15, 8, -8, null, 20];

// Schedule: one silent count-in bar, then the exercise; the metronome clicks on quarters
const log = [];
let t = REC_START + 0.5;
for (let i = 0; i < 4; i++, t += BEAT) log.push({ bpm: BPM, t, q: true, bar: i === 0, sub: 1, clicked: true, ci: true, quiet: true });
for (let i = 0; i < 4; i++, t += BEAT) log.push({ bpm: BPM, t, q: true, bar: i === 0, sub: 1, clicked: true, ci: false });
for (let i = 0; i < 8; i++, t += BEAT / 2) log.push({ bpm: BPM, t, q: i % 2 === 0, bar: i === 0, sub: 2, clicked: i % 2 === 0, ci: false });
const exercise = log.filter(b => !b.ci);
assert.equal(exercise.length, DEVS.length);

let seed = 5;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
function synthesize({ withClicks }) {
  const d = new Float32Array(Math.ceil((t - REC_START + 1) * SR));
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.01; // room noise
  const add = (t0, len, fn) => { for (let i = Math.ceil(t0 * SR); i < Math.min(d.length, Math.floor((t0 + len) * SR)); i++) d[i] += fn(i / SR - t0); };
  if (withClicks) for (const b of log) if (b.clicked) add(b.t - REC_START + CLICK_DELAY, 0.05, x => 0.15 * Math.sin(2 * Math.PI * (b.ci ? 2000 : 1800) * x) * Math.exp(-x * 60));
  const noise = Array.from({ length: SR }, rnd);
  exercise.forEach((b, i) => {
    if (DEVS[i] === null) return;
    add(b.t - REC_START + CLICK_DELAY + DEVS[i] / 1000, 0.2, x => 0.3 * Math.exp(-x * 6) * [1, 2, 3, 4, 5, 6].reduce((a, h) => a + Math.sin(2 * Math.PI * 196 * h * x) / h, 0) / 2.4 + 0.25 * Math.exp(-x * 250) * noise[Math.floor(x * SR) % SR]);
  });
  return d;
}

// The mic heard the click: the grid comes from the recorded clicks
{
  const data = synthesize({ withClicks: true });
  const { grid, odf, al } = placeGrid(data, SR, log, REC_START, 0);
  assert.ok(al, 'the recorded clicks were found');
  assert.ok(Math.abs(al.offset - CLICK_DELAY) < TOLERANCE_MS / 1000, `click delay ${al.offset.toFixed(4)} s`);
  const a = analyzeTake(data, SR, odf, grid);
  const got = a.beats.filter(r => !r.ci).map(r => r.dev);
  DEVS.forEach((want, i) => {
    if (want === null) assert.equal(got[i], null, `beat ${i + 1} was not played`);
    else assert.ok(got[i] !== null && Math.abs(got[i] - want) <= TOLERANCE_MS, `beat ${i + 1}: expected ${want} ms, got ${got[i]} ms`);
  });
  const played = DEVS.filter(v => v !== null).length;
  assert.equal(a.total, DEVS.length);
  assert.equal(a.hits, played);
  assert.equal(a.score, Math.round(100 * a.inZone / a.total));
  assert.ok(a.findings.length > 0);
  // "Ignore unplayed beats": the missing note is a rest and leaves the total
  const rest = analyzeTake(data, SR, odf, grid, { restMode: true });
  assert.equal(rest.total, played);
  assert.equal(rest.beats.filter(r => r.rest).length, DEVS.length - played);
  console.log('with clicks: deviations', got.join(','), '| score', a.score);
}

// Headphones: no click in the recording, so the grid falls back to the given delay
{
  const data = synthesize({ withClicks: false });
  const { grid, al, ruler } = placeGrid(data, SR, log, REC_START, CLICK_DELAY);
  assert.equal(al, null);
  assert.ok(Math.abs(grid[0].t - (log[0].t - REC_START + CLICK_DELAY + ruler)) < 1e-9);
  const a = analyzeTake(data, SR, computeOnsetFunction(data, SR), grid);
  assert.equal(a.hits, DEVS.filter(v => v !== null).length);
  console.log('headphones: fallback grid, hits', a.hits, 'of', a.total);
}
console.log('errors: []');
