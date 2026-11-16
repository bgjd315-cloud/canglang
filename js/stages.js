// 三段式關卡（規格書第二～四節）：熟句關 → 身世卡 → 魔王戰
// 熟句關的句子來自練功坊（keyline/data/<課>.json），身世卡來自滄浪拾遺・藏書樓（keyline/fanwai/data/guoxue.json）。
// 學生的熟句關作答與身世卡進度存在自己的座位文件（players/班級_座號），不寫 answers，所以不影響魔王戰計分。
// 學生手機與老師控制台共用；不碰 Firebase，讀不到檔案時該段就不提供。

export const KL_COUNT = 8; // 每課熟句關句數（規格書：6–8 句）

const docCache = {};
async function loadKeylineDoc(id) {
  if (!(id in docCache)) {
    docCache[id] = null;
    try { const r = await fetch(`keyline/data/${encodeURIComponent(id)}.json`); if (r.ok) docCache[id] = await r.json(); } catch { /* 沒有就跳過 */ }
  }
  return docCache[id];
}

// 依課別載入練功坊句子；回傳 { 句子id → 句子（附 lessonId） }
export async function loadSentences(lessons) {
  const map = {};
  for (const id of lessons) {
    const d = await loadKeylineDoc(id);
    for (const s of d?.sentences || []) map[s.id] = { ...s, lessonId: id };
  }
  return map;
}

// 挑熟句關的句子：大考考過的優先，其次依課文順序；跨課時各課平均分配。全班用同一組。
export function pickSentences(sentences, lessons, n = KL_COUNT) {
  const pools = lessons.map(id => Object.values(sentences).filter(s => s.lessonId === id)
    .map((s, i) => ({ s, i, exam: (s.exam_refs || []).length }))
    .sort((a, b) => (b.exam > 0) - (a.exam > 0) || a.i - b.i)
    .map(x => x.s.id)).filter(p => p.length);
  const out = [];
  for (let round = 0; out.length < n && pools.some(p => p.length > round); round++) {
    for (const p of pools) if (p[round] && out.length < n) out.push(p[round]);
  }
  // 依課文順序排回去，學生讀起來比較順
  const order = Object.keys(sentences);
  return out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

const shuffle = (a, rand = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const meaningAnswer = s => { if (s.meaning_answer) return s.meaning_answer; const f = s.meaning.split("。")[0]; return /[？！]$/.test(f) ? f : f + "。"; };

// 第 idx 句的題目：雙數題「句子→白話」，單數題「情境→句子」（錯誤選項取同課其他句子）
export function klQuestion(sentences, sid, idx) {
  const s = sentences[sid];
  if (!s) return null;
  if (idx % 2 === 0 || !s.scene) {
    const answer = meaningAnswer(s);
    return { sid, type: "meaning", sentence: s.sentence, prompt: "這句話的意思是？", answer, options: shuffle([answer, ...(s.meaning_distractors || []).slice(0, 3)]) };
  }
  const others = shuffle(Object.values(sentences).filter(x => x.lessonId === s.lessonId && x.id !== sid && x.sentence !== s.sentence)).slice(0, 3).map(x => x.sentence);
  return { sid, type: "scene", prompt: `${s.scene}課文在這裡寫的是哪一句？`, answer: s.sentence, options: shuffle([s.sentence, ...others]) };
}

// 依課別找身世卡主題（先秦韻文選對應「韻文」主題）
const EXTRA = { "xianqin-yunwen": "yunwen" };
let topicCache = null;
export async function loadTopics() {
  if (!topicCache) {
    topicCache = [];
    try { const r = await fetch("keyline/fanwai/data/guoxue.json"); if (r.ok) topicCache = (await r.json()).topics || []; } catch { /* 沒有就不提供身世卡 */ }
  }
  return topicCache;
}
export function topicsFor(topics, lessons) {
  return topics.filter(t => lessons.some(id => (t.lessons || []).includes(id) || EXTRA[id] === t.id));
}

// 老師端：依各座位的作答算每句答對率，答對率低的排前面
export function sentenceStats(players, sids) {
  return sids.map(sid => {
    let right = 0, n = 0;
    for (const p of players) if (p.kl && sid in p.kl) { n++; if (p.kl[sid]) right++; }
    return { sid, right, n, rate: n ? right / n : null };
  }).sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));
}
