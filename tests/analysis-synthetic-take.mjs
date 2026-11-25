import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext({viewport:{width:700,height:1500}}); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto(HTML_URL);
const res = await p.evaluate(async () => {
  const sr = 48000, dur = 9; const ac = new AudioContext(); const buf = ac.createBuffer(1, sr*dur, sr); const d = buf.getChannelData(0);
  let seed=7; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff-0.5; };
  for (let i=0;i<d.length;i++) d[i]=rnd()*0.01;
  app.S.bpm = 120; // quarter = 0.5 s
  // grid: 1 bar count-in (ci), then 1 bar quarters, 1 bar eighths, 1 bar sixteenths
  const beats = []; let t = 0.5;
  for (let i=0;i<4;i++) { beats.push({t, q:true, bar:i===0, sub:1, ci:true}); t+=0.5; }
  const plan = [[1,4],[2,8],[4,16]];
  for (const [sub,n] of plan) for (let i=0;i<n;i++) { beats.push({t, q:i%sub===0, bar:i===0, sub, ci:false}); t+=0.5/sub; }
  app.S.recBeats = beats; app.S.recShift = 0; app.S.recBuffer = buf;
  // click bursts (1800 Hz) at every quarter including count-in
  for (const bt of beats) if (bt.q) { for (let i=Math.floor(bt.t*sr); i<Math.floor((bt.t+0.05)*sr); i++) { const x=i/sr-bt.t; d[i]+=0.12*Math.sin(2*Math.PI*1800*x)*Math.exp(-x*60); } }
  // notes: deviations per exercise beat (ms); null = not played
  const devs = [45,-40,40,-35, 30,-30,30,-30,5,0,-5,15, 8,-8,null,20,0,-15,12,-10,3,0,5,-5,2,-3,0,3];
  const ex = beats.filter(b=>!b.ci); const noiseTab = Array.from({length:96000}, rnd);
  ex.forEach((bt,i) => { const dv = devs[i]; if (dv===null) return; const t0 = bt.t + dv/1000;
    for (let i2=Math.floor(t0*sr); i2<Math.min(d.length, Math.floor((t0+0.35)*sr)); i2++) { const x=i2/sr-t0; d[i2]+= 0.3*Math.exp(-x*6)*[1,2,3,4,5,6].reduce((a,h)=>a+Math.sin(2*Math.PI*196*h*x)/h,0)/2.4 + 0.25*Math.exp(-x*250)*noiseTab[Math.floor(x*sr)%96000]; } });
  app.recPanel.hidden=false; app.setTransportEnabled(true); app.setView(1.8, 6); app.renderWave(-1);
  app.analyzeTiming();
  const got = app.S.anaResult.beats.filter(r=>!r.ci).map(r=>r.dev); window.__strs = app.S.anaResult.beats.filter(r=>!r.ci).map(r=>Math.round(r.str)).join(',');
  return { points: app.S.anaResult.points, diff: app.S.anaResult.difficulty.toFixed(2), noteDiff: app.S.anaResult.noteDiff.toFixed(2), lenF: app.S.anaResult.lenFactor.toFixed(2), takes: JSON.parse(localStorage.getItem('pyramidTakes')||'[]').length, findings: app.S.anaResult.findings, strs: window.__strs, expected: devs, got, score: app.S.anaResult.score, inZone: app.S.anaResult.inZone, total: app.S.anaResult.total, missed: app.S.anaResult.total-app.S.anaResult.hits, mean: app.S.anaResult.mean.toFixed(1), sd: app.S.anaResult.sd.toFixed(1) };
});
console.log('expected:', res.expected.join(',')); console.log('strengths:', res.strs);
console.log('got:     ', res.got.join(','));
console.log('points', res.points, '| difficulty', res.diff, '= notes', res.noteDiff, '× length', res.lenF, '| takes stored:', res.takes);
const errsDev = res.expected.map((e,i)=> e===null ? (res.got[i]===null?0:99) : (res.got[i]===null?99:Math.abs(res.got[i]-e)));
console.log('max abs error (ms):', Math.max(...errsDev), '| score', res.score, '| inZone', res.inZone+'/'+res.total, '| missed', res.missed, '| mean', res.mean, '| sd', res.sd);
await p.check('#ignoreUnplayed'); await p.waitForTimeout(300);
console.log('rest mode: score', await p.evaluate(()=>app.S.anaResult.score), '| total', await p.evaluate(()=>app.S.anaResult.total), '| rests', await p.evaluate(()=>app.S.anaResult.beats.filter(r=>r.rest).length), '| missed tile', await p.evaluate(()=>app.S.anaResult.total-app.S.anaResult.hits), '| finding:', await p.evaluate(()=>app.S.anaResult.findings.find(f=>/rests/.test(f.text))?.text));
await p.uncheck('#ignoreUnplayed'); await p.waitForTimeout(300); console.log('normal: score', await p.evaluate(()=>app.S.anaResult.score), '| total', await p.evaluate(()=>app.S.anaResult.total));
await p.click('#driftZoomIn'); console.log('zoom1:', await p.$eval('.zoomctl span', e=>e.textContent)); await p.click('#driftZoomIn'); console.log('zoom2:', await p.$eval('.zoomctl span', e=>e.textContent));
await p.$eval('#driftScroll', e=>{ e.value = e.max; e.dispatchEvent(new Event('input')); }); console.log('scrolled:', await p.$eval('.zoomctl span', e=>e.textContent), '| strip labels:', await p.$$eval('.drift svg text[font-size="15"]', t=>t.map(x=>x.textContent).join(' / ')));
await p.click('#driftZoomOut'); await p.click('#driftZoomOut'); console.log('zoomed out:', await p.$eval('.zoomctl span', e=>e.textContent));
await p.click('.drift .chip[data-key="4:3"]'); console.log('chip a on:', await p.$eval('.drift .chip.on', b=>b.textContent), '| faded marks:', await p.$$eval('.drift svg [opacity="0.18"]', m=>m.length), '| solid:', await p.$$eval('.drift svg [opacity="1"]', m=>m.length));
const el = await p.$('#recPanel'); await el.screenshot({path:SHOTS + '/ana.png'});
console.log('findings:'); for (const f of res.findings) console.log('  -', f.kind, '|', f.text); console.log('errors:', errs); await b.close();
