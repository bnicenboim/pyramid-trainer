import { HTML_URL, CHROME, SHOTS } from './_env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({executablePath: CHROME,args:['--autoplay-policy=no-user-gesture-required']});
const ctx = await b.newContext(); const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(HTML_URL);
const results = {}; for (const sound of ['beep','long','bright','wood']) { const res = await p.evaluate(async (sound) => {
  const sr = 48000, dur = 12; const d = new Float32Array(sr*dur);
  let seed=5; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff-0.5; }; for (let i=0;i<d.length;i++) d[i]=rnd()*0.01;
  app.S.bpm = 120; app.S.recStartAudioTime = 0; app.S.beatLog = [];
  // schedule: 1 bar count-in (quarters, 2000 Hz clicks), then 2 bars eighths with clicks on quarters (1800 Hz); mic hears clicks 0.11 s after schedule
  let t = 0.5; const OFF = 0.11;
  for (let i=0;i<4;i++) { app.S.beatLog.push({t, q:true, bar:i===0, sub:1, clicked:true, ci:true, round:0}); t+=0.5; }
  for (let i=0;i<16;i++) { const q = i%2===0; app.S.beatLog.push({t, q, bar:i===0||i===8, sub:2, clicked:q, ci:false, round:0}); t+=0.25; }
  const noiseTab = Array.from({length:96000}, rnd);
  { const off = new OfflineAudioContext(1, sr*dur, sr); const g = off.createGain(); g.gain.value = 0.5; g.connect(off.destination);
    for (const bt of app.S.beatLog) { if (!bt.clicked) continue; app.synthClick(off, bt.t + OFF, bt.ci ? 2000 : 1800, true, g, sound); }
    const rb = await off.startRendering(); const cd = rb.getChannelData(0); for (let i=0;i<d.length;i++) d[i]+=cd[i]; }
  // notes exactly on every exercise beat (physical onset at grid time, heard with the same OFF)
  for (const bt of []) { if (bt.ci) continue; const t0 = bt.t + OFF; for (let i=Math.floor(t0*sr); i<Math.min(d.length, Math.floor((t0+0.2)*sr)); i++) { const x=i/sr-t0; d[i]+= 0.3*Math.exp(-x*6)*[1,2,3,4,5,6].reduce((a,h)=>a+Math.sin(2*Math.PI*196*h*x)/h,0)/2.4 + 0.25*Math.exp(-x*250)*noiseTab[Math.floor(x*sr)%96000]; } }
  // WAV blob (mono 16-bit)
  const pcm = new Int16Array(d.length); for (let i=0;i<d.length;i++) pcm[i]=Math.max(-1,Math.min(1,d[i]))*32767;
  const hdr = new ArrayBuffer(44), dv = new DataView(hdr); const str=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  str(0,'RIFF'); dv.setUint32(4,36+pcm.length*2,true); str(8,'WAVE'); str(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true); dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true); str(36,'data'); dv.setUint32(40,pcm.length*2,true);
  app.S.recordedBlob = new Blob([hdr, pcm.buffer], {type:'audio/wav'});
  app.finalizeRecording();
  await new Promise(r => { const iv = setInterval(() => { if (app.S.recBuffer) { clearInterval(iv); r(); } }, 50); });
  const info = app.$('gridInfo').textContent;
  app.analyzeTiming();
  const ex = app.S.anaResult.beats.filter(r=>!r.ci && !r.skipped);
  return { sound, nz: app.S.anaResult.inZone+'/'+app.S.anaResult.total+' hits '+app.S.anaResult.hits, info: info.slice(0,60), grid0: app.S.recBeats.find(b=>!b.ci).t.toFixed(4), lean: app.S.anaResult.mean.toFixed(1), sd: app.S.anaResult.sd.toFixed(1), score: app.S.anaResult.score, devs: ex.map(r=>r.dev).join(',') };
}, sound); console.log(res); }
console.log('errors:', errs); await b.close();
