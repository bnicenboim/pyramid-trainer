// Timing analysis of a take: which attack belongs to which beat, and the score. No page access.
import { bandsFor, inZoneR, ioiWeight } from './bands.js';
import { buildFindings } from './findings.js';

const rng = xs => xs.length ? [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))] : [0, 0];

// For every exercise beat, the attack nearest its grid line (within half a subdivision).
// `onset` is computeOnsetFunction(data, sr); `grid` is the beat grid in recording time (see placeGrid).
// Options: minRel (weak-note rule: an attack below this share of the take's median strength is not a note),
// restMode (beats with no note are rests, not misses), bpm (for grid entries that carry none).
export function analyzeTake(data, sr, onset, grid, { minRel = 0.1, restMode = false, bpm = 0 } = {}) {
  const { odf, odfNoClick, tone, hopSec, frameSec, nHops } = onset;
  const floor = 5; // minimum flux rise for a peak to be considered at all
  // Peaks: local max over ±2 hops, rising at least `floor` over the mean of the previous 32 hops.
  // Onset time = the hop where the rise passes half its height. The very first sign of the
  // transient is a few ms before the attack you hear and see in the waveform; the half-rise
  // point matches the perceived attack better. Peaks whose block is mostly the click tone
  // are the click, not a note.
  // Times where a click actually sounded (from the schedule): a peak within 15 ms of one is the click
  // unless it carries clearly more off-click energy than a bare click does.
  const clickT = grid.filter(b => b.clicked).map(b => b.t).sort((a, b) => a - b);
  const nearClick = t => { let lo = 0, hi = clickT.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (clickT[m] < t - 0.015) lo = m + 1; else if (clickT[m] > t + 0.015) hi = m - 1; else return true; } return false; };
  const peaks = [];
  for (let n = 34; n < nHops - 2; n++) {
    const c = odf[n];
    if (c < odf[n - 1] || c < odf[n - 2] || c < odf[n + 1] || c < odf[n + 2]) continue;
    let mean = 0; for (let j = n - 33; j < n - 1; j++) mean += odf[j]; mean /= 32;
    const str = c - mean;
    if (str < floor) continue;
    let k0 = n; while (k0 > 0 && odf[k0 - 1] - mean > 0.5 * str) k0--;
    const t = k0 * hopSec + frameSec;
    const isClick = tone[n] >= 0.6 || tone[Math.max(0, n - 1)] >= 0.6 || nearClick(t);
    // Flux outside the click's own frequency bins: what a note adds on top of a click
    let meanNC = 0; for (let j = n - 33; j < n - 1; j++) meanNC += odfNoClick[j]; meanNC /= 32;
    const strNC = Math.max(0, odfNoClick[n] - meanNC);
    // Loudness just after the attack (20 ms): a fret scrape or pre-strum has a lot of flux but little level
    let amp = 0; for (let i = Math.floor(t * sr), e = Math.min(data.length, i + Math.round(0.02 * sr)); i < e; i++) { const a = Math.abs(data[i]); if (a > amp) amp = a; }
    peaks.push({ t, str, strNC, isClick, amp });
  }
  // A note played exactly on a clicked beat shares its frame with the click, so the
  // frame looks like "click". The count-in clicks (no guitar yet) show how much
  // off-click flux a bare click produces; a click-flagged peak with clearly more
  // than that has a note in it, and is kept with its off-click strength.
  const ciEnd = (() => { const f = grid.find(b => !b.ci); return f ? f.t : 0; })();
  const bare = peaks.filter(p => p.isClick && p.t < ciEnd - 0.05).map(p => p.strNC).sort((a, b) => a - b);
  const bareRef = bare.length ? bare[Math.floor(bare.length * 0.75)] : null; // upper quartile: be conservative
  // ... and how loud a bare click is: a click-coincident attack clearly louder than that has a note in it
  const bareAmp = peaks.filter(p => p.isClick && p.t < ciEnd - 0.05).map(p => p.amp).sort((a, b) => a - b);
  const bareAmpRef = bareAmp.length ? bareAmp[Math.floor(bareAmp.length * 0.75)] : null;
  const notes = [];
  for (const p of peaks) {
    if (!p.isClick) notes.push(p);
    else if (bareRef !== null && (p.strNC >= Math.max(floor, 1.5 * bareRef) || (bareAmpRef && p.amp >= 1.6 * bareAmpRef))) notes.push({ t: p.t, str: Math.max(p.strNC, floor), isClick: true, amp: p.amp });
  }
  let pos = 0, qn = 0;
  const beats = grid.map(b => { pos = b.q ? 0 : pos + 1; if (b.bar) qn = 0; else if (b.q) qn++; return { beatT: b.t, ci: b.ci, q: b.q, bar: b.bar, sub: b.sub, pos, qn, bpm: b.bpm || bpm, round: b.round || 0, dev: null, onsetT: null, str: 0 }; });
  // Interval each note had to hit (drives the timing bands and the difficulty)
  beats.forEach((r, i) => { const nx = beats[i + 1], pv = beats[i - 1]; r.ioi = nx ? nx.beatT - r.beatT : pv ? r.beatT - pv.beatT : 0.5; Object.assign(r, bandsFor(r.ioi)); });
  let pi = 0;
  for (const r of beats) {
    if (r.ci) continue;
    const half = Math.min(0.15, r.ioi / 2 + 0.005); // half the interval this note had (logged, not the live bpm)
    while (pi < notes.length && notes[pi].t < r.beatT - 0.3) pi++;
    let best = null;
    for (let j = pi; j < notes.length && notes[j].t <= r.beatT + half; j++) {
      const p = notes[j]; if (p.t < r.beatT - half) continue;
      // The note is the clearly loudest attack in the window (a pre-strum or scrape before it is
      // quieter even if its flux is high); among comparably loud ones, the sharper attack wins.
      if (!best || p.amp > 1.4 * best.amp || (p.amp > best.amp / 1.4 && p.str > best.str)) best = p;
    }
    if (best) { r.dev = Math.round((best.t - r.beatT) * 1000); r.onsetT = best.t; r.str = best.str; }
  }
  // Second pass: a "note" far weaker than the others in this take is noise or a release
  // sound that happened to sit in an empty window — drop it.
  const strs = beats.filter(r => r.dev !== null).map(r => r.str).sort((a, b) => a - b);
  if (strs.length >= 4) {
    const medStr = strs[Math.floor(strs.length / 2)];
    for (const r of beats) if (r.dev !== null && r.str < minRel * medStr) { r.dev = null; r.onsetT = null; r.str = 0; }
  }
  // Beats after your last note are the time it took to press Stop, not misses: leave them out
  let lastHit = -1;
  beats.forEach((r, i) => { if (!r.ci && r.dev !== null) lastHit = i; });
  beats.forEach((r, i) => { r.skipped = !r.ci && i > lastHit; });
  // Option: beats with no note are rests you chose not to play, not misses — leave them out
  beats.forEach(r => { r.rest = restMode && !r.ci && !r.skipped && r.dev === null; });
  // Summary & score
  const ex = beats.filter(r => !r.ci && !r.skipped && !r.rest);
  const hits = ex.filter(r => r.dev !== null);
  const inZone = hits.filter(inZoneR);
  const mean = hits.length ? hits.reduce((a, r) => a + r.dev, 0) / hits.length : 0;
  const sd = hits.length > 1 ? Math.sqrt(hits.reduce((a, r) => a + (r.dev - mean) ** 2, 0) / (hits.length - 1)) : 0;
  // Score = plain accuracy: share of beats within ±25 ms, misses count 0. Comparable across takes.
  const score = ex.length ? Math.round(100 * inZone.length / ex.length) : 0;
  // Difficulty: the sounded interval each note had to hit (see ioiWeight), and the length of the take
  const noteDiff = ex.length ? ex.reduce((a, r) => a + ioiWeight(r.ioi), 0) / ex.length : 1;
  const lenFactor = Math.min(1.6, Math.max(0.85, 1 + 0.15 * Math.log2(Math.max(1, ex.length) / 16)));
  const difficulty = noteDiff * lenFactor;
  const points = Math.round(score * difficulty);
  const bySub = {};
  for (const r of ex) { const k = r.sub; bySub[k] = bySub[k] || { n: 0, z: 0, miss: 0, devs: [] }; bySub[k].n++; if (r.dev === null) bySub[k].miss++; else { bySub[k].devs.push(r.dev); if (inZoneR(r)) bySub[k].z++; } }
  // Per-position statistics: downbeat vs beats 2-4, and each off-beat syllable of each subdivision
  const byPos = {};
  const addPos = (key, r) => { const o = byPos[key] = byPos[key] || { key, n: 0, z: 0, miss: 0, devs: [] }; o.n++; if (r.dev === null) o.miss++; else { o.devs.push(r.dev); if (inZoneR(r)) o.z++; } };
  for (const r of ex) {
    if (r.pos === 0) addPos(r.qn === 0 ? 'down' : 'b234', r);
    else addPos(`${r.sub}:${r.pos}`, r);
  }
  for (const o of Object.values(byPos)) { const m = o.devs.length ? o.devs.reduce((x, y) => x + y, 0) / o.devs.length : 0; o.mean = m; o.sd = o.devs.length > 1 ? Math.sqrt(o.devs.reduce((x, v) => x + (v - m) ** 2, 0) / (o.devs.length - 1)) : 0; }
  const a = { beats, byPos, score, points, difficulty, noteDiff, lenFactor, tightLo: rng(ex.map(r => r.tight))[0], tightHi: rng(ex.map(r => r.tight))[1], zoneLo: rng(ex.map(r => r.zone))[0], zoneHi: rng(ex.map(r => r.zone))[1], hits: hits.length, total: ex.length, inZone: inZone.length, mean, sd, bySub };
  a.findings = buildFindings(a);
  return a;
}
