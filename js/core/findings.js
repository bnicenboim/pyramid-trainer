// Plain-language findings from an analyzed take. No page access.
import { inZoneR } from './bands.js';

// Plain-language diagnosis: what went well, what to work on. Each finding is
// {text, kind: 'good' | 'bad' | 'note'} and is only stated when the numbers back it.
const POS_LABEL = { '2:1': 'the "+"', '3:1': 'the "trip"', '3:2': 'the "let"', '4:1': 'the "e"', '4:2': 'the "+"', '4:3': 'the "a"' };
export const POS_ORDER = ['down', 'b234', '2:1', '3:1', '3:2', '4:1', '4:2', '4:3'];
export const POS_SHORT = { down: 'Downbeat (1)', b234: 'Beats 2, 3, 4', '2:1': '+ (eighths)', '3:1': 'trip', '3:2': 'let', '4:1': 'e', '4:2': '+ (sixteenths)', '4:3': 'a' };
export function buildFindings(a) {
  const out = [];
  const say = (text, kind = 'note') => out.push({ text, kind });
  const subName = { 1: 'quarter notes', 2: 'eighth notes', 3: 'triplets', 4: 'sixteenth notes' };
  const cap = t => t[0].toUpperCase() + t.slice(1);
  const ms = v => `${Math.round(Math.abs(v))} ms`;
  const ex = a.beats.filter(r => !r.ci && !r.skipped && !r.rest);
  const hits = ex.filter(r => r.dev !== null);
  if (!ex.length) return out;
  const rests = a.beats.filter(r => r.rest).length;
  if (rests) say(`${rests} beat${rests > 1 ? 's' : ''} without a note ${rests > 1 ? 'were' : 'was'} treated as ${rests > 1 ? 'rests' : 'a rest'} and left out (option "ignore unplayed beats").`, 'note');
  if (hits.length < Math.max(3, ex.length * 0.3)) {
    say(`Only ${hits.length} of ${ex.length} beats had a clear attack, which is too few to judge. Lower the attack threshold, play closer to the mic, or check that the grid lines up with your notes.`, 'bad');
    return out;
  }
  const mean = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
  const lateEarly = m => m > 0 ? 'late' : 'early';

  // 1. Each subdivision: how many notes were in zone, how many missed
  const subs = Object.keys(a.bySub).map(k => ({ k: +k, ...a.bySub[k] })).sort((p, q) => p.k - q.k);
  for (const x of subs) {
    if (x.n < 4) continue;
    const pct = x.z / x.n;
    const played = x.n - x.miss;
    const base = `${cap(subName[x.k])}: ${x.z} of ${x.n} notes in the zone` + (x.miss ? `, ${x.miss} not played or not heard` : '') + '.';
    if (pct >= 0.8) say(`${base} That is solid.`, 'good');
    else if (pct < 0.6) say(`${base} This is the weakest part: practice it slower until it sits.`, 'bad');
    else say(base, 'note');
    if (x.devs.length >= 4) { const m = mean(x.devs); if (Math.abs(m) >= 15) say(`In ${subName[x.k]} you were on average ${ms(m)} ${lateEarly(m)}.`, 'bad'); }
    if (played && x.devs.length >= 4) { const sd = Math.sqrt(x.devs.reduce((s2, v) => s2 + (v - mean(x.devs)) ** 2, 0) / x.devs.length); if (sd > 35) say(`In ${subName[x.k]} the notes scattered widely (±${Math.round(sd)} ms): the pulse was not steady there.`, 'bad'); }
  }

  // 2. Overall lean, only when it clearly outweighs the spread. Thresholds follow the
  //    literature: musicians typically sit 0-15 ms early without anyone noticing.
  if (Math.abs(a.mean) >= 15 && Math.abs(a.mean) >= a.sd * 0.5)
    say(`Across the whole take you played ${ms(a.mean)} ${lateEarly(a.mean)} on average, and consistently so. ${a.mean > 0 ? 'You are reacting to the click instead of anticipating it: try to feel the beat slightly earlier.' : 'You are rushing ahead of the click: try to relax and sit on the beat.'}`, 'bad');
  else if (Math.abs(a.mean) < 15 && a.sd <= 20)
    say(`Overall you were centered on the beat (average ${a.mean >= 0 ? '+' : '−'}${ms(a.mean)}) and tight (spread ±${Math.round(a.sd)} ms).`, 'good');
  else if (a.sd > 35)
    say(`There is no consistent early or late habit, but the spread is wide (±${Math.round(a.sd)} ms): the timing wanders. Use a slower tempo and smaller steps.`, 'bad');

  // 3. Positions inside the beat and the bar: the downbeat, 2-3-4, "+", "e", "a", "trip", "let".
  //    Each one is compared with its neighbours in the same subdivision, so a habit on one
  //    syllable shows up even when the subdivision as a whole looks fine.
  const P = a.byPos || {};
  const pname = key => key === 'down' ? 'the downbeat' : key === 'b234' ? 'beats 2, 3 and 4' : POS_LABEL[key] || key;
  for (const sub of [2, 3, 4]) {
    const keys = [0, 1, 2, 3].slice(0, sub).map(i => i === 0 ? null : `${sub}:${i}`);
    // the beat note of this subdivision = pos-0 beats played in this subdivision
    const beatNotes = hits.filter(r => r.sub === sub && r.pos === 0);
    const group = keys.slice(1).map(k => P[k]).filter(o => o && o.n >= 4);
    if (!group.length) continue;
    const beatStat = beatNotes.length >= 3 ? { n: beatNotes.length, z: beatNotes.filter(inZoneR).length, mean: mean(beatNotes.map(r => r.dev)), key: 'beat' } : null;
    const all = beatStat ? [beatStat, ...group] : group;
    const rate = o => o.z / o.n;
    // (a) one position clearly worse than the rest
    const sorted = [...all].sort((x, y) => rate(x) - rate(y));
    const worst = sorted[0], others = sorted.slice(1);
    if (others.length && rate(worst) < 0.6 && others.every(o => rate(o) - rate(worst) >= 0.25)) {
      const label = worst.key === 'beat' ? `the beat note of the ${subName[sub]}` : pname(worst.key);
      say(`In ${subName[sub]}, ${label} is the weak spot: ${Math.round(100 * rate(worst))}% in zone${worst.devs && worst.devs.length ? `, ${ms(worst.mean)} ${lateEarly(worst.mean)} on average` : ''}, while ${others.map(o => o.key === 'beat' ? 'the beat note' : pname(o.key)).join(', ')} ${others.length > 1 ? 'are' : 'is'} at ${others.map(o => Math.round(100 * rate(o)) + '%').join(' / ')}.`, 'bad');
    }
    // (b) a lean that belongs to one syllable only (the others are centered)
    for (const o of group) {
      const rest = all.filter(x => x !== o);
      if (Math.abs(o.mean) >= 15 && rest.length && rest.every(x => Math.abs(x.mean) < 10))
        say(`${cap(pname(o.key))} is consistently ${ms(o.mean)} ${lateEarly(o.mean)} in ${subName[sub]}, while the other positions are centered: ${o.mean > 0 ? 'you stretch' : 'you rush'} that syllable.`, 'bad');
    }
    // (c) relative to the beat note: the classic "rushing the and"
    if (beatStat) for (const o of group) {
      const diff = o.mean - beatStat.mean;
      if (Math.abs(diff) >= 15 && !(Math.abs(o.mean) >= 15 && all.filter(x => x !== o).every(x => Math.abs(x.mean) < 10)))
        say(`In ${subName[sub]}, ${pname(o.key)} comes ${ms(diff)} ${diff > 0 ? 'later' : 'earlier'} than the beat note does: you ${diff > 0 ? 'stretch' : 'rush'} the ${subName[sub]} after the beat.`, 'bad');
    }
    // (d) misses concentrated on one syllable
    const missed = group.filter(o => o.miss >= 2).sort((x, y) => y.miss - x.miss)[0];
    const totalMiss = ex.filter(r => r.sub === sub && r.dev === null).length;
    if (missed && missed.miss >= 0.5 * totalMiss) say(`Of the missed ${subName[sub]}, ${missed.miss} were ${pname(missed.key)}.`, 'bad');
  }
  // (e) the downbeat against beats 2-4 (all subdivisions): losing the bar rather than the beat
  if (P.down && P.b234 && P.down.devs.length >= 4 && P.b234.devs.length >= 4) {
    const diff = P.down.mean - P.b234.mean;
    if (Math.abs(diff) >= 15) say(`Your downbeats land ${ms(diff)} ${diff > 0 ? 'later' : 'earlier'} than beats 2, 3 and 4 (${P.down.mean >= 0 ? '+' : '−'}${ms(P.down.mean)} vs ${P.b234.mean >= 0 ? '+' : '−'}${ms(P.b234.mean)}): you ${diff > 0 ? 'hesitate at' : 'anticipate'} the start of the bar.`, 'bad');
    else if (P.down.z / P.down.n < 0.6 && P.b234.z / P.b234.n - P.down.z / P.down.n >= 0.25) say(`The downbeat is less reliable than beats 2, 3 and 4 (${Math.round(100 * P.down.z / P.down.n)}% vs ${Math.round(100 * P.b234.z / P.b234.n)}% in zone): the bar line, not the beat, is where you lose it.`, 'bad');
    else if (P.down.z / P.down.n >= 0.8 && P.b234.z / P.b234.n >= 0.8 && Math.abs(diff) < 10) say(`Downbeats and beats 2, 3, 4 are equally solid: the bar is well anchored.`, 'good');
  }

  // 4. Progress over the take. Always reported (it does not affect the score):
  //    per pyramid round when there were several, otherwise first / middle / last third.
  if (ex.length >= 9) {
    const rounds = [...new Set(ex.map(r => r.round))];
    let parts, label;
    if (rounds.length >= 2) { parts = rounds.map(k => ex.filter(r => r.round === k)); label = i => `round ${i + 1}`; }
    else { const n = Math.floor(ex.length / 3); parts = [ex.slice(0, n), ex.slice(n, 2 * n), ex.slice(2 * n)]; label = i => ['the first third', 'the middle', 'the last third'][i]; }
    const stat = part => { const h = part.filter(r => r.dev !== null); return { z: part.length ? part.filter(inZoneR).length / part.length : 0, m: h.length ? mean(h.map(r => r.dev)) : 0, n: part.length }; };
    const st = parts.map(stat);
    const first = st[0], last = st[st.length - 1];
    const seq = st.map((x, i) => `${label(i)} ${Math.round(100 * x.z)}%`).join(', ');
    const delta = last.z - first.z;
    if (delta >= 0.15) say(`You improved over the take (in zone: ${seq}). It started rough and got there, which is exactly what practice should look like.`, 'good');
    else if (delta <= -0.15) say(`You got worse over the take (in zone: ${seq}). Either fatigue or the tempo is too high for a take this long: stop earlier or slow down.`, 'bad');
    else say(`Steady over the take (in zone: ${seq}).`, 'note');
    a.trend = { seq, delta };
    if (Math.abs(last.m - first.m) >= 12) say(`Your timing drifted ${lateEarly(last.m - first.m)}r as you went: ${label(0)} averaged ${first.m >= 0 ? '+' : '−'}${ms(first.m)}, ${label(st.length - 1)} ${last.m >= 0 ? '+' : '−'}${ms(last.m)}.`, 'bad');
  }
  if (!out.length) say('Nothing stands out: the deviations are spread evenly across subdivisions and positions.', 'note');
  return out;
}
