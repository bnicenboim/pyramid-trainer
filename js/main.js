// Entry point: UI handlers, settings memory, and start-up.
import { S } from './state.js';
import { VERSION } from './version.js';
import { $, bpmSlider, bpmDisplay, deviceSel, recPanel, recIndicator, waveCanvas, playBtn, statusMsg, startBtn, resetBtn, pauseBtn, micToggle, manualSection, autoSection, manualSubdiv, noInput, resetPauseBtn, countdownOverlay, beatTrack } from './dom.js';
import { alignByRecordedClicks } from './core/align.js';
import { buildVanishTo } from './vanish.js';
import { buildBeatDots, selectedSteps, buildPyramidSeq, updatePyramidUI } from './ui.js';
import { synthClick, playClick, pollSessionLevel } from './audio.js';
import { releaseMic, applySink, resetMicToggle, startMicPreview } from './devices.js';
import { restartGridNow, setBpm } from './scheduler.js';
import { firstExerciseT, exportWav, clearRecording, finalizeRecording } from './recording.js';
import { setView, renderWave, startPlayback, pausePlayback, seekTo, prevBar, nextBar, setTransportEnabled, playbackTone } from './playback.js';
import { analyzeTiming, renderAnaSummary } from './results.js';
import { updateCsvBtn, downloadCsv, renderTakes, logCsv } from './history.js';
import { startFrameLoop, startAudio, stop } from './session.js';

// Help panel
$('helpToggle').addEventListener('click', () => {
  const p = $('helpPanel');
  p.hidden = !p.hidden;
  $('helpToggle').textContent = p.hidden ? '? How it works' : '▲ Close';
});

// BPM
bpmSlider.addEventListener('input', () => { S.bpm = +bpmSlider.value; bpmDisplay.value = S.bpm; });
bpmSlider.addEventListener('change', () => setBpm(+bpmSlider.value));
bpmDisplay.addEventListener('change', () => { setBpm(+bpmDisplay.value || S.bpm); bpmDisplay.value = S.bpm; });
bpmDisplay.addEventListener('keydown', e => { if (e.key === 'Enter') bpmDisplay.blur(); });
$('bpmDn').addEventListener('click', () => setBpm(S.bpm - 5));
$('bpmUp').addEventListener('click', () => setBpm(S.bpm + 5));

// Mode toggle
$('modeManual').addEventListener('click', () => {
  S.autoMode = false;
  $('modeManual').classList.add('active'); $('modeAuto').classList.remove('active');
  manualSection.hidden = false; autoSection.hidden = true;
  $('stopBarsWrap').hidden = false; $('stopRoundsWrap').hidden = true; vanishUI();
});
$('modeAuto').addEventListener('click', () => {
  S.autoMode = true;
  $('modeAuto').classList.add('active'); $('modeManual').classList.remove('active');
  manualSection.hidden = true; autoSection.hidden = false;
  $('stopBarsWrap').hidden = true; $('stopRoundsWrap').hidden = false; vanishUI();
});

// Manual subdivision picker
document.querySelectorAll('#stepPick input').forEach(cb => cb.addEventListener('change', () => {
  buildPyramidSeq();
  if (S.running && S.autoMode) return; // takes effect on the next run
  if (S.autoMode) { S.pyramidStepIdx = 0; updatePyramidUI(); }
}));
$('subdivRow').querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $('subdivRow').querySelectorAll('.step-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (S.running && (S.autoMode || S.inCountIn)) return; // takes effect on the next run
    S.subdivisions = +btn.dataset.divs;
    buildBeatDots();
    if (S.running) restartGridNow();
  });
});

// Auto pyramid settings
$('barsPerStep').addEventListener('change', e => { S.barsPerStep = +e.target.value; });
function progUI() {
  const m = $('progMode').value;
  $('roundCiRow').hidden = m === 'repeat';
  $('progEveryWrap').hidden = (m === 'repeat');
  $('progRandRow').hidden = m !== 'random';
}
$('progMode').addEventListener('change', progUI);

// Input device
deviceSel.addEventListener('change', () => {
  if (noInput()) {
    if (S.micPreviewOn) resetMicToggle();
    releaseMic();
    micToggle.disabled = true;
    if (!S.running) statusMsg.textContent = 'Metronome only — nothing is recorded. Choose a microphone to record your playing.';
    return;
  }
  micToggle.disabled = false;
  if (S.micPreviewOn && !S.running) startMicPreview(deviceSel.value);
});
$('micRelease').addEventListener('click', () => {
  releaseMic();
  statusMsg.textContent = 'Microphone off.';
});
micToggle.addEventListener('click', () => {
  if (S.running) return;
  if (noInput()) { statusMsg.textContent = 'Choose a microphone first to test the input.'; return; }
  if (S.micPreviewOn) resetMicToggle();
  else startMicPreview(deviceSel.value);
});

// Click volume & mode
$('clickVol').addEventListener('input', e => {
  S.clickVolume = (+e.target.value) / 100;
  $('clickVolVal').textContent = e.target.value + '%';
  if (S.clickBus) S.clickBus.gain.value = S.clickVolume;
});
$('clickModeSel').addEventListener('change', e => { S.clickMode = e.target.value; vanishUI(); });
function vanishUI() { $('vanishRow').hidden = $('clickModeSel').value !== 'vanish'; $('vanishUnit').textContent = S.autoMode ? 'rounds' : 'bars'; }
$('vanishFrom').addEventListener('change', () => { buildVanishTo(); saveSettings(); });
$('outputSel').addEventListener('change', e => { S.outputId = e.target.value; if (S.audioCtx) applySink(S.audioCtx); $('outputNote').textContent = ''; try { localStorage.setItem('pyramidOutputLabel', e.target.selectedOptions[0].textContent); } catch (err) {} });

// Recording playback & view
playBtn.addEventListener('click', () => {
  if (S.pbRunning) { pausePlayback(); return; }
  startPlayback(S.pbPos);
});
$('analyzeBtn').addEventListener('click', () => { statusMsg.textContent = 'Analyzing…'; setTimeout(() => { analyzeTiming(); statusMsg.textContent = S.anaResult ? `Timing analyzed: score ${S.anaResult.score}` : 'Nothing to analyze'; }, 20); });
let anaTimer = null;
$('ignoreUnplayed').addEventListener('change', () => { if (S.anaResult) analyzeTiming(); });
$('anaSens').addEventListener('input', e => { $('anaSensVal').textContent = e.target.value; if (!S.anaResult) return; clearTimeout(anaTimer); anaTimer = setTimeout(analyzeTiming, 150); });
$('pbStart').addEventListener('click', () => seekTo(firstExerciseT()));
$('pbPrevBar').addEventListener('click', prevBar);
$('pbNextBar').addEventListener('click', nextBar);
waveCanvas.addEventListener('click', e => {
  if (!S.recBuffer) return;
  const rect = waveCanvas.getBoundingClientRect();
  const t = S.viewStart + (e.clientX - rect.left) / rect.width * S.viewLen;
  startPlayback(Math.max(0, t));
});
document.addEventListener('keydown', e => {
  if (recPanel.hidden || S.running) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
  if (e.key === ' ') { e.preventDefault(); S.pbRunning ? pausePlayback() : startPlayback(S.pbPos); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? prevBar() : seekTo(S.pbPos - 2); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? nextBar() : seekTo(S.pbPos + 2); }
});
const rw = () => renderWave(S.pbPos);
$('zoomIn').addEventListener('click', () => { setView(S.viewStart + S.viewLen * 0.25, S.viewLen / 2); rw(); });
$('gainUp').addEventListener('click', () => { S.waveGain = Math.min(32, S.waveGain * 2); $('gainLbl').textContent = '×' + S.waveGain; rw(); });
$('gainDown').addEventListener('click', () => { S.waveGain = Math.max(1, S.waveGain / 2); $('gainLbl').textContent = '×' + S.waveGain; rw(); });
$('zoomOut').addEventListener('click', () => { setView(S.viewStart - S.viewLen * 0.5, S.viewLen * 2); rw(); });
$('scrollBar').addEventListener('input', e => {
  const dur = S.recBuffer ? S.recBuffer.duration : 0;
  setView((+e.target.value / 1000) * Math.max(0, dur - S.viewLen), S.viewLen);
  rw();
});
window.addEventListener('resize', () => { if (S.recBuffer && !S.pbRunning) rw(); if (S.anaResult) { clearTimeout(anaTimer); anaTimer = setTimeout(renderAnaSummary, 150); } });

// Transport
startBtn.addEventListener('click', () => { S.running ? stop() : startAudio(); });

pauseBtn.addEventListener('click', () => {
  if (!S.running) return;
  if (!S.paused) {
    S.paused = true;
    if (S.animId) { cancelAnimationFrame(S.animId); S.animId = null; }
    if (S.mediaRecorder && S.mediaRecorder.state === 'recording') { try { S.mediaRecorder.pause(); } catch(e){} }
    S.pausedAt = S.audioCtx.currentTime;
    // Ticks already scheduled beyond this moment (lookahead) will not be recorded: silence them and forget them
    if (S.clickBus) S.clickBus.gain.setValueAtTime(0, S.pausedAt);
    S.beatLog = S.beatLog.filter(b => b.t + S.recPausedSec <= S.pausedAt);
    recIndicator.hidden = true;
    pauseBtn.textContent = '▶ Resume'; pauseBtn.classList.add('active');
    statusMsg.textContent = 'Paused';
  } else {
    S.paused = false;
    S.nextBeatTime = S.audioCtx.currentTime + 0.1;
    S.scheduledBeats = [];
    S.recPausedSec += S.audioCtx.currentTime - S.pausedAt;
    S.exercisePausedSec += S.audioCtx.currentTime - S.pausedAt;
    S.recSeg++;
    if (S.clickBus) S.clickBus.gain.setValueAtTime(S.clickVolume, S.audioCtx.currentTime);
    if (S.mediaRecorder && S.mediaRecorder.state === 'paused') { try { S.mediaRecorder.resume(); recIndicator.hidden = false; } catch(e){} }
    resetPauseBtn();
    statusMsg.textContent = 'Go! Play in time with the click.';
    startFrameLoop();
  }
});

resetBtn.addEventListener('click', clearRecording);
$('exportBtn').addEventListener('click', exportWav);
$('clickTestBtn').addEventListener('click', () => {
  if (S.running) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  applySink(ctx);
  const g = ctx.createGain(); g.gain.value = S.clickVolume; g.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05, q = 60 / S.bpm;
  for (let i = 0; i < 4; i++) synthClick(ctx, t0 + i * q, i === 0 ? 1800 : 1200, i === 0, g, $('clickSoundSel').value);
  setTimeout(() => ctx.close(), (4 * q + 0.3) * 1000);
});
$('csvBtn').addEventListener('click', downloadCsv);

// Settings memory: every control is remembered in this browser and restored on the next visit
const SETTINGS_KEY = 'pyramidSettings';
const settingIds = ['ignoreUnplayed', 'clickSoundSel', 'vanishFrom', 'dotsClickedOnly', 'csvToggle', 'vanishStay', 'vanishTo', 'countInSel', 'clickModeSel', 'recToggle', 'manualBars', 'maxRounds', 'maxMinutes', 'barsPerStep', 'progMode', 'progRounds', 'progMin', 'progMax', 'roundCountInSel', 'deviceSel', 'anaSens', 'pbClickSel', 'clickVol'];
function saveSettings() {
  const o = { bpm: S.bpm, autoMode: S.autoMode, subdiv: manualSubdiv(), steps: selectedSteps() };
  for (const id of settingIds) { const el = $(id); if (!el) continue; o[id] = el.type === 'checkbox' ? el.checked : el.value; }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) {}
}
function restoreSettings() {
  let o; try { o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
  if (!o) return;
  if (o.vanishFrom) $('vanishFrom').value = o.vanishFrom;
  buildVanishTo();
  for (const id of settingIds) {
    const el = $(id); if (!el || !(id in o) || id === 'deviceSel') continue;
    if (el.type === 'checkbox') el.checked = !!o[id];
    else { el.value = o[id]; if (el.tagName === 'SELECT' && el.value !== String(o[id])) el.selectedIndex = 0; }
  }
  if (o.bpm) setBpm(o.bpm, true);
  if (o.subdiv) { $('subdivRow').querySelectorAll('.step-btn').forEach(b => b.classList.toggle('active', +b.dataset.divs === o.subdiv)); S.subdivisions = o.subdiv; }
  if (Array.isArray(o.steps) && o.steps.length) document.querySelectorAll('#stepPick input').forEach(cb => { cb.checked = o.steps.includes(+cb.dataset.divs); });
  if (o.autoMode) $('modeAuto').click();
  if ($('anaSensVal')) $('anaSensVal').textContent = $('anaSens').value;
  $('clickVol').dispatchEvent(new Event('input')); // applies the remembered click volume
}
buildVanishTo();
restoreSettings();
S.clickMode = $('clickModeSel').value;
vanishUI();
buildBeatDots();
buildPyramidSeq();
progUI();
renderTakes();
updateCsvBtn();
document.querySelectorAll('input, select').forEach(el => { if (el.id && el.id !== 'bpmDisplay') el.addEventListener('change', saveSettings); });
bpmSlider.addEventListener('change', saveSettings);
bpmDisplay.addEventListener('change', saveSettings);
$('modeManual').addEventListener('click', saveSettings);
$('modeAuto').addEventListener('click', saveSettings);
$('subdivRow').querySelectorAll('.step-btn').forEach(b => b.addEventListener('click', saveSettings));
$('versionLbl').textContent = `Pyramid Trainer v${VERSION}`;

// Handle for the tests and the browser console
window.app = { S, finalizeRecording, analyzeTiming, alignByRecordedClicks, $, recPanel, setTransportEnabled, setView, renderWave, resetBtn, recIndicator, playClick, synthClick, logCsv, statusMsg, waveCanvas, pollSessionLevel, manualSubdiv, countdownOverlay, playbackTone, beatTrack };
