// Microphone stream, input and output devices, and the mic test.
import { S } from './state.js';
import { $, deviceSel, statusMsg, micToggle } from './dom.js';
import { updateSigMeter } from './audio.js';

// Mic stream & devices
let devicesEnumerated = false;
// One mic stream per device, kept open for the life of the page: the browser
// asks permission once instead of on every Start/Test.
let micStream = null, micStreamDevice = null;
// Mic test (level meter only)
let previewCtx = null, previewAnalyser = null, previewAnimId = null;
const previewTdData = new Uint8Array(1024);

export async function getMicStream(deviceId) {
  if (micStream && micStreamDevice === deviceId && micStream.getTracks().every(t => t.readyState === 'live')) return micStream;
  releaseMic();
  micStream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
  micStreamDevice = deviceId;
  micStream.getTracks().forEach(t => { t.onended = () => { if (micStream && micStream.getTracks().includes(t)) releaseMic(); }; });
  updateMicReleaseBtn();
  return micStream;
}
export function releaseMic() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null; micStreamDevice = null;
  updateMicReleaseBtn();
}
// Show "mic off" whenever the mic is held open but nothing is using it
export function updateMicReleaseBtn() {
  $('micRelease').hidden = !(micStream && !S.running && !S.micPreviewOn);
}

function micConstraints(deviceId) {
  return { audio: { deviceId: deviceId ? {exact: deviceId} : undefined,
                    echoCancellation:false, noiseSuppression:false, autoGainControl:false } };
}

export function micErrorMsg(e) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return 'Microphone API unavailable here (page must be HTTPS and allowed to use the mic). Open the artifact in its own tab, or pick "No input" to use the metronome only.';
  switch (e && e.name) {
    case 'NotAllowedError': case 'SecurityError': case 'PermissionDeniedError':
      return 'Mic blocked — allow the microphone for this page (lock/camera icon in the address bar), or pick "No input" to use the metronome only.';
    case 'NotFoundError': case 'DevicesNotFoundError':
      return 'No microphone found — pick "No input" to use the metronome only.';
    case 'OverconstrainedError':
      return 'That input is not available — try "Default microphone".';
    case 'NotReadableError': case 'TrackStartError':
      return 'Microphone is in use by another app.';
    default:
      return 'Mic error: ' + ((e && (e.name + ' ' + e.message)) || 'unknown');
  }
}

// Output device (click + playback). Chrome/Edge support choosing it (AudioContext.setSinkId); others play on the default.
function populateOutputs(outs) {
  const sel = $('outputSel');
  if (!('setSinkId' in AudioContext.prototype)) { $('outputRow').hidden = true; return; }
  const current = sel.value;
  sel.innerHTML = '<option value="">System default</option>';
  outs.forEach((d, i) => { if (d.deviceId === 'default') return; const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || 'Output ' + (i + 1); sel.appendChild(o); });
  sel.value = [...sel.options].some(o => o.value === current) ? current : '';
  S.outputId = sel.value;
  if (!S.outputId) restoreOutput();
}
export async function applySink(ctx) {
  if (!ctx || !ctx.setSinkId || !S.outputId) return;
  try { await ctx.setSinkId(S.outputId); } catch (e) { $('outputNote').textContent = 'could not switch output: ' + (e.message || e.name); }
}
// Enumerate inputs after permission is granted; keeps the current selection
export async function populateDevices() {
  if (devicesEnumerated) return;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const devs = all.filter(d => d.kind === 'audioinput');
    populateOutputs(all.filter(d => d.kind === 'audiooutput'));
    if (!devs.length) return;
    const current = deviceSel.value;
    deviceSel.innerHTML = '';
    devs.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      let lbl = d.label;
      if (!lbl || lbl === 'Default') lbl = i === 0 ? 'Default microphone' : 'Microphone ' + (i + 1);
      opt.textContent = lbl;
      deviceSel.appendChild(opt);
    });
    const none = document.createElement('option');
    none.value = 'none'; none.textContent = 'No input (metronome only)';
    deviceSel.appendChild(none);
    deviceSel.value = current === 'none' ? 'none' : (devs.some(d => d.deviceId === current) ? current : devs[0].deviceId);
    if (micStream && micStreamDevice === current) micStreamDevice = deviceSel.value; // same mic, now with its real id
    devicesEnumerated = true;
  } catch(e) { /* keep defaults */ }
}

export function resetMicToggle() {
  stopMicPreview();
  micToggle.textContent = '🎙 Test';
  micToggle.style.borderColor = '';
  micToggle.style.color = '';
}

export async function startMicPreview(deviceId) {
  stopMicPreview();
  statusMsg.textContent = 'Requesting microphone…';
  try {
    const previewStream = await getMicStream(deviceId);
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    await previewCtx.resume();
    const src = previewCtx.createMediaStreamSource(previewStream);
    previewAnalyser = previewCtx.createAnalyser();
    previewAnalyser.fftSize = 1024; previewAnalyser.smoothingTimeConstant = 0.3;
    src.connect(previewAnalyser);
    S.micPreviewOn = true; updateMicReleaseBtn();
    micToggle.textContent = '🎙 Live';
    micToggle.style.borderColor = 'var(--green)';
    micToggle.style.color = 'var(--green)';
    statusMsg.textContent = 'Mic live — play something and watch the meter. Click Start when ready.';
    await populateDevices();
    runPreviewLoop();
  } catch(e) {
    stopMicPreview();
    statusMsg.textContent = micErrorMsg(e);
  }
}

function stopMicPreview() {
  S.micPreviewOn = false;
  if (previewAnimId) { clearInterval(previewAnimId); previewAnimId = null; }
  // the shared mic stream stays open (see getMicStream)
  if (previewCtx) { previewCtx.close().catch(()=>{}); previewCtx = null; }
  previewAnalyser = null;
  updateSigMeter(-100);
  updateMicReleaseBtn();
}

function runPreviewLoop() {
  if (previewAnimId) { clearInterval(previewAnimId); previewAnimId = null; }
  previewAnimId = setInterval(() => {
    if (!S.micPreviewOn || S.running || !previewAnalyser) { clearInterval(previewAnimId); previewAnimId = null; return; }
    previewAnalyser.getByteTimeDomainData(previewTdData);
    let sum = 0;
    for (let i = 0; i < previewTdData.length; i++) { const v=(previewTdData[i]-128)/128; sum+=v*v; }
    const rms = Math.sqrt(sum/previewTdData.length);
    updateSigMeter(rms > 0 ? 20*Math.log10(rms) : -100);
  }, 50);
}
// Device labels are only known after the mic is allowed: pick the remembered output by its name once they are
function restoreOutput() { try { const lbl = localStorage.getItem('pyramidOutputLabel'); if (!lbl) return; const o = [...$('outputSel').options].find(o => o.textContent === lbl); if (o) { $('outputSel').value = o.value; S.outputId = o.value; } } catch (e) {} }
