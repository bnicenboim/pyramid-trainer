// Runs in Node, without a browser: the alignment code has no page access.
import { alignByRecordedClicks } from '../js/core/align.js';
const sr = 48000;
// scheduled clicks: quarters at 120 bpm for 8 s, recording started 0.2 s before first beat; true offset (speaker→mic) 0.137 s
const beatLog = []; const recStartAudioTime = 10.0;
for (let i = 0; i < 16; i++) beatLog.push({ t: 10.2 + i * 0.5, clicked: true, ci: i < 4, quiet: i < 4 });
const data = new Float32Array(sr * 9);
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
for (let i = 0; i < data.length; i++) data[i] = rnd() * 0.01; // room noise
// guitar: notes every 0.25 s (eighths), harmonic, loud
for (let n = 0; n < 32; n++) { const t0 = 0.21 + n * 0.25; for (let i = Math.floor(t0 * sr); i < Math.min(data.length, Math.floor((t0 + 0.4) * sr)); i++) { const d = i / sr - t0; data[i] += 0.3 * Math.exp(-d * 3) * [1,2,3,4,5].reduce((a,h)=>a+Math.sin(2*Math.PI*196*h*d)/h,0)/2.3; } }
// recorded click: 1800 Hz (strong) bursts at scheduled + 0.137, amplitude 0.12 (quieter than guitar)
for (const b of beatLog) { const t0 = b.t - recStartAudioTime + 0.137; const f = b.ci ? 2000 : 1800; for (let i = Math.floor(t0 * sr); i < Math.floor((t0 + 0.05) * sr); i++) { const d = i / sr - t0; data[i] += 0.12 * Math.sin(2 * Math.PI * f * d) * Math.exp(-d * 60); } }
const align = d => alignByRecordedClicks(d, sr, beatLog, recStartAudioTime);
const r1 = align(data); console.log('with clicks   ->', JSON.stringify({offset:r1.offset, matched:r1.matched, total:r1.total, clickTimes:r1.clickTimes.length}));
// headphones: no clicks in the recording
const data2 = new Float32Array(sr * 9); for (let i = 0; i < data2.length; i++) data2[i] = rnd() * 0.01;
for (let n = 0; n < 32; n++) { const t0 = 0.21 + n * 0.25; for (let i = Math.floor(t0 * sr); i < Math.min(data2.length, Math.floor((t0 + 0.4) * sr)); i++) { const d = i / sr - t0; data2[i] += 0.3 * Math.exp(-d * 3) * [1,2,3,4,5].reduce((a,h)=>a+Math.sin(2*Math.PI*196*h*d)/h,0)/2.3; } }
{ const d3 = new Float32Array(sr*9); for (let i=0;i<d3.length;i++) d3[i]=rnd()*0.01;
  for (const [n,b] of beatLog.entries()) { if (n>=2) continue; const t0=b.t-recStartAudioTime+0.137; for (let i=Math.floor(t0*sr);i<Math.floor((t0+0.05)*sr);i++){ const d=i/sr-t0; d3[i]+=0.12*Math.sin(2*Math.PI*2000*d)*Math.exp(-d*60);} }
  for (let n=0;n<32;n++){ const t0=1.2+n*0.25; for (let i=Math.floor(t0*sr);i<Math.min(d3.length,Math.floor((t0+0.4)*sr));i++){ const d=i/sr-t0; d3[i]+=0.6*Math.exp(-d*3)*[1,2,3,4,5].reduce((a,h)=>a+Math.sin(2*Math.PI*196*h*d)/h,0)/2.3; } }
  console.log('only 2 clean  ->', JSON.stringify(align(d3))); }
console.log('headphones    ->', JSON.stringify(align(data2)));
