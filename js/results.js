// Runs the timing analysis on the current recording and shows the result.
import { S } from './state.js';
import { SUB_WORD, POS_WORD } from './state.js';
import { $ } from './dom.js';
import { computeOnsetFunction } from './core/onset.js';
import { POS_ORDER, POS_SHORT } from './core/findings.js';
import { analyzeTake } from './core/timing.js';
import { showPos } from './playback.js';
import { saveTake, logCsv, renderTakes } from './history.js';

// Analyze the current recording with the settings on the page, store the take and show the result
export function analyzeTiming() {
  if (!S.recBuffer || !S.recBeats.length) return;
  const data = S.recBuffer.getChannelData(0), sr = S.recBuffer.sampleRate;
  S.recOdf = S.recOdf || computeOnsetFunction(data, sr);
  const grid = S.recShift ? S.recBeats.map(b => ({ ...b, t: b.t + S.recShift })) : S.recBeats;
  S.anaResult = analyzeTake(data, sr, S.recOdf, grid, { minRel: (+$('anaSens').value || 10) / 100, restMode: $('ignoreUnplayed').checked, bpm: S.bpm });
  if (S.anaResult.total) { saveTake(S.anaResult); if ($('csvToggle').checked) logCsv(S.anaResult); }
  renderAnaSummary();
  showPos(S.pbPos);
}

// ── Drift chart: every note in time order, deviation on y, subdivision strip on top ──
let driftHl = null; // highlighted position key, or null
// Drift chart: deviation (ms) per beat in time order, subdivision segments on top, bars below.
function renderDriftChart(exAll, W, hl = null, view = null) {
  const H = 244, padL = 44, padR = 12, padT = 32, padB = 36;
  // Running median over the whole take (window of 9 notes), then the visible window is cut out
  const medAll = exAll.map((r, i) => { const w = []; for (let j = Math.max(0, i - 4); j <= Math.min(exAll.length - 1, i + 4); j++) if (exAll[j].dev !== null) w.push(exAll[j].dev); if (w.length < 3) return null; w.sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; });
  const v0 = view ? view.start : 0, v1 = view ? Math.min(exAll.length, view.start + view.len) : exAll.length;
  const ex = exAll.slice(v0, v1), med = medAll.slice(v0, v1);
  const n = ex.length; if (!n) return '';
  const devs = ex.filter(r => r.dev !== null).map(r => Math.abs(r.dev));
  const maxZone = Math.max(...ex.map(r => r.zone));
  const yMax = Math.max(maxZone * 1.5, Math.min(150, Math.max(...devs, 40) * 1.15));
  const x = i => padL + (i + 0.5) * (W - padL - padR) / n;
  const y = v => padT + (H - padT - padB) * (1 - (v + yMax) / (2 * yMax));
  const clamp = v => Math.max(-yMax, Math.min(yMax, v));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif" font-size="11">`;
  // zone bands (step with the interval): amber zone light grey, tight zone light green
  const band = (key, fill) => { let d = ''; for (let i = 0; i < n; i++) { const x0 = padL + i * (W - padL - padR) / n, w = (W - padL - padR) / n; d += `M${x0},${y(ex[i][key])}h${w}v${y(-ex[i][key]) - y(ex[i][key])}h${-w}z`; } s += `<path d="${d}" fill="${fill}"/>`; };
  band('zone', '#e8e9ee'); band('tight', '#dcefe2');
  // subdivision segments on top
  let segStart = 0;
  const subName = { 1: 'quarters', 2: 'eighths', 3: 'triplets', 4: 'sixteenths' };
  for (let i = 1; i <= n; i++) {
    if (i === n || ex[i].sub !== ex[segStart].sub || ex[i].bpm !== ex[segStart].bpm) {
      const x0 = padL + segStart * (W - padL - padR) / n, x1 = padL + i * (W - padL - padR) / n;
      s += `<rect x="${x0}" y="${padT - 22}" width="${x1 - x0}" height="19" fill="${['#f0f1f5', '#e4e6ec'][(ex[segStart].sub) % 2]}"/>`;
      const w = x1 - x0, sym = { 1: '♩', 2: '♪', 3: '♪₃', 4: '♬' }[ex[segStart].sub], bp = ex[segStart].bpm;
      const lbl = w > 58 ? `${sym} ${bp}` : w > 16 ? sym : '';
      if (lbl) s += `<text x="${(x0 + x1) / 2}" y="${padT - 6}" text-anchor="middle" fill="#333" font-weight="600" font-size="15">${lbl}</text>`;
      if (i < n) s += `<line x1="${x1}" x2="${x1}" y1="${padT - 22}" y2="${H - padB}" stroke="#9aa0ad" stroke-width="1"/>`;
      segStart = i;
    }
  }
  // y grid + axis
  for (const v of [-yMax, -yMax / 2, 0, yMax / 2, yMax]) {
    const yy = y(v); const major = v === 0;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="${major ? '#222' : '#cfd2da'}" stroke-width="${major ? 1.5 : 1}"/>`;
    s += `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" fill="#555">${v > 0 ? '+' : ''}${Math.round(v)}</text>`;
  }
  s += `<text x="10" y="${(padT + H - padB) / 2}" transform="rotate(-90 10 ${(padT + H - padB) / 2})" text-anchor="middle" fill="#555">ms (+ late, − early)</text>`;
  // bar numbers along the bottom
  const nBars = ex.filter(r => r.bar).length, barPx = (W - padL - padR) / Math.max(1, nBars), every = barPx >= 34 ? 1 : barPx >= 18 ? 2 : 4; // label every bar when there is room
  for (let i = 0; i < n; i++) if (ex[i].bar) { const bar = ex[i].barNo; const xx = padL + i * (W - padL - padR) / n; s += `<line x1="${xx}" x2="${xx}" y1="${H - padB}" y2="${H - padB + 5}" stroke="#555"/>`; if (bar % every === 1 || every === 1) s += `<text x="${xx + 3}" y="${H - padB + 15}" fill="#555">${bar}</text>`; }
  s += `<text x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle" fill="#555">bar →</text>`;
  // running median (drift line), window 9
  const pts = [];
  for (let i = 0; i < n; i++) if (med[i] !== null) pts.push([x(i), y(clamp(med[i]))]);
  if (pts.length > 1) s += `<path d="M${pts.map(p => p.join(',')).join('L')}" fill="none" stroke="#222" stroke-width="2" stroke-linejoin="round"/>`;
  // dots
  for (let i = 0; i < n; i++) {
    const r = ex[i];
    if (r.dev === null) { s += `<circle cx="${x(i)}" cy="${y(-yMax) - 4}" r="3.5" fill="none" stroke="#c03030" stroke-width="1.5" opacity="${hl && !hl.split('|').includes(r.pos === 0 ? (r.qn === 0 ? 'down' : 'b234') : r.sub + ':' + r.pos) ? 0.18 : 1}"><title>bar ${r.barNo}, beat ${r.qn + 1}${r.pos ? ', ' + POS_WORD[r.sub][r.pos] : ''}: not played or not heard</title></circle>`; continue; }
    const col = Math.abs(r.dev) <= r.tight ? '#1e9950' : Math.abs(r.dev) <= r.zone ? '#c07818' : '#c03030';
    const yy = y(clamp(r.dev)), cx = x(i);
    const key = r.pos === 0 ? (r.qn === 0 ? 'down' : 'b234') : `${r.sub}:${r.pos}`;
    const dim = hl && !hl.split('|').includes(key); const op = dim ? 0.18 : 1;
    // shape = position: ◆ downbeat, ● beats 2-4, ■ the "+", ▲ e / trip (first syllable after the beat), ▼ a / let (last)
    const tip = `<title>bar ${r.barNo}, beat ${r.qn + 1}${r.pos ? ', ' + POS_WORD[r.sub][r.pos] : ''} (${SUB_WORD[r.sub]}s): ${r.dev > 0 ? '+' : ''}${r.dev} ms</title>`;
    const st = `fill="${col}" stroke="#fff" stroke-width="1" opacity="${op}"`;
    if (key === 'down') s += `<path d="M${cx},${yy - 5.5}l5.5,5.5l-5.5,5.5l-5.5,-5.5z" ${st}>${tip}</path>`;
    else if (key === 'b234') s += `<circle cx="${cx}" cy="${yy}" r="3.8" ${st}>${tip}</circle>`;
    else if (key === '2:1' || key === '4:2') s += `<rect x="${cx - 3.5}" y="${yy - 3.5}" width="7" height="7" ${st}>${tip}</rect>`;
    else if (key === '4:1' || key === '3:1') s += `<path d="M${cx},${yy - 4.5}l4.5,8h-9z" ${st}>${tip}</path>`;
    else s += `<path d="M${cx},${yy + 4.5}l4.5,-8h-9z" ${st}>${tip}</path>`;
    if (Math.abs(r.dev) > yMax) s += `<path d="M${x(i) - 3},${yy + (r.dev > 0 ? 6 : -6)}l3,${r.dev > 0 ? -5 : 5}l3,${r.dev > 0 ? 5 : -5}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
  }
  return s + '</svg>';
}

const DRIFT_CHIPS = [['all', null], ['1', 'down'], ['2 3 4', 'b234'], ['+', '2:1|4:2'], ['e', '4:1'], ['a', '4:3'], ['trip', '3:1'], ['let', '3:2']];
function driftHtml(a) {
  const ex = a.beats.filter(r => !r.ci && !r.skipped && !r.rest);
  if (ex.length < 4) return '';
  let bar = 0; ex.forEach(r => { if (r.bar) bar++; r.barNo = bar; });
  const host = $('anaSummary'); const W = Math.max(320, (host.hidden ? host.parentElement.clientWidth - 34 : host.clientWidth) - 24);
  const chips = DRIFT_CHIPS.map(([lbl, key]) => `<button class="chip${(driftHl || null) === key ? ' on' : ''}" data-key="${key || ''}">${lbl}</button>`).join('');
  if (S.driftView && S.driftView.len >= ex.length) S.driftView = null;
  if (S.driftView) S.driftView.start = Math.max(0, Math.min(ex.length - S.driftView.len, S.driftView.start));
  const vLen = S.driftView ? S.driftView.len : ex.length, vStart = S.driftView ? S.driftView.start : 0;
  const zoom = `<span class="zoomctl">Zoom <button class="chip" id="driftZoomOut" ${S.driftView ? '' : 'disabled'}>−</button><button class="chip" id="driftZoomIn" ${vLen > 8 ? '' : 'disabled'}>+</button>
    <input type="range" id="driftScroll" min="0" max="${Math.max(0, ex.length - vLen)}" value="${vStart}" ${S.driftView ? '' : 'disabled'} style="width:140px;vertical-align:middle">
    <span>${S.driftView ? `notes ${vStart + 1}–${vStart + vLen} of ${ex.length}` : `all ${ex.length} notes`}</span></span>`;
  return `<div class="ana-tile wide drift"><div class="chips">Highlight: ${chips}${zoom}</div>${renderDriftChart(ex, W, driftHl, S.driftView)}<div class="drift-key">Each mark is one note, left to right in time; 0 = exactly on the grid, above = late, below = early. Shapes = position: ◆ downbeat · ● beats 2, 3, 4 · ■ the "+" · ▲ e / trip · ▼ a / let. Color = timing band; hollow red at the bottom = not played or not heard. Black line = running median of 9 notes, i.e. the drift; a perfect take is a flat line on 0. Hover a mark for its bar, beat and deviation.</div></div>`;
}

export function renderAnaSummary() {
  const el = $('anaSummary'); const a = S.anaResult;
  if (!a) { el.hidden = true; el.innerHTML = ''; renderTakes(); return; }
  const subName = { 1: 'quarters', 2: 'eighths', 3: 'triplets', 4: 'sixteenths' };
  const lean = a.hits ? (Math.abs(a.mean) < 1 ? 'on the beat' : `${Math.abs(a.mean).toFixed(0)} ms ${a.mean > 0 ? 'late' : 'early'}`) : '—';
  const subs = Object.keys(a.bySub).sort().map(k => { const s = a.bySub[k]; const m = s.devs.length ? s.devs.reduce((x, y) => x + y, 0) / s.devs.length : 0; return `<b>${subName[k]}</b> ${Math.round(100 * s.z / s.n)}% in zone${s.miss ? `, ${s.miss} missed` : ''}${s.devs.length ? `, lean ${m >= 0 ? '+' : ''}${m.toFixed(0)} ms` : ''}`; }).join(' · ');
  const posRows = POS_ORDER.filter(k => a.byPos && a.byPos[k] && a.byPos[k].n >= 2).map(k => { const o = a.byPos[k]; const r = Math.round(100 * o.z / o.n); const cls = r >= 80 ? 'good' : r < 60 ? 'bad' : ''; return `<tr class="${cls}"><td>${POS_SHORT[k]}</td><td>${o.n}</td><td>${r}%</td><td>${o.devs.length ? (o.mean >= 0 ? '+' : '−') + Math.round(Math.abs(o.mean)) + ' ms' : '—'}</td><td>${o.devs.length > 1 ? '±' + Math.round(o.sd) + ' ms' : '—'}</td><td>${o.miss || ''}</td></tr>`; }).join('');
  const posTable = posRows ? `<table class="takes pos"><thead><tr><th>Position</th><th>Notes</th><th>In zone</th><th>Lean</th><th>Spread</th><th>Missed</th></tr></thead><tbody>${posRows}</tbody></table>` : '';
  el.innerHTML = `
    <div class="ana-tile"><div class="sl">Score</div><div class="sv">${a.score}<small>/100${a.total < 16 ? ' · short take' : ''}</small></div></div>
    <div class="ana-tile"><div class="sl">Points</div><div class="sv">${a.points}<small> · difficulty ×${a.difficulty.toFixed(2)}</small></div></div>
    <div class="ana-tile"><div class="sl">In zone (±${a.zoneLo}${a.zoneHi !== a.zoneLo ? '–' + a.zoneHi : ''} ms)</div><div class="sv">${a.inZone}<small>/${a.total}</small></div></div>
    <div class="ana-tile"><div class="sl">Missed</div><div class="sv">${a.total - a.hits}</div></div>
    <div class="ana-tile"><div class="sl">Lean</div><div class="sv" style="font-size:0.9rem">${lean}</div></div>
    <div class="ana-tile"><div class="sl">Consistency</div><div class="sv">±${a.sd.toFixed(0)}<small> ms</small></div></div>
    <div class="ana-tile"><div class="sl">Trend</div><div class="sv" style="font-size:0.9rem">${a.trend ? (a.trend.delta >= 0.15 ? '↑ improving' : a.trend.delta <= -0.15 ? '↓ declining' : '→ steady') : '—'}</div></div>
    ${driftHtml(a)}
    <div class="ana-tile wide"><ul class="findings">${(a.findings || []).map(f => `<li class="${f.kind}">${f.text}</li>`).join('')}</ul>${posTable}${subs || 'No exercise beats in this recording.'}<br>Bands scale with the interval between notes (research on timing perception: a displaced note becomes audible at ~2.5% of the interval, ensemble notes up to 30–50 ms apart still sound together). Green = within max(15 ms, 3%) of the beat (capped at 25 ms): inaudible. Amber = within max(35 ms, 7%) (capped at 60 ms): a careful listener feels it, but it holds together. Red beyond. In this take: green ≤ ${a.tightLo}${a.tightHi !== a.tightLo ? '–' + a.tightHi : ''} ms, amber ≤ ${a.zoneLo}${a.zoneHi !== a.zoneLo ? '–' + a.zoneHi : ''} ms depending on the note value; a red ring = no attack found near that beat (a grey ring = treated as a rest); beats after your last note (while you reached for Stop) are not counted. Zoom in (Time +) to see each deviation in ms. Score = share of beats in zone (missed beats count 0): pure accuracy, comparable across takes. Points = Score × difficulty, where difficulty = ×${a.noteDiff.toFixed(2)} for the intervals you had to hit (easiest at 250–700 ms between notes; faster is a motor challenge, slower lets the pulse drift) × ${a.lenFactor.toFixed(2)} for the length of the take (${a.total} notes; 16 = ×1.00, each doubling +0.15). Fewer than 16 notes is marked a short take: a high score there can be luck.</div>`;
  el.hidden = false;
  el.querySelectorAll('.drift .chip[data-key]').forEach(b => b.addEventListener('click', () => { driftHl = b.dataset.key || null; renderAnaSummary(); }));
  const exN = a.beats.filter(r => !r.ci && !r.skipped && !r.rest).length;
  const zi = $('driftZoomIn'), zo = $('driftZoomOut'), sc = $('driftScroll');
  if (zi) zi.addEventListener('click', () => { const len = S.driftView ? S.driftView.len : exN; const nl = Math.max(8, Math.round(len / 2)); const mid = (S.driftView ? S.driftView.start : 0) + len / 2; S.driftView = { start: Math.round(mid - nl / 2), len: nl }; renderAnaSummary(); });
  if (zo) zo.addEventListener('click', () => { if (!S.driftView) return; const nl = S.driftView.len * 2; if (nl >= exN) S.driftView = null; else { const mid = S.driftView.start + S.driftView.len / 2; S.driftView = { start: Math.round(mid - nl / 2), len: nl }; } renderAnaSummary(); });
  if (sc) sc.addEventListener('input', e => { if (S.driftView) { S.driftView.start = +e.target.value; const svg = el.querySelector('.drift svg'); if (svg) svg.outerHTML = renderDriftChart(a.beats.filter(r => !r.ci && !r.skipped && !r.rest), svg.width.baseVal.value, driftHl, S.driftView); const lbl = sc.nextElementSibling; if (lbl) lbl.textContent = `notes ${S.driftView.start + 1}–${S.driftView.start + S.driftView.len} of ${exN}`; } });
  renderTakes();
}
