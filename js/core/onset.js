// Onset function of a recording. No page access: plain data in, plain data out.

// Onset function: spectral flux with max-filter vibrato suppression ("SuperFlux",
// Böck & Widmer 2013) on the guitar channel: 512-sample Hann frames every 128
// samples (2.7 ms), log-compressed magnitudes, positive change vs. the frame 3 hops
// earlier. Also returns, per hop, how much of the block is the metronome's own tone.
export function computeOnsetFunction(data, sr) {
  const N = 512, H = 128, MU = 3, K = N / 2;
  const nHops = Math.max(0, Math.floor((data.length - N) / H));
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float32Array(N), im = new Float32Array(N);
  const spec = []; const odf = new Float32Array(nHops), odfNoClick = new Float32Array(nHops), tone = new Float32Array(nHops);
  // The click = a pitch (1800/1200 exercise, 2000/1400 count-in) plus, for the bright/wood sounds, its 2nd and 3rd harmonics
  const CLICK_F = [1800, 1200, 2000, 1400];
  const cf = CLICK_F.map(f => [1, 2, 3].map(h => 2 * Math.cos(2 * Math.PI * f * h / sr)));
  // bins the click occupies (±4 bins ≈ ±375 Hz around each pitch and its harmonics)
  const clickBin = new Uint8Array(K);
  for (const f of CLICK_F) for (const h of [1, 2, 3]) { const kc = Math.round(f * h * N / sr); for (let k = kc - 4; k <= kc + 4; k++) if (k >= 0 && k < K) clickBin[k] = 1; }
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } }
    }
  };
  for (let n = 0; n < nHops; n++) {
    const off = n * H;
    let e = 0; for (let i = 0; i < N; i++) { const v = data[off + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    // tone share of the newest block (last 128 samples of the frame)
    let best = 0, eb = 0;
    for (let i = N - H; i < N; i++) { const x = data[off + i]; eb += x * x; }
    for (let c = 0; c < cf.length; c++) {
      let pw = 0;
      for (const co of cf[c]) { let s1 = 0, s2 = 0; for (let i = N - H; i < N; i++) { const s0 = data[off + i] + co * s1 - s2; s2 = s1; s1 = s0; } pw += (s1 * s1 + s2 * s2 - co * s1 * s2) * 2 / (H * H); }
      if (pw > best) best = pw;
    }
    tone[n] = eb > 0 ? best / (eb / H) : 0;
    fft(re, im);
    const L = new Float32Array(K);
    for (let k = 0; k < K; k++) L[k] = Math.log(1 + 20 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
    spec.push(L); if (spec.length > MU + 1) spec.shift();
    let flux = 0, fluxNC = 0;
    if (spec.length > MU) { const P = spec[0]; for (let k = 2; k < K; k++) { const m = Math.max(P[k - 1], P[k], k + 1 < K ? P[k + 1] : 0); const d = L[k] - m; if (d > 0) { flux += d; if (!clickBin[k]) fluxNC += d; } } }
    odf[n] = flux; odfNoClick[n] = fluxNC;
  }
  return { odf, odfNoClick, tone, hopSec: H / sr, frameSec: N / sr, nHops };
}
