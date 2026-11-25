import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
console.log('setSinkId supported:', await p.evaluate(()=>'setSinkId' in AudioContext.prototype), '| row hidden:', await p.isHidden('#outputRow'));
await p.selectOption('#countInSel','1'); await p.fill('#manualBars','1'); await p.press('#manualBars','Tab'); await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running);
console.log('outputs:', await p.$$eval('#outputSel option', o=>o.map(x=>x.textContent).join(' | ')), '| note:', await p.textContent('#outputNote'));
const opts = await p.$$eval('#outputSel option', o=>o.map(x=>x.value)); if (opts.length>1) { await p.selectOption('#outputSel', opts[1]); await p.waitForTimeout(300); console.log('switched; note:', await p.textContent('#outputNote'), '| sink:', await p.evaluate(()=>app.S.audioCtx.sinkId)); }
await p.waitForFunction(()=>!app.S.running,{timeout:20000}); await p.click('#clickTestBtn'); await p.waitForTimeout(300);
console.log('errors:', errs); await b.close();
