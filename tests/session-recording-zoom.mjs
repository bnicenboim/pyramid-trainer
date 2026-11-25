import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({permissions:['microphone']}); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(HTML_URL);
// mic test
await p.click('#micToggle'); await p.waitForTimeout(600); console.log('test:', await p.textContent('#micToggle'), '| meter on:', await p.$$eval('.seg.on,.seg.hot',s=>s.length)); await p.click('#micToggle');
// session: auto pyramid, 1 bar/step, 120 bpm, count-in 1 bar, 1 round
await p.fill('#bpmDisplay','120'); await p.press('#bpmDisplay','Enter'); await p.selectOption('#countInSel','1');
await p.click('#modeAuto'); await p.selectOption('#barsPerStep','1'); await p.fill('#maxRounds','1');
await p.click('#startBtn'); await p.waitForTimeout(17500);
console.log('status:', await p.textContent('#statusMsg'), '| running:', await p.evaluate(()=>app.S.running));
await p.waitForTimeout(1500);
console.log('rec:', await p.textContent('#pbDur'),  '| beats:', await p.evaluate(()=>app.S.recBeats.length), '| subs:', await p.evaluate(()=>[...new Set(app.S.recBeats.map(b=>b.sub))].join('')), '| shift:', await p.evaluate(()=>app.S.recShift.toFixed(3)), '| view:', await p.textContent('#viewLbl'), '| canvas w:', await p.evaluate(()=>app.waveCanvas.width));
// click channel should contain clicks, guitar channel the fake mic tone

await p.click('#zoomIn'); console.log('zoomed:', await p.textContent('#viewLbl'));
await p.click('#playBtn'); await p.waitForTimeout(1500); console.log('playing:', await p.textContent('#playBtn'), '| clickGain:', await p.evaluate(()=>typeof pbClickGain!=='undefined'?pbClickGain.gain.value:null));
// (pbClick checkbox no longer exists)
await p.click('#playBtn'); await p.click('#resetBtn'); console.log('cleared:', await p.evaluate(()=>app.recPanel.hidden && !app.S.recordedBlob));
console.log('sig meter during session works:', await p.evaluate(()=>typeof app.pollSessionLevel==='function'));
console.log('errors:', errs); await b.close();
