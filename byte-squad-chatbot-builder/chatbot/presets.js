export function detectChatTags(text) {
  const s = (text || "");
  const hasLowerUser = /(^|\n)\s*user:\s*/.test(s);
  const hasLowerAI = /(^|\n)\s*ai:\s*/.test(s);
  if (hasLowerUser && hasLowerAI) return { user: "user", ai: "ai" };
  const hasUpperUser = /(^|\n)\s*User:\s*/.test(s);
  const hasUpperAI = /(^|\n)\s*AI:\s*/.test(s);
  if (hasUpperUser && hasUpperAI) return { user: "User", ai: "AI" };
  return { user: "User", ai: "AI" };
}

function detectDialogueStats(text) {
  const s = (text || "");
  const lines = s.split("\n");
  const re = /^\s*([A-Z][A-Z0-9 ]{1,24}):\s/;
  let hits = 0;
  let nonEmpty = 0;
  const counts = new Map();
  for (const line of lines) {
    if (line.trim()) nonEmpty++;
    const m = line.match(re);
    if (!m) continue;
    const tag = m[1].trim();
    hits++;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  let topTag = "";
  let topCount = 0;
  for (const [tag, c] of counts) {
    if (c > topCount) { topCount = c; topTag = tag; }
  }
  const ratio = nonEmpty ? (hits / nonEmpty) : 0;
  return { hits, unique: counts.size, ratio, topTag };
}

export function detectDatasetKind(text) {
  const s = (text || "");
  const hasUser = /(^|\n)\s*(User:|user:)\b/.test(s);
  const hasAI = /(^|\n)\s*(AI:|ai:)\b/.test(s);
  if (hasUser && hasAI) return "chat";

  const dlg = detectDialogueStats(s);
  if (dlg.unique >= 2 && dlg.hits >= 6 && dlg.ratio >= 0.08) return "dialogue";

  const len = Math.max(1, s.length);
  const newlines = (s.match(/\n/g) || []).length / len;
  const braces = (s.match(/[{}()[\];]/g) || []).length;
  const arrows = (s.match(/=>/g) || []).length;
  const codeScore = (braces + 6 * arrows) / len;
  if (codeScore > 0.020 && newlines > 0.004) return "code";

  const digits = (s.match(/[0-9]/g) || []).length;
  const ops = (s.match(/[+\-*/^=]/g) || []).length;
  const qa = /(^|\n)\s*(Q:|A:)\b/i.test(s);
  const mathScore = (digits + 2 * ops) / len;
  if ((qa && mathScore > 0.04) || (mathScore > 0.10 && newlines > 0.004)) return "math";

  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  const avgLine = lines.reduce((a, l) => a + l.length, 0) / Math.max(1, lines.length);
  const shortLines = lines.filter(l => l.length <= 32).length;
  const shortRatio = lines.length ? (shortLines / lines.length) : 0;
  if (lines.length >= 20 && shortRatio > 0.55 && avgLine < 45 && newlines > 0.015) return "lyrics";

  if (avgLine > 55 && newlines < 0.020) return "prose";

  return "mixed";
}

export function detectSpeakerTag(text) {
  const dlg = detectDialogueStats(text || "");
  if (dlg.topTag) return dlg.topTag.trim();
  const m = (text || "").match(/(^|\n)\s*([A-Z][A-Z0-9 ]{2,20}):/);
  return m ? m[2].trim() : "";
}

function tail(text, n) {
  const s = (text || "");
  if (s.length <= n) return s;
  return s.slice(s.length - n);
}

export function getTrainPreset(kind, data, datasetKind) {
  const k = (kind === "auto") ? datasetKind : kind;
  const speaker = detectSpeakerTag(data);
  const tags = detectChatTags(data);

  const desired = {
    normalize: true,
    valSplit: 10,
    dModel: 112,
    tieWeights: true,
    residual: true,
    evalEvery: 25,
    clip: 1.0,
    lr: 0.005,
    warmup: 500,
    decay: 0.000005,
    wd: 0.0008,
    labelSmooth: 0.05,
    blockSize: 192,
    temp: 0.40,
    topK: 50,
    topP: 0.95,
    repPenalty: 0.20,
    noRepeatNgram: 3,
    maxNew: 220,
    greedy: false,
    normPrompt: true,
    prompt: "Write something in the same style:\n",
    status: "preset applied: mixed",
  };

  if (k === "chat") {
    desired.lr = 0.0055;
    desired.warmup = 600;
    desired.wd = 0.0010;
    desired.labelSmooth = 0.05;
    desired.blockSize = 256;
    desired.dModel = 112;
    desired.temp = 0.22;
    desired.topK = 40;
    desired.topP = 0.95;
    desired.repPenalty = 0.25;
    desired.noRepeatNgram = 4;
    desired.maxNew = 180;
    desired.prompt = `${tags.user}: hey\n${tags.ai}:`;
    desired.status = "preset applied: chat";
  } else if (k === "dialogue") {
    desired.lr = 0.0055;
    desired.warmup = 600;
    desired.wd = 0.0010;
    desired.labelSmooth = 0.06;
    desired.blockSize = 256;
    desired.dModel = 112;
    desired.temp = 0.18;
    desired.topK = 30;
    desired.topP = 0.95;
    desired.repPenalty = 0.50;
    desired.noRepeatNgram = 4;
    desired.maxNew = 220;
    desired.prompt = `${speaker || "SPEAKER"}: `;
    desired.status = "preset applied: dialogue";
  } else if (k === "prose") {
    desired.lr = 0.0050;
    desired.warmup = 500;
    desired.wd = 0.0007;
    desired.labelSmooth = 0.04;
    desired.blockSize = 192;
    desired.dModel = 112;
    desired.temp = 0.32;
    desired.topK = 60;
    desired.topP = 0.95;
    desired.repPenalty = 0.20;
    desired.noRepeatNgram = 4;
    desired.maxNew = 260;
    desired.prompt = tail(data.trim(), 520) + "\n";
    desired.status = "preset applied: prose";
  } else if (k === "code") {
    desired.lr = 0.0045;
    desired.warmup = 400;
    desired.wd = 0.0010;
    desired.labelSmooth = 0.02;
    desired.blockSize = 192;
    desired.dModel = 112;
    desired.temp = 0.20;
    desired.topK = 30;
    desired.topP = 0.92;
    desired.repPenalty = 0.0;
    desired.noRepeatNgram = 0;
    desired.maxNew = 240;
    desired.prompt = tail(data.trim(), 520) + "\n";
    desired.status = "preset applied: code";
  } else if (k === "math") {
    desired.lr = 0.0045;
    desired.warmup = 400;
    desired.wd = 0.0010;
    desired.labelSmooth = 0.03;
    desired.blockSize = 128;
    desired.dModel = 96;
    desired.temp = 0.12;
    desired.topK = 12;
    desired.topP = 0.85;
    desired.repPenalty = 0.0;
    desired.noRepeatNgram = 0;
    desired.maxNew = 120;
    desired.greedy = true;
    desired.prompt = "Q: 12+9=\nA:";
    desired.status = "preset applied: math";
  } else if (k === "lyrics") {
    desired.lr = 0.0055;
    desired.warmup = 600;
    desired.wd = 0.0007;
    desired.labelSmooth = 0.05;
    desired.blockSize = 160;
    desired.dModel = 112;
    desired.temp = 0.45;
    desired.topK = 80;
    desired.topP = 0.97;
    desired.repPenalty = 0.10;
    desired.noRepeatNgram = 3;
    desired.maxNew = 260;
    desired.prompt = tail(data.trim(), 400) + "\n";
    desired.status = "preset applied: lyrics";
  }

  return { desired, tags, speaker, kind: k };
}

export function getGenPreset(kind, data, datasetKind) {
  const k = (kind === "auto") ? datasetKind : kind;
  const speaker = detectSpeakerTag(data);
  const tags = detectChatTags(data);

  const desired = {
    prompt: "Write something in the same style:\n",
    temp: 0.40,
    topK: 50,
    topP: 0.95,
    repPenalty: 0.20,
    noRepeatNgram: 3,
    maxNew: 220,
    greedy: false,
    normPrompt: true,
    status: "preset applied: mixed",
  };

  if (k === "chat") {
    desired.prompt = `${tags.user}: hey\n${tags.ai}:`;
    desired.temp = 0.25;
    desired.topK = 40;
    desired.topP = 0.95;
    desired.repPenalty = 0.20;
    desired.noRepeatNgram = 4;
    desired.maxNew = 160;
    desired.status = "preset applied: chat";
  } else if (k === "dialogue") {
    desired.prompt = `${speaker || "SPEAKER"}: `;
    desired.temp = 0.18;
    desired.topK = 30;
    desired.topP = 0.95;
    desired.repPenalty = 0.50;
    desired.noRepeatNgram = 4;
    desired.maxNew = 220;
    desired.status = "preset applied: dialogue";
  } else if (k === "prose") {
    const p = tail(data.trim(), 520);
    desired.prompt = (p ? p : "Chapter 1\n") + (p.endsWith("\n") ? "" : "\n");
    desired.temp = 0.35;
    desired.topK = 60;
    desired.topP = 0.95;
    desired.repPenalty = 0.15;
    desired.noRepeatNgram = 4;
    desired.maxNew = 220;
    desired.status = "preset applied: prose";
  } else if (k === "code") {
    const p = tail(data.trim(), 520);
    desired.prompt = (p ? p : "// ") + (p.endsWith("\n") ? "" : "\n");
    desired.temp = 0.22;
    desired.topK = 30;
    desired.topP = 0.92;
    desired.repPenalty = 0.0;
    desired.noRepeatNgram = 0;
    desired.maxNew = 240;
    desired.status = "preset applied: code";
  } else if (k === "math") {
    desired.prompt = "Q: 12+9=\nA:";
    desired.temp = 0.12;
    desired.topK = 12;
    desired.topP = 0.85;
    desired.repPenalty = 0.0;
    desired.noRepeatNgram = 0;
    desired.greedy = true;
    desired.maxNew = 120;
    desired.status = "preset applied: math";
  } else if (k === "lyrics") {
    const p = tail(data.trim(), 400);
    desired.prompt = (p ? p : "") + (p.endsWith("\n") ? "" : "\n");
    desired.temp = 0.45;
    desired.topK = 80;
    desired.topP = 0.97;
    desired.repPenalty = 0.10;
    desired.noRepeatNgram = 3;
    desired.maxNew = 260;
    desired.status = "preset applied: lyrics";
  }

  return { desired, kind: k };
}

export function getSpeedPreset(kind) {
  if (kind === "slow") {
    return { stepsPerTick: 800, budgetMs: 20, uiEvery: 8, status: "speed preset applied: slow" };
  }
  if (kind === "fast") {
    return { stepsPerTick: 6000, budgetMs: 60, uiEvery: 18, status: "speed preset applied: fast" };
  }
  return { stepsPerTick: 2500, budgetMs: 35, uiEvery: 12, status: "speed preset applied: average" };
}
