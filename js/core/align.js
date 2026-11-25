// Places the beat grid on a recording from the clicks the microphone heard. No page access.
import { computeOnsetFunction } from './onset.js';

// Grid in recording time: every logged tick, `offset` seconds after its scheduled time
export const gridFromLog = (log, recStart, offset, segOffset = {}) => log.map(b => ({ bpm: b.bpm, t: b.t - recStart + (segOffset[b.seg || 0] !== undefined ? segOffset[b.seg || 0] : offset), q: b.q, bar: b.bar, sub: b.sub, ci: b.ci, clicked: !!b.clicked, round: b.round || 0 }));

// Find the metronome clicks (pure 1800/1200 Hz bursts) in the mic channel and the
// single time offset that lines them up with the schedule. Returns null when too
// few are found (e.g. headphones). Tone-matched, so guitar notes don't count.
export function alignByRecordedClicks(data, sr, log, recStart) {
  const schedAll = log.filter(b => b.clicked).map(b => ({ t: b.t - recStart, ci: !!b.quiet, seg: b.seg || 0 })); // ci = first (silent) count-in bar
  const sched = schedAll.map(x => x.t);
  const hasCountIn = schedAll.filter(x => x.ci).length >= 2; // a usable silent bar (a mid-bar "Clear" can leave fewer)
  if (sched.length < 2) return null;
  const B = 128, nb = Math.floor(data.length / B);
  const freqs = [1800, 1200, 2000, 1400], coeffs = freqs.map(f => 2 * Math.cos(2 * Math.PI * f / sr)); // exercise and count-in click pitches
  // Per block: tone power (best of the click pitches), its share of the block's energy
  const pDb = new Float32Array(nb), share = new Float32Array(nb);
  for (let k = 0; k < nb; k++) {
    let e = 0, best = 0;
    for (let c = 0; c < coeffs.length; c++) {
      const coeff = coeffs[c]; let s1 = 0, s2 = 0;
      for (let i = k * B; i < (k + 1) * B; i++) { const x = data[i]; const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; if (c === 0) e += x * x; }
      const pw = (s1 * s1 + s2 * s2 - coeff * s1 * s2) * 2 / (B * B);
      if (pw > best) best = pw;
    }
    pDb[k] = best > 0 ? 10 * Math.log10(best) : -120;
    share[k] = e > 0 ? best / (e / B) : 0;
  }
  // Burst starts: tone jumps >= 12 dB over the previous 40 ms and dominates the block
  const cands = [];
  let lastK = -1e9;
  for (let k = 16; k < nb; k++) {
    let base = 0; for (let j = k - 16; j < k - 2; j++) base += pDb[j]; base /= 14;
    if (pDb[k] > -70 && pDb[k] - base >= 12 && share[k] >= 0.25 && k - lastK > Math.round(0.04 * sr / B)) { cands.push(k * B / sr); lastK = k; }
  }
  if (cands.length < 2) return null;
  // Offset between recorded and scheduled clicks: mode of all pairwise differences (4 ms bins), then median
  const diffs = []; // {d: candidate − scheduled, ci: scheduled click was in the count-in}
  let ci = 0;
  for (const x of schedAll) {
    while (ci < cands.length && cands[ci] < x.t - 0.1) ci++;
    for (let j = ci; j < cands.length && cands[j] < x.t + 0.6; j++) diffs.push({ d: cands[j] - x.t, ci: x.ci, seg: x.seg });
  }
  if (diffs.length < 2) return null;
  const bins = new Map();
  // Vote with the silent bar's clicks only when there is one (guitar notes near the click pitches can't outvote them)
  const voters = hasCountIn ? diffs.filter(x => x.ci) : diffs;
  for (const { d } of voters) { const b = Math.round(d / 0.004); bins.set(b, (bins.get(b) || 0) + 1); }
  let modeBin = 0, modeN = 0;
  for (const [b, n] of bins) if (n > modeN) { modeN = n; modeBin = b; }
  const near = diffs.filter(x => Math.abs(x.d - modeBin * 0.004) <= 0.008).sort((a, b) => a.d - b.d);
  const matched = near.length, nearCi = near.filter(x => x.ci), ciMatched = nearCi.length;
  // Two clicks that agree on the same offset are enough: the schedule gives all the
  // others (clicks later masked by the guitar don't need to be found). To rule out
  // chance agreement with other tonal sounds, the two must come from the count-in
  // (the first bar is silent, so a click there is unmistakable); without a count-in, three must agree.
  if (!(hasCountIn ? ciMatched >= 2 : matched >= 3)) return null;
  // The offset itself comes from the silent bar's clicks when there are enough of them
  const src = ciMatched >= 2 ? nearCi : near;
  const offset = src[Math.floor(src.length / 2)].d;
  // After a pause/resume the recorder's own pause and resume instants differ from the main
  // thread's by some ms: re-estimate the offset per segment from the clicks found there
  const segOffset = {};
  for (const seg of new Set(schedAll.map(x => x.seg))) {
    if (seg === 0) continue;
    const ds = diffs.filter(x => x.seg === seg && Math.abs(x.d - offset) <= 0.08).map(x => x.d).sort((a, b) => a - b);
    if (ds.length < 2) continue;
    const med = ds[Math.floor(ds.length / 2)];
    if (ds.filter(d => Math.abs(d - med) <= 0.008).length >= 2) segOffset[seg] = med;
  }
  const offFor = seg => segOffset[seg] !== undefined ? segOffset[seg] : offset;
  const clickTimes = []; // recorded clicks that agree with the offset (for the detector-consistency step)
  for (const x of schedAll) { const expect = x.t + offFor(x.seg); const c = cands.find(v => Math.abs(v - expect) <= 0.008); if (c !== undefined) clickTimes.push(c); }
  return { offset, segOffset, matched, total: sched.length, clickTimes };
}

// The alignment above dates a click at the first block where its tone appears (its
// physical start), while the timing analysis dates a note at the half-rise of its
// attack (what you hear). Measured on a real take, that difference is ~5-7 ms, which
// would show up as a fake "late" lean on every note. So the recorded clicks are
// re-dated with the note detector, and the grid is shifted by the median difference:
// notes and clicks are then measured with the same ruler.
export function clickRulerShift(onset, clickTimes) {
  if (!clickTimes || clickTimes.length < 1) return 0.005; // no recorded click: typical value
  const { odf, hopSec, frameSec, nHops } = onset;
  const ds = [];
  for (const tc of clickTimes) {
    // strongest ODF peak within ±15 ms of the tone start, then its half-rise time
    const nc = Math.round((tc - frameSec) / hopSec);
    let best = -1, bestV = -1;
    for (let n = Math.max(34, nc - 6); n <= Math.min(nHops - 3, nc + 6); n++) if (odf[n] > bestV) { bestV = odf[n]; best = n; }
    if (best < 0) continue;
    let mean = 0; for (let j = best - 33; j < best - 1; j++) mean += odf[j]; mean /= 32;
    const str = bestV - mean; if (str <= 0) continue;
    let k0 = best; while (k0 > 0 && odf[k0 - 1] - mean > 0.5 * str) k0--;
    ds.push(k0 * hopSec + frameSec - tc);
  }
  if (!ds.length) return 0.005;
  ds.sort((a, b) => a - b);
  const med = ds[Math.floor(ds.length / 2)];
  return Math.max(0, Math.min(0.015, med)); // sanity bounds
}

// The whole grid in recording time. Preferred: the mic heard the click from the speakers,
// so the recording itself says where every click landed, and the grid (silent subdivisions
// included) is placed by matching those recorded clicks to the schedule `log`.
// Fallback (headphones: the mic can't hear the click): the grid is placed `fallbackSec`
// after the schedule, plus the typical start-to-attack difference of the note detector.
// Returns { grid, ruler, odf (onset function, when it was computed), al (null in the fallback) }.
export function placeGrid(data, sr, log, recStart, fallbackSec) {
  const al = alignByRecordedClicks(data, sr, log, recStart);
  if (!al) return { grid: gridFromLog(log, recStart, fallbackSec + 0.005), ruler: 0.005, odf: null, al: null };
  const odf = computeOnsetFunction(data, sr);
  const ruler = clickRulerShift(odf, al.clickTimes);
  const segShifted = {}; for (const k in al.segOffset) segShifted[k] = al.segOffset[k] + ruler;
  return { grid: gridFromLog(log, recStart, al.offset + ruler, segShifted), ruler, odf, al };
}
