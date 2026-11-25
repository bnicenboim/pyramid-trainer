// Timing bands and the difficulty weight of a note interval. No page access.

// Timing bands, from the perception and synchronization literature. The just-noticeable
// displacement of a tone in a steady sequence is ~6 ms below 240 ms spacing and ~2.5% of the
// interval above it (Friberg & Sundberg 1995); professional percussionists scatter ~10 ms (2%)
// at 500 ms and ~4% at 300 ms (Fujii et al. 2011, in Repp & Su 2013); ensemble notes up to
// 30-50 ms apart still sound "together" (Rasch 1979). So:
//   green  = within max(15 ms, 3% of the interval), capped at 25 ms: nobody can hear it is off
//   amber  = within max(35 ms, 7% of the interval), capped at 60 ms: a careful listener feels it, but it holds together
//   red    = beyond that
export const bandsFor = ioiSec => { const ms = ioiSec * 1000; return { tight: Math.min(25, Math.max(15, 0.03 * ms)), zone: Math.min(60, Math.max(35, 0.07 * ms)) }; };
export const inTight = r => r.dev !== null && Math.abs(r.dev) <= r.tight;
export const inZoneR = r => r.dev !== null && Math.abs(r.dev) <= r.zone;
// Difficulty of one note from the interval it had to hit, after the sensorimotor-synchronization
// literature (Fraisse 1982; Repp 2005; London 2012): timing is easiest and least variable for
// intervals of roughly 250-700 ms. Shorter intervals are a motor challenge (sixteenths at 160 bpm =
// 94 ms -> ×1.5); longer ones let the internal clock drift, but you can subdivide them in your
// head, so the ramp is gentler (quarters at 50 bpm = 1200 ms -> ×1.2, at 30 bpm -> ×1.4).
export function ioiWeight(sec) {
  const ms = sec * 1000;
  if (ms < 250) return 1 + 0.35 * Math.log2(250 / Math.max(50, ms));
  if (ms > 700) return 1 + 0.25 * Math.log2(ms / 700);
  return 1;
}
