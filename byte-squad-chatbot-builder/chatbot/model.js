export const MAX_BLOCK = 256;

export function clampInt(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x | 0));
}

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function zeros(n) {
  return new Float32Array(n);
}

export function fillRand(a, scale = 0.02) {
  for (let i = 0; i < a.length; i++) a[i] = randn() * scale;
  return a;
}

export function matmul(A, ar, ac, B, bc, C) {
  C.fill(0);
  for (let i = 0; i < ar; i++) {
    const aRow = i * ac;
    const cRow = i * bc;
    for (let k = 0; k < ac; k++) {
      const a = A[aRow + k];
      const bRow = k * bc;
      for (let j = 0; j < bc; j++) C[cRow + j] += a * B[bRow + j];
    }
  }
}

export function addBiasRows(M, rows, cols, b) {
  for (let i = 0; i < rows; i++) {
    const r = i * cols;
    for (let j = 0; j < cols; j++) M[r + j] += b[j];
  }
}

export function softmaxRowInPlace(row, offset, n) {
  let max = -1e30;
  for (let i = 0; i < n; i++) max = Math.max(max, row[offset + i]);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(row[offset + i] - max);
    row[offset + i] = e;
    sum += e;
  }
  const inv = 1 / (sum + 1e-12);
  for (let i = 0; i < n; i++) row[offset + i] *= inv;
}

function createAdamStateLike(param) {
  return { m: new Float32Array(param.length), v: new Float32Array(param.length) };
}

export function createModel(vocabSize, dModel, opts = {}) {
  const tieWeights = !!opts.tieWeights;
  const residual = !!opts.residual;
  const E = fillRand(new Float32Array(vocabSize * dModel), 0.08);
  const P = fillRand(new Float32Array(MAX_BLOCK * dModel), 0.06);
  const Wq = fillRand(new Float32Array(dModel * dModel), 0.06);
  const Wk = fillRand(new Float32Array(dModel * dModel), 0.06);
  const Wv = fillRand(new Float32Array(dModel * dModel), 0.06);
  const Wo = tieWeights ? null : fillRand(new Float32Array(dModel * vocabSize), 0.06);
  const b = zeros(vocabSize);

  const opt = {
    t: 0,
    E: createAdamStateLike(E),
    P: createAdamStateLike(P),
    Wq: createAdamStateLike(Wq),
    Wk: createAdamStateLike(Wk),
    Wv: createAdamStateLike(Wv),
    b: createAdamStateLike(b),
  };
  if (!tieWeights) opt.Wo = createAdamStateLike(Wo);

  return { vocabSize, dModel, tieWeights, residual, E, P, Wq, Wk, Wv, Wo, b, opt };
}

export function forward(model, xIds) {
  const T = xIds.length;
  const d = model.dModel;
  const V = model.vocabSize;
  const scale = 1 / Math.sqrt(d);

  const X = new Float32Array(T * d);
  const Q = new Float32Array(T * d);
  const K = new Float32Array(T * d);
  const Vv = new Float32Array(T * d);
  const S = new Float32Array(T * T);
  const P = new Float32Array(T * T);
  const O = new Float32Array(T * d);
  const logits = new Float32Array(T * V);

  for (let t = 0; t < T; t++) {
    const id = xIds[t];
    const eOff = id * d;
    const pOff = t * d;
    const xOff = t * d;
    for (let j = 0; j < d; j++) X[xOff + j] = model.E[eOff + j] + model.P[pOff + j];
  }

  matmul(X, T, d, model.Wq, d, Q);
  matmul(X, T, d, model.Wk, d, K);
  matmul(X, T, d, model.Wv, d, Vv);

  for (let i = 0; i < T; i++) {
    const qi = i * d;
    const sRow = i * T;
    for (let j = 0; j < T; j++) {
      if (j > i) { S[sRow + j] = -1e9; continue; }
      const kj = j * d;
      let dot = 0;
      for (let k = 0; k < d; k++) dot += Q[qi + k] * K[kj + k];
      S[sRow + j] = dot * scale;
    }
  }

  P.set(S);
  for (let i = 0; i < T; i++) softmaxRowInPlace(P, i * T, T);

  for (let i = 0; i < T; i++) {
    const oOff = i * d;
    const pOff = i * T;
    for (let k = 0; k < d; k++) {
      let sum = 0;
      for (let j = 0; j < T; j++) sum += P[pOff + j] * Vv[j * d + k];
      O[oOff + k] = sum;
    }
  }

  if (model.residual) {
    for (let i = 0; i < O.length; i++) O[i] += X[i];
  }

  if (model.tieWeights) {
    for (let t = 0; t < T; t++) {
      const oOff = t * d;
      const lOff = t * V;
      for (let v = 0; v < V; v++) {
        const eOff = v * d;
        let sum = 0;
        for (let i = 0; i < d; i++) sum += O[oOff + i] * model.E[eOff + i];
        logits[lOff + v] = sum;
      }
    }
  } else {
    matmul(O, T, d, model.Wo, V, logits);
  }
  addBiasRows(logits, T, V, model.b);

  return { X, Q, K, Vv, P, O, logits };
}

export function lossAndGradLogits(logits, targets, padId, labelSmooth = 0) {
  const T = targets.length;
  const V = logits.length / T;
  const dlogits = new Float32Array(logits.length);
  let loss = 0, count = 0;
  const ls = Math.max(0, Math.min(0.2, labelSmooth || 0));

  for (let t = 0; t < T; t++) {
    const y = targets[t];
    if (y === padId) continue;
    const off = t * V;

    let max = -1e30;
    for (let i = 0; i < V; i++) max = Math.max(max, logits[off + i]);
    let sum = 0;
    for (let i = 0; i < V; i++) sum += Math.exp(logits[off + i] - max);

    const logProb = (logits[off + y] - max) - Math.log(sum + 1e-12);
    loss += -logProb;
    count++;

    for (let i = 0; i < V; i++) dlogits[off + i] = Math.exp(logits[off + i] - max) / (sum + 1e-12);

    if (ls > 0 && V > 1) {
      const qOther = ls / (V - 1);
      for (let i = 0; i < V; i++) if (i !== y) dlogits[off + i] -= qOther;
      dlogits[off + y] -= (1 - ls);
    } else {
      dlogits[off + y] -= 1;
    }
  }

  const inv = 1 / Math.max(1, count);
  loss *= inv;
  for (let i = 0; i < dlogits.length; i++) dlogits[i] *= inv;
  return { loss, dlogits };
}

export function lossOnly(logits, targets, padId) {
  const T = targets.length;
  const V = logits.length / T;
  let loss = 0, count = 0;

  for (let t = 0; t < T; t++) {
    const y = targets[t];
    if (y === padId) continue;
    const off = t * V;

    let max = -1e30;
    for (let i = 0; i < V; i++) max = Math.max(max, logits[off + i]);
    let sum = 0;
    for (let i = 0; i < V; i++) sum += Math.exp(logits[off + i] - max);

    const logProb = (logits[off + y] - max) - Math.log(sum + 1e-12);
    loss += -logProb;
    count++;
  }

  return loss / Math.max(1, count);
}

export function applyGlobalClip(grads, clip) {
  const clipOn = isFinite(clip) && clip > 0;
  let sumSq = 0;
  for (const g of grads) {
    for (let i = 0; i < g.length; i++) {
      const v = g[i];
      if (!isFinite(v)) return { norm: NaN, scale: NaN, clipped: false, nonFinite: true };
      sumSq += v * v;
    }
  }
  const norm = Math.sqrt(sumSq);
  if (!clipOn || norm <= clip || norm === 0) return { norm, scale: 1, clipped: false, nonFinite: false };
  const scale = clip / (norm + 1e-12);
  for (const g of grads) for (let i = 0; i < g.length; i++) g[i] *= scale;
  return { norm, scale, clipped: true, nonFinite: false };
}

export function adamUpdate(param, grad, state, lr, t, weightDecay = 0, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
  const m = state.m, v = state.v;
  const b1t = 1 - Math.pow(beta1, t);
  const b2t = 1 - Math.pow(beta2, t);
  const lrT = lr * Math.sqrt(b2t) / (b1t + 1e-12);
  const wd = Math.max(0, weightDecay || 0);

  for (let i = 0; i < param.length; i++) {
    const g = grad[i];
    m[i] = beta1 * m[i] + (1 - beta1) * g;
    v[i] = beta2 * v[i] + (1 - beta2) * g * g;
    param[i] -= lrT * (m[i] / (Math.sqrt(v[i]) + eps));
    if (wd) param[i] -= lr * wd * param[i];
  }
}

export function sgdUpdate(param, grad, lr, weightDecay = 0) {
  const wd = Math.max(0, weightDecay || 0);
  for (let i = 0; i < param.length; i++) {
    param[i] -= lr * grad[i];
    if (wd) param[i] -= lr * wd * param[i];
  }
}
