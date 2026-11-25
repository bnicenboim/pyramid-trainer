// Beat track, pyramid sequence, bars row, session header, and countdown.
import { S } from './state.js';
import { SUB_WORD } from './state.js';
import { $, beatTrack, countdownOverlay, pyramidSeq, stepFill, ticksPerBar, manualSubdiv } from './dom.js';
import { vanishName } from './vanish.js';
import { maxMinutes } from './scheduler.js';

const COUNT_SYL = { 1: [''], 2: ['', '+'], 3: ['', 'trip', 'let'], 4: ['', 'e', '+', 'a'] };
export function buildBeatDots() {
  beatTrack.innerHTML = '';
  const count = Math.min(S.subdivisions * 4, 16);
  const syl = COUNT_SYL[S.subdivisions] || [''];
  for (let i = 0; i < count; i++) {
    const strong = i % S.subdivisions === 0;
    const cell = document.createElement('div');
    cell.className = 'beat-cell' + (strong ? ' strong' : '');
    const d = document.createElement('div');
    d.className = 'beat-dot' + (strong ? ' strong' : '');
    const l = document.createElement('span');
    l.className = 'beat-lbl';
    l.textContent = strong ? String(Math.floor(i / S.subdivisions) + 1) : (syl[i % S.subdivisions] || '');
    cell.appendChild(d); cell.appendChild(l);
    beatTrack.appendChild(cell);
  }
}

export function litDot(idx, cls='lit') {
  const dots = beatTrack.querySelectorAll('.beat-dot');
  if (!dots.length) return;
  dots.forEach(d => { d.classList.remove('lit','countin'); });
  if (idx >= 0) dots[idx % dots.length].classList.add(cls);
}

const STEP_LABEL = { 1: '♩', 2: '♪', 3: '♪₃', 4: '♬' }, STEP_NAME = { 1: 'Quarter', 2: 'Eighth', 3: 'Triplet', 4: 'Sixteenth' };
export function selectedSteps() {
  const boxes = [...document.querySelectorAll('#stepPick input')];
  let sel = boxes.filter(b => b.checked).map(b => +b.dataset.divs);
  if (!sel.length) { boxes[0].checked = true; sel = [1]; } // at least one step
  return sel.sort((a, b) => a - b);
}
export function buildPyramidSeq() {
  const up = selectedSteps();
  S.PYRAMID_SEQ = up.concat(up.slice(0, -1).reverse()); // climb, then back down without repeating the top
  const labels = S.PYRAMID_SEQ.map(d => STEP_LABEL[d]), names = S.PYRAMID_SEQ.map(d => STEP_NAME[d]);
  pyramidSeq.innerHTML = '';
  S.PYRAMID_SEQ.forEach((d, i) => {
    if (i > 0) {
      const arr = document.createElement('span');
      arr.className = 'pseq-arrow';
      arr.textContent = '›';
      pyramidSeq.appendChild(arr);
    }
    const el = document.createElement('div');
    el.className = 'pseq-step';
    el.id = 'ps' + i;
    el.innerHTML = `<span style="font-size:1rem">${labels[i]}</span><span>${names[i]}</span>`;
    pyramidSeq.appendChild(el);
  });
}

export function updatePyramidUI() {
  S.PYRAMID_SEQ.forEach((_, i) => {
    const el = $('ps' + i);
    if (!el) return;
    el.classList.toggle('cur', i === S.pyramidStepIdx);
    el.classList.toggle('done', i < S.pyramidStepIdx);
  });
  const pct = ticksPerBar() > 0
    ? Math.min(100, Math.round(S.ticksSinceStepStart / (S.barsPerStep * ticksPerBar()) * 100))
    : 0;
  stepFill.style.width = pct + '%';
}

// The bar in progress and the bars that follow, as note symbols: ♩ quarters, ♫ eighths, ♪♪♪ triplets, ♬♬ sixteenths
const BEAT_GLYPH = { 1: '♩', 2: '♫', 3: '♪♪♪<sup>3</sup>', 4: '♬♬' };
function upcomingBars(cur, n) {
  const out = []; // {sub, ci?, lbl?, end?}
  if (cur.ci) {
    for (let i = 0; i < cur.ciBarsLeft; i++) out.push({ sub: cur.sub, ci: true, lbl: i === 0 ? 'count-in' : '' });
    const first = S.autoMode ? S.PYRAMID_SEQ[0] : manualSubdiv();
    for (let i = 0; out.length < n; i++) out.push({ sub: first, lbl: i === 0 ? (S.roundCountIn ? 'go' : 'start') : '' });
    return out.slice(0, n);
  }
  if (S.autoMode) {
    const maxR = Math.max(0, +$('maxRounds').value || 0);
    let step = cur.step, bar = cur.barInStep, round = cur.round, first = true;
    while (out.length < n) {
      const sub = S.PYRAMID_SEQ[step];
      for (; bar < S.barsPerStep && out.length < n; bar++) out.push({ sub, lbl: first ? '' : bar === 0 ? SUB_WORD[sub] + 's' : '' }), first = false;
      bar = 0; step++;
      if (step >= S.PYRAMID_SEQ.length) {
        step = 0; round++;
        if (maxR > 0 && round >= maxR) { out.push({ end: true }); break; }
        if (out.length < n) { out.push({ sub: S.PYRAMID_SEQ[0], lbl: `round ${round + 1}`, newRound: true }); bar = 1; }
      }
    }
    return out.slice(0, n);
  }
  const maxBars = Math.max(0, +$('manualBars').value || 0);
  let barNo = cur.barInStep;
  while (out.length < n) { if (maxBars > 0 && barNo >= maxBars) { out.push({ end: true }); break; } out.push({ sub: cur.sub }); barNo++; }
  return out.slice(0, n);
}
export function renderBarsRow(cur) {
  const row = $('barsRow');
  if (!cur) { row.innerHTML = ''; return; }
  const n = Math.max(2, Math.min(4, Math.floor(row.clientWidth / 150)));
  const bars = upcomingBars(cur, n);
  const beatInBar = Math.floor(cur.idx / cur.sub) % 4;
  row.innerHTML = bars.map((b, i) => {
    if (b.end) return `<span class="bar end"><span class="lbl">end</span><span class="beats">𝄂</span></span>`;
    const beats = [0, 1, 2, 3].map(k => `<span class="beat${i === 0 && k === beatInBar ? ' now' : ''}">${BEAT_GLYPH[b.sub]}</span>`).join('');
    const change = i > 0 && !b.ci && b.sub !== bars[i - 1].sub && !bars[i - 1].ci;
    const lbl = b.lbl || (change ? SUB_WORD[b.sub] + 's' : '');
    return `<span class="bar${i === 0 ? ' cur' : ''}${change ? ' change' : ''}${b.ci ? ' ci' : ''}"><span class="lbl">${lbl}</span><span class="beats">${beats}</span></span>`;
  }).join('');
}
export function updateSessionHead(cur) {
  const h = $('sessionHead');
  if (!S.running) { h.innerHTML = ''; return; }
  const next = cur && !cur.ci && S.autoMode && cur.barInStep === S.barsPerStep - 1 ? (() => { const i = cur.step + 1; const sub = i < S.PYRAMID_SEQ.length ? S.PYRAMID_SEQ[i] : (Math.max(0, +$('maxRounds').value || 0) > 0 && S.roundsDone + 1 >= Math.max(0, +$('maxRounds').value || 0)) ? null : S.PYRAMID_SEQ[0]; return sub ? ` <span class="next">→ ${SUB_WORD[sub]}s next bar</span>` : ' <span class="next">→ last bar</span>'; })() : '';
  // Overall progress: bars played of the total (when bars/rounds are limited) and playing time of the limit
  const totalBars = S.autoMode ? (Math.max(0, +$('maxRounds').value || 0) * S.PYRAMID_SEQ.length * S.barsPerStep) : Math.max(0, +$('manualBars').value || 0);
  const barNow = S.inCountIn ? 0 : Math.max(1, S.exBarNo);
  const progress = S.inCountIn ? '' : ` · <b>bar ${barNow}${totalBars ? ' of ' + totalBars : ''}</b>` + (maxMinutes() ? ` · <span id="headTime"></span>` : '');
  if (S.autoMode) {
    const maxR = Math.max(0, +$('maxRounds').value || 0);
    const sub = S.inCountIn ? S.PYRAMID_SEQ[0] : S.subdivisions;
    h.innerHTML = `Round ${S.roundsDone + 1}${maxR ? ' of ' + maxR : ''} · ${S.bpm} BPM <small>· ${S.inCountIn ? 'count-in' : SUB_WORD[sub] + 's'}${S.inCountIn ? '' : ` (bar ${(cur ? cur.barInStep : 0) + 1}/${S.barsPerStep})`}${progress}</small>${next}`;
  } else {
    h.innerHTML = `${S.bpm} BPM <small>· ${S.inCountIn ? 'count-in' : SUB_WORD[S.subdivisions] + 's'}${progress}</small>`;
  }
  updateHeadTime();
}
// Playing time so far / the time limit, as m:ss (updated every frame)
export function updateHeadTime() {
  const el = $('headTime'); if (!el || !S.audioCtx || S.exerciseStartT === null) return;
  const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const played = Math.max(0, (S.paused ? S.pausedAt : S.audioCtx.currentTime) - S.exerciseStartT - S.exercisePausedSec);
  el.textContent = `${fmt(played)} / ${fmt(maxMinutes() * 60)}`;
}
export function updateRoundLbl() {
  const v = S.clickMode === 'vanish' && S.running && !S.inCountIn ? ` · click: ${vanishName()}` : '';
  if (S.clickMode === 'vanish' && S.running && !S.inCountIn) $('clickLbl').textContent = `Metronome: ${vanishName()}`;
  else if (!/click not heard/.test($('clickLbl').textContent)) $('clickLbl').textContent = '';
  $('roundLbl').textContent = S.running && S.autoMode && (!S.inCountIn || S.roundCountIn) ? `Round ${S.roundsDone + 1} · ${S.bpm} BPM${v}` : '';
}

export function updateCountdownDisplay() {
  if (!S.inCountIn) { countdownOverlay.classList.remove('show'); return; }
  const barsLeft = Math.max(1, Math.ceil(S.countInBeatsLeft / 4));
  // Silence matters only when the mic is recording: the count-in clicks anchor the grid.
  const firstBar = S.countInBeatsLeft > S.countInBeatsTotal - 4;
  const note = S.roundCountIn ? `new tempo ${S.bpm} BPM — count-in`
             : S.recDest && firstBar ? 'count-in — stay silent, these clicks anchor the grid'
             : S.recDest ? 'count-in — grid anchored, you can start playing' : 'count-in';
  countdownOverlay.innerHTML = `${barsLeft}<small>${note}</small>`;
  countdownOverlay.classList.add('show');
}
