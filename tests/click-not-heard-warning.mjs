import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL); await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.fill('#bpmDisplay','200'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1'); await p.fill('#manualBars','2'); await p.press('#manualBars','Tab');
// A: fake mic, click not heard → warning right after the count-in
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running && !app.S.inCountIn); await p.waitForTimeout(300);
console.log('A heard:', await p.evaluate(()=>app.S.ciClickHeard), '| recDest', await p.evaluate(()=>!!app.S.recDest)); console.log('A status:', (await p.textContent('#statusMsg')).slice(0,110), '| lbl:', await p.textContent('#clickLbl'), '| sysLatency:', await p.evaluate(()=>app.S.sysLatencySec));
await p.waitForFunction(()=>!app.S.running,{timeout:20000}); await p.waitForTimeout(1200);
console.log('A grid note:', (await p.textContent('#gridInfo')).slice(0,120));
// B: route the click into the analyser (as if the mic heard it) → no warning
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running && !!app.S.clickBus); await p.evaluate(()=>{ app.S.clickBus.connect(app.S.sessionAnalyser); }); await p.waitForFunction(()=>app.S.running && !app.S.inCountIn); await p.waitForTimeout(300);
console.log('B heard:', await p.evaluate(()=>app.S.ciClickHeard), '| status:', (await p.textContent('#statusMsg')).slice(0,60));
await p.click('#startBtn'); console.log('errors:', errs); await b.close();
