// Recording the microphone, placing the grid on the recording, and WAV export.
import { S } from './state.js';
import { $, recPanel, recIndicator, waveCanvas, pbDur, statusMsg, resetBtn, setPlayBtn } from './dom.js';
import { placeGrid } from './core/align.js';
import { setView, showPos, stopPlayback, setTransportEnabled } from './playback.js';
import { renderAnaSummary } from './results.js';

// Headphones only (mic hears no click): the grid is placed by this typical delay instead. A guess.
const FALLBACK_LATENCY_SEC = 0.06; // used only when the audio system reports nothing
// Best guess of click-to-mic delay when the mic cannot hear the click: what the audio system reports
// for its output path plus ~8 ms for the input buffer of an interface. Usually within ~10 ms of the truth.
const fallbackLatency = () => S.sysLatencySec !== null ? S.sysLatencySec : FALLBACK_LATENCY_SEC;
let firstBeatAudioTime = 0;

// The recording is the microphone, mono.
export function startRecording(firstBeatTime) {
  if (!S.stream || !S.recDest || !$('recToggle').checked) return;
  S.recChunks = []; S.beatLog = [];
  try {
    const rec = new MediaRecorder(S.recDest.stream);
    const chunks = S.recChunks;
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      if (rec !== S.mediaRecorder) return; // an older recorder that was discarded by "Clear recording"
      S.recordedBlob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      finalizeRecording();
    };
    S.mediaRecorder = rec;
    rec.start(100);
    S.recStartAudioTime = S.audioCtx.currentTime; S.recPausedSec = 0; S.recSeg = 0;
    firstBeatAudioTime = firstBeatTime != null ? firstBeatTime : S.nextBeatTime; // first click in the recording
    if (S.paused) { try { rec.pause(); } catch (e) {} S.pausedAt = S.recStartAudioTime; } // started by "Clear" during a pause
    recPanel.hidden = false;
    recIndicator.hidden = S.paused;
    resetBtn.disabled = false;
  } catch(e) { /* MediaRecorder unavailable */ }
}

export function stopRecording() {
  if (S.mediaRecorder && S.mediaRecorder.state !== 'inactive') S.mediaRecorder.stop();
  recIndicator.hidden = true;
}

// Discard what has been recorded so far in the running session and keep recording from now
function restartRecording() {
  if (!S.running || !S.mediaRecorder) return;
  const old = S.mediaRecorder; S.mediaRecorder = null;
  try { if (old.state !== 'inactive') old.stop(); } catch (e) {}
  startRecording(S.nextBeatTime);
}
// Time of the first exercise (non-count-in) tick in the recording
export const firstExerciseT = () => { const b = S.recBeats.find(b => !b.ci); return b ? b.t + S.recShift : 0; };

export function finalizeRecording() {
  const blob = S.recordedBlob;
  if (!blob) return;
  setTransportEnabled(true); resetBtn.disabled = false;
  const tmpCtx = new AudioContext();
  decodeBlob(blob, tmpCtx).then(buf => {
    tmpCtx.close();
    if (S.recordedBlob !== blob) return; // cleared or replaced while decoding
    S.recBuffer = buf;
    // Preferred: the mic heard the click from the speakers, so the recording itself
    // says where every click landed; the whole grid (silent subdivisions included)
    // is placed by matching those recorded clicks to the schedule. No calibration needed.
    const { grid, ruler, odf, al } = placeGrid(buf.getChannelData(0), buf.sampleRate, S.beatLog, S.recStartAudioTime, fallbackLatency());
    S.recBeats = grid; S.recRuler = ruler; S.recOdf = odf; S.recShift = 0;
    let gridSource;
    if (al) {
      gridSource = `✔ grid aligned to the click the mic recorded (${al.matched} of ${al.total} clicks found; the rest follow from the schedule). The click you hear on playback is the recorded one.`;
    } else {
      gridSource = S.sysLatencySec !== null
        ? `⚠ the mic did not hear the click (headphones, or a direct input such as an audio interface), so the grid was placed by the delay the audio system reports (${Math.round(S.sysLatencySec * 1000)} ms). That is usually within ~10 ms of the truth, so leans of a few ms are not meaningful; spreads, drift and position comparisons are unaffected. For an exact grid the input must hear the click.`
        : `⚠ the mic did not hear the click (headphones, or a direct input such as an audio interface), so the grid is a guess (${Math.round(FALLBACK_LATENCY_SEC * 1000)} ms typical delay) and can be off by tens of ms. For an exact grid the input must hear the click.`;
      statusMsg.textContent = (statusMsg.textContent || 'Stopped').replace(/[.!]\s*$/, '') + '. ⚠ The mic did not hear the click, so the grid is only a guess (see note under the waveform).';
    }
    const bars = S.recBeats.filter(b => b.bar && !b.ci).length;
    pbDur.textContent = `${buf.duration.toFixed(1)} s · ${bars} bar${bars === 1 ? '' : 's'}`;
    $('gridInfo').textContent = gridSource;
    S.viewLen = Math.min(8, Math.max(2, buf.duration));
    setView(firstExerciseT() - 0.3, S.viewLen);
    S.pbPos = firstExerciseT(); showPos(S.pbPos);
  }).catch(() => { tmpCtx.close(); });
}

// Read `blob` and decode it with `ctx`; resolves with the AudioBuffer
export function decodeBlob(blob, ctx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => ctx.decodeAudioData(e.target.result).then(resolve, reject);
    reader.readAsArrayBuffer(blob);
  });
}

// ── Export: the decoded recording as a 16-bit PCM WAV (mono) ──
function bufferToWav(buf) {
  const ch = buf.getChannelData(0), n = ch.length, sr = buf.sampleRate;
  const out = new ArrayBuffer(44 + n * 2), v = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2) { const s = Math.max(-1, Math.min(1, ch[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return out;
}
export async function exportWav() {
  if (!S.recBuffer) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const filename = `pyramid-${S.bpm}bpm-${stamp}.wav`;
  const wav = bufferToWav(S.recBuffer);
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  if (dl) {
    try { await dl.save({ filename, data: wav }); statusMsg.textContent = `Saved ${filename}`; }
    catch (e) { if (e && e.code !== 'declined') statusMsg.textContent = 'Could not save the WAV: ' + (e.message || e.code || e); }
    return;
  }
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Forget the finished recording. While a session is running, discard what was
// recorded so far and keep recording from this moment.
export function clearRecording() {
  stopPlayback(true);
  S.pbPos = 0;
  setPlayBtn(false);
  S.recordedBlob = null; S.recChunks = []; S.recBuffer = null; S.recBeats = []; S.beatLog = [];
  S.anaResult = null; S.recOdf = null; S.driftView = null; renderAnaSummary();
  setTransportEnabled(false);
  waveCanvas.width = 0; pbDur.textContent = ''; $('pbPos').textContent = ''; $('viewLbl').textContent = ''; $('gridInfo').textContent = '';
  if (S.running && S.mediaRecorder) {
    restartRecording(); // fails to restart only if "Record" was unticked meanwhile
    if (S.mediaRecorder) { statusMsg.textContent = 'Recording cleared — recording again from here.'; return; }
    recIndicator.hidden = true;
    statusMsg.textContent = 'Recording cleared.';
  }
  // Not recording: a recorder still finishing (onstop pending) must not bring the cleared recording back
  S.mediaRecorder = null;
  resetBtn.disabled = true;
  recPanel.hidden = true;
}
