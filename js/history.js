// Takes history and the CSV log, kept in this browser.
import { S } from './state.js';
import { SUB_WORD, POS_WORD } from './state.js';
import { $, statusMsg, manualSubdiv } from './dom.js';
import { inTight, inZoneR } from './core/bands.js';
import { VANISH_DEF } from './vanish.js';
import { selectedSteps } from './ui.js';

export function snapshotTake() {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const vanish = $('clickModeSel').value === 'vanish';
  return {
    date, time, take_id: date.replace(/-/g, '') + '-' + time.replace(/:/g, ''),
    mode: S.autoMode ? 'auto' : 'manual',
    subdivision_setting: S.autoMode ? '' : SUB_WORD[manualSubdiv()],
    steps: S.autoMode ? selectedSteps().join('') : '',
    bars_per_step: S.autoMode ? $('barsPerStep').value : '',
    count_in_bars: $('countInSel').value,
    click_mode: $('clickModeSel').value,
    vanish_from: vanish ? VANISH_DEF[$('vanishFrom').value].name : '', vanish_stay: vanish ? $('vanishStay').value : '', vanish_down_to: vanish ? (VANISH_DEF[$('vanishTo').value] || {}).name || '' : '',
    progression: S.autoMode ? $('progMode').value : '', progression_every: S.autoMode ? $('progRounds').value : '',
    round_count_in: S.autoMode && $('progMode').value !== 'repeat' ? $('roundCountInSel').value : '',
    stop_bars: S.autoMode ? '' : $('manualBars').value, stop_rounds: S.autoMode ? $('maxRounds').value : '', stop_minutes: $('maxMinutes').value,
    circles_click_only: $('dotsClickedOnly').checked ? 1 : 0,
  };
}

// ── Takes history (kept in this browser only) ──
const TAKES_KEY = 'pyramidTakes';
function loadTakes() { try { return JSON.parse(localStorage.getItem(TAKES_KEY) || '[]'); } catch (e) { return []; } }
export function saveTake(a) {
  const ex = a.beats.filter(r => !r.ci && !r.skipped && !r.rest);
  const bars = ex.filter(r => r.bar).length;
  const subs = [...new Set(ex.map(r => r.sub))].sort().join('');
  const take = { d: Date.now(), bpm: S.bpm, bars, subs, n: ex.length, score: a.score, points: a.points, diff: +a.difficulty.toFixed(2) };
  try { const takes = loadTakes(); takes.push(take); localStorage.setItem(TAKES_KEY, JSON.stringify(takes.slice(-200))); } catch (e) {}
}
// ── CSV log (one row per beat of every analyzed take; kept in this browser) ──
const CSV_KEY = 'pyramidCsvLog';
const CSV_COLS = ['date', 'time', 'take_id', 'mode', 'bpm', 'subdivision_setting', 'steps', 'bars_per_step', 'count_in_bars', 'click_mode', 'vanish_from', 'vanish_stay', 'vanish_down_to', 'progression', 'progression_every', 'round_count_in', 'stop_bars', 'stop_rounds', 'stop_minutes', 'circles_click_only', 'ignore_unplayed', 'attack_threshold_pct', 'round', 'bar', 'beat', 'subdivision', 'position', 'position_index', 'interval_ms', 'grid_time_s', 'onset_time_s', 'deviation_ms', 'band', 'in_zone', 'score', 'points', 'difficulty'];
function loadCsvLog() { try { return JSON.parse(localStorage.getItem(CSV_KEY) || '{}'); } catch (e) { return {}; } }
export function logCsv(a) {
  const info = S.takeInfo || snapshotTake();
  const ex = a.beats.filter(r => !r.ci && !r.skipped);
  let bar = 0;
  const rows = ex.map(r => {
    if (r.bar) bar++;
    const band = r.rest ? 'rest' : r.dev === null ? 'missed' : inTight(r) ? 'green' : inZoneR(r) ? 'amber' : 'red';
    return [info.date, info.time, info.take_id, info.mode, r.bpm, info.subdivision_setting, info.steps, info.bars_per_step, info.count_in_bars, info.click_mode, info.vanish_from, info.vanish_stay, info.vanish_down_to, info.progression, info.progression_every, info.round_count_in, info.stop_bars, info.stop_rounds, info.stop_minutes, info.circles_click_only, $('ignoreUnplayed').checked ? 1 : 0, $('anaSens').value,
      r.round + 1, bar, r.qn + 1, SUB_WORD[r.sub], POS_WORD[r.sub][r.pos], r.pos, Math.round(r.ioi * 1000), r.beatT.toFixed(3), r.onsetT !== null ? r.onsetT.toFixed(3) : '', r.dev !== null ? r.dev : '', band, r.rest ? '' : r.dev !== null && inZoneR(r) ? 1 : 0, a.score, a.points, a.difficulty.toFixed(2)];
  });
  try { const log = loadCsvLog(); log[info.take_id] = rows; localStorage.setItem(CSV_KEY, JSON.stringify(log)); } catch (e) {}
  updateCsvBtn();
}
function csvText() {
  const log = loadCsvLog();
  const esc = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lines = [CSV_COLS.join(',')];
  for (const id of Object.keys(log).sort()) for (const row of log[id]) lines.push(row.map(esc).join(','));
  return lines.join('\n') + '\n';
}
export function updateCsvBtn() { $('csvBtn').disabled = !Object.keys(loadCsvLog()).length; }
export async function downloadCsv() {
  const text = csvText();
  const filename = `pyramid-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
  const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  if (dl) {
    try { await dl.save({ filename, data: text }); statusMsg.textContent = `Saved ${filename}`; }
    catch (e) { if (e && e.code !== 'declined') statusMsg.textContent = 'Could not save the CSV: ' + (e.message || e.code || e); }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function renderTakes() {
  const el = $('takesPanel'); const takes = loadTakes();
  if (!takes.length) { el.hidden = true; el.innerHTML = ''; return; }
  const best = Math.max(...takes.map(t => t.points));
  const subName = { '1': 'quarters', '2': 'eighths', '3': 'triplets', '4': 'sixteenths' };
  const fmt = t => { const d = new Date(t.d); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  const rows = takes.slice(-12).reverse().map(t => `<tr${t.points === best ? ' class="best"' : ''}><td>${fmt(t)}</td><td>${t.bpm}</td><td>${t.bars}</td><td>${t.subs.length === 4 ? 'pyramid' : t.subs.split('').map(k => subName[k]).join('+')}</td><td>${t.score}</td><td>×${t.diff.toFixed(2)}</td><td><b>${t.points}</b>${t.points === best ? ' ★' : ''}</td></tr>`).join('');
  el.innerHTML = `<div class="takes-head"><span>Takes (${takes.length}, best ${best} points)</span><button class="btn btn-secondary btn-sm" id="clearTakes" title="Forget the takes table and the CSV log">Clear history</button></div>
    <table class="takes"><thead><tr><th>When</th><th>BPM</th><th>Bars</th><th>Notes</th><th>Score</th><th>Difficulty</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table>`;
  el.hidden = false;
  $('clearTakes').addEventListener('click', () => { try { localStorage.removeItem(TAKES_KEY); localStorage.removeItem(CSV_KEY); } catch (e) {} renderTakes(); updateCsvBtn(); });
}
