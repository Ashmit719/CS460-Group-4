import { PAD, EOS, itos, stoi, tokenizer, setVocabFromItos, setTokenizerFromState } from "./tokenizer.js";
import { MAX_BLOCK, createModel } from "./model.js";
import {
  getModel,
  setModel,
  setUiValuesFromModel,
  resetTrainingStateForImport,
  applyDataToCurrentVocabForImport,
  updateUIAfterImport,
  handleModelImportReset,
  runBaselineEvalForImport,
} from "./train.js";

function u8ToB64(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function b64ToU8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function f32ToB64(f32) { return u8ToB64(new Uint8Array(f32.buffer)); }
function b64ToF32(b64) { return new Float32Array(b64ToU8(b64).buffer); }

export function exportModelJSON() {
  const model = getModel();
  if (!model || !itos || !stoi) throw new Error("No model/vocab to export yet.");
  const V = model.vocabSize;
  const d = model.dModel;
  const tie = !!model.tieWeights;
  const state = {
    format: "tiny-transformer-json",
    version: 2,
    savedAt: new Date().toISOString(),
    config: { vocabSize: V, dModel: d, maxBlock: MAX_BLOCK, tieWeights: tie, residual: !!model.residual },
    tokenizer: {
      mode: tokenizer ? tokenizer.mode : "char",
      merges: (tokenizer && tokenizer.merges) ? tokenizer.merges : [],
    },
    itos: Array.from(itos),
    weights: {
      E: { b64: f32ToB64(model.E), len: model.E.length },
      P: { b64: f32ToB64(model.P), len: model.P.length },
      Wq: { b64: f32ToB64(model.Wq), len: model.Wq.length },
      Wk: { b64: f32ToB64(model.Wk), len: model.Wk.length },
      Wv: { b64: f32ToB64(model.Wv), len: model.Wv.length },
      Wo: tie ? null : { b64: f32ToB64(model.Wo), len: model.Wo.length },
      b: { b64: f32ToB64(model.b), len: model.b.length },
    },
  };
  return state;
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function loadModelJSON(state, ui) {
  if (!state || state.format !== "tiny-transformer-json") throw new Error("Not a supported model JSON file.");
  if (state.version !== 1 && state.version !== 2) throw new Error(`Unsupported model JSON version: ${state.version}`);
  if (!state.config || !state.weights || !Array.isArray(state.itos)) throw new Error("Model JSON is missing required fields.");

  const V = state.config.vocabSize | 0;
  const d = state.config.dModel | 0;
  const tie = !!state.config.tieWeights;
  const residual = !!state.config.residual;
  const maxBlock = state.config.maxBlock | 0;
  if (maxBlock !== MAX_BLOCK) throw new Error(`Model expects maxBlock=${maxBlock}, but this app supports ${MAX_BLOCK}.`);
  if (state.itos.length !== V) throw new Error(`Vocab mismatch: itos has ${state.itos.length}, config says ${V}.`);

  const tokMode = (state.version === 2 && state.tokenizer && state.tokenizer.mode) ? String(state.tokenizer.mode) : "char";
  const merges = (state.version === 2 && state.tokenizer && Array.isArray(state.tokenizer.merges)) ? state.tokenizer.merges : [];

  setVocabFromItos(state.itos);
  if (stoi[PAD] === undefined || stoi[EOS] === undefined) throw new Error("Imported vocab is missing PAD/EOS.");
  if (stoi[" "] === undefined) throw new Error("Imported vocab is missing a space character.");

  setTokenizerFromState(tokMode, merges);

  const model = createModel(V, d, { tieWeights: tie, residual });
  const w = state.weights;

  function loadInto(param, entry, name) {
    if (!entry || !entry.b64) throw new Error(`Missing weights for ${name}.`);
    const arr = b64ToF32(entry.b64);
    if (arr.length !== param.length) throw new Error(`Bad shape for ${name}: got ${arr.length}, expected ${param.length}.`);
    param.set(arr);
  }

  loadInto(model.E, w.E, "E");
  loadInto(model.P, w.P, "P");
  loadInto(model.Wq, w.Wq, "Wq");
  loadInto(model.Wk, w.Wk, "Wk");
  loadInto(model.Wv, w.Wv, "Wv");
  if (!tie) loadInto(model.Wo, w.Wo, "Wo");
  loadInto(model.b, w.b, "b");

  setModel(model);
  resetTrainingStateForImport();
  setUiValuesFromModel(d, tie, residual, tokMode, V);
  updateUIAfterImport();
  applyDataToCurrentVocabForImport();
  runBaselineEvalForImport();

  if (ui && ui.status) ui.status.textContent = "model imported";
  handleModelImportReset();
}
