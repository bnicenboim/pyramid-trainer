import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'], viewport:{width:760,height:900} }); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.click('#modeAuto'); await p.fill('#bpmDisplay','150'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#barsPerStep','2'); await p.fill('#maxRounds','3'); await p.press('#maxRounds','Tab'); await p.fill('#maxMinutes','2'); await p.press('#maxMinutes','Tab'); await p.selectOption('#countInSel','1');
await p.uncheck('#stepPick input[data-divs="3"]');
await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running);
const shots = [1200, 3800, 7200, 10500];
let i=0; for (const ms of shots) { await p.waitForTimeout(i===0?ms:ms-shots[i-1]); i++; const head = await p.textContent('#sessionHead'); const bars = await p.$eval('#barsRow', e=>e.innerText.replace(/\n/g,' ')); console.log(`t=${ms}: ${head} || ${bars}`); if (i===3) { const el = await p.$('.session-head'); const bb = await el.boundingBox(); await p.screenshot({path:SHOTS + '/bars.png', clip:{x:0,y:bb.y-10,width:760,height:230}}); } }
await p.click('#startBtn'); console.log('cleared:', await p.textContent('#sessionHead'), '|', await p.textContent('#barsRow'));
console.log('errors:', errs); await b.close();
