import { HTML_URL, CHROME, SHOTS, spy } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({permissions:['microphone']}); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await spy(p, 'playClick'); await p.goto(HTML_URL);
await p.evaluate(()=>{ window.__clicks=[]; window.__spy={ playClick: (w,s,c)=>{ __clicks.push({w:+w.toFixed(3), q: Math.floor(app.S.beatIndex/app.S.subdivisions)%4, c}); } }; });
await p.fill('#bpmDisplay','120'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1'); await p.selectOption('#deviceSel','none');
for (const mode of ['b13','b24']) {
  await p.selectOption('#clickModeSel', mode); await p.evaluate(()=>__clicks.length=0);
  await p.click('#startBtn'); await p.waitForTimeout(2300); await p.click('#startBtn');
  console.log(mode, '-> quarter positions clicked:', await p.evaluate(()=>[...new Set(__clicks.map(c=>c.q+1))].sort().join(',')), '| count:', await p.evaluate(()=>__clicks.length));
}
await p.selectOption('#deviceSel',''); await p.selectOption('#clickModeSel','quarters'); await p.click('#startBtn'); await p.waitForTimeout(2500); await p.click('#startBtn'); await p.waitForTimeout(1200);
await p.click('#gainUp'); await p.click('#gainUp'); console.log('gain:', await p.textContent('#gainLbl'), '| pbClick default:', await p.evaluate(()=>app.$('pbClick')&&app.$('pbClick').checked));
console.log('errors:', errs); await b.close();
