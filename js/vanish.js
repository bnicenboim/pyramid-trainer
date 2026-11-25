// Vanishing metronome: the stages and when to move to the next one.
import { S } from './state.js';
import { $, statusMsg } from './dom.js';
import { updateRoundLbl } from './ui.js';
import { atTickTime } from './scheduler.js';

// Vanishing metronome. Stages are named patterns; the sequence depends on where it starts.
// Starting on 1 it thins to "1 every 4th bar"; starting on 2 and 4 it thins to "2 every 4th bar".
export const VANISH_DEF = {
  all:   { name: 'all subdivisions', on: () => true },
  q1234: { name: '1 2 3 4',          on: (db) => db },
  b13:   { name: '1 and 3',          on: (db, bd, q) => db && q % 2 === 0 },
  b24:   { name: '2 and 4',          on: (db, bd, q) => db && q % 2 === 1 },
  one1:  { name: '1 only',           on: (db, bd) => bd },
  one2:  { name: '2 only',           on: (db, bd, q) => db && q === 1 },
  e2_1:  { name: '1 every other bar', on: (db, bd, q, bar) => bd && bar % 2 === 0 },
  e4_1:  { name: '1 every 4th bar',   on: (db, bd, q, bar) => bd && bar % 4 === 0 },
  e2_2:  { name: '2 every other bar', on: (db, bd, q, bar) => db && q === 1 && bar % 2 === 0 },
  e4_2:  { name: '2 every 4th bar',   on: (db, bd, q, bar) => db && q === 1 && bar % 4 === 0 },
};
const VANISH_SEQ = {
  all: ['all', 'q1234', 'b13', 'one1', 'e2_1', 'e4_1'],
  q1234: ['q1234', 'b13', 'one1', 'e2_1', 'e4_1'],
  b13: ['b13', 'one1', 'e2_1', 'e4_1'],
  b24: ['b24', 'one2', 'e2_2', 'e4_2'],
  one1: ['one1', 'e2_1', 'e4_1'],
};
const vanishSeq = () => VANISH_SEQ[$('vanishFrom').value] || VANISH_SEQ.q1234;
export const vanishName = () => VANISH_DEF[vanishSeq()[S.vanishStage]].name;
export function vanishClick(isDownbeat, isBarDown, quarterInBar) {
  const barInStage = S.exBarNo - 1 - S.vanishStageStartBar; // 0 = first bar of the stage
  const seq = vanishSeq();
  return VANISH_DEF[seq[Math.min(S.vanishStage, seq.length - 1)]].on(isDownbeat, isBarDown, quarterInBar, barInStage);
}
// Next stage (at a bar line), unless the chosen last stage is reached
export function vanishAdvance() {
  const seq = vanishSeq();
  let last = seq.indexOf($('vanishTo').value); if (last < 0) last = seq.length - 1;
  if (S.vanishStage >= last) return false;
  S.vanishStage++; S.vanishStageStartBar = S.exBarNo;
  atTickTime(() => { statusMsg.textContent = `Metronome now: ${vanishName()}`; updateRoundLbl(); });
  return true;
}
// "down to" lists the stages after the chosen start; keeps the previous choice when it still exists
export function buildVanishTo() {
  const sel = $('vanishTo'), prev = sel.value, seq = vanishSeq().slice(1);
  sel.innerHTML = seq.map(k => `<option value="${k}">${VANISH_DEF[k].name}</option>`).join('');
  sel.value = seq.includes(prev) ? prev : (seq.includes('e2_1') ? 'e2_1' : seq.includes('e2_2') ? 'e2_2' : seq[seq.length - 1]);
}
export const vanishStay = () => Math.max(1, +$('vanishStay').value || 1);
