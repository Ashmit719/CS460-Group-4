import { initApp } from "./train.js";
import { exportModelJSON, downloadJSON, loadModelJSON } from "./storage.js";

const ui = {
  data: document.getElementById("data"),
  btnApplyData: document.getElementById("btnApplyData"),
  btnLoadExample: document.getElementById("btnLoadExample"),
  btnReset: document.getElementById("btnReset"),
  dataRating: document.getElementById("dataRating"),

  normalize: document.getElementById("normalize"),

  tokMode: document.getElementById("tokMode"),
  btnTokInfo: document.getElementById("btnTokInfo"),
  bpeVocab: document.getElementById("bpeVocab"),
  bpeSampleChars: document.getElementById("bpeSampleChars"),
  bpeMaxWords: document.getElementById("bpeMaxWords"),

  presetTrain: document.getElementById("presetTrain"),
  preset: document.getElementById("preset"),
  presetInfo: document.getElementById("presetInfo"),
  presetDiff: document.getElementById("presetDiff"),

  trainPresetChips: document.getElementById("trainPresetChips"),
  speedPresetChips: document.getElementById("speedPresetChips"),
  genPresetChips: document.getElementById("genPresetChips"),

  optim: document.getElementById("optim"),
  lr: document.getElementById("lr"),
  decay: document.getElementById("decay"),
  warmup: document.getElementById("warmup"),
  wd: document.getElementById("wd"),
  labelSmooth: document.getElementById("labelSmooth"),

  stepsPerTick: document.getElementById("stepsPerTick"),
  budgetMs: document.getElementById("budgetMs"),
  uiEvery: document.getElementById("uiEvery"),

  blockSize: document.getElementById("blockSize"),
  dModel: document.getElementById("dModel"),
  clip: document.getElementById("clip"),
  maxBlock: document.getElementById("maxBlock"),
  valSplit: document.getElementById("valSplit"),
  evalEvery: document.getElementById("evalEvery"),
  tieWeights: document.getElementById("tieWeights"),
  residual: document.getElementById("residual"),

  btnTrain: document.getElementById("btnTrain"),
  btnStop: document.getElementById("btnStop"),
  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("btnImport"),
  fileImport: document.getElementById("fileImport"),

  btnDebug: document.getElementById("btnDebug"),
  btnCopyDebug: document.getElementById("btnCopyDebug"),
  debugOut: document.getElementById("debugOut"),

  status: document.getElementById("status"),

  learnGauge: document.getElementById("learnGauge"),
  learnPct: document.getElementById("learnPct"),
  learnStage: document.getElementById("learnStage"),
  learnExplain: document.getElementById("learnExplain"),
  lossStage: document.getElementById("lossStage"),

  gobbleMeter: document.getElementById("gobbleMeter"),
  gobblePct: document.getElementById("gobblePct"),
  epochs: document.getElementById("epochs"),
  plateau: document.getElementById("plateau"),
  epochEta: document.getElementById("epochEta"),

  step: document.getElementById("step"),
  loss: document.getElementById("loss"),
  valLoss: document.getElementById("valLoss"),
  ppl: document.getElementById("ppl"),
  vocab: document.getElementById("vocab"),
  trainChars: document.getElementById("trainChars"),
  valChars: document.getElementById("valChars"),
  lossPlot: document.getElementById("lossPlot"),

  prompt: document.getElementById("prompt"),
  btnPreset: document.getElementById("btnPreset"),
  maxNew: document.getElementById("maxNew"),
  temp: document.getElementById("temp"),
  topK: document.getElementById("topK"),
  topP: document.getElementById("topP"),
  repPenalty: document.getElementById("repPenalty"),
  noRepeatNgram: document.getElementById("noRepeatNgram"),
  normPrompt: document.getElementById("normPrompt"),
  greedy: document.getElementById("greedy"),
  btnGen: document.getElementById("btnGen"),
  live: document.getElementById("live"),
  liveMs: document.getElementById("liveMs"),
  confMeter: document.getElementById("confMeter"),
  confExplain: document.getElementById("confExplain"),
  output: document.getElementById("output"),

  repRate: document.getElementById("repRate"),
  noveltyRate: document.getElementById("noveltyRate"),
  copyRate: document.getElementById("copyRate"),

  sampleAuto: document.getElementById("sampleAuto"),
  sampleTimeline: document.getElementById("sampleTimeline"),
  learningPulse: document.getElementById("learningPulse"),

  speedPreset: document.getElementById("speedPreset"),
};

const advancedToggle = document.getElementById("toggleAdvanced");
if (advancedToggle) {
  advancedToggle.addEventListener("change", () => {
    document.body.dataset.advanced = advancedToggle.checked ? "true" : "false";
  });
}

ui.onExport = () => {
  try {
    const state = exportModelJSON();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJSON(state, `tiny-transformer-model-${stamp}.json`);
    if (ui.status) ui.status.textContent = "model exported";
  } catch (err) {
    console.error(err);
    if (ui.status) ui.status.textContent = err && err.message ? err.message : String(err);
  }
};

ui.onImport = () => {
  ui.fileImport.value = "";
  ui.fileImport.click();
};

ui.fileImport.addEventListener("change", async () => {
  try {
    const file = ui.fileImport.files && ui.fileImport.files[0];
    if (!file) return;
    const text = await file.text();
    const state = JSON.parse(text);
    loadModelJSON(state, ui);
  } catch (err) {
    console.error(err);
    if (ui.status) ui.status.textContent = err && err.message ? err.message : String(err);
  } finally {
    ui.fileImport.value = "";
  }
});

initApp(ui);
window.__appReady = true;
const bootWarning = document.getElementById("bootWarning");
if (bootWarning) bootWarning.style.display = "none";
