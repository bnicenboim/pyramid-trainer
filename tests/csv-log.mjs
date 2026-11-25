import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'], acceptDownloads:true }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
await p.evaluate(()=>localStorage.clear()); await p.reload();
console.log('csv toggle default:', await p.isChecked('#csvToggle'), '| csv btn disabled:', await p.isDisabled('#csvBtn'));
await p.click('#modeAuto'); await p.fill('#bpmDisplay','200'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#barsPerStep','1'); await p.fill('#maxRounds','1'); await p.press('#maxRounds','Tab'); await p.selectOption('#countInSel','1');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); await p.waitForFunction(()=>!app.S.running,{timeout:40000}); await p.waitForTimeout(1500);
// fake analysis: plant deviations so rows exist
await p.evaluate(()=>{ app.analyzeTiming(); if (!app.S.anaResult) return; app.S.anaResult.beats.forEach((r,i)=>{ if(!r.ci){ r.dev = (i%3)*10-10; r.onsetT = r.beatT + r.dev/1000; r.skipped=false; } }); app.logCsv(app.S.anaResult); });
console.log('csv btn disabled after:', await p.isDisabled('#csvBtn'));
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csvBtn')]);
const fs = await import('fs'); const txt = fs.readFileSync(await dl.path(),'utf8'); const lines = txt.trim().split('\n');
console.log('rows:', lines.length-1); console.log(lines[0]); console.log(lines[1]); console.log(lines[5]); console.log(lines[lines.length-1]);
console.log('errors:', errs); await b.close();
