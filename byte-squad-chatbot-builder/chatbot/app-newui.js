/**
 * app-newui.js
 * Bridge between NEWUI.html and the backend (train.js, storage.js).
 *
 * The approach: build the same `ui` object that initApp(ui) expects,
 * pointing each key to a real DOM element. Elements that exist in
 * the new UI reference their IDs directly; elements that don't exist
 * in the visible UI are created as hidden inputs/selects/divs so the
 * backend can read/write values without crashing.
 */

import { initApp } from "./train.js";
import { exportModelJSON, downloadJSON, loadModelJSON } from "./storage.js";
import { detectDatasetKind } from "./presets.js";
import { normalizeText } from "./tokenizer.js";
import { getGenPreset } from "./presets.js";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Get an existing element or create a hidden one so the backend never sees null. */
function $orHidden(id, tag = "input", attrs = {}) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement(tag);
  el.id = id;
  el.style.display = "none";
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "checked") el.checked = v;
    else el.setAttribute(k, v);
  });
  document.body.appendChild(el);
  return el;
}
function $orDiv(id) { return $orHidden(id, "div"); }
function $orSelect(id, options = []) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement("select");
  el.id = id;
  el.style.display = "none";
  options.forEach(([val, text, sel]) => {
    const o = document.createElement("option");
    o.value = val; o.textContent = text;
    if (sel) o.selected = true;
    el.appendChild(o);
  });
  document.body.appendChild(el);
  return el;
}
function $orCheckbox(id, checked = false) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement("input");
  el.type = "checkbox"; el.id = id; el.checked = checked;
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}
function $orCanvas(id, w = 360, h = 160) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement("canvas");
  el.id = id; el.width = w; el.height = h;
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

/* ------------------------------------------------------------------ */
/* build the `ui` object                                               */
/* ------------------------------------------------------------------ */

const ui = {
  /* ---- dataset --------------------------------------------------- */
  data:            document.getElementById("data"),
  btnApplyData:    document.getElementById("btnApplyData"),
  btnLoadExample:  document.getElementById("btnLoadExample"),
  btnReset:        document.getElementById("btnReset"),
  dataRating:      $orDiv("dataRating"),

  normalize:       $orCheckbox("normalize", true),

  /* ---- tokenizer ------------------------------------------------- */
  tokMode:         $orSelect("tokMode", [["bpe","Token-level BPE",true]]),
  btnTokInfo:      $orHidden("btnTokInfo", "button"),
  bpeVocab:        $orHidden("bpeVocab", "input", { type: "number", value: "2000" }),
  bpeSampleChars:  $orHidden("bpeSampleChars", "input", { type: "number", value: "1000000" }),
  bpeMaxWords:     $orHidden("bpeMaxWords", "input", { type: "number", value: "40000" }),

  /* ---- presets --------------------------------------------------- */
  presetTrain:     $orSelect("presetTrain", [
    ["auto","Auto",true],["chat","Chat"],["dialogue","Dialogue"],
    ["prose","Prose"],["code","Code"],["math","Math"],
    ["lyrics","Lyrics"],["mixed","Mixed"]
  ]),
  preset:          $orSelect("preset", [
    ["auto","Auto",true],["chat","Chat"],["dialogue","Dialogue"],
    ["prose","Prose"],["code","Code"],["math","Math"],
    ["lyrics","Lyrics"],["mixed","Mixed"]
  ]),
  presetInfo:      $orDiv("presetInfo"),
  presetDiff:      $orDiv("presetDiff"),
  trainPresetChips: $orDiv("trainPresetChips"),
  speedPresetChips: $orDiv("speedPresetChips"),
  genPresetChips:   $orDiv("genPresetChips"),

  /* ---- optimizer / training -------------------------------------- */
  optim:           $orSelect("optim", [["adam","Adam",true],["sgd","SGD"]]),
  lr:              document.getElementById("lr"),
  decay:           $orHidden("decay", "input", { type: "number", value: "0.000005" }),
  warmup:          $orHidden("warmup", "input", { type: "number", value: "500" }),
  wd:              $orHidden("wd", "input", { type: "number", value: "0.0008" }),
  labelSmooth:     $orHidden("labelSmooth", "input", { type: "number", value: "0.05" }),

  stepsPerTick:    document.getElementById("stepsPerTick"),
  budgetMs:        document.getElementById("budgetMs"),
  uiEvery:         $orHidden("uiEvery", "input", { type: "number", value: "12" }),

  blockSize:       document.getElementById("blockSize"),
  dModel:          document.getElementById("dModel"),
  clip:            $orHidden("clip", "input", { type: "number", value: "1" }),
  maxBlock:        $orHidden("maxBlock", "input", { type: "number", value: "256" }),
  valSplit:        document.getElementById("valSplit"),
  evalEvery:       $orHidden("evalEvery", "input", { type: "number", value: "25" }),
  tieWeights:      $orCheckbox("tieWeights", true),
  residual:        $orCheckbox("residual", true),

  /* ---- action buttons -------------------------------------------- */
  btnTrain:        document.getElementById("btnTrain"),
  btnStop:         document.getElementById("btnStop"),
  btnExport:       document.getElementById("btnExport"),
  btnImport:       document.getElementById("btnImport"),
  fileImport:      document.getElementById("fileImport"),

  /* ---- debug ----------------------------------------------------- */
  btnDebug:        $orHidden("btnDebug", "button"),
  btnCopyDebug:    $orHidden("btnCopyDebug", "button"),
  debugOut:        $orDiv("debugOut"),

  /* ---- status ---------------------------------------------------- */
  status:          document.getElementById("status"),

  /* ---- learning gauge -------------------------------------------- */
  learnGauge:      document.getElementById("learnGauge"),
  learnPct:        document.getElementById("learnPct"),
  learnStage:      document.getElementById("learnStage"),
  learnExplain:    document.getElementById("learnExplain"),
  lossStage:       document.getElementById("lossStage"),

  /* ---- gobble meter ---------------------------------------------- */
  gobbleMeter:     $orDiv("gobbleMeter"),
  gobblePct:       $orDiv("gobblePct"),
  epochs:          $orDiv("epochs"),
  plateau:         $orDiv("plateau"),
  epochEta:        $orDiv("epochEta"),

  /* ---- live stats ------------------------------------------------ */
  step:            document.getElementById("step"),
  loss:            document.getElementById("loss"),
  valLoss:         document.getElementById("valLoss"),
  vocab:           document.getElementById("vocab"),
  trainChars:      document.getElementById("trainChars"),
  valChars:        document.getElementById("valChars"),
  lossPlot:        $orCanvas("lossPlot"),

  /* ---- generation ------------------------------------------------ */
  prompt:          document.getElementById("prompt"),
  btnPreset:       $orHidden("btnPreset", "button"),
  maxNew:          document.getElementById("maxNew"),
  temp:            document.getElementById("temp"),
  topK:            document.getElementById("topK"),
  topP:            document.getElementById("topP"),
  repPenalty:      document.getElementById("repPenalty"),
  noRepeatNgram:   document.getElementById("noRepeatNgram"),
  normPrompt:      $orCheckbox("normPrompt", true),
  greedy:          $orCheckbox("greedy", false),
  btnGen:          document.getElementById("btnGen"),
  live:            $orCheckbox("live", false),
  liveMs:          $orHidden("liveMs", "input", { type: "number", value: "1200" }),
  confMeter:       $orDiv("confMeter"),
  confExplain:     $orDiv("confExplain"),
  output:          document.getElementById("output"),
  ppl:             document.getElementById("ppl"),

  /* ---- quality cards --------------------------------------------- */
  repRate:         $orDiv("repRate"),
  noveltyRate:     $orDiv("noveltyRate"),
  copyRate:        $orDiv("copyRate"),

  /* ---- sample timeline ------------------------------------------- */
  sampleAuto:      $orCheckbox("sampleAuto", false),
  sampleTimeline:  $orDiv("sampleTimeline"),
  learningPulse:   $orDiv("learningPulse"),

  /* ---- speed preset ---------------------------------------------- */
  speedPreset:     $orSelect("speedPreset", [
    ["slow","Slow"],["average","Average",true],["fast","Fast"]
  ]),
};

/* ------------------------------------------------------------------ */
/* export / import wiring                                              */
/* ------------------------------------------------------------------ */

ui.onExport = () => {
  try {
    const state = exportModelJSON();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJSON(state, `tiny-transformer-model-${stamp}.json`);
    if (ui.status) ui.status.textContent = "model exported";
  } catch (err) {
    console.error(err);
    if (ui.status) ui.status.textContent = err?.message || String(err);
  }
};

ui.onImport = () => {
  ui.fileImport.value = "";
  ui.fileImport.click();
};

ui.fileImport.addEventListener("change", async () => {
  try {
    const file = ui.fileImport.files?.[0];
    if (!file) return;
    const text = await file.text();
    const state = JSON.parse(text);
    loadModelJSON(state, ui);
  } catch (err) {
    console.error(err);
    if (ui.status) ui.status.textContent = err?.message || String(err);
  } finally {
    ui.fileImport.value = "";
  }
});

/* ------------------------------------------------------------------ */
/* wire the new-UI-specific stage animations                           */
/* ------------------------------------------------------------------ */

const datasetStages = [
  { label: "Raw text",  detail: "Paste dataset",  tooltip: "This is the raw text the user pastes in before any processing happens." },
  { label: "Clean",     detail: "Normalize text",  tooltip: "The app tidies spacing, formatting, and noise so the dataset is more consistent." },
  { label: "Split",     detail: "Train / val",     tooltip: "The dataset is split so one part trains the model and another part checks how well it is doing." },
  { label: "Ready",     detail: "Dataset built",   tooltip: "The text is prepared and ready to be used by the model." },
];
const transformerStages = [
  { label: "Prompt",     detail: "Read input",  tooltip: "The model starts by reading the current prompt and context window." },
  { label: "Embed",      detail: "Vectorize",   tooltip: "The tokens are turned into vectors so the model can work with them numerically." },
  { label: "Attention",  detail: "Find context", tooltip: "Attention helps the model decide which earlier tokens matter most for the next prediction." },
  { label: "Next token", detail: "Predict",     tooltip: "The model predicts the next token, adds it to the sequence, and repeats the process." },
];

function stageHTML(stage, i, lit) {
  return `
    <button type="button" class="stage ${lit ? "active" : ""}" aria-label="${stage.label}: ${stage.tooltip}">
      <div class="stage-num">${i + 1}</div>
      <div class="stage-title">${stage.label}</div>
      <div class="stage-detail">${stage.detail}</div>
      <div class="tooltip">${stage.tooltip}</div>
    </button>
  `;
}

let activeStage = 0;
let generationStage = 0;
let buildState = "idle";

if (ui.tokMode) ui.tokMode.value = "bpe";

const dsContainer  = document.getElementById("datasetStages");
const tfContainer  = document.getElementById("transformerStages");
const dsBar        = document.getElementById("datasetBar");
const tfBar        = document.getElementById("transformerBar");
const dsStatus     = document.getElementById("datasetStatus");
const tfStatus     = document.getElementById("transformerStatus");
const dsBadge      = document.getElementById("datasetBadge");
const tfBadge      = document.getElementById("transformerBadge");
const buildPct     = document.getElementById("buildPct");
const buildStateText = document.getElementById("learnBuildState");
const maxNewValue = document.getElementById("maxNewValue");

function setBuildPercent(value) {
  if (!buildPct) return;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  buildPct.textContent = `${pct}%`;
}

function setBuildLabel(text) {
  if (!buildPct) return;
  buildPct.textContent = text;
}

function renderStages() {
  if (!dsContainer || !tfContainer) return;
  const buildPctMatch = (buildPct?.textContent || "").match(/(\d+)%/);
  const realBuildPct = buildPctMatch ? Math.max(0, Math.min(100, parseInt(buildPctMatch[1], 10) || 0)) : null;

  dsContainer.innerHTML = datasetStages.map((s, i) => {
    const lit = i < activeStage || ((buildState === "ready" || buildState === "generating") && i <= activeStage) || (buildState === "building" && i === activeStage);
    return stageHTML(s, i, lit);
  }).join("");

  tfContainer.innerHTML = transformerStages.map((s, i) => {
    const lit = (buildState === "generating" && i <= generationStage) || (buildState !== "generating" && i === 0);
    return stageHTML(s, i, lit);
  }).join("");

  if (dsBar) {
    if (buildState === "building" && realBuildPct !== null) dsBar.style.width = `${realBuildPct}%`;
    else dsBar.style.width = (buildState === "ready" || buildState === "generating") ? "100%" : `${Math.min(((activeStage + 1) / datasetStages.length) * 100, 100)}%`;
  }
  if (tfBar) tfBar.style.width = buildState === "generating" ? `${Math.min(((generationStage + 1) / transformerStages.length) * 100, 100)}%` : (buildState === "ready" ? "25%" : "0%");

  if (buildState === "building") {
    if (!/^(\d+)%$/.test(buildPct?.textContent || "")) {
      setBuildLabel("BUILDING");
    }
    if (buildStateText) buildStateText.textContent = "Building dataset";
    if (dsStatus) dsStatus.textContent = "Preparing dataset";
    if (dsBadge) dsBadge.textContent = "Working";
    if (tfStatus) tfStatus.textContent = "Waiting for prompt";
    if (tfBadge) tfBadge.textContent = "Idle";
  } else if (buildState === "generating") {
    setBuildLabel("READY");
    if (buildStateText) buildStateText.textContent = "Dataset ready";
    if (dsStatus) dsStatus.textContent = "Dataset ready";
    if (dsBadge) dsBadge.textContent = "Ready";
    if (tfStatus) tfStatus.textContent = "Running generation";
    if (tfBadge) tfBadge.textContent = "Live";
  } else if (buildState === "ready") {
    setBuildLabel("READY");
    if (buildStateText) buildStateText.textContent = "Dataset ready";
    if (dsStatus) dsStatus.textContent = "Dataset ready";
    if (dsBadge) dsBadge.textContent = "Ready";
    if (tfStatus) tfStatus.textContent = "Waiting for prompt";
    if (tfBadge) tfBadge.textContent = "Idle";
  } else {
    setBuildLabel("IDLE");
    if (buildStateText) buildStateText.textContent = "Waiting for data";
    if (dsStatus) dsStatus.textContent = "Waiting for text";
    if (dsBadge) dsBadge.textContent = "Idle";
    if (tfStatus) tfStatus.textContent = "Waiting for prompt";
    if (tfBadge) tfBadge.textContent = "Idle";
  }
}

function syncMaxNewDisplay() {
  if (!ui.maxNew || !maxNewValue) return;
  maxNewValue.textContent = `${ui.maxNew.value} TOKENS`;
}

/* Listen for real backend events via MutationObserver on the status div */
function watchStatusForStages() {
  if (!ui.status) return;

  const observer = new MutationObserver(() => {
    const rawText = ui.status.textContent || "";
    const text = rawText.toLowerCase();
    const bpeMatch = rawText.match(/building BPE:\s+(\d+)%/i);

    if (text.includes("applying data") || text.includes("building bpe")) {
      buildState = "building";
      activeStage = 1;
      if (bpeMatch) {
        const pct = Math.max(0, Math.min(100, parseInt(bpeMatch[1], 10) || 0));
        setBuildPercent(pct);
        if (dsBar) dsBar.style.width = `${pct}%`;
      } else {
        setBuildLabel("BUILDING");
      }
      renderStages();
      if (text.includes("applying data")) {
        setTimeout(() => { activeStage = 2; renderStages(); }, 400);
      }
    } else if (text.includes("data applied") || text.includes("model reset") || text.includes("ready")) {
      buildState = "ready";
      activeStage = 3;
      renderStages();

      /* ---- AUTO-PRESET: silently apply optimal gen settings ---- */
      try {
        const raw = ui.data.value || "";
        const normalized = normalizeText(raw);
        const kind = detectDatasetKind(normalized);
        const { desired } = getGenPreset("auto", normalized, kind);

        // Apply generation settings silently (no confirm dialogs)
        ui.temp.value       = String(desired.temp);
        ui.topK.value       = String(desired.topK);
        ui.topP.value       = String(desired.topP);
        ui.repPenalty.value  = String(desired.repPenalty);
        ui.noRepeatNgram.value = String(desired.noRepeatNgram);
        ui.maxNew.value      = String(desired.maxNew);
        syncMaxNewDisplay();
        ui.normPrompt.checked = !!desired.normPrompt;
        ui.greedy.checked     = !!desired.greedy;

        // Set prompt template if user hasn't typed a custom one
        const promptEl = ui.prompt;
        if (!promptEl.value.trim() || promptEl.value === "Ask your chatbot something...") {
          promptEl.value = desired.prompt;
        }
      } catch (e) {
        console.warn("auto-preset skipped:", e);
      }
    } else if (text.includes("training...")) {
      buildState = "ready";
      activeStage = 3;
      renderStages();
    }
  });
  observer.observe(ui.status, { childList: true, characterData: true, subtree: true });
}

/* Hook generate button so the backend runs only after the stage animation completes */
const GENERATE_ANIMATION_MS = 700;
let allowImmediateGenerate = false;
let generateAnimationTimer = null;
let generateStageTimers = [];

function runGenerateAnimation() {
  buildState = "generating";
  activeStage = 3;
  generationStage = 0;
  renderStages();
  generateStageTimers.forEach(clearTimeout);
  generateStageTimers = [
    setTimeout(() => { generationStage = 1; renderStages(); }, 150),
    setTimeout(() => { generationStage = 2; renderStages(); }, 350),
    setTimeout(() => { generationStage = 3; renderStages(); }, 550),
  ];
}

document.getElementById("btnGen")?.addEventListener("click", (event) => {
  if (allowImmediateGenerate) {
    allowImmediateGenerate = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  const btn = event.currentTarget;
  if (btn && "disabled" in btn) btn.disabled = true;

  if (generateAnimationTimer) clearTimeout(generateAnimationTimer);
  runGenerateAnimation();

  generateAnimationTimer = setTimeout(() => {
    buildState = "ready";
    renderStages();
    if (btn && "disabled" in btn) btn.disabled = false;
    allowImmediateGenerate = true;
    btn?.click();
  }, GENERATE_ANIMATION_MS);
}, true);

/* ------------------------------------------------------------------ */
/* advanced panel toggle                                               */
/* ------------------------------------------------------------------ */
const advPanel = document.getElementById("advanced");
const toggleBtn = document.getElementById("toggleAdvanced");
const labBtn = document.getElementById("openLabTop");

function toggleLab() {
  if (!advPanel) return;
  advPanel.classList.toggle("open");
  const open = advPanel.classList.contains("open");
  if (toggleBtn) toggleBtn.textContent = open ? "Hide Advanced" : "Advanced";
  if (labBtn)   labBtn.textContent   = open ? "Close Model Lab" : "Open Model Lab";
}
toggleBtn?.addEventListener("click", toggleLab);
labBtn?.addEventListener("click", toggleLab);

/* ------------------------------------------------------------------ */
/* sync advanced panel inputs → backend hidden inputs                  */
/* ------------------------------------------------------------------ */

function syncAdvancedInputs() {
  // The advanced panel has labeled inputs; map them to the real backend inputs
  const advBody = document.querySelector(".adv-body");
  if (!advBody) return;

  const fields = advBody.querySelectorAll(".field");
  const mapping = {
    "learning rate": "lr",
    "block size": "blockSize",
    "d_model": "dModel",
    "steps per tick": "stepsPerTick",
    "budget ms": "budgetMs",
    "temperature": "temp",
    "top-k": "topK",
    "top-p": "topP",
    "repetition penalty": "repPenalty",
    "no-repeat n-gram": "noRepeatNgram",
    "normalize text": "normalize",
    "sample chars": "bpeSampleChars",
    "validation split": "valSplit",
    "rebuild vocab": null, // no-op
  };

  fields.forEach(field => {
    const labelEl = field.querySelector(".field-label");
    const inputEl = field.querySelector("input");
    if (!labelEl || !inputEl) return;
    const label = labelEl.textContent.trim().toLowerCase();
    const backendId = mapping[label];

    if (backendId && ui[backendId]) {
      // Set the advanced input's value from the backend element's current value
      if (ui[backendId].type === "checkbox") {
        inputEl.value = ui[backendId].checked ? "on" : "off";
      } else {
        inputEl.value = ui[backendId].value;
      }
      // When user types in advanced input, sync to backend
      inputEl.addEventListener("input", () => {
        if (ui[backendId].type === "checkbox") {
          ui[backendId].checked = inputEl.value.toLowerCase() === "on" || inputEl.value === "true" || inputEl.value === "1";
        } else {
          ui[backendId].value = inputEl.value;
        }
        // Trigger change event so backend listeners fire
        ui[backendId].dispatchEvent(new Event("change"));
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* wire the "Save Snapshot" button to export                           */
/* ------------------------------------------------------------------ */
const saveBtn = document.getElementById("btnSaveSnapshot");
if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    ui.onExport();
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

renderStages();
watchStatusForStages();
syncAdvancedInputs();
syncMaxNewDisplay();

initApp(ui);

ui.maxNew?.addEventListener("input", syncMaxNewDisplay);
ui.maxNew?.addEventListener("change", syncMaxNewDisplay);

window.__appReady = true;
const bootWarning = document.getElementById("bootWarning");
if (bootWarning) bootWarning.style.display = "none";
