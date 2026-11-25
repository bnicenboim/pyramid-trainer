// Starting and stopping a session.
import { S } from './state.js';
import { $, beatTrack, countdownOverlay, deviceSel, statusMsg, startBtn, pauseBtn, stepFill, manualSubdiv, noInput, resetPauseBtn } from './dom.js';
import { buildBeatDots, litDot, updatePyramidUI, renderBarsRow, updateSessionHead, updateHeadTime, updateCountdownDisplay } from './ui.js';
import { ciBg, pollClickHeard, pollSessionLevel, updateSigMeter } from './audio.js';
import { getMicStream, updateMicReleaseBtn, micErrorMsg, applySink, populateDevices, resetMicToggle } from './devices.js';
import { SCHED_MS, countInSubdiv, setBpm, scheduleTick, randomBpm } from './scheduler.js';
import { startRecording, stopRecording, clearRecording } from './recording.js';
import { snapshotTake } from './history.js';

let sourceNode = null;
let starting = false;
let schedLoopId = null;

// Animation loop: lights the dot of the tick that just sounded, advances the pyramid progress bar
export function startFrameLoop() {
  let lastDotT = 0;
  function frame() {
    if (!S.running || S.paused) return;
    const now = S.audioCtx?.currentTime;
    if (now) {
      const recent = S.scheduledBeats.filter(b => b.time <= now);
      if (recent.length > 0) {
        const last = recent[recent.length-1];
        if (last.time !== lastDotT) {
          if (last.clicked || !$('dotsClickedOnly').checked) litDot(last.idx, S.inCountIn ? 'countin' : 'lit');
          lastDotT = last.time;
          renderBarsRow(last); updateSessionHead(last);
          setTimeout(() => litDot(-1), 150);
        }
      }
    }
    if (S.autoMode && !S.inCountIn) updatePyramidUI();
    updateHeadTime();
    pollSessionLevel(); pollClickHeard();
    S.animId = requestAnimationFrame(frame);
  }
  S.animId = requestAnimationFrame(frame);
}

export async function startAudio() {
  if (S.running || starting) return false;
  starting = true; startBtn.disabled = true;
  try {
    resetMicToggle(); // hand off mic to main session
    clearRecording(); // a new session always replaces the previous recording
    const useMic = !noInput();
    statusMsg.textContent = useMic ? 'Requesting microphone…' : 'Starting metronome…';
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await S.audioCtx.resume();
    await applySink(S.audioCtx);
    S.clickBus = S.audioCtx.createGain(); S.clickBus.gain.value = S.clickVolume; S.clickBus.connect(S.audioCtx.destination);
    if (useMic) {
      S.stream = await getMicStream(deviceSel.value);
      await populateDevices(); // labels are available once permission is granted
      sourceNode = S.audioCtx.createMediaStreamSource(S.stream);
      S.sessionAnalyser = S.audioCtx.createAnalyser(); S.sessionAnalyser.fftSize = 2048; S.sessionAnalyser.smoothingTimeConstant = 0;
      S.sessionFd = new Float32Array(S.sessionAnalyser.frequencyBinCount);
      const out = (S.audioCtx.baseLatency || 0) + (S.audioCtx.outputLatency || 0);
      S.sysLatencySec = out > 0.002 ? out + 0.008 : null;
      $('outputNote').textContent = S.sysLatencySec !== null ? `reported delay ≈ ${Math.round(out * 1000)} ms` : '';
      S.ciClickHeard = false; S.ciHeardTimes = []; ciBg[2000] = ciBg[1400] = null;
      sourceNode.connect(S.sessionAnalyser);
      // Recording graph
      // Recording = the microphone only (mono). What you hear on playback is exactly what
      // the mic heard: your guitar, and the click if it came from speakers.
      S.recDest = S.audioCtx.createMediaStreamDestination();
      S.recDest.channelCount = 1; S.recDest.channelCountMode = 'explicit';
      const micMono = S.audioCtx.createGain(); micMono.channelCount = 1; micMono.channelCountMode = 'explicit';
      sourceNode.connect(micMono); micMono.connect(S.recDest);
    } else {
      S.stream = null; sourceNode = null; S.recDest = null;
    }

    // Init state
    S.running = true; S.sessionId++; S.beatIndex = 0; S.roundsDone = 0; S.exerciseStartT = null; S.exercisePausedSec = 0;
    S.takeInfo = snapshotTake();
    S.vanishStage = 0; S.exBarNo = 0; S.vanishStageStartBar = 0;
    S.pendingTransition = null; S.stopPending = false;
    S.nextBeatTime = S.audioCtx.currentTime + 0.15;
    S.scheduledBeats = [];
    S.mediaRecorder = null; S.recChunks = [];

    // Random tempo progression: the first round is drawn too (the tempo at the top is only the starting point otherwise)
    if (S.autoMode && $('progMode').value === 'random') setBpm(randomBpm(), true);
    // Count-in: always at least one bar — its clicks, recorded with no guitar yet, anchor the grid
    const countInBars = Math.max(1, +$('countInSel').value || 1);
    S.inCountIn = true; S.roundCountIn = false;
    S.countInBeatsLeft = S.countInBeatsTotal = countInBars * 4;
    S.subdivisions = countInSubdiv(); buildBeatDots(); // quarter notes, or the subdivisions when the metronome plays them
    startRecording(S.nextBeatTime);
    updateCountdownDisplay();
    statusMsg.textContent = `Count-in: ${countInBars} bar${countInBars>1?'s':''}…`;

    S.barsPerStep = +$('barsPerStep').value;
    S.clickMode = $('clickModeSel').value;
    startBtn.textContent = 'Stop'; startBtn.style.background = 'var(--red)';
    pauseBtn.disabled = false; resetPauseBtn();
    updateMicReleaseBtn();

    // Scheduler loop
    schedLoopId = setInterval(() => {
      if (!S.running || S.paused) return;
      scheduleTick();
      if (S.inCountIn) updateCountdownDisplay();
    }, SCHED_MS);

    starting = false; startBtn.disabled = false;
    startFrameLoop();
    return true;
  } catch(e) {
    const isMicErr = e && /NotAllowed|NotFound|Overconstrained|NotReadable|Security|Permission|TrackStart|DevicesNotFound/.test(e.name || '');
    statusMsg.textContent = isMicErr ? micErrorMsg(e) : 'Could not start: ' + (e && e.message || e);
    starting = false; startBtn.disabled = false;
    stop(true);
    return false;
  }
}

export function stop(keepMsg) {
  S.running = false; S.paused = false; S.inCountIn = false; S.roundCountIn = false;
  S.pendingTransition = null; S.stopPending = false;
  S.subdivisions = manualSubdiv(); buildBeatDots(); // back to the picker's setting
  if (S.autoMode) { S.pyramidStepIdx = 0; updatePyramidUI(); stepFill.style.width = '0%'; }
  if (S.animId) cancelAnimationFrame(S.animId);
  if (schedLoopId) { clearInterval(schedLoopId); schedLoopId = null; }
  const ctx = S.audioCtx; S.audioCtx = null; // mic stream itself stays open (see getMicStream)
  if (ctx) {
    const rec = S.mediaRecorder;
    if (rec && rec.state !== 'inactive') rec.addEventListener('stop', () => ctx.close(), { once: true }); // keep the tail
    else ctx.close();
  }
  stopRecording();
  S.sessionAnalyser = null;
  sourceNode = null; S.stream = null; S.scheduledBeats = [];
  S.clickBus = null; S.recDest = null;
  startBtn.textContent = 'Start'; startBtn.style.background = '';
  pauseBtn.disabled = true; resetPauseBtn();
  beatTrack.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('lit','countin'));
  countdownOverlay.classList.remove('show');
  $('roundLbl').textContent = ''; $('clickLbl').textContent = ''; $('sessionHead').innerHTML = ''; $('barsRow').innerHTML = '';
  updateSigMeter(-100);
  if (!keepMsg && !/complete/.test(statusMsg.textContent)) statusMsg.textContent = 'Stopped';
  updateMicReleaseBtn();
}
