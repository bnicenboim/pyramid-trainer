import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
await p.click('#modeAuto');
// steps: only quarter + sixteenth
await p.uncheck('#stepPick input[data-divs="2"]'); await p.uncheck('#stepPick input[data-divs="3"]');
console.log('seq:', await p.evaluate(()=>app.S.PYRAMID_SEQ.join(',')));
await p.uncheck('#stepPick input[data-divs="1"]'); await p.uncheck('#stepPick input[data-divs="4"]');
console.log('seq when none:', await p.evaluate(()=>app.S.PYRAMID_SEQ.join(',')), '| quarter re-checked:', await p.isChecked('#stepPick input[data-divs="1"]'));
await p.check('#stepPick input[data-divs="4"]');
// auto mode, 1 bar/step, 2 rounds, +10 bpm, round count-in 1 bar
await p.fill('#bpmDisplay','200'); await p.press('#bpmDisplay','Enter');
await p.selectOption('#barsPerStep','1'); await p.fill('#maxRounds','2'); await p.selectOption('#progMode','up10');
console.log('round-ci row visible:', !(await p.isHidden('#roundCiRow')));
await p.selectOption('#roundCountInSel','1'); await p.selectOption('#countInSel','1');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running);
const seen = new Set(); const t0 = Date.now();
while (Date.now()-t0 < 20000) { const r = await p.evaluate(()=>({running: app.S.running, inCountIn: app.S.inCountIn, roundCountIn: app.S.roundCountIn, bpm: app.S.bpm, sub: app.S.subdivisions, st: app.statusMsg.textContent, ov: app.countdownOverlay.textContent})); seen.add(JSON.stringify([r.inCountIn, r.roundCountIn, r.bpm, r.sub])); if (!r.running) break; if (r.roundCountIn) seen.add('OVERLAY:'+r.ov+' | '+r.st); await p.waitForTimeout(100); }
console.log([...seen].join('\n'));
await p.waitForTimeout(1500);
console.log('beatLog ci rounds:', await p.evaluate(()=>{ const ci = app.S.beatLog.filter(b=>b.ci); return `ci beats ${ci.length}, quiet ${app.S.beatLog.filter(b=>b.quiet).length}, subs ${[...new Set(app.S.beatLog.map(b=>b.sub))].join('')}`; }));
console.log('errors:', errs); await b.close();
