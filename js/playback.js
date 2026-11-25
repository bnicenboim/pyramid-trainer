// Waveform view and playback of the recording.
import { S } from './state.js';
import { $, waveCanvas, playBtn, statusMsg, cssVarColor, setPlayBtn } from './dom.js';
import { inTight, inZoneR } from './core/bands.js';
import { playTone } from './audio.js';
import { applySink } from './devices.js';
import { firstExerciseT, decodeBlob } from './recording.js';

let recAudioCtx = null, recSource = null, pbTimer = null;

// ── Waveform view (white sheet, black grid, dark guitar waveform) ──
function updateScrollBar() {
  const dur = S.recBuffer ? S.recBuffer.duration : 0;
  const sb = $('scrollBar');
  const maxStart = Math.max(0, dur - S.viewLen);
  sb.disabled = maxStart <= 0;
  sb.value = maxStart > 0 ? Math.round(S.viewStart / maxStart * 1000) : 0;
  $('viewLbl').textContent = dur ? `${S.viewStart.toFixed(1)}–${Math.min(dur, S.viewStart + S.viewLen).toFixed(1)} s of ${dur.toFixed(1)} s` : '';
}
export function setView(start, len) {
  const dur = S.recBuffer ? S.recBuffer.duration : 0;
  S.viewLen = Math.max(1, Math.min(len, Math.max(2, dur)));
  S.viewStart = Math.max(0, Math.min(start, Math.max(0, dur - S.viewLen)));
  updateScrollBar();
}

// Draws the visible window: grid, guitar waveform, and (if pos >= 0) the playback cursor.
export function renderWave(pos) {
  const buf = S.recBuffer; if (!buf) return;
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const ctx2 = waveCanvas.getContext('2d');
  const dpr = devicePixelRatio;
  const W = Math.max(1, Math.round(waveCanvas.offsetWidth * dpr));
  const H = Math.max(1, Math.round(waveCanvas.offsetHeight * dpr));
  if (waveCanvas.width !== W || waveCanvas.height !== H) { waveCanvas.width = W; waveCanvas.height = H; }
  ctx2.fillStyle = '#ffffff'; ctx2.fillRect(0, 0, W, H);
  const t0 = S.viewStart, t1 = S.viewStart + S.viewLen;
  const xOf = t => (t - t0) / S.viewLen * W;
  const mid = H * 0.55, amp = H * 0.42;

  // Guitar waveform: filled min/max envelope (smooth at any zoom), centre line underneath
  const s0 = Math.floor(t0 * sr), s1 = Math.min(data.length, Math.ceil(t1 * sr));
  const spp = (s1 - s0) / W;
  ctx2.fillStyle = '#e4e7ee'; ctx2.fillRect(0, Math.round(mid), W, 1);
  const top = [], bot = [];
  for (let x = 0; x < W; x++) {
    const a = Math.floor(s0 + x * spp), b = Math.min(s1, Math.floor(s0 + (x + 1) * spp));
    if (a >= s1) break;
    let lo = 1, hi = -1;
    for (let j = a; j < Math.max(b, a + 1); j++) { const v = data[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi < lo) { lo = hi = 0; }
    top.push(Math.max(0, mid - hi * amp * S.waveGain)); bot.push(Math.min(H, mid - lo * amp * S.waveGain));
  }
  if (top.length) {
    ctx2.beginPath();
    ctx2.moveTo(0, top[0]);
    for (let x = 1; x < top.length; x++) ctx2.lineTo(x, top[x]);
    for (let x = bot.length - 1; x >= 0; x--) ctx2.lineTo(x, Math.max(bot[x], top[x] + 1));
    ctx2.closePath();
    ctx2.fillStyle = '#9fb0d6'; ctx2.fill();
  }
  // Beat grid ON TOP of the waveform: bar lines thick black, quarters black, subdivisions dark red
  const subName = { 1: 'quarters', 2: 'eighths', 3: 'triplets', 4: 'sixteenths' };
  ctx2.font = `${11 * dpr}px Inter, sans-serif`; ctx2.textBaseline = 'top';
  // Count-in area shaded grey
  const firstEx = S.recBeats.find(b => !b.ci);
  if (firstEx && S.recBeats[0] && S.recBeats[0].ci) {
    const a = Math.max(0, xOf(S.recBeats[0].t + S.recShift)), bx = Math.min(W, xOf(firstEx.t + S.recShift));
    if (bx > 0 && a < W) { ctx2.fillStyle = '#eceef3'; ctx2.fillRect(a, 0, bx - a, H); }
  }
  let lastSub = null, barNo = 0, ciLabelled = false;
  S.recBeats.forEach(b => {
    const t = b.t + S.recShift;
    if (b.bar && !b.ci) barNo++;
    const changed = !b.ci && b.sub !== lastSub; if (!b.ci) lastSub = b.sub;
    if (t < t0 - 0.01 || t > t1 + 0.01) return;
    const x = Math.round(xOf(t));
    // integer widths at integer positions: crisp lines, no anti-aliased smear
    const px = Math.max(1, Math.round(dpr));
    // Solid line = a click actually sounded there; dashed = placed from the schedule (no click)
    const dashed = (x0, y0, w, h) => { const d = Math.round(5 * dpr); for (let y = y0; y < h; y += 2 * d) ctx2.fillRect(x0, y, w, Math.min(d, h - y)); };
    ctx2.fillStyle = b.ci ? '#9aa0ad' : '#222';
    if (b.bar) { if (b.clicked) ctx2.fillRect(x - px, 0, 3 * px, H); else dashed(x - px, 0, 3 * px, H); }
    else if (b.q) { if (b.clicked) ctx2.fillRect(x, 0, px, H); else dashed(x, 0, px, H); }
    else { ctx2.fillStyle = b.ci ? '#c5c9d3' : '#555'; if (b.clicked) ctx2.fillRect(x, Math.round(H * 0.12), px, H); else dashed(x, Math.round(H * 0.12), px, H); }
    if (b.ci && !ciLabelled) { ciLabelled = true; ctx2.fillStyle = '#6a7082'; ctx2.fillText('count-in', x + 3 * dpr, 2 * dpr); }
    if (!b.ci && b.q) { ctx2.fillStyle = '#000'; ctx2.fillText(b.bar ? String(barNo) : '', x + 3 * dpr, 2 * dpr); }
    if (changed) {
      const label = subName[b.sub] || ('×' + b.sub);
      ctx2.font = `600 ${11 * dpr}px Inter, sans-serif`;
      const tw = ctx2.measureText(label).width;
      ctx2.fillStyle = 'rgba(255,255,255,0.85)'; ctx2.fillRect(x + 2 * dpr, 14 * dpr, tw + 4 * dpr, 13 * dpr); // keep the label legible over the grid
      ctx2.fillStyle = '#000'; ctx2.fillText(label, x + 4 * dpr, 15 * dpr);
      ctx2.font = `${11 * dpr}px Inter, sans-serif`;
    }
  });

  // Timing analysis markers: a coloured flag at each found attack, a hollow red ring for a missed beat
  if (S.anaResult) {
    const px = Math.max(1, Math.round(dpr));
    S.anaResult.beats.forEach(r => {
      if (r.ci || r.skipped) return;
      const tb = r.beatT;
      if (r.dev === null) {
        if (tb < t0 || tb > t1) return;
        const x = Math.round(xOf(tb));
        ctx2.strokeStyle = r.rest ? '#9aa0ad' : '#d03030'; ctx2.lineWidth = px; ctx2.beginPath(); ctx2.arc(x, H - 22 * dpr, 4 * dpr, 0, 2 * Math.PI); ctx2.stroke();
      } else {
        const ta = r.onsetT;
        if (ta < t0 || ta > t1) return;
        const x = Math.round(xOf(ta));
        const col = inTight(r) ? '#1e9950' : inZoneR(r) ? '#c07818' : '#d03030';
        ctx2.fillStyle = col; ctx2.fillRect(x - px, Math.round(H * 0.06), 2 * px, Math.round(H * 0.88));
        ctx2.beginPath(); ctx2.moveTo(x - px, Math.round(H * 0.06)); ctx2.lineTo(x + 6 * dpr, Math.round(H * 0.06) + 4 * dpr); ctx2.lineTo(x - px, Math.round(H * 0.06) + 8 * dpr); ctx2.closePath(); ctx2.fill();
        if (S.viewLen <= 4) { ctx2.font = `${10 * dpr}px IBM Plex Mono, monospace`; ctx2.fillText((r.dev >= 0 ? '+' : '') + r.dev, x + 7 * dpr, Math.round(H * 0.06) + 10 * dpr); ctx2.font = `${11 * dpr}px Inter, sans-serif`; }
      }
    });
  }
  // Time axis along the bottom (seconds into the recording)
  {
    const nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
    const step = nice.find(v => S.viewLen / v <= 10) || 120;
    const ah = Math.round(14 * dpr);
    ctx2.fillStyle = 'rgba(255,255,255,0.8)'; ctx2.fillRect(0, H - ah, W, ah);
    ctx2.fillStyle = '#6a7082'; ctx2.font = `${9 * dpr}px IBM Plex Mono, monospace`; ctx2.textBaseline = 'bottom';
    const dec = step < 1 ? (step < 0.25 ? 2 : 1) : 0;
    for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-9; t += step) {
      const x = Math.round(xOf(t));
      ctx2.fillRect(x, H - ah, Math.max(1, Math.round(dpr)), Math.round(4 * dpr));
      ctx2.fillText(t.toFixed(dec) + ' s', x + 3 * dpr, H - 1);
    }
    ctx2.textBaseline = 'top'; ctx2.font = `${11 * dpr}px Inter, sans-serif`;
  }
  // Playback cursor
  if (pos >= 0 && pos >= t0 && pos <= t1) {
    ctx2.fillStyle = cssVarColor('--blue'); ctx2.fillRect(Math.round(xOf(pos)) - dpr, 0, 2.5 * dpr, H);
  }
}
// Redraw with the cursor at `pos` and update the position label
export function showPos(pos) { renderWave(pos); updatePosLbl(pos); }

// ── Playback: the recording, plus an optional click synthesized from the grid ──
export function startPlayback(fromSec = 0) {
  if (!S.recordedBlob) return;
  if (S.pbRunning) stopPlayback(true);
  S.pbRunning = true; S.pbPos = Math.max(0, fromSec);
  setPlayBtn(true);
  recAudioCtx = new AudioContext(); applySink(recAudioCtx);
  decodeBlob(S.recordedBlob, recAudioCtx).then(buf => {
    if (!S.pbRunning) return;
    recSource = recAudioCtx.createBufferSource();
    recSource.buffer = buf;
    const guitar = recAudioCtx.createGain();
    recSource.connect(guitar);
    guitar.connect(recAudioCtx.destination);
    const startAt = recAudioCtx.currentTime + 0.05;
    const from = Math.min(S.pbPos, buf.duration);
    recSource.start(startAt, from);
    recSource.onended = () => { S.pbPos = 0; stopPlayback(); };
    // Playback click: scheduled from the grid, ahead of time, in recording time → context time
    let pbClickIdx = 0; // next grid beat to schedule a click for
    while (pbClickIdx < S.recBeats.length && S.recBeats[pbClickIdx].t + S.recShift < from) pbClickIdx++;
    const tick = () => {
      if (!S.pbRunning || !recAudioCtx) return;
      const now = recAudioCtx.currentTime;
      const pos = from + Math.max(0, now - startAt);
      S.pbPos = pos;
      const mode = $('pbClickSel').value;
      while (pbClickIdx < S.recBeats.length) {
        const b = S.recBeats[pbClickIdx]; const tb = b.t + S.recShift;
        const when = startAt + (tb - from);
        if (when > now + 0.2) break;
        pbClickIdx++;
        if (mode === 'none' || b.ci || when < now) continue;
        const play = mode === 'all' || (mode === 'quarters' && b.q) || (mode === 'downbeat' && b.bar);
        if (play) playbackTone(when - (b.clicked ? S.recRuler : 0), b.q ? 1800 : 1200, (b.q ? 0.3 : 0.14) * S.clickVolume); // on clicked beats: coincide with the recorded click
      }
      if (pos > S.viewStart + S.viewLen || pos < S.viewStart) setView(pos - S.viewLen * 0.1, S.viewLen); // follow the cursor
      showPos(pos);
      pbTimer = setTimeout(tick, 40);
    };
    tick();
    statusMsg.textContent = 'Playing back…';
  }).catch(() => { stopPlayback(); });
}
export function playbackTone(when, freq, level) {
  playTone(recAudioCtx, when, freq, Math.max(0.001, level), 0.05, recAudioCtx.destination);
}

export function pausePlayback() {
  stopPlayback(true); // keeps pbPos
  setPlayBtn(false);
  showPos(S.pbPos);
  statusMsg.textContent = 'Paused';
}

export function stopPlayback(restarting) {
  S.pbRunning = false;
  clearTimeout(pbTimer);
  if (recSource) { recSource.onended = null; try { recSource.stop(); } catch(e){} recSource = null; }
  if (recAudioCtx) { recAudioCtx.close(); recAudioCtx = null; }
  if (restarting) return;
  showPos(S.pbPos);
  setPlayBtn(false);
  if (!S.running) statusMsg.textContent = 'Stopped';
}

// Seek helpers: jump to a position (keeps playing if it was playing)
export function seekTo(t) {
  const dur = S.recBuffer ? S.recBuffer.duration : 0;
  t = Math.max(0, Math.min(t, Math.max(0, dur - 0.01)));
  if (S.pbRunning) startPlayback(t);
  else { S.pbPos = t; if (t < S.viewStart || t > S.viewStart + S.viewLen) setView(t - S.viewLen * 0.1, S.viewLen); showPos(t); }
}
const barTimes = () => S.recBeats.filter(b => b.bar).map(b => b.t + S.recShift);
export function prevBar() { const bars = barTimes().filter(t => t < S.pbPos - 0.3); seekTo(bars.length ? bars[bars.length - 1] : 0); }
export function nextBar() { const bars = barTimes().filter(t => t > S.pbPos + 0.05); if (bars.length) seekTo(bars[0]); }
function updatePosLbl(t) {
  const firstT = firstExerciseT();
  const bars = barTimes().filter(bt => bt >= firstT - 0.001);
  let n = 0; for (const bt of bars) if (bt <= t + 0.001) n++;
  const where = !S.recBeats.length ? '' : t < firstT - 0.001 ? ' · count-in' : ` · bar ${Math.max(1, n)}`;
  $('pbPos').textContent = `${t.toFixed(1)} s${where}`;
}
export function setTransportEnabled(on) { ['pbStart','pbPrevBar','pbNextBar','analyzeBtn','exportBtn'].forEach(id => $(id).disabled = !on); playBtn.disabled = !on; }
