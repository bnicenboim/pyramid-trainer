// Click synthesis, and whether the input hears the click.
import { S } from './state.js';
import { $, sigbar } from './dom.js';

// Level meter for the input (analyser polled by the animation loop)
const sessionTd = new Uint8Array(1024);
// During the count-in: does the input hear the click? Look for a sharp spectral peak at the count-in
// click pitch (2000 Hz on the beat, 1400 Hz on subdivisions) standing well above its surroundings.
export const ciBg = { 2000: null, 1400: null }; // level at the click pitch between clicks (the pitch must jump above it)
export function pollClickHeard() {
  if (!S.sessionAnalyser || !S.sessionFd || !S.inCountIn || S.ciClickHeard || !S.audioCtx) return;
  const now = S.audioCtx.currentTime;
  S.sessionAnalyser.getFloatFrequencyData(S.sessionFd);
  const binHz = S.audioCtx.sampleRate / S.sessionAnalyser.fftSize;
  const levelAt = f => { const k = Math.round(f / binHz); let peak = -200; for (let j = k - 1; j <= k + 1; j++) peak = Math.max(peak, S.sessionFd[j]); return peak; };
  // only the 250 ms after a count-in click count; the rest of the time feeds the background level
  const click = S.scheduledBeats.find(b => b.ci && b.clicked && now >= b.time && now <= b.time + 0.25);
  if (!click) { for (const f of [2000, 1400]) { const v = levelAt(f); if (isFinite(v)) ciBg[f] = ciBg[f] === null ? v : 0.8 * ciBg[f] + 0.2 * v; } return; }
  if (S.ciHeardTimes.includes(click.time)) return;
  for (const f of [2000, 1400]) {
    const k = Math.round(f / binHz), peak = levelAt(f);
    const around = []; for (let j = k - 14; j <= k + 14; j++) if (Math.abs(j - k) >= 4) around.push(S.sessionFd[j]);
    around.sort((a, b) => a - b); const med = around[Math.floor(around.length / 2)];
    // a sharp peak that stands out from its surroundings AND jumps above what this pitch showed between clicks
    if (peak > -75 && isFinite(med) && med > -130 && peak - med >= 15 && (ciBg[f] === null || peak - ciBg[f] >= 10)) {
      S.ciHeardTimes.push(click.time); if (S.ciHeardTimes.length >= 2) S.ciClickHeard = true; return;
    }
  }
}
export function pollSessionLevel() {
  if (!S.sessionAnalyser) return;
  S.sessionAnalyser.getByteTimeDomainData(sessionTd);
  let sum = 0;
  for (let i = 0; i < sessionTd.length; i++) { const v = (sessionTd[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / sessionTd.length);
  updateSigMeter(rms > 0 ? 20 * Math.log10(rms) : -100);
}

export function updateSigMeter(db) {
  const segs = sigbar.querySelectorAll('.seg');
  const lvls = [-50,-40,-30,-20,-12];
  segs.forEach((s,i) => {
    s.classList.toggle('on', db >= lvls[i] && db < -12);
    s.classList.toggle('hot', db >= lvls[i] && db >= -12);
  });
}

// ── Click synthesis ──
// Short sine blip in `ctx`: `level` decaying to silence over `decay` seconds, into `dest`
export function playTone(ctx, when, freq, level, decay, dest) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(level, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + decay);
  osc.connect(gain); gain.connect(dest);
  osc.start(when); osc.stop(when + decay + 0.01);
}
// One metronome click. Every sound keeps a dominant sine at the click pitch (the recording is
// aligned by finding that pitch), the variants add length, level, harmonics or a short snap.
export function synthClick(ctx, when, freq, strong, dest, sound) {
  const base = strong ? 0.3 : 0.14;
  switch (sound) {
    case 'long': playTone(ctx, when, freq, base * 2, 0.12, dest); break;
    case 'bright':
      playTone(ctx, when, freq, base * 2, 0.08, dest);
      playTone(ctx, when, freq * 2, base * 0.9, 0.04, dest);
      playTone(ctx, when, freq * 3, base * 0.4, 0.025, dest);
      break;
    case 'wood': {
      playTone(ctx, when, freq, base * 2, 0.07, dest);
      playTone(ctx, when, freq * 2, base * 0.8, 0.03, dest);
      // 3 ms noise snap, band-limited around the click pitch so the pitch still dominates
      const n = Math.round(ctx.sampleRate * 0.004), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 4;
      const g = ctx.createGain(); g.gain.value = base * 1.2;
      src.connect(bp); bp.connect(g); g.connect(dest); src.start(when);
      break;
    }
    default: playTone(ctx, when, freq, base, 0.05, dest);
  }
}
export function playClick(when, strong, isCountIn) {
  const freq = isCountIn ? (strong ? 2000 : 1400) : (strong ? 1800 : 1200);
  synthClick(S.audioCtx, when, freq, strong, S.clickBus || S.audioCtx.destination, $('clickSoundSel').value);
}
