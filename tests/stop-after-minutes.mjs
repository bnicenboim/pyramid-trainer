import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
await p.fill('#bpmDisplay','240'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1'); await p.fill('#manualBars','0');
await p.evaluate(()=>{ app.$('maxMinutes').value = '0.1'; }); // 6 s of playing
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); const t0=Date.now();
await p.waitForFunction(()=>!app.S.running, {timeout:30000});
const el = (Date.now()-t0)/1000;
console.log('stopped after', el.toFixed(1), 's total (1 s count-in + 6 s + last bar) | status:', await p.textContent('#statusMsg'));
console.log('exercise beats logged:', await p.evaluate(()=>app.S.beatLog.filter(b=>!b.ci).length), '(bars of 4 at 240 bpm → multiple of 4)');
console.log('errors:', errs); await b.close();
