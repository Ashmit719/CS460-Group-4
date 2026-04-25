
import {
  MAX_BLOCK,
  clampInt,
  clamp01,
  createModel,
  forward,
  lossAndGradLogits,
  lossOnly,
  applyGlobalClip,
  adamUpdate,
  sgdUpdate,
} from "./model.js";
import {
  PAD,
  EOS,
  stoi,
  itos,
  tokenizer,
  normalizeText,
  buildCharVocab,
  buildBpeVocab,
  encodeText,
  decodeIds,
} from "./tokenizer.js";
import {
  detectDatasetKind,
  detectChatTags,
  detectSpeakerTag,
  getTrainPreset,
  getGenPreset,
  getSpeedPreset,
} from "./presets.js";

let ui = null;

let model = null;
let TRAIN_IDS = null;
let VAL_IDS = null;

let isTraining = false;
let isApplyingData = false;
let stepCount = 0;
let tickCount = 0;
const lossHistory = [];
let liveTimer = null;

let stepsPerSecEMA = 0;
let trainLossEMA = NaN;
let valLossEMA = NaN;
let learnTrendEMA = 0;

const GOBBLE_BUCKET = 256;
let gobbleBuckets = null;
let gobbleSeenBuckets = 0;
let trainTokensSeen = 0;
let plateauUIStreak = 0;
let lastClipInfo = { norm: NaN, scale: 1, clipped: false };
let lastLR = NaN;
let lastLossRaw = NaN;
let lastSampleStart = 0;
let lastGenStats = null;

let lastNormalizedData = "";
let lastDatasetKind = "mixed";
let samplePrompts = [];
const sampleHistory = [];

function setStatus(msg, kind = "ok") {
  if (!ui || !ui.status) return;
  const prefix = kind === "bad" ? "ERROR: " : (kind === "warn" ? "WARN: " : "");
  ui.status.textContent = prefix + msg;
}

function fmtLoss(x) { return isFinite(x) ? x.toFixed(4) : "-"; }
function fmtPplFromLoss(loss) { return isFinite(loss) ? Math.exp(Math.min(20, loss)).toFixed(2) : "-"; }

function pulseOnce(el) {
  if (!el) return;
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
  setTimeout(() => el && el.classList && el.classList.remove("pulse"), 260);
}

function stageFromQuality(q) {
  if (!isFinite(q)) return "stage: -";
  if (q < 0.10) return "stage: Confused";
  if (q < 0.28) return "stage: Starting to recognize patterns";
  if (q < 0.45) return "stage: Getting consistent";
  return "stage: Strong patterns";
}

function resetGobbled() {
  const n = TRAIN_IDS ? TRAIN_IDS.length : 0;
  const buckets = Math.max(1, Math.ceil(n / GOBBLE_BUCKET));
  gobbleBuckets = new Uint8Array(buckets);
  gobbleSeenBuckets = 0;
  trainTokensSeen = 0;
  plateauUIStreak = 0;
  updateGobbledUI();
}

function markGobbled(start, len) {
  if (!gobbleBuckets || !TRAIN_IDS || TRAIN_IDS.length === 0) return;
  if (!isFinite(start) || !isFinite(len) || len <= 0) return;
  const end = Math.min(TRAIN_IDS.length, start + len);
  const b0 = Math.floor(start / GOBBLE_BUCKET);
  const b1 = Math.floor(Math.max(0, end - 1) / GOBBLE_BUCKET);
  for (let b = b0; b <= b1; b++) {
    if (gobbleBuckets[b] === 0) { gobbleBuckets[b] = 1; gobbleSeenBuckets++; }
  }
}

function updateGobbledUI() {
  const n = TRAIN_IDS ? TRAIN_IDS.length : 0;
  if (!n || !gobbleBuckets) {
    if (ui && ui.gobbleMeter) ui.gobbleMeter.style.width = "0%";
    if (ui && ui.gobblePct) ui.gobblePct.textContent = "0%";
    if (ui && ui.epochs) ui.epochs.textContent = "0.00";
    if (ui && ui.plateau) ui.plateau.textContent = "-";
    if (ui && ui.epochEta) ui.epochEta.textContent = "-";
    return;
  }

  const cov = gobbleBuckets.length ? (gobbleSeenBuckets / gobbleBuckets.length) : 0;
  const pct = Math.round(cov * 100);
  if (ui && ui.gobbleMeter) ui.gobbleMeter.style.width = `${pct}%`;
  if (ui && ui.gobblePct) ui.gobblePct.textContent = `${pct}%`;

  const epochs = trainTokensSeen / Math.max(1, n);
  if (ui && ui.epochs) ui.epochs.textContent = epochs.toFixed(2);

  const useLoss = isFinite(valLossEMA) ? valLossEMA : trainLossEMA;
  const trending = Math.abs(learnTrendEMA) >= 0.0002;
  const canJudge = isFinite(useLoss) && stepCount > 600;
  if (canJudge && !trending) plateauUIStreak++;
  else plateauUIStreak = 0;

  const plateau = plateauUIStreak >= 10;
  if (ui && ui.plateau) {
    if (!canJudge) ui.plateau.textContent = "warming up";
    else if (plateau) ui.plateau.textContent = (cov > 0.92 ? "yes (try new data)" : "yes");
    else ui.plateau.textContent = "no";
  }

  if (ui && ui.epochEta) {
    if (!stepsPerSecEMA || !isFinite(stepsPerSecEMA)) {
      ui.epochEta.textContent = "-";
    } else {
      const tokensPerStep = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);
      const remaining = Math.max(0, n - (trainTokensSeen % n));
      const secs = remaining / Math.max(1, stepsPerSecEMA * tokensPerStep);
      const mins = Math.max(0, secs / 60);
      ui.epochEta.textContent = mins < 1 ? `${secs.toFixed(0)}s` : `${mins.toFixed(1)}m`;
    }
  }
}

function f32Summary(name, a) {
  if (!a) return `${name}: (null)`;
  const n = a.length | 0;
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, absMax = 0;
  let nan = 0, inf = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    if (!isFinite(x)) { if (Number.isNaN(x)) nan++; else inf++; continue; }
    if (x < min) min = x;
    if (x > max) max = x;
    const ax = Math.abs(x);
    if (ax > absMax) absMax = ax;
    sum += x;
    sumSq += x * x;
  }
  const denom = Math.max(1, n - nan - inf);
  const rms = Math.sqrt(sumSq / denom);
  const minStr = (min !== Infinity) ? min.toFixed(4) : "-";
  const maxStr = (max !== -Infinity) ? max.toFixed(4) : "-";
  return `${name}: n=${n} rms=${rms.toFixed(5)} absMax=${absMax.toFixed(4)} min=${minStr} max=${maxStr} nan=${nan} inf=${inf}`;
}

function hasNonFiniteArray(a) {
  if (!a) return false;
  for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) return true;
  return false;
}

function modelHasNonFinite(m) {
  if (!m) return true;
  if (hasNonFiniteArray(m.E)) return true;
  if (hasNonFiniteArray(m.P)) return true;
  if (hasNonFiniteArray(m.Wq)) return true;
  if (hasNonFiniteArray(m.Wk)) return true;
  if (hasNonFiniteArray(m.Wv)) return true;
  if (!m.tieWeights && hasNonFiniteArray(m.Wo)) return true;
  if (hasNonFiniteArray(m.b)) return true;
  return false;
}

function makeDebugSnapshot() {
  const lines = [];
  const now = new Date();

  lines.push(`time: ${now.toLocaleString()}`);
  lines.push(`training: ${isTraining ? "on" : "off"} | step=${stepCount} tick=${tickCount} | ~${stepsPerSecEMA.toFixed(1)} steps/s`);
  lines.push(`speed: stepsPerTick=${ui.stepsPerTick.value} budgetMs=${ui.budgetMs.value} uiEvery=${ui.uiEvery.value}`);

  const V = model ? model.vocabSize : 0;
  const d = model ? model.dModel : 0;
  lines.push(`model: vocab=${V} d_model=${d} tieWeights=${model ? !!model.tieWeights : false} residual=${model ? !!model.residual : false}`);
  lines.push(`tokenizer: mode=${tokenizer ? tokenizer.mode : "?"} merges=${tokenizer && tokenizer.merges ? tokenizer.merges.length : 0}`);

  const blockSize = clampInt(parseInt(ui.blockSize.value, 10) || 0, 16, MAX_BLOCK);
  const lr0 = parseFloat(ui.lr.value);
  const decay = parseFloat(ui.decay.value);
  const warmup = clampInt(parseInt(ui.warmup.value, 10), 0, 200000);
  const wd = Math.max(0, parseFloat(ui.wd.value) || 0);
  const labelSmooth = Math.max(0, Math.min(0.2, parseFloat(ui.labelSmooth.value) || 0));
  const clip = parseFloat(ui.clip.value);
  let lr = decay > 0 ? (lr0 / (1 + decay * stepCount)) : lr0;
  if (warmup > 0) lr *= Math.min(1, (stepCount + 1) / warmup);
  lines.push(`train: block=${blockSize} optim=${ui.optim.value} lr_now=${lr.toFixed(6)} (last=${isFinite(lastLR) ? lastLR.toFixed(6) : "-"}) wd=${wd} labelSmooth=${labelSmooth} clip=${isFinite(clip) && clip > 0 ? clip : "off"}`);

  lines.push(`loss: train=${fmtLoss(trainLossEMA)} val=${fmtLoss(valLossEMA)} trendEMA=${learnTrendEMA.toExponential(2)}`);
  lines.push(`grad: norm=${isFinite(lastClipInfo.norm) ? lastClipInfo.norm.toFixed(3) : "-"} clipped=${lastClipInfo.clipped ? "yes" : "no"} scale=${isFinite(lastClipInfo.scale) ? lastClipInfo.scale.toFixed(3) : "-"}`);

  const nTrain = TRAIN_IDS ? TRAIN_IDS.length : 0;
  const cov = (gobbleBuckets && gobbleBuckets.length) ? (gobbleSeenBuckets / gobbleBuckets.length) : 0;
  lines.push(`data: trainChars=${nTrain} valChars=${VAL_IDS ? VAL_IDS.length : 0} coverage=${Math.round(cov * 100)}% epochs~=${(nTrain ? (trainTokensSeen / nTrain) : 0).toFixed(2)} plateau=${ui.plateau ? ui.plateau.textContent : "-"}`);

  if (lastGenStats && lastGenStats.steps) {
    const temp = parseFloat(ui.temp.value);
    const topK = parseInt(ui.topK.value, 10);
    const topP = parseFloat(ui.topP.value);
    const repPenalty = parseFloat(ui.repPenalty.value);
    const noRepeatNgram = parseInt(ui.noRepeatNgram.value, 10);
    lines.push(`gen: temp=${temp} topK=${topK} topP=${topP} repPenalty=${repPenalty} noRepeatNgram=${noRepeatNgram} greedy=${ui.greedy.checked ? "on" : "off"}`);
    lines.push(`gen: avgPeak=${Math.round(lastGenStats.avgPeak * 100)}% lastPeak=${Math.round(lastGenStats.lastPeak * 100)}% minPeak=${Math.round(lastGenStats.minPeak * 100)}% steps=${lastGenStats.steps}`);
  } else {
    lines.push("gen: (no recent generation)");
  }

  if (model) {
    lines.push("");
    lines.push("weights:");
    lines.push(f32Summary("E", model.E));
    lines.push(f32Summary("P", model.P));
    lines.push(f32Summary("Wq", model.Wq));
    lines.push(f32Summary("Wk", model.Wk));
    lines.push(f32Summary("Wv", model.Wv));
    if (!model.tieWeights) lines.push(f32Summary("Wo", model.Wo));
    lines.push(f32Summary("b", model.b));
  }

  lines.push("");
  lines.push("tuning hints:");
  if (lastClipInfo.clipped && isFinite(lastClipInfo.scale) && lastClipInfo.scale < 0.25) {
    lines.push("- clipping hard: lower LR and/or raise clip slightly");
  } else if (isFinite(trainLossEMA) && isFinite(valLossEMA) && valLossEMA > trainLossEMA + 0.20) {
    lines.push("- overfitting: add data, lower d_model, or stop when val loss stops improving");
  } else if (isFinite(learnTrendEMA) && Math.abs(learnTrendEMA) < 0.0002 && stepCount > 1200) {
    lines.push("- plateau: try new data, bigger model, or different LR");
  } else {
    lines.push("- keep going; watch val loss and confidence");
  }

  return lines.join("\n");
}

function updateLearningMeter() {
  const V = model ? model.vocabSize : 0;
  const baseline = V > 1 ? Math.log(V) : NaN;
  const useVal = isFinite(valLossEMA);
  const useLoss = useVal ? valLossEMA : trainLossEMA;

  if (!isFinite(useLoss) || !isFinite(baseline) || baseline <= 0) {
    if (ui && ui.learnPct) ui.learnPct.textContent = "0%";
    if (ui && ui.learnExplain) ui.learnExplain.textContent = "quality ~= 1 - loss / ln(vocab)";
    if (ui && ui.ppl) ui.ppl.textContent = "-";
    if (ui && ui.lossStage) ui.lossStage.textContent = "stage: -";
    if (ui && ui.learnStage) ui.learnStage.textContent = "stage: -";
    if (ui && ui.learnGauge) {
      ui.learnGauge.style.width = "0%";
      ui.learnGauge.style.background = "linear-gradient(90deg, #4d8fff 0%, #74c7ff 45%, #b6f5ff 100%)";
    }
    return;
  }

  const rawQuality = clamp01(1 - (useLoss / baseline));
  const quality = Math.sqrt(rawQuality);
  const pct = Math.round(quality * 100);
  if (ui && ui.learnPct) ui.learnPct.textContent = `${pct}%`;
  if (ui && ui.ppl) ui.ppl.textContent = fmtPplFromLoss(useLoss);
  const stage = stageFromQuality(rawQuality);
  if (ui && ui.lossStage) ui.lossStage.textContent = stage;
  if (ui && ui.learnStage) ui.learnStage.textContent = stage;

  let trend = "flat";
  if (learnTrendEMA > 0.0005) trend = "improving";
  else if (learnTrendEMA < -0.0005) trend = "worsening";

  if (ui && ui.learnExplain) {
    ui.learnExplain.textContent = `signal from ${useVal ? "val" : "train"} loss against ln(vocab)=${baseline.toFixed(2)}; trend=${trend}`;
  }

  if (ui && ui.learnGauge) {
    ui.learnGauge.style.width = `${pct}%`;
    ui.learnGauge.style.background = `linear-gradient(90deg, #4d8fff 0%, #74c7ff ${Math.max(35, pct)}%, #b6f5ff 100%)`;
  }
}

function drawLoss() {
  if (!ui || !ui.lossPlot) return;
  const c = ui.lossPlot;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.strokeStyle = "#2a3a5a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 12);
  ctx.lineTo(40, c.height - 28);
  ctx.lineTo(c.width - 12, c.height - 28);
  ctx.stroke();

  const n = lossHistory.length;
  if (n < 2) return;

  let min = Infinity, max = -Infinity;
  for (const v of lossHistory) { min = Math.min(min, v); max = Math.max(max, v); }

  const x0 = 40, y0 = 12, x1 = c.width - 12, y1 = c.height - 28;
  const w = x1 - x0, h = y1 - y0;

  ctx.strokeStyle = "#63c5ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = x0 + (i / (n - 1)) * w;
    const t = (lossHistory[i] - min) / ((max - min) + 1e-12);
    const y = y1 - t * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#93a4c7";
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(`min ${min.toFixed(3)}`, 44, 22);
  ctx.fillText(`max ${max.toFixed(3)}`, 44, 38);

  if (model) {
    const V = model.vocabSize;
    const baseline = V > 1 ? Math.log(V) : NaN;
    const useLoss = isFinite(valLossEMA) ? valLossEMA : trainLossEMA;
    if (isFinite(useLoss) && isFinite(baseline) && baseline > 0) {
      const q = clamp01(1 - (useLoss / baseline));
      const stage = stageFromQuality(q).replace("stage: ", "");
      const t = `> ${stage}`;
      const wText = ctx.measureText(t).width;
      ctx.fillText(t, c.width - 12 - wText, 22);
    }
  }
}

function runBaselineEval() {
  if (!TRAIN_IDS || !model) return;
  const blockSize = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);
  trainLossEMA = evalLossOnIds(TRAIN_IDS, blockSize, 2);
  valLossEMA = VAL_IDS ? evalLossOnIds(VAL_IDS, blockSize, 2) : NaN;
  if (ui && ui.loss) ui.loss.textContent = fmtLoss(trainLossEMA);
  if (ui && ui.valLoss) ui.valLoss.textContent = fmtLoss(valLossEMA);
  updateLearningMeter();
}

function updateDatasetRater(raw, normalized, fullLen, trainLen, valLen, vocabSize) {
  if (!ui || !ui.dataRating) return;

  const rawLen = (raw || "").length;
  const normLen = (normalized || "").length;
  const changed = rawLen && raw !== normalized;

  const lines = (normalized || "").split("\n").length;
  const kind = detectDatasetKind(normalized || "");
  const unit = (tokenizer && tokenizer.mode === "bpe") ? "tokens" : "chars";

  const unique = new Set([...(normalized || "")]).size;
  const uniqRatio = normLen ? (unique / normLen) : 0;

  let lengthScore = "too short";
  if (normLen >= 4000) lengthScore = "ok";
  if (normLen >= 15000) lengthScore = "good";
  if (normLen >= 60000) lengthScore = "great";

  const notes = [];
  notes.push(`length: ${normLen} chars (${lines} lines) -> ${lengthScore}`);
  notes.push(`sequence: ${fullLen} ${unit} (incl EOS)`);
  notes.push(`vocab: ${vocabSize} ${unit} (lower is easier to learn)`);
  notes.push(`split: train ${trainLen} / val ${valLen || 0} ${unit}`);

  if (changed) notes.push(`normalize: on (removed/converted ~${Math.max(0, rawLen - normLen)} chars)`);
  if (kind === "chat") {
    const tags = detectChatTags(normalized || "");
    notes.push("format: chat-style detected");
    notes.push(`tip: prompt with "${tags.user}:" and end with "${tags.ai}:" (match casing + spacing)`);
  } else if (kind === "dialogue") {
    const tag = detectSpeakerTag(normalized || "");
    notes.push("format: play/dialogue detected");
    notes.push(`tip: prompt with "${tag || "SPEAKER"}: " to continue in-character`);
  } else if (kind === "code") {
    notes.push("format: code/markup detected");
  } else if (kind === "math") {
    notes.push("format: math-like Q/A detected");
    notes.push("tip: use a pattern like \"Q: ...\\nA:\"");
  } else if (kind === "lyrics") {
    notes.push("format: lyrics/poem detected");
    notes.push("tip: keep line breaks; prompt with a partial line or verse");
  } else if (kind === "prose") {
    notes.push("format: prose detected");
  } else {
    notes.push("format: mixed or unknown (that is fine; try presets)");
  }

  if (tokenizer && tokenizer.mode === "bpe") {
    if (vocabSize > 12000) notes.push("warn: vocab is very large -> slower and harder to learn; consider 1000-4000");
    else if (vocabSize > 6000) notes.push("note: vocab is large -> may need more steps or smaller vocab");
  } else {
    if (vocabSize > 220) notes.push("warn: vocab is very large -> expect slower and more random outputs; keep Normalize on");
    else if (vocabSize > 160) notes.push("note: vocab is large -> training will be harder than simple ASCII text");
  }

  if (uniqRatio > 0.25 && normLen > 2000) notes.push("note: lots of unique characters -> data may be noisy or mixed");
  if (normLen < 800) notes.push("tip: paste more text (a few pages) for the model to learn real patterns");

  ui.dataRating.textContent = notes.join("\n");
  updatePresetRecommendation(normalized || "");
}

function updatePresetRecommendation(normalizedText) {
  lastNormalizedData = normalizedText || "";
  lastDatasetKind = detectDatasetKind(lastNormalizedData);
  if (ui && ui.presetInfo) ui.presetInfo.textContent = `recommended: ${lastDatasetKind}`;
  updateSamplePrompts();
}

function updateSamplePrompts() {
  const data = lastNormalizedData || "";
  const speaker = detectSpeakerTag(data);
  const tags = detectChatTags(data);
  if (lastDatasetKind === "chat") {
    samplePrompts = [
      `${tags.user}: hey\n${tags.ai}:`,
      `${tags.user}: give me three tips for focus\n${tags.ai}:`,
    ];
  } else if (lastDatasetKind === "dialogue") {
    samplePrompts = [
      `${speaker || "SPEAKER"}: `,
      "NARRATOR: ",
    ];
  } else if (lastDatasetKind === "code") {
    samplePrompts = [
      (data.trim().slice(0, 220) || "// ") + "\n",
      "function add(a, b) {\n  return a + b;\n}\n",
    ];
  } else if (lastDatasetKind === "math") {
    samplePrompts = ["Q: 7*8=\nA:", "Q: 12+9=\nA:"];
  } else if (lastDatasetKind === "lyrics") {
    samplePrompts = [
      (data.trim().slice(0, 200) || "") + "\n",
      "Line one of a verse\n",
    ];
  } else if (lastDatasetKind === "prose") {
    samplePrompts = [
      (data.trim().slice(0, 240) || "Chapter 1\n") + "\n",
      "It was a quiet morning when ",
    ];
  } else {
    samplePrompts = [
      "Write something in the same style:\n",
      "Continue:\n",
    ];
  }
}

function setInput(el, value) { if (el) el.value = String(value); }

function applyDatasetPreset(kind) {
  const data = lastNormalizedData || "";
  const { desired, kind: resolved } = getTrainPreset(kind, data, lastDatasetKind);

  const curNormalize = !!ui.normalize.checked;
  const curValSplit = parseInt(ui.valSplit.value, 10);
  const curDModel = model ? model.dModel : clampInt(parseInt(ui.dModel.value, 10), 8, 128);
  const curTie = model ? !!model.tieWeights : !!ui.tieWeights.checked;
  const curResidual = model ? !!model.residual : !!ui.residual.checked;

  const nextValSplit = clampInt(parseInt(desired.valSplit, 10) || 0, 0, 40);
  const nextDModel = clampInt(parseInt(desired.dModel, 10) || curDModel, 8, 128);
  const needsReset =
    (curNormalize !== !!desired.normalize) ||
    ((curValSplit | 0) !== (nextValSplit | 0)) ||
    ((curDModel | 0) !== (nextDModel | 0)) ||
    (curTie !== !!desired.tieWeights) ||
    (curResidual !== !!desired.residual);

  let doReset = false;
  if (needsReset) {
    const msg = isTraining
      ? "This preset changes model/data settings and requires a reset.\n\nOK = stop training + rebuild vocab + reset weights.\nCancel = apply only live knobs."
      : "This preset changes model/data settings.\n\nOK = rebuild vocab + reset weights now.\nCancel = apply only live knobs.";
    doReset = confirm(msg);
    if (doReset && isTraining) {
      isTraining = false;
      ui.btnTrain.disabled = false;
      ui.btnStop.disabled = true;
    }
  }

  setInput(ui.evalEvery, desired.evalEvery);
  setInput(ui.clip, desired.clip);
  setInput(ui.lr, desired.lr);
  setInput(ui.warmup, desired.warmup);
  setInput(ui.decay, desired.decay);
  setInput(ui.wd, desired.wd);
  setInput(ui.labelSmooth, desired.labelSmooth);
  setInput(ui.blockSize, desired.blockSize);

  setInput(ui.temp, desired.temp);
  setInput(ui.topK, desired.topK);
  setInput(ui.topP, desired.topP);
  setInput(ui.repPenalty, desired.repPenalty);
  setInput(ui.noRepeatNgram, desired.noRepeatNgram);
  setInput(ui.maxNew, desired.maxNew);
  ui.greedy.checked = !!desired.greedy;
  ui.normPrompt.checked = !!desired.normPrompt;
  ui.prompt.value = desired.prompt;

  if (doReset) {
    ui.normalize.checked = !!desired.normalize;
    setInput(ui.valSplit, nextValSplit);
    setInput(ui.dModel, nextDModel);
    ui.tieWeights.checked = !!desired.tieWeights;
    ui.residual.checked = !!desired.residual;

    applyDataAndReset();
    ui.output.textContent = "";
    setStatus(`${desired.status} + reset`);
  } else {
    setStatus(needsReset ? `${desired.status} (some settings require reset)` : desired.status, needsReset ? "warn" : undefined);
  }

  updatePresetDiff(desired, resolved);
}

function applyGenPreset(kind) {
  const data = lastNormalizedData || "";
  const { desired, kind: resolved } = getGenPreset(kind, data, lastDatasetKind);
  ui.normPrompt.checked = true;
  ui.greedy.checked = false;

  ui.prompt.value = desired.prompt;
  ui.temp.value = String(desired.temp);
  ui.topK.value = String(desired.topK);
  ui.topP.value = String(desired.topP);
  ui.repPenalty.value = String(desired.repPenalty);
  ui.noRepeatNgram.value = String(desired.noRepeatNgram);
  ui.maxNew.value = String(desired.maxNew);
  ui.greedy.checked = !!desired.greedy;
  ui.normPrompt.checked = !!desired.normPrompt;
  setStatus(desired.status);

  if (ui.presetDiff) {
    ui.presetDiff.textContent = `Output preset: ${resolved}. temp=${desired.temp}, topK=${desired.topK}, topP=${desired.topP}, rep=${desired.repPenalty}`;
  }
}

function applySpeedPreset(kind) {
  const desired = getSpeedPreset(kind || "average");
  setInput(ui.stepsPerTick, desired.stepsPerTick);
  setInput(ui.budgetMs, desired.budgetMs);
  setInput(ui.uiEvery, desired.uiEvery);
  setStatus(desired.status);
  if (ui.presetDiff) {
    ui.presetDiff.textContent = `Speed preset: ${kind}. steps/tick=${desired.stepsPerTick}, budget=${desired.budgetMs}ms, uiEvery=${desired.uiEvery}`;
  }
}

function updatePresetDiff(desired, resolved) {
  if (!ui.presetDiff) return;
  const parts = [
    `Preset: ${resolved}`,
    `lr=${desired.lr}`,
    `block=${desired.blockSize}`,
    `d_model=${desired.dModel}`,
    `wd=${desired.wd}`,
    `smooth=${desired.labelSmooth}`,
  ];
  ui.presetDiff.textContent = parts.join(" | ");
}
function applyDataToCurrentVocab() {
  if (!stoi || !itos) throw new Error("No vocab loaded yet.");

  const raw = ui.data.value || "";
  const text = ui.normalize.checked ? normalizeText(raw) : raw;
  const safeText = text.trim().length ? text : " ";

  const fullIds = encodeText((safeText || "") + EOS);
  const valPct = clamp01(parseFloat(ui.valSplit.value) / 100);
  const split = splitTrainValIds(fullIds, valPct);
  TRAIN_IDS = split.trainIds;
  VAL_IDS = split.valIds;

  if (ui.vocab) ui.vocab.textContent = String(itos.length);
  if (ui.trainChars) ui.trainChars.textContent = String(TRAIN_IDS ? TRAIN_IDS.length : 0);
  if (ui.valChars) ui.valChars.textContent = String(VAL_IDS ? VAL_IDS.length : 0);
  updateDatasetRater(raw, text, fullIds.length, TRAIN_IDS ? TRAIN_IDS.length : 0, VAL_IDS ? VAL_IDS.length : 0, itos.length);

  resetGobbled();
  runBaselineEval();
}

async function applyDataAndResetAsync() {
  if (isApplyingData) return;
  isApplyingData = true;

  try {
    const raw = ui.data.value || "";
    const text = ui.normalize.checked ? normalizeText(raw) : raw;
    const safeText = text.trim().length ? text : "user: hi\nai: hello\n";

    const mode = (ui.tokMode && ui.tokMode.value) ? ui.tokMode.value : "char";
    setStatus(`applying data (${mode})...`);

    if (mode === "bpe") {
      const targetVocab = clampInt(parseInt(ui.bpeVocab.value, 10), 200, 50000);
      ui.bpeVocab.value = String(targetVocab);
      const sampleChars = clampInt(parseInt(ui.bpeSampleChars.value, 10), 20000, 10000000);
      ui.bpeSampleChars.value = String(sampleChars);
      const maxWords = clampInt(parseInt(ui.bpeMaxWords.value, 10), 1000, 400000);
      ui.bpeMaxWords.value = String(maxWords);

      await buildBpeVocab(safeText, { targetVocab, sampleChars, maxWords }, (info) => {
        if (ui && ui.status) {
          const pct = Math.round((info.progress ?? 0) * 100);
          ui.status.textContent = `building BPE: ${pct}% (${info.iter}/${info.maxMerges} merges, ${info.elapsed.toFixed(1)}s)`;
        }
      });
    } else {
      buildCharVocab(safeText);
    }

    const fullIds = encodeText((safeText || "") + EOS);
    const valPct = clamp01(parseFloat(ui.valSplit.value) / 100);
    const split = splitTrainValIds(fullIds, valPct);
    TRAIN_IDS = split.trainIds;
    VAL_IDS = split.valIds;

    if (ui.vocab) ui.vocab.textContent = String(itos.length);
    if (ui.trainChars) ui.trainChars.textContent = String(TRAIN_IDS ? TRAIN_IDS.length : 0);
    if (ui.valChars) ui.valChars.textContent = String(VAL_IDS ? VAL_IDS.length : 0);
    updateDatasetRater(raw, text, fullIds.length, TRAIN_IDS ? TRAIN_IDS.length : 0, VAL_IDS ? VAL_IDS.length : 0, itos.length);

    rebuildModelAndReset();
    runBaselineEval();

    const vWarn = (tokenizer && tokenizer.mode === "bpe") ? 8000 : 180;
    if (itos.length > vWarn) {
      setStatus(`data applied. vocab=${itos.length} (large). Consider smaller BPE vocab and/or more training.`, "warn");
    } else {
      setStatus(`data applied (${mode}), model reset`);
    }
  } finally {
    isApplyingData = false;
  }
}

function applyDataAndReset() {
  applyDataAndResetAsync().catch(err => {
    console.error(err);
    setStatus(err && err.message ? err.message : String(err), "bad");
    isApplyingData = false;
  });
}

function rebuildModelAndReset() {
  const dModel = clampInt(parseInt(ui.dModel.value, 10), 8, 128);
  ui.dModel.value = String(dModel);

  if (!itos) { setStatus("vocab not built yet", "warn"); return; }
  model = createModel(itos.length, dModel, { tieWeights: !!ui.tieWeights.checked, residual: !!ui.residual.checked });

  resetTrainingState();
}

function resetTrainingState() {
  stepCount = 0;
  tickCount = 0;
  stepsPerSecEMA = 0;
  trainLossEMA = NaN;
  valLossEMA = NaN;
  learnTrendEMA = 0;
  sampleHistory.length = 0;
  if (ui && ui.sampleTimeline) ui.sampleTimeline.innerHTML = "";
  resetGobbled();
  lossHistory.length = 0;
  if (ui.step) ui.step.textContent = "0";
  if (ui.loss) ui.loss.textContent = "-";
  if (ui.valLoss) ui.valLoss.textContent = "-";
  if (ui.ppl) ui.ppl.textContent = "-";
  if (ui.confMeter) ui.confMeter.style.width = "0%";
  if (ui.confExplain) ui.confExplain.textContent = "confidence = average softmax peak while generating";
  drawLoss();
  updateLearningMeter();
  updateGobbledUI();
}

function ensureReadyForTrain() {
  if (isApplyingData) throw new Error("Apply data is still running. Please wait.");
  if (!TRAIN_IDS || !itos || !stoi) throw new Error("Click Apply data first (build vocab/tokenizer)." );
  const blockSize = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);
  ui.blockSize.value = String(blockSize);

  if (!model) throw new Error("Model not built yet. Click Apply data first.");
  if (!TRAIN_IDS || TRAIN_IDS.length < 32) {
    throw new Error("Training data too small. Paste more text, then click Apply data.");
  }
}

function sampleWindowFrom(ids, blockSize) {
  if (!ids || ids.length === 0) return { start: 0, slice: new Int32Array(0) };
  if (ids.length <= blockSize) return { start: 0, slice: ids };
  const start = (Math.random() * (ids.length - blockSize)) | 0;
  return { start, slice: ids.subarray(start, start + blockSize) };
}

function splitTrainValIds(ids, valPct) {
  const pct = Math.max(0, Math.min(0.40, valPct || 0));
  if (!ids || ids.length < 256 || pct <= 0) return { trainIds: ids, valIds: null };
  let cut = Math.floor(ids.length * (1 - pct));
  cut = clampInt(cut, 64, ids.length - 64);
  return { trainIds: ids.subarray(0, cut), valIds: ids.subarray(cut) };
}

function evalLossOnIds(ids, blockSize, batches = 6) {
  if (!model || !ids || ids.length < 32) return NaN;
  const T = blockSize;
  const padId = stoi[PAD];
  const reps = clampInt(batches | 0, 1, 40);
  let total = 0, n = 0;

  for (let r = 0; r < reps; r++) {
    const sample = sampleWindowFrom(ids, blockSize).slice;
    const x = new Int32Array(T);
    const y = new Int32Array(T);
    for (let i = 0; i < T; i++) {
      x[i] = (i < sample.length) ? sample[i] : padId;
      y[i] = (i + 1 < sample.length) ? sample[i + 1] : padId;
    }
    const cache = forward(model, x);
    total += lossOnly(cache.logits, y, padId);
    n++;
  }
  return total / Math.max(1, n);
}

function trainStep(sampleIds, blockSize, lr, clip, optimName, weightDecay = 0, labelSmooth = 0) {
  const T = blockSize;
  const d = model.dModel;
  const V = model.vocabSize;
  const padId = stoi[PAD];
  const scale = 1 / Math.sqrt(d);

  const x = new Int32Array(T);
  const y = new Int32Array(T);
  for (let i = 0; i < T; i++) {
    x[i] = (i < sampleIds.length) ? sampleIds[i] : padId;
    y[i] = (i + 1 < sampleIds.length) ? sampleIds[i + 1] : padId;
  }

  const cache = forward(model, x);
  const { loss, dlogits } = lossAndGradLogits(cache.logits, y, padId, labelSmooth);
  if (!isFinite(loss)) throw new Error("Non-finite loss encountered. Lower LR and reset weights.");

  const db = new Float32Array(model.b.length);
  const dWq = new Float32Array(model.Wq.length);
  const dWk = new Float32Array(model.Wk.length);
  const dWv = new Float32Array(model.Wv.length);
  const dE = new Float32Array(model.E.length);
  const dPpos = new Float32Array(model.P.length);

  const dO = new Float32Array(T * d);
  const dAttP = new Float32Array(T * T);
  const dVv = new Float32Array(T * d);
  const dS = new Float32Array(T * T);
  const dQ = new Float32Array(T * d);
  const dK = new Float32Array(T * d);
  const dX = new Float32Array(T * d);

  let dWo = null;
  let dEout = null;

  for (let t = 0; t < T; t++) {
    const off = t * V;
    for (let j = 0; j < V; j++) db[j] += dlogits[off + j];
  }

  if (model.tieWeights) {
    dEout = new Float32Array(model.E.length);
    for (let v = 0; v < V; v++) {
      const eOff = v * d;
      for (let i = 0; i < d; i++) {
        let sum = 0;
        for (let t = 0; t < T; t++) sum += cache.O[t * d + i] * dlogits[t * V + v];
        dEout[eOff + i] = sum;
      }
    }

    for (let t = 0; t < T; t++) {
      const oOff = t * d;
      const lOff = t * V;
      for (let i = 0; i < d; i++) {
        let sum = 0;
        for (let v = 0; v < V; v++) sum += dlogits[lOff + v] * model.E[v * d + i];
        dO[oOff + i] = sum;
      }
    }
  } else {
    dWo = new Float32Array(model.Wo.length);

    for (let i = 0; i < d; i++) {
      const wOff = i * V;
      for (let j = 0; j < V; j++) {
        let sum = 0;
        for (let t = 0; t < T; t++) sum += cache.O[t * d + i] * dlogits[t * V + j];
        dWo[wOff + j] = sum;
      }
    }

    for (let t = 0; t < T; t++) {
      const oOff = t * d;
      const lOff = t * V;
      for (let i = 0; i < d; i++) {
        let sum = 0;
        const wOff = i * V;
        for (let j = 0; j < V; j++) sum += dlogits[lOff + j] * model.Wo[wOff + j];
        dO[oOff + i] = sum;
      }
    }
  }

  for (let i = 0; i < T; i++) {
    const dOi = i * d;
    const dPi = i * T;
    for (let j = 0; j < T; j++) {
      const vj = j * d;
      let dot = 0;
      for (let k = 0; k < d; k++) dot += dO[dOi + k] * cache.Vv[vj + k];
      dAttP[dPi + j] = dot;
    }
  }
  for (let j = 0; j < T; j++) {
    const dVj = j * d;
    for (let k = 0; k < d; k++) {
      let sum = 0;
      for (let i = 0; i < T; i++) sum += cache.P[i * T + j] * dO[i * d + k];
      dVv[dVj + k] = sum;
    }
  }

  for (let i = 0; i < T; i++) {
    const off = i * T;
    let dot = 0;
    for (let j = 0; j < T; j++) dot += dAttP[off + j] * cache.P[off + j];
    for (let j = 0; j < T; j++) {
      let g = cache.P[off + j] * (dAttP[off + j] - dot);
      if (j > i) g = 0;
      dS[off + j] = g;
    }
  }

  for (let i = 0; i < T; i++) {
    const dQi = i * d;
    const sOff = i * T;
    for (let k = 0; k < d; k++) {
      let sum = 0;
      for (let j = 0; j < T; j++) sum += dS[sOff + j] * cache.K[j * d + k];
      dQ[dQi + k] = sum * scale;
    }
  }
  for (let j = 0; j < T; j++) {
    const dKj = j * d;
    for (let k = 0; k < d; k++) {
      let sum = 0;
      for (let i = 0; i < T; i++) sum += dS[i * T + j] * cache.Q[i * d + k];
      dK[dKj + k] = sum * scale;
    }
  }

  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
    let sQ = 0, sK = 0, sV = 0;
    for (let t = 0; t < T; t++) {
      const xij = cache.X[t * d + i];
      sQ += xij * dQ[t * d + j];
      sK += xij * dK[t * d + j];
      sV += xij * dVv[t * d + j];
    }
    dWq[i * d + j] = sQ;
    dWk[i * d + j] = sK;
    dWv[i * d + j] = sV;
  }

  for (let t = 0; t < T; t++) {
    const xOff = t * d;
    for (let i = 0; i < d; i++) {
      let sumQ = 0, sumK = 0, sumV = 0;
      for (let j = 0; j < d; j++) sumQ += dQ[t * d + j] * model.Wq[i * d + j];
      for (let j = 0; j < d; j++) sumK += dK[t * d + j] * model.Wk[i * d + j];
      for (let j = 0; j < d; j++) sumV += dVv[t * d + j] * model.Wv[i * d + j];
      dX[xOff + i] = sumQ + sumK + sumV;
    }
  }

  if (model.residual) {
    for (let i = 0; i < dX.length; i++) dX[i] += dO[i];
  }

  for (let t = 0; t < T; t++) {
    const id = x[t];
    if (id === padId) continue;
    const eOff = id * d;
    const pOff = t * d;
    const xOff = t * d;
    for (let j = 0; j < d; j++) {
      const g = dX[xOff + j];
      dE[eOff + j] += g;
      dPpos[pOff + j] += g;
    }
  }

  if (dEout) for (let i = 0; i < dE.length; i++) dE[i] += dEout[i];

  const grads = [db, dWq, dWk, dWv, dE, dPpos];
  if (dWo) grads.unshift(dWo);
  const clipInfo = applyGlobalClip(grads, clip);
  if (clipInfo && clipInfo.nonFinite) {
    throw new Error("Non-finite gradient encountered. Training stopped to protect weights.");
  }

  if (optimName === "adam") {
    model.opt.t++;
    const tOpt = model.opt.t;
    const wd = Math.max(0, weightDecay || 0);
    adamUpdate(model.E, dE, model.opt.E, lr, tOpt, wd);
    adamUpdate(model.P, dPpos, model.opt.P, lr, tOpt, 0);
    adamUpdate(model.Wq, dWq, model.opt.Wq, lr, tOpt, wd);
    adamUpdate(model.Wk, dWk, model.opt.Wk, lr, tOpt, wd);
    adamUpdate(model.Wv, dWv, model.opt.Wv, lr, tOpt, wd);
    if (!model.tieWeights) adamUpdate(model.Wo, dWo, model.opt.Wo, lr, tOpt, wd);
    adamUpdate(model.b, db, model.opt.b, lr, tOpt, 0);
  } else {
    const wd = Math.max(0, weightDecay || 0);
    sgdUpdate(model.E, dE, lr, wd);
    sgdUpdate(model.P, dPpos, lr, 0);
    sgdUpdate(model.Wq, dWq, lr, wd);
    sgdUpdate(model.Wk, dWk, lr, wd);
    sgdUpdate(model.Wv, dWv, lr, wd);
    if (!model.tieWeights) sgdUpdate(model.Wo, dWo, lr, wd);
    sgdUpdate(model.b, db, lr, 0);
  }

  return { loss, clipInfo };
}

function trainLoop() {
  if (!isTraining) return;

  try {
    ensureReadyForTrain();

    const optimName = (ui.optim.value === "sgd") ? "sgd" : "adam";
    if (ui.optim.value !== optimName) ui.optim.value = optimName;

    const lrRaw = parseFloat(ui.lr.value);
    const lr0 = isFinite(lrRaw) ? Math.max(1e-6, Math.min(1, lrRaw)) : 0.006;
    ui.lr.value = String(lr0);

    const decayRaw = parseFloat(ui.decay.value);
    const decay = isFinite(decayRaw) ? Math.max(0, Math.min(1, decayRaw)) : 0;
    ui.decay.value = String(decay);

    const warmup = clampInt(parseInt(ui.warmup.value, 10), 0, 200000);
    ui.warmup.value = String(warmup);
    const wd = Math.max(0, parseFloat(ui.wd.value) || 0);
    ui.wd.value = String(wd);
    const labelSmooth = Math.max(0, Math.min(0.2, parseFloat(ui.labelSmooth.value) || 0));
    ui.labelSmooth.value = String(labelSmooth);
    const clipRaw = parseFloat(ui.clip.value);
    const clip = isFinite(clipRaw) ? Math.max(0, Math.min(100, clipRaw)) : 1;
    ui.clip.value = String(clip);

    const stepsCap = clampInt(parseInt(ui.stepsPerTick.value, 10), 1, 50000);
    const blockSize = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);

    const budgetMs = clampInt(parseInt(ui.budgetMs.value, 10), 2, 80);
    ui.budgetMs.value = String(budgetMs);

    const uiEvery = clampInt(parseInt(ui.uiEvery.value, 10), 1, 200);
    ui.uiEvery.value = String(uiEvery);

    const evalEvery = clampInt(parseInt(ui.evalEvery.value, 10), 1, 400);
    ui.evalEvery.value = String(evalEvery);

    const t0 = performance.now();
    let lastLoss = NaN;
    let stepsDone = 0;

    while (stepsDone < stepsCap && (performance.now() - t0) < budgetMs) {
      let lr = decay > 0 ? (lr0 / (1 + decay * stepCount)) : lr0;
      if (warmup > 0) lr *= Math.min(1, (stepCount + 1) / warmup);
      if (!isFinite(lr) || lr <= 0) throw new Error("Learning rate became invalid. Check LR/decay/warmup settings.");
      const win = sampleWindowFrom(TRAIN_IDS, blockSize);
      const sample = win.slice;
      const res = trainStep(sample, blockSize, lr, clip, optimName, wd, labelSmooth);
      if (!isFinite(res.loss)) throw new Error("Non-finite loss encountered. Training stopped.");
      lastLoss = res.loss;
      lastLossRaw = res.loss;
      lastClipInfo = res.clipInfo || lastClipInfo;
      lastLR = lr;
      lastSampleStart = win.start;
      trainTokensSeen += sample.length;
      markGobbled(win.start, sample.length);
      stepCount++;
      if ((stepCount & 63) === 0 && modelHasNonFinite(model)) {
        throw new Error("Model weights became non-finite. Training stopped to avoid corruption.");
      }
      stepsDone++;
    }

    tickCount++;

    const dt = Math.max(0.001, performance.now() - t0);
    const sps = (stepsDone / dt) * 1000;
    stepsPerSecEMA = stepsPerSecEMA ? (0.9 * stepsPerSecEMA + 0.1 * sps) : sps;

    if (isFinite(lastLoss)) {
      const prevUse = isFinite(valLossEMA) ? valLossEMA : trainLossEMA;
      trainLossEMA = isFinite(trainLossEMA) ? (0.90 * trainLossEMA + 0.10 * lastLoss) : lastLoss;

      if (VAL_IDS && (tickCount % evalEvery === 0)) {
        const v = evalLossOnIds(VAL_IDS, blockSize, 4);
        if (isFinite(v)) valLossEMA = isFinite(valLossEMA) ? (0.85 * valLossEMA + 0.15 * v) : v;
      }

      const nextUse = isFinite(valLossEMA) ? valLossEMA : trainLossEMA;
      if (isFinite(prevUse) && isFinite(nextUse)) {
        const delta = prevUse - nextUse;
        learnTrendEMA = learnTrendEMA ? (0.90 * learnTrendEMA + 0.10 * delta) : delta;
      }
    }

    if (tickCount % uiEvery === 0) {
      if (ui.step) ui.step.textContent = String(stepCount);

      if (isFinite(trainLossEMA)) {
        if (ui.loss) ui.loss.textContent = fmtLoss(trainLossEMA);
        if (ui.valLoss) ui.valLoss.textContent = fmtLoss(valLossEMA);
        updateLearningMeter();
        updateGobbledUI();

        lossHistory.push(trainLossEMA);
        if (lossHistory.length > 220) lossHistory.shift();
        drawLoss();
        pulseOnce(ui.lossPlot);
        pulseOnce(ui.learnGauge);
        pulseOnce(ui.learningPulse);
        setStatus(`training... steps/tick=${stepsDone}, budget=${budgetMs}ms, ~${stepsPerSecEMA.toFixed(1)} steps/s, quality=${ui.learnPct.textContent}`);
      } else {
        if (ui.loss) ui.loss.textContent = "NaN";
        if (ui.valLoss) ui.valLoss.textContent = "-";
        if (ui.ppl) ui.ppl.textContent = "-";
        updateLearningMeter();
        updateGobbledUI();
        setStatus("loss became NaN. Lower LR (e.g. 0.003-0.006) and/or keep grad clip ~1.0.", "warn");
      }

      if (ui.sampleAuto && ui.sampleAuto.checked && tickCount % evalEvery === 0) {
        captureSamples();
      }
    }
  } catch (err) {
    console.error(err);
    setStatus(err && err.message ? err.message : String(err), "bad");
    isTraining = false;
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
    return;
  }

  setTimeout(trainLoop, 0);
}
function argmax(logits, offset, n) {
  let bestI = 0, bestV = -1e30;
  for (let i = 0; i < n; i++) {
    const v = logits[offset + i];
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return bestI;
}

function sampleTopKTopP(logits, offset, n, temperature, topK, topP) {
  const temp = Math.max(0.05, temperature);
  const k = Math.max(1, Math.min((topK | 0) || n, n));
  const pTarget = Math.max(0, Math.min(1, (topP === undefined || topP === null) ? 1 : +topP));

  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => (logits[offset + b] / temp) - (logits[offset + a] / temp));

  const kk = Math.min(k, n);
  let max = -1e30;
  for (let i = 0; i < kk; i++) max = Math.max(max, logits[offset + idx[i]] / temp);

  const probs = new Float32Array(kk);
  let sum = 0;
  for (let i = 0; i < kk; i++) {
    const e = Math.exp((logits[offset + idx[i]] / temp) - max);
    probs[i] = e;
    sum += e;
  }
  const inv = 1 / (sum + 1e-12);
  for (let i = 0; i < kk; i++) probs[i] *= inv;

  let cut = kk;
  if (pTarget > 0 && pTarget < 1) {
    let cum = 0;
    cut = 0;
    while (cut < kk && cum < pTarget) { cum += probs[cut]; cut++; }
    cut = Math.max(1, cut);
  }

  let sumP = 0;
  for (let i = 0; i < cut; i++) sumP += probs[i];
  let r = Math.random() * sumP;
  for (let i = 0; i < cut; i++) {
    r -= probs[i];
    if (r <= 0) return idx[i];
  }
  return idx[cut - 1];
}

function softmaxPeakStats(logits, offset, n, temperature, chosenId) {
  const temp = Math.max(0.05, temperature);
  let max = -1e30;
  for (let i = 0; i < n; i++) max = Math.max(max, logits[offset + i] / temp);

  let sum = 0;
  let peak = 0;
  let chosenExp = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp((logits[offset + i] / temp) - max);
    sum += e;
    if (e > peak) peak = e;
    if (i === chosenId) chosenExp = e;
  }
  const inv = 1 / (sum + 1e-12);
  return { peakProb: peak * inv, chosenProb: chosenExp * inv };
}

function createGenCache(modelRef, maxLen) {
  const d = modelRef.dModel;
  return {
    t: 0,
    maxLen: maxLen | 0,
    K: new Float32Array((maxLen | 0) * d),
    V: new Float32Array((maxLen | 0) * d),
    x: new Float32Array(d),
    q: new Float32Array(d),
    k: new Float32Array(d),
    v: new Float32Array(d),
    o: new Float32Array(d),
    scores: new Float32Array(maxLen | 0),
    probs: new Float32Array(maxLen | 0),
    logits: new Float32Array(modelRef.vocabSize),
  };
}

function genStepCached(modelRef, cache, id) {
  const d = modelRef.dModel;
  const V = modelRef.vocabSize;
  const t = cache.t | 0;
  if (t >= cache.maxLen) throw new Error("gen cache overflow (increase blockSize)");

  const eOff = (id | 0) * d;
  const pOff = t * d;
  for (let i = 0; i < d; i++) cache.x[i] = modelRef.E[eOff + i] + modelRef.P[pOff + i];

  for (let j = 0; j < d; j++) {
    let sq = 0, sk = 0, sv = 0;
    const col = j;
    for (let i = 0; i < d; i++) {
      const x = cache.x[i];
      const rowOff = i * d + col;
      sq += x * modelRef.Wq[rowOff];
      sk += x * modelRef.Wk[rowOff];
      sv += x * modelRef.Wv[rowOff];
    }
    cache.q[j] = sq;
    cache.k[j] = sk;
    cache.v[j] = sv;
  }

  const kvOff = t * d;
  cache.K.set(cache.k, kvOff);
  cache.V.set(cache.v, kvOff);
  cache.t = t + 1;

  const scale = 1 / Math.sqrt(d);
  let max = -1e30;
  for (let j = 0; j <= t; j++) {
    const kj = j * d;
    let dot = 0;
    for (let i = 0; i < d; i++) dot += cache.q[i] * cache.K[kj + i];
    const s = dot * scale;
    cache.scores[j] = s;
    if (s > max) max = s;
  }

  let sum = 0;
  for (let j = 0; j <= t; j++) {
    const e = Math.exp(cache.scores[j] - max);
    cache.probs[j] = e;
    sum += e;
  }
  const inv = 1 / (sum + 1e-12);
  for (let j = 0; j <= t; j++) cache.probs[j] *= inv;

  cache.o.fill(0);
  for (let j = 0; j <= t; j++) {
    const vOff = j * d;
    const p = cache.probs[j];
    for (let i = 0; i < d; i++) cache.o[i] += p * cache.V[vOff + i];
  }

  if (modelRef.residual) {
    for (let i = 0; i < d; i++) cache.o[i] += cache.x[i];
  }

  if (modelRef.tieWeights) {
    for (let v = 0; v < V; v++) {
      const eOff2 = v * d;
      let sumLog = 0;
      for (let i = 0; i < d; i++) sumLog += cache.o[i] * modelRef.E[eOff2 + i];
      cache.logits[v] = sumLog + modelRef.b[v];
    }
  } else {
    for (let v = 0; v < V; v++) {
      let sumLog = 0;
      for (let i = 0; i < d; i++) sumLog += cache.o[i] * modelRef.Wo[i * V + v];
      cache.logits[v] = sumLog + modelRef.b[v];
    }
  }

  return cache.logits;
}

function applyRepetitionPenalty(logits, recentIds, penalty) {
  if (!penalty || penalty <= 0) return;
  const seen = new Set(recentIds);
  for (const id of seen) {
    const v = logits[id];
    if (v > 0) logits[id] = v / (1 + penalty);
    else logits[id] = v * (1 + penalty);
  }
}

function buildNoRepeatMap(idsArr, ngramSize, windowSize) {
  const map = new Map();
  const start = Math.max(0, idsArr.length - windowSize);
  for (let i = start; i + ngramSize <= idsArr.length; i++) {
    const prefix = idsArr.slice(i, i + ngramSize - 1).join(",");
    const next = idsArr[i + ngramSize - 1];
    if (!map.has(prefix)) map.set(prefix, new Set());
    map.get(prefix).add(next);
  }
  return map;
}

function sanitizePromptForTokenizer(promptText) {
  const text = promptText || "";
  if (!tokenizer || tokenizer.mode === "bpe") return text;
  return [...text].map(ch => (stoi[ch] === undefined ? " " : ch)).join("");
}

function buildGenCacheFromIds(modelRef, ids, blockSize) {
  const cache = createGenCache(modelRef, blockSize);
  let logits = null;
  const start = Math.max(0, ids.length - blockSize);
  for (let i = start; i < ids.length; i++) logits = genStepCached(modelRef, cache, ids[i]);
  return { cache, logits };
}

function generate(modelRef, promptText, maxNew, temperature, blockSize, topK, topP, greedy, repPenalty = 0, noRepeatNgram = 0) {
  const safe = sanitizePromptForTokenizer(promptText);
  const promptIds = encodeText(safe);
  const padId = stoi[PAD];

  const seedIds = promptIds.length ? promptIds : new Int32Array([stoi[" "] || padId]);
  const ctxIds = seedIds.length > blockSize ? seedIds.subarray(seedIds.length - blockSize) : seedIds;

  const ids = Array.from(ctxIds);
  let { cache, logits } = buildGenCacheFromIds(modelRef, ids, blockSize);
  const out = [];
  let avgPeak = 0, minPeak = 1, lastPeak = 0;
  const ngramWindow = Math.max(64, blockSize);

  for (let t = 0; t < maxNew; t++) {
    if (cache.t >= blockSize) {
      ({ cache, logits } = buildGenCacheFromIds(modelRef, ids, blockSize));
    }
    const stepLogits = logits || genStepCached(modelRef, cache, ids[ids.length - 1]);

    stepLogits[padId] = -1e9;
    applyRepetitionPenalty(stepLogits, ids.slice(Math.max(0, ids.length - 256)), repPenalty);

    let banned = null;
    if (noRepeatNgram > 0 && ids.length >= noRepeatNgram - 1) {
      const map = buildNoRepeatMap(ids, noRepeatNgram, ngramWindow);
      const prefix = ids.slice(ids.length - (noRepeatNgram - 1)).join(",");
      banned = map.get(prefix) || null;
    }

    if (banned && banned.size) {
      for (const id of banned) stepLogits[id] = -1e9;
    }

    let nextId = 0;
    if (greedy) {
      nextId = argmax(stepLogits, 0, modelRef.vocabSize);
    } else {
      nextId = sampleTopKTopP(stepLogits, 0, modelRef.vocabSize, temperature, topK, topP);
    }

    if (banned && banned.size && stepLogits[nextId] <= -1e8) {
      nextId = argmax(stepLogits, 0, modelRef.vocabSize);
    }

    const stats = softmaxPeakStats(stepLogits, 0, modelRef.vocabSize, temperature, nextId);
    avgPeak += stats.peakProb;
    minPeak = Math.min(minPeak, stats.peakProb);
    lastPeak = stats.peakProb;

    ids.push(nextId);
    out.push(nextId);
    if (cache.t >= blockSize) {
      ({ cache, logits } = buildGenCacheFromIds(modelRef, ids, blockSize));
    } else {
      logits = genStepCached(modelRef, cache, nextId);
    }
  }

  const genText = decodeIds(out);
  const text = (promptText || "") + genText;
  const steps = out.length;
  avgPeak = steps ? (avgPeak / steps) : 0;
  return { text, genText, avgPeak, lastPeak, minPeak, steps };
}

function updateQualityCards(output, prompt) {
  if (!ui) return;
  const outTokens = (output || "").trim().split(/\s+/).filter(Boolean);
  const promptTokens = new Set((prompt || "").trim().split(/\s+/).filter(Boolean));
  const unique = new Set(outTokens);

  let repeats = 0;
  const seenPairs = new Set();
  for (let i = 0; i < outTokens.length - 1; i++) {
    const pair = `${outTokens[i]} ${outTokens[i + 1]}`;
    if (seenPairs.has(pair)) repeats++;
    else seenPairs.add(pair);
  }

  let copy = 0;
  for (const tok of outTokens) if (promptTokens.has(tok)) copy++;

  const repRate = outTokens.length > 1 ? (repeats / (outTokens.length - 1)) : 0;
  const novelty = outTokens.length ? (unique.size / outTokens.length) : 0;
  const copyRate = outTokens.length ? (copy / outTokens.length) : 0;

  if (ui.repRate) ui.repRate.textContent = `${Math.round(repRate * 100)}%`;
  if (ui.noveltyRate) ui.noveltyRate.textContent = `${Math.round(novelty * 100)}%`;
  if (ui.copyRate) ui.copyRate.textContent = `${Math.round(copyRate * 100)}%`;
}

function doOneGenerate() {
  try {
    if (isApplyingData) { setStatus("Apply data is running; try Generate again in a moment.", "warn"); return; }
    if (!TRAIN_IDS || !model) { setStatus("Click Apply data first.", "warn"); return; }

    const blockSize = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);
    const maxNew = clampInt(parseInt(ui.maxNew.value, 10), 1, 4000);
    const temp = parseFloat(ui.temp.value);

    const topK = clampInt(parseInt(ui.topK.value, 10), 1, (model ? model.vocabSize : 9999));
    ui.topK.value = String(topK);

    const topP = Math.max(0, Math.min(1, parseFloat(ui.topP.value)));
    ui.topP.value = String(isFinite(topP) ? topP : 1);

    const repPenalty = Math.max(0, parseFloat(ui.repPenalty.value) || 0);
    ui.repPenalty.value = String(repPenalty);

    const noRepeatNgram = clampInt(parseInt(ui.noRepeatNgram.value, 10) || 0, 0, 12);
    ui.noRepeatNgram.value = String(noRepeatNgram);

    const greedy = !!ui.greedy.checked;
    const rawPrompt = ui.prompt.value;
    const prompt = ui.normPrompt.checked ? normalizeText(rawPrompt) : rawPrompt;

    let unknown = 0, total = 0;
    if (!tokenizer || tokenizer.mode !== "bpe") {
      for (const ch of prompt) {
        total++;
        if (stoi[ch] === undefined) unknown++;
      }
    }

    const liveMax = ui.live.checked ? Math.min(maxNew, 220) : maxNew;
    const res = generate(model, prompt, liveMax, temp, blockSize, topK, topP, greedy, repPenalty, noRepeatNgram);
    lastGenStats = res;
    ui.output.textContent = res.text;

    const pct = Math.round((res.avgPeak || 0) * 100);
    if (ui.confMeter) ui.confMeter.style.width = `${pct}%`;
    if (ui.confExplain) {
      ui.confExplain.textContent = res.steps
        ? `confidence = avg peak ${Math.round(res.avgPeak * 100)}% (last ${Math.round(res.lastPeak * 100)}%, min ${Math.round(res.minPeak * 100)}%)${unknown ? ` | prompt unknown ${unknown}/${total}` : ""}`
        : "confidence = average softmax peak while generating";
    }
    pulseOnce(ui.confMeter);
    updateQualityCards(res.genText, prompt);
  } catch (err) {
    console.error(err);
    setStatus(err && err.message ? err.message : String(err), "bad");
  }
}

function startLive() {
  stopLive();
  const ms = clampInt(parseInt(ui.liveMs.value, 10), 150, 5000);
  ui.liveMs.value = String(ms);

  liveTimer = setInterval(() => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => doOneGenerate(), { timeout: 120 });
    else setTimeout(doOneGenerate, 0);
  }, ms);
}

function stopLive() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

function captureSamples() {
  if (!model || !TRAIN_IDS) return;
  const blockSize = clampInt(parseInt(ui.blockSize.value, 10), 16, MAX_BLOCK);
  const maxNew = Math.min(120, clampInt(parseInt(ui.maxNew.value, 10), 1, 4000));
  const temp = parseFloat(ui.temp.value);
  const topK = clampInt(parseInt(ui.topK.value, 10), 1, (model ? model.vocabSize : 9999));
  const topP = Math.max(0, Math.min(1, parseFloat(ui.topP.value)));
  const repPenalty = Math.max(0, parseFloat(ui.repPenalty.value) || 0);
  const noRepeatNgram = clampInt(parseInt(ui.noRepeatNgram.value, 10) || 0, 0, 12);
  const greedy = !!ui.greedy.checked;

  const prompts = samplePrompts.length ? samplePrompts : [ui.prompt.value || "Write something:\n"];
  const now = new Date();

  for (let i = 0; i < Math.min(2, prompts.length); i++) {
    const p = ui.normPrompt.checked ? normalizeText(prompts[i]) : prompts[i];
    const res = generate(model, p, maxNew, temp, blockSize, topK, topP, greedy, repPenalty, noRepeatNgram);
    sampleHistory.unshift({ time: now.toLocaleTimeString(), prompt: p, text: res.genText });
  }

  while (sampleHistory.length > 6) sampleHistory.pop();
  renderSampleTimeline();
}

function renderSampleTimeline() {
  if (!ui || !ui.sampleTimeline) return;
  ui.sampleTimeline.innerHTML = "";
  for (const item of sampleHistory) {
    const el = document.createElement("div");
    el.className = "timeline-item";
    el.innerHTML = `<strong>${item.time}</strong><br><span class="mono">${item.prompt}</span><br>${item.text}`;
    ui.sampleTimeline.appendChild(el);
  }
}

function bindChipGroup(container, valueAttr, onSelect, activeValue) {
  if (!container) return;
  const buttons = Array.from(container.querySelectorAll(".chip"));
  const setActive = (value) => {
    buttons.forEach(btn => {
      const match = btn.getAttribute(valueAttr) === value;
      btn.classList.toggle("active", match);
    });
  };
  if (activeValue) setActive(activeValue);
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute(valueAttr);
      setActive(value);
      onSelect(value);
    });
  });
}

function setDefaultData() {
  ui.data.value = `User: hey
AI: hey. what's up?

User: not much. kinda bored honestly
AI: yeah, that happens. want to talk, build something, or just kill time?

User: maybe build something
AI: cool. coding, design, music, or something else?

User: coding
AI: nice. web, apps, or something experimental?

User: web
AI: frontend, backend, or a mix?

User: frontend
AI: clean UI or something more edgy?

User: edgy
AI: got it. dark theme, motion, glitchy accents, or brutal minimal?

User: dark and glitchy
AI: perfect. do you want a site, a tool, or a game?

User: a site
AI: portfolio, landing page, or something weird?

User: portfolio but not boring
AI: then we avoid corporate vibes. what do you want it to feel like?

User: modern but kind of aggressive
AI: sharp contrast, tight spacing, bold typography, subtle chaos. sound right?

User: yeah
AI: cool. do you want animations or keep it mostly static?

User: animations but smooth
AI: smooth, not distracting. motion with purpose.

User: exactly
AI: alright. one page or multi-page?

User: one page but feels like an app
AI: so SPA-style sections, transitions, no reloads.
`;
}

export function initApp(uiRefs) {
  ui = uiRefs;
  ui.maxBlock.value = String(MAX_BLOCK);

  setDefaultData();

  ui.btnLoadExample.addEventListener("click", () => { setDefaultData(); });

  ui.btnDebug.addEventListener("click", () => {
    try {
      ui.debugOut.textContent = makeDebugSnapshot();
      pulseOnce(ui.debugOut);
      setStatus("debug snapshot captured");
    } catch (err) {
      console.error(err);
      setStatus(err && err.message ? err.message : String(err), "bad");
    }
  });

  ui.btnCopyDebug.addEventListener("click", async () => {
    try {
      const text = (ui.debugOut && ui.debugOut.textContent) ? ui.debugOut.textContent : "";
      if (!text) { setStatus("nothing to copy yet", "warn"); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus("debug copied");
      } else {
        setStatus("clipboard not available in this context", "warn");
      }
    } catch (err) {
      console.error(err);
      setStatus("copy failed (clipboard permissions)", "warn");
    }
  });

  ui.btnTokInfo.addEventListener("click", () => {
    alert(
      "Token-level BPE mode:\n\n" +
      "- Learns a vocabulary of frequent multi-character pieces (subwords).\n" +
      "- Trains next-token prediction on those tokens instead of raw characters.\n" +
      "- Usually gives cleaner words and structure, but Apply data takes longer.\n\n" +
      "Tip: start with vocab 2000 and sample 1,000,000 chars. If Apply data feels slow, lower vocab and sample."
    );
  });

  ui.tokMode.addEventListener("change", () => {
    if (isTraining) {
      setStatus("Stop training before changing tokenizer mode (requires rebuild).", "warn");
      ui.tokMode.value = tokenizer ? tokenizer.mode : "char";
      return;
    }
    setStatus("Tokenizer mode changed. Click Apply data to rebuild vocab and reset weights.", "warn");
  });

  ui.btnApplyData.addEventListener("click", () => {
    isTraining = false;
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
    applyDataAndReset();
    ui.output.textContent = "";
  });

  ui.btnTrain.addEventListener("click", () => {
    try {
      ensureReadyForTrain();
      isTraining = true;
      ui.btnTrain.disabled = true;
      ui.btnStop.disabled = false;
      setStatus("starting training...");
      setTimeout(trainLoop, 0);
    } catch (err) {
      console.error(err);
      setStatus(err && err.message ? err.message : String(err), "bad");
    }
  });

  ui.btnStop.addEventListener("click", () => {
    isTraining = false;
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
    setStatus("stopped");
  });

  ui.btnReset.addEventListener("click", () => {
    isTraining = false;
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
    rebuildModelAndReset();
    runBaselineEval();
    ui.output.textContent = "";
    setStatus("weights reset");
  });

  ui.btnGen.addEventListener("click", doOneGenerate);
  ui.btnPreset.addEventListener("click", () => applyGenPreset(ui.preset.value));

  ui.live.addEventListener("change", () => { ui.live.checked ? startLive() : stopLive(); });
  ui.liveMs.addEventListener("change", () => { if (ui.live.checked) startLive(); });

  ui.dModel.addEventListener("change", () => {
    if (isTraining) {
      setStatus("Stop training before changing d_model (shape change resets weights).", "warn");
      ui.dModel.value = String(model ? model.dModel : clampInt(parseInt(ui.dModel.value, 10), 8, 128));
      return;
    }
    rebuildModelAndReset();
    runBaselineEval();
    setStatus("d_model changed; weights reset");
  });

  ui.tieWeights.addEventListener("change", () => {
    if (isTraining) {
      setStatus("Stop training before changing weight tying (resets weights).", "warn");
      ui.tieWeights.checked = !!(model ? model.tieWeights : ui.tieWeights.checked);
      return;
    }
    rebuildModelAndReset();
    runBaselineEval();
    setStatus("weight tying changed; weights reset");
  });

  ui.residual.addEventListener("change", () => {
    if (isTraining) {
      setStatus("Stop training before changing residual (resets weights).", "warn");
      ui.residual.checked = !!(model ? model.residual : ui.residual.checked);
      return;
    }
    rebuildModelAndReset();
    runBaselineEval();
    setStatus("residual changed; weights reset");
  });

  ui.valSplit.addEventListener("change", () => {
    isTraining = false;
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
    applyDataAndReset();
    ui.output.textContent = "";
    setStatus("validation split changed; data re-applied and model reset");
  });

  ui.evalEvery.addEventListener("change", () => {
    const v = clampInt(parseInt(ui.evalEvery.value, 10), 1, 400);
    ui.evalEvery.value = String(v);
  });

  ui.presetTrain.addEventListener("change", () => {
    applyDatasetPreset(ui.presetTrain.value);
  });

  ui.speedPreset.addEventListener("change", () => {
    applySpeedPreset(ui.speedPreset.value);
  });

  bindChipGroup(ui.trainPresetChips, "data-preset", (value) => {
    ui.presetTrain.value = value;
    applyDatasetPreset(value);
  }, ui.presetTrain.value);

  bindChipGroup(ui.speedPresetChips, "data-speed", (value) => {
    ui.speedPreset.value = value;
    applySpeedPreset(value);
  }, ui.speedPreset.value);

  bindChipGroup(ui.genPresetChips, "data-preset", (value) => {
    ui.preset.value = value;
    applyGenPreset(value);
  }, ui.preset.value);

  ui.btnExport.addEventListener("click", ui.onExport);
  ui.btnImport.addEventListener("click", ui.onImport);

  try {
    applyDataAndReset();
    drawLoss();
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), "bad");
  }
}

export function getModel() { return model; }
export function setModel(newModel) { model = newModel; }
export function getTokenizerMode() { return tokenizer ? tokenizer.mode : "char"; }
export function setTrainingState(opts = {}) {
  if (typeof opts.isTraining === "boolean") isTraining = opts.isTraining;
}

export function resetTrainingStateForImport() {
  resetTrainingState();
}

export function applyDataToCurrentVocabForImport() {
  applyDataToCurrentVocab();
}

export function updateUIAfterImport() {
  drawLoss();
  updateLearningMeter();
  resetGobbled();
  updateGobbledUI();
}

export function handleModelImportReset() {
  isTraining = false;
  if (ui) {
    ui.btnTrain.disabled = false;
    ui.btnStop.disabled = true;
  }
}

export function setUiHandlers(handlers = {}) {
  if (!ui) return;
  ui.onExport = handlers.onExport || (() => {});
  ui.onImport = handlers.onImport || (() => {});
}

export function setUiValuesFromModel(d, tie, residual, mode, vocabSize) {
  if (!ui) return;
  ui.dModel.value = String(d);
  ui.tieWeights.checked = tie;
  ui.residual.checked = residual;
  if (ui.tokMode) ui.tokMode.value = mode;
  if (ui.vocab) ui.vocab.textContent = String(vocabSize);
}

export function getTrainingState() {
  return {
    stepCount,
    tickCount,
    stepsPerSecEMA,
    trainLossEMA,
    valLossEMA,
    learnTrendEMA,
    lossHistory,
    lastClipInfo,
    lastLR,
    lastLossRaw,
    lastGenStats,
  };
}

export function setTrainingStateFromImport() {
  stepCount = 0;
  tickCount = 0;
  stepsPerSecEMA = 0;
  trainLossEMA = NaN;
  valLossEMA = NaN;
  learnTrendEMA = 0;
  lossHistory.length = 0;
}

export function runBaselineEvalForImport() {
  runBaselineEval();
}

export function getUi() { return ui; }
