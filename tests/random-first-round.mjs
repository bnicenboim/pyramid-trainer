import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: CHROME, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ permissions:['microphone'] }); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL); await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.click('#modeAuto'); await p.fill('#bpmDisplay','200'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#progMode','random'); await p.fill('#progMin','60'); await p.press('#progMin','Tab'); await p.fill('#progMax','80'); await p.press('#progMax','Tab');
const seen=[]; for (let i=0;i<3;i++) { await p.click('#startBtn'); await p.waitForFunction(()=>app.S.running); await p.waitForTimeout(400); seen.push(await p.evaluate(()=>app.S.bpm)); await p.click('#startBtn'); await p.waitForTimeout(300); }
console.log('first-round tempos:', seen.join(', '), '(expected 60–80)'); console.log('errors:', errs); await b.close();
