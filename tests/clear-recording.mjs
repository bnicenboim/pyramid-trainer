import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({permissions:['microphone']}); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(HTML_URL);
await p.fill('#bpmDisplay','120'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1');
// 1) clear during a session → recording restarts from there and still finalises
await p.click('#startBtn'); await p.waitForTimeout(2500);
console.log('clear btn enabled while running:', await p.evaluate(()=>!app.resetBtn.disabled));
await p.click('#resetBtn'); await p.waitForTimeout(100); console.log('after clear:', await p.textContent('#statusMsg'), '| panel visible:', await p.evaluate(()=>!app.recPanel.hidden), '| REC:', await p.evaluate(()=>!app.recIndicator.hidden));
await p.waitForTimeout(3000); await p.click('#startBtn'); await p.waitForTimeout(1500);
console.log('recorded after clear:', await p.textContent('#pbDur'), '| beats:', await p.evaluate(()=>app.S.recBeats.length), '(expected ~3 s)');
// 2) starting again replaces the old recording automatically
await p.click('#startBtn'); await p.waitForTimeout(300);
console.log('on start: old recording gone:', await p.evaluate(()=>app.S.recordedBlob===null && app.S.recBuffer===null), '| panel visible (recording):', await p.evaluate(()=>!app.recPanel.hidden));
await p.waitForTimeout(2000); await p.click('#startBtn'); await p.waitForTimeout(1500);
console.log('new recording:', await p.textContent('#pbDur'));
// 3) clear when stopped hides the panel
await p.click('#resetBtn'); console.log('cleared when stopped: panel hidden:', await p.evaluate(()=>app.recPanel.hidden), '| clear disabled:', await p.evaluate(()=>app.resetBtn.disabled));
console.log('errors:', errs); await b.close();
