import { HTML_URL, CHROME, SHOTS, spy } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({permissions:['microphone']});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await spy(p, 'playClick'); await p.goto(HTML_URL);
await p.evaluate(()=>{ window.__clicks=[]; window.__spy={ playClick: (w,s,c)=>{ __clicks.push([+w.toFixed(4),s,c,app.S.subdivisions]); } }; });
await p.fill('#bpmDisplay','120'); await p.press('#bpmDisplay','Enter');
await p.selectOption('#countInSel','1'); await p.selectOption('#clickModeSel','all');
await p.click('#modeAuto'); await p.selectOption('#barsPerStep','1');
await p.selectOption('#progMode','up10'); await p.fill('#maxRounds','0'); await p.selectOption('#deviceSel','none');
await p.click('#startBtn');
await p.waitForTimeout(16500);
const r = await p.evaluate(()=>({clicks:__clicks, bpm: app.S.bpm, running: app.S.running, status:app.statusMsg.textContent, round: roundLbl.textContent}));
await p.click('#startBtn');
const c=r.clicks; let out=[];
for(let i=1;i<c.length;i++){ const dt=c[i][0]-c[i-1][0]; out.push(`${dt.toFixed(3)}${c[i][1]?'*':''}${c[i][2]?'c':''}/${c[i][3]}`); }
console.log(out.join(' '));
console.log('bpm now', r.bpm, '| status', r.status, '| round', r.round, '| errors', errs);
// downbeat check: every strong click must be at a multiple of beatSec from the first exercise click
const ex=c.filter(x=>!x[2]); const t0=ex[0][0];
const bad = ex.filter(x=>x[1]).map(x=>((x[0]-t0)/0.5)%1).filter(f=>Math.abs(f)>0.01 && Math.abs(f-1)>0.01);
console.log('strong-click misalignments (120bpm phase):', bad.length, '| subdivision sequence:', [...new Set(ex.map(x=>x[3]))].join(''));
await b.close();
