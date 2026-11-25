// Page elements and small helpers.
import { S } from './state.js';

export const $ = id => document.getElementById(id);
export const bpmSlider=$('bpmSlider'), bpmDisplay=$('bpmDisplay');
export const beatTrack=$('beatTrack'), countdownOverlay=$('countdownOverlay');
export const deviceSel=$('deviceSel'), sigbar=$('sigbar');
export const recPanel=$('recPanel'), recIndicator=$('recIndicator');
export const waveCanvas=$('waveCanvas'), playBtn=$('playBtn'), pbDur=$('pbDur');
export const statusMsg=$('statusMsg'), startBtn=$('startBtn'), resetBtn=$('resetBtn'), pauseBtn=$('pauseBtn');
export const micToggle=$('micToggle');
export const manualSection=$('manualSection'), autoSection=$('autoSection');
export const pyramidSeq=$('pyramidSeq'), stepFill=$('stepFill');

const beatSec = () => 60 / S.bpm;
export const subdivSec = () => beatSec() / S.subdivisions;
export const ticksPerBar = () => S.subdivisions * 4; // 4/4 time
export const manualSubdiv = () => +(document.querySelector('#subdivRow .step-btn.active')?.dataset.divs || 1);
export const noInput = () => deviceSel.value === 'none';
const signed = ms => (ms >= 0 ? '+' : '') + ms;
export const cssVarColor = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#2266cc';
export function setPlayBtn(playing) {
  playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
  playBtn.className = playing ? 'btn btn-playing btn-sm' : 'btn btn-play btn-sm';
}
export function resetPauseBtn() { pauseBtn.textContent = '⏸ Pause'; pauseBtn.classList.remove('active'); }
