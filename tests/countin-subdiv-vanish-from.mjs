import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
await p.evaluate(()=>localStorage.clear()); await p.reload();
const pattern = async () => p.evaluate(()=>{ const out=[]; let cur=null; for (const b of app.S.beatLog) { if (b.bar) { cur=[]; out.push(cur); } cur.push((b.ci?(b.quiet?'Q':'c'):'')+(b.clicked?'x':'.')); } return out.map(r=>r.join('')).join(' '); });
// A. manual sixteenths, metronome "all": count-in should play sixteenths too
await p.fill('#bpmDisplay','240'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1'); await p.click('#subdivRow .step-btn[data-divs="4"]');
await p.selectOption('#clickModeSel','all'); await p.fill('#manualBars','1'); await p.press('#manualBars','Tab'); await p.fill('#maxMinutes','0'); await p.press('#maxMinutes','Tab');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); await p.waitForFunction(()=>!app.S.running,{timeout:30000}); await p.waitForTimeout(300);
console.log('A all/sixteenths:', await pattern());
// B. vanishing from "2 and 4", stay 1 bar, down to "2 every 4th bar"
await p.click('#subdivRow .step-btn[data-divs="1"]'); await p.selectOption('#clickModeSel','vanish'); await p.selectOption('#vanishFrom','b24');
console.log('down-to options:', await p.$$eval('#vanishTo option', o=>o.map(x=>x.textContent).join(' | ')), '| selected:', await p.inputValue('#vanishTo'));
await p.selectOption('#vanishTo','e4_2'); await p.fill('#vanishStay','1'); await p.press('#vanishStay','Tab'); await p.fill('#manualBars','8'); await p.press('#manualBars','Tab');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); await p.waitForFunction(()=>!app.S.running,{timeout:30000}); await p.waitForTimeout(300);
console.log('B from 2&4:', await pattern());
// C. vanishing from "all subdivisions" with eighths: count-in plays eighths, then thins
await p.click('#subdivRow .step-btn[data-divs="2"]'); await p.selectOption('#vanishFrom','all'); await p.selectOption('#vanishTo','one1'); await p.fill('#manualBars','4'); await p.press('#manualBars','Tab');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); await p.waitForFunction(()=>!app.S.running,{timeout:30000}); await p.waitForTimeout(300);
console.log('C from all/eighths:', await pattern());
await p.reload(); console.log('restored: from', await p.inputValue('#vanishFrom'), 'to', await p.inputValue('#vanishTo'), 'sound', await p.inputValue('#clickSoundSel'));
console.log('errors:', errs); await b.close();
