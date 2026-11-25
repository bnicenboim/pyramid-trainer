// Tempo, the lookahead scheduler, and the transitions between steps and rounds.
import { S } from './state.js';
import { $, bpmSlider, bpmDisplay, countdownOverlay, statusMsg, subdivSec, ticksPerBar, manualSubdiv } from './dom.js';
import { vanishName, vanishClick, vanishAdvance, vanishStay } from './vanish.js';
import { buildBeatDots, updatePyramidUI, updateRoundLbl, updateCountdownDisplay } from './ui.js';
import { playClick } from './audio.js';
import { startRecording } from './recording.js';
import { stop } from './session.js';

export const LOOKAHEAD = 0.12, SCHED_MS = 40;
let finishMsg = 'Pyramid complete!';
// Count-in note value: when the metronome plays the subdivisions, the count-in plays them too
export function countInSubdiv() {
  const m = $('clickModeSel').value;
  const plays = m === 'all' || (m === 'vanish' && $('vanishFrom').value === 'all');
  return plays ? (S.autoMode ? S.PYRAMID_SEQ[0] : manualSubdiv()) : 1;
}

// Restart the beat grid from now (used when the user changes tempo/subdivision mid-session)
export function restartGridNow() {
  S.scheduledBeats = []; S.beatIndex = 0; S.ticksSinceStepStart = 0; S.nextBeatTime = S.audioCtx.currentTime + 0.05;
}
export function setBpm(v, quiet) {
  S.bpm = Math.max(20, Math.min(220, Math.round(v)));
  bpmSlider.value = S.bpm;
  if (document.activeElement !== bpmDisplay) bpmDisplay.value = S.bpm;
  // User tempo change while running: restart the grid from now so the change is audible at once.
  // Internal changes (round progression) are "quiet": the new tempo simply applies from the next tick.
  if (S.running && !quiet && S.audioCtx && !S.inCountIn) restartGridNow();
}

// All timeline changes (count-in → exercise, pyramid step changes, round changes)
// happen *inside* this loop, exactly on a tick boundary, so no tick is ever
// scheduled twice and no beat is skipped.
export function scheduleTick() {
  if (!S.audioCtx || !S.running || S.stopPending) return;
  const now = S.audioCtx.currentTime;
  while (S.nextBeatTime < now + LOOKAHEAD) {
    if (S.pendingTransition) {
      const fn = S.pendingTransition; S.pendingTransition = null;
      if (fn() === false) {            // finished: stop when the last tick has sounded
        S.stopPending = true;
        const sid = S.sessionId;
        setTimeout(() => { if (S.running && S.sessionId === sid) { statusMsg.textContent = finishMsg; stop(); } },
                   Math.max(0, (S.nextBeatTime - S.audioCtx.currentTime) * 1000));
        return;
      }
    }
    const t = S.nextBeatTime;
    const isDownbeat = S.beatIndex % S.subdivisions === 0;
    const isBarDown = S.beatIndex % (S.subdivisions * 4) === 0;
    const quarterInBar = Math.floor(S.beatIndex / S.subdivisions) % 4; // 0..3
    if (!S.inCountIn && isBarDown) {
      // Vanishing metronome, manual mode: a stage lasts N bars (auto mode: N rounds, see advancePyramidStep)
      if (S.clickMode === 'vanish' && !S.autoMode && S.exBarNo - S.vanishStageStartBar >= vanishStay()) vanishAdvance();
      S.exBarNo++; // this bar has started (barInStage = exBarNo - 1 - vanishStageStartBar for every tick in it)
    }
    const shouldClick = S.inCountIn ? (S.subdivisions > 1 || isDownbeat)
      : (S.clickMode === 'vanish' ? vanishClick(isDownbeat, isBarDown, quarterInBar)
      : S.clickMode === 'all'
         || (S.clickMode === 'quarters' && isDownbeat)
         || (S.clickMode === 'b13' && isDownbeat && quarterInBar % 2 === 0)
         || (S.clickMode === 'b24' && isDownbeat && quarterInBar % 2 === 1)
         || (S.clickMode === 'downbeat' && isBarDown));
    S.scheduledBeats.push({ time: t, idx: S.beatIndex, ci: S.inCountIn, clicked: shouldClick, sub: S.subdivisions, step: S.pyramidStepIdx, round: S.roundsDone,
      barInStep: Math.floor(S.ticksSinceStepStart / ticksPerBar()), ciBarsLeft: S.inCountIn ? Math.ceil((S.countInBeatsLeft + (isDownbeat ? 0 : 1)) / 4) : 0 });
    if (S.mediaRecorder && S.mediaRecorder.state === 'recording')
      S.beatLog.push({ bpm: S.bpm, t: t - S.recPausedSec, q: isDownbeat, bar: isBarDown, sub: S.subdivisions, clicked: shouldClick, ci: S.inCountIn, quiet: S.inCountIn && !S.roundCountIn && S.countInBeatsLeft + (isDownbeat ? 0 : 1) > S.countInBeatsTotal - 4, seg: S.recSeg, round: S.autoMode ? S.roundsDone : 0 });
    if (shouldClick) playClick(t, isDownbeat, S.inCountIn);

    if (S.inCountIn) {
      // Count-in beats are quarter notes (the count-in may play subdivisions inside them)
      if (isDownbeat) S.countInBeatsLeft--;
      if (S.countInBeatsLeft <= 0 && S.beatIndex % S.subdivisions === S.subdivisions - 1) S.pendingTransition = endCountIn;
    } else if (S.autoMode) {
      S.ticksSinceStepStart++;
      if (S.ticksSinceStepStart >= S.barsPerStep * ticksPerBar()) S.pendingTransition = advancePyramidStep;
    } else {
      S.ticksSinceStepStart++;
      const maxBars = Math.max(0, +$('manualBars').value || 0);
      if (maxBars > 0 && S.ticksSinceStepStart >= maxBars * ticksPerBar()) S.pendingTransition = manualBarsDone;
    }
    // Time limit: once the playing time is up, stop at the next bar line (overrides a step change there)
    const maxMin = maxMinutes();
    if (!S.inCountIn && maxMin > 0 && S.exerciseStartT !== null && t - S.exerciseStartT - S.exercisePausedSec >= maxMin * 60) {
      const nextIsBar = (S.beatIndex + 1) % (S.subdivisions * 4) === 0 || S.pendingTransition; // next tick starts a bar (or a step)
      if (nextIsBar) S.pendingTransition = timeDone;
    }

    S.beatIndex++;
    S.nextBeatTime = t + subdivSec(); // next boundary, in the subdivision that was just played
  }
  S.scheduledBeats = S.scheduledBeats.filter(b => b.time > now - 0.8);
}

// The time limit, shown in both panels (one value, two inputs kept in sync)
export const maxMinutes = () => Math.max(0, +$('maxMinutes').value || 0);
// Time limit reached (checked at a bar line)
function timeDone() { const m = maxMinutes(); finishMsg = `Done — ${m} minute${m === 1 ? '' : 's'} of playing complete!`; return false; }

// Manual mode: stop after N bars (0 = endless)
function manualBarsDone() { finishMsg = `Done — ${Math.round(S.ticksSinceStepStart / ticksPerBar())} bars complete!`; return false; }

// Run a UI update when the tick at `nextBeatTime` actually sounds (the scheduler runs ahead).
export function atTickTime(fn) {
  if (!S.audioCtx) return fn();
  const sid = S.sessionId;
  setTimeout(() => { if (S.sessionId === sid) fn(); }, Math.max(0, (S.nextBeatTime - S.audioCtx.currentTime) * 1000));
}

// Called by the scheduler at the first exercise tick after the count-in.
function endCountIn() {
  if (!S.roundCountIn && S.exerciseStartT === null) { S.exerciseStartT = S.nextBeatTime; S.exercisePausedSec = 0; }
  const wasRoundCountIn = S.roundCountIn;
  S.inCountIn = false; S.roundCountIn = false;
  S.beatIndex = 0;
  S.ticksSinceStepStart = 0;
  if (S.autoMode) { S.pyramidStepIdx = 0; S.subdivisions = S.PYRAMID_SEQ[0]; }
  else S.subdivisions = manualSubdiv();
  if (!S.mediaRecorder) startRecording(S.nextBeatTime); // normally already recording since the count-in
  atTickTime(() => {
    countdownOverlay.textContent = 'GO'; countdownOverlay.classList.add('show');
    setTimeout(() => countdownOverlay.classList.remove('show'), 350);
    buildBeatDots(); if (S.autoMode) updatePyramidUI();
    statusMsg.textContent = S.clickMode === 'vanish' ? `Go! Metronome: ${vanishName()} (it will thin out)` : 'Go! Play in time with the click.';
    if (S.recDest && !S.ciClickHeard && !wasRoundCountIn) {
      statusMsg.textContent = `⚠ The input did not hear the click during the count-in (headphones, or a direct input?). The grid will be placed by the system's reported delay${S.sysLatencySec !== null ? ` (${Math.round(S.sysLatencySec * 1000)} ms)` : ''}, not measured. Playing on.`;
      $('clickLbl').textContent = '⚠ click not heard by the input';
    }
    updateRoundLbl();
  });
}

// Called by the scheduler exactly at the tick that starts the next step.
// Returns false when the pyramid is finished and the session should stop.
function advancePyramidStep() {
  S.pyramidStepIdx++;
  let msg = null;
  if (S.pyramidStepIdx >= S.PYRAMID_SEQ.length) {
    S.roundsDone++;
    if (S.clickMode === 'vanish' && S.roundsDone % vanishStay() === 0) vanishAdvance();
    const maxR = Math.max(0, +$('maxRounds').value || 0);
    if (maxR > 0 && S.roundsDone >= maxR) { finishMsg = `Done — ${S.roundsDone} round${S.roundsDone > 1 ? 's' : ''} complete!`; return false; }
    const nb = applyProgression();
    S.pyramidStepIdx = 0;
    if (nb !== null && nb !== S.bpm) {
      setBpm(nb, true);
      const rci = +$('roundCountInSel').value || 0;
      if (rci > 0) { // a few bars of quarter-note clicks at the new tempo, then the round starts (endCountIn)
        S.inCountIn = true; S.roundCountIn = true;
        S.countInBeatsLeft = S.countInBeatsTotal = rci * 4;
        S.subdivisions = countInSubdiv(); S.ticksSinceStepStart = 0; S.beatIndex = 0;
        atTickTime(() => { buildBeatDots(); updatePyramidUI(); updateRoundLbl(); updateCountdownDisplay(); statusMsg.textContent = `New tempo ${S.bpm} BPM — count-in (${rci} bar${rci > 1 ? 's' : ''})`; });
        return true;
      }
      msg = `Round ${S.roundsDone + 1} — new tempo ${S.bpm} BPM`;
    }
    else msg = `Round ${S.roundsDone + 1}`;
  }
  S.subdivisions = S.PYRAMID_SEQ[S.pyramidStepIdx];
  S.ticksSinceStepStart = 0;
  S.beatIndex = 0; // restart the bar grid so downbeats line up in the new subdivision
  atTickTime(() => {
    buildBeatDots(); updatePyramidUI(); updateRoundLbl();
    if (msg) statusMsg.textContent = msg;
  });
  return true;
}

// Tempo progression between rounds: the new BPM, or null to keep the current one
function applyProgression() {
  const m = $('progMode').value;
  const every = Math.max(1, +$('progRounds').value || 1);
  if (m === 'repeat' || S.roundsDone % every !== 0) return null;
  if (m === 'up5') return S.bpm + 5;
  if (m === 'up10') return S.bpm + 10;
  if (m === 'random') return randomBpm();
  return null;
}
// A tempo drawn at random inside the "Random between" limits (never the current one)
export function randomBpm() {
  let lo = +$('progMin').value || 20, hi = +$('progMax').value || 220;
  if (lo > hi) [lo, hi] = [hi, lo];
  let v = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (v === S.bpm && hi > lo) v = v === hi ? lo : v + 1; // avoid an identical tempo
  return v;
}
