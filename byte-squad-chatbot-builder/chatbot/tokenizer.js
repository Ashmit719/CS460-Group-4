export const PAD = "\u0000";
export const EOS = "\u0003";
const PAIR_SEP = "\u0001";

export let stoi = null;
export let itos = null;
export let tokenizer = { mode: "char", merges: [], ranks: null, cache: null };

function clampInt(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x | 0));
}

export function normalizeText(s) {
  return (s || "")
    .replace(/\r/g, "")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[^\x09\x0A\x20-\x7E]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function buildCharVocab(text) {
  const set = new Set([PAD, EOS]);
  for (const ch of (text || "")) set.add(ch);
  for (const ch of "User: \nAI:user: \nai:") set.add(ch);
  const chars = Array.from(set).sort();
  stoi = Object.create(null);
  itos = chars;
  for (let i = 0; i < chars.length; i++) stoi[chars[i]] = i;
  tokenizer = { mode: "char", merges: [], ranks: null, cache: null };
  return chars.length;
}

function pairKey(a, b) { return a + PAIR_SEP + b; }

function bpeEncodeWord(word) {
  const w = word || "";
  if (!tokenizer || tokenizer.mode !== "bpe" || !tokenizer.ranks) return Array.from(w);
  if (!tokenizer.cache) tokenizer.cache = new Map();
  const cached = tokenizer.cache.get(w);
  if (cached) return cached;

  let tokens = Array.from(w);
  const ranks = tokenizer.ranks;

  while (tokens.length >= 2) {
    let bestRank = Infinity;
    let bestA = "", bestB = "";
    for (let i = 0; i < tokens.length - 1; i++) {
      const k = pairKey(tokens[i], tokens[i + 1]);
      const r = ranks.get(k);
      if (r !== undefined && r < bestRank) {
        bestRank = r;
        bestA = tokens[i];
        bestB = tokens[i + 1];
      }
    }
    if (bestRank === Infinity) break;
    const merged = bestA + bestB;
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      if (i < tokens.length - 1 && tokens[i] === bestA && tokens[i + 1] === bestB) {
        out.push(merged);
        i++;
      } else {
        out.push(tokens[i]);
      }
    }
    tokens = out;
  }

  tokenizer.cache.set(w, tokens);
  return tokens;
}

function encodeBpe(str) {
  const s = (str || "");
  const ids = [];
  const fallback = (stoi && stoi[" "] !== undefined) ? stoi[" "] : 0;
  let buf = "";

  function flushWord() {
    if (!buf) return;
    const toks = bpeEncodeWord(buf);
    for (const t of toks) {
      const id = stoi[t];
      ids.push(id === undefined ? fallback : id);
    }
    buf = "";
  }

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      flushWord();
      const id = stoi[ch];
      ids.push(id === undefined ? fallback : id);
    } else {
      buf += ch;
    }
  }
  flushWord();
  return new Int32Array(ids);
}

function encodeChar(str) {
  const s = (str || "");
  const out = new Int32Array(s.length);
  const fallback = (stoi && stoi[" "] !== undefined) ? stoi[" "] : 0;
  for (let i = 0; i < s.length; i++) {
    const id = stoi[s[i]];
    out[i] = (id === undefined ? fallback : id);
  }
  return out;
}

export function encodeText(str) {
  if (tokenizer && tokenizer.mode === "bpe") return encodeBpe(str);
  return encodeChar(str);
}

export function decodeIds(ids) {
  let s = "";
  for (let i = 0; i < ids.length; i++) {
    const tok = itos[ids[i]];
    if (tok === PAD || tok === EOS) continue;
    s += tok;
  }
  return s;
}

export async function buildBpeVocab(fullText, opts = {}, onProgress) {
  const text = fullText || "";
  const targetVocab = clampInt(parseInt(opts.targetVocab, 10) || 2000, 200, 50000);
  const sampleChars = clampInt(parseInt(opts.sampleChars, 10) || 1000000, 20000, 10000000);
  const maxWords = clampInt(parseInt(opts.maxWords, 10) || 40000, 1000, 400000);

  const baseSet = new Set();
  for (const ch of text) baseSet.add(ch);
  baseSet.add(PAD);
  baseSet.add(EOS);

  const baseChars = Array.from(baseSet).filter(ch => ch !== PAD && ch !== EOS).sort();
  const sample = text.slice(0, Math.min(sampleChars, text.length));

  const wordCounts = new Map();
  const re = /[^\s]+/g;
  let m;
  while ((m = re.exec(sample)) !== null) {
    const w = m[0];
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    if (wordCounts.size > maxWords) break;
  }

  let entries = Array.from(wordCounts.entries());
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length > maxWords) entries = entries.slice(0, maxWords);

  const words = entries.map(([w, c]) => ({ syms: Array.from(w), count: c }));
  const baseSize = 2 + baseChars.length;
  const maxMerges = Math.max(0, targetVocab - baseSize);
  const merges = [];
  const tStart = performance.now();
  let lastYield = performance.now();

  for (let iter = 0; iter < maxMerges; iter++) {
    const pairCounts = new Map();
    for (const w of words) {
      const s = w.syms;
      for (let i = 0; i < s.length - 1; i++) {
        const k = pairKey(s[i], s[i + 1]);
        pairCounts.set(k, (pairCounts.get(k) || 0) + w.count);
      }
    }

    let bestK = "";
    let bestC = 0;
    for (const [k, c] of pairCounts) {
      if (c > bestC) { bestC = c; bestK = k; }
    }
    if (!bestK) break;

    const parts = bestK.split(PAIR_SEP);
    const a = parts[0];
    const b = parts[1];
    const merged = a + b;
    merges.push([a, b]);

    for (const w of words) {
      const s = w.syms;
      const out = [];
      for (let i = 0; i < s.length; i++) {
        if (i < s.length - 1 && s[i] === a && s[i + 1] === b) {
          out.push(merged);
          i++;
        } else {
          out.push(s[i]);
        }
      }
      w.syms = out;
    }

    if (performance.now() - lastYield > 120) {
      lastYield = performance.now();
      if (onProgress) {
        const elapsed = (performance.now() - tStart) / 1000;
        onProgress({
          iter: iter + 1,
          maxMerges,
          elapsed,
          progress: maxMerges > 0 ? ((iter + 1) / maxMerges) : 1,
          done: false,
        });
      }
      await new Promise(requestAnimationFrame);
    }
  }

  const tokenSet = new Set(baseChars);
  const mergedTokens = [];
  for (const [a, b] of merges) {
    const t = a + b;
    if (!tokenSet.has(t)) { tokenSet.add(t); mergedTokens.push(t); }
  }

  const tokens = [PAD, EOS, ...baseChars, ...mergedTokens];
  stoi = Object.create(null);
  itos = tokens;
  for (let i = 0; i < tokens.length; i++) stoi[tokens[i]] = i;

  const ranks = new Map();
  for (let i = 0; i < merges.length; i++) ranks.set(pairKey(merges[i][0], merges[i][1]), i);
  tokenizer = { mode: "bpe", merges, ranks, cache: new Map() };

  if (onProgress) {
    const elapsed = (performance.now() - tStart) / 1000;
    onProgress({
      iter: merges.length,
      maxMerges,
      elapsed,
      progress: 1,
      done: true,
    });
  }

  return { vocabSize: tokens.length, merges };
}

export function setVocabFromItos(newItos) {
  itos = Array.from(newItos);
  stoi = Object.create(null);
  for (let i = 0; i < itos.length; i++) stoi[itos[i]] = i;
}

export function setTokenizerFromState(mode, merges) {
  if (mode === "bpe") {
    const ranks = new Map();
    for (let i = 0; i < merges.length; i++) {
      const a = merges[i][0];
      const b = merges[i][1];
      if (typeof a === "string" && typeof b === "string") ranks.set(pairKey(a, b), i);
    }
    tokenizer = { mode: "bpe", merges, ranks, cache: new Map() };
  } else {
    tokenizer = { mode: "char", merges: [], ranks: null, cache: null };
  }
}
