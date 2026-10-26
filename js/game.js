// 滄浪闖關手機版：計分與戰鬥的核心邏輯（純函式，瀏覽器與 Node 模擬腳本共用）
import { CONFIG } from "./config.js";

// 題目在系統裡的唯一代號：題庫檔名 + 題目 id，避免不同課的 id 撞名
export const qKey = (bankId, qid) => `${bankId}:${qid}`;

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 判分。sel 是學生選的「原始」選項位置。
// 單選：對 5、錯 0。多選：照學測，漏選正解、多選錯項各算錯一個；錯 0/1/2/3+ 個得 5/3/1/0。
export function scoreAnswer(q, sel) {
  const picked = new Set(sel);
  const right = new Set(q.answer);
  if (q.type !== "multi") {
    const correct = picked.size === 1 && right.has(sel[0]);
    return { correct, points: correct ? CONFIG.pointsPerQuestion : 0, errors: correct ? 0 : 1 };
  }
  let errors = 0;
  for (let i = 0; i < q.options.length; i++) if (picked.has(i) !== right.has(i)) errors++;
  const table = [CONFIG.pointsPerQuestion, 3, 1];
  return { correct: errors === 0, points: table[errors] ?? 0, errors };
}

// 從選定的課出題。正式版：單課 20 題全出；跨課從各課平均抽到 20 題。試玩版：抽 5 題。
// banks：{ bankId: 題庫物件 }，ids：老師勾選的順序
export function pickQuestions(banks, ids, mode, rand = Math.random) {
  const total = mode === "trial" ? CONFIG.trialQuestions : CONFIG.questionsPerLesson;
  const pools = ids.map(id => shuffle(banks[id].questions.map(q => qKey(id, q.id)), rand));
  if (ids.length === 1 && mode !== "trial") return pools[0].slice(0, total);
  const share = ids.map(() => Math.floor(total / ids.length));
  const extra = shuffle(ids.map((_, i) => i), rand).slice(0, total - share.reduce((s, n) => s + n, 0));
  for (const i of extra) share[i]++;
  // 某課題數不夠時，把缺額轉給其他課
  let short = 0;
  ids.forEach((_, i) => { if (share[i] > pools[i].length) { short += share[i] - pools[i].length; share[i] = pools[i].length; } });
  for (let i = 0; short > 0 && i < ids.length; i++) {
    const room = pools[i].length - share[i];
    const add = Math.min(room, short);
    share[i] += add; short -= add;
  }
  return pools.flatMap((p, i) => p.slice(0, share[i]));
}

// 依人數計算的門檻
export function thresholds(n) {
  const N = Math.max(1, n);
  return {
    ultimateAt: Math.ceil(N * CONFIG.ultimateEnergyRatio),
    ultimateDamage: N * CONFIG.ultimatePerPlayer,
    shieldUnit: Math.max(1, Math.ceil(N * CONFIG.shieldUnitRatio)),
  };
}

export function newBattle(n, mode) {
  const hp = Math.max(1, n) * CONFIG.bossHpPerPlayer[mode === "trial" ? "trial" : "formal"];
  return {
    n, bossMax: hp, boss: hp, morale: CONFIG.moraleMax, shield: 0, energy: 0,
    defeatedSeg: null, failedSeg: null, ultimates: 0, counters: [],
    tally: { m: [0, 0], u: [0, 0], a: [0, 0] }, // [答對, 作答]
  };
}

const round1 = x => Math.round(x * 10) / 10;

// 一次作答對戰況的影響。回傳事件清單（給投影畫面播動畫用）
export function applyAnswer(b, tier, correct, seg) {
  const ev = [];
  b.tally[tier][1]++;
  if (!correct) return ev;
  b.tally[tier][0]++;
  if (b.boss <= 0) return ev; // 魔王已倒，作答繼續但不再扣血
  const fx = CONFIG.effects[tier];
  const t = thresholds(b.n);
  b.boss = Math.max(0, round1(b.boss - fx.damage));
  b.shield += fx.shield;
  b.energy += fx.energy;
  ev.push({ type: "hit", tier });
  if (b.energy >= t.ultimateAt) {
    b.boss = Math.max(0, round1(b.boss - t.ultimateDamage));
    b.energy = 0;
    b.ultimates++;
    ev.push({ type: "ultimate", damage: t.ultimateDamage });
  }
  if (b.boss <= 0 && b.defeatedSeg == null) { b.defeatedSeg = seg; ev.push({ type: "defeated" }); }
  return ev;
}

// 一段結束時的結算：每 counterEvery 段魔王反擊一次
export function endSegment(b, seg) {
  if (seg % CONFIG.counterEvery !== 0 || b.boss <= 0) return null;
  const t = thresholds(b.n);
  const maxBlocks = Math.floor(CONFIG.shieldBlockMax / CONFIG.shieldBlock);
  const blocks = Math.min(maxBlocks, Math.floor(b.shield / t.shieldUnit));
  b.shield -= blocks * t.shieldUnit;
  const blocked = blocks * CONFIG.shieldBlock;
  const dmg = Math.max(0, CONFIG.counterDamage - blocked);
  b.morale = Math.max(0, b.morale - dmg);
  if (b.morale <= 0 && b.failedSeg == null) b.failedSeg = seg;
  const c = { seg, blocked, damage: dmg };
  b.counters.push(c);
  return c;
}

// 從全部作答紀錄重算戰況（投影頁重新整理時也能還原）
// answers：依時間排序；每筆 {seg, key, sel}；qmap：key → 題目；segDone：已結算的段數
export function replay(n, mode, answers, qmap, segDone) {
  const b = newBattle(n, mode);
  const bySeg = new Map();
  for (const a of answers) {
    if (!bySeg.has(a.seg)) bySeg.set(a.seg, []);
    bySeg.get(a.seg).push(a);
  }
  const lastSeg = Math.max(segDone, ...bySeg.keys(), 0);
  for (let s = 1; s <= lastSeg; s++) {
    for (const a of bySeg.get(s) || []) {
      const q = qmap[a.key];
      if (q) applyAnswer(b, q.tier, scoreAnswer(q, a.sel).correct, s);
    }
    if (s <= segDone) endSegment(b, s);
  }
  return b;
}

// 每位學生的成績：只計第一次作答，沒答到的 0 分並記未作答題數
export function computeScores(players, answers, keys, qmap) {
  const out = {};
  for (const p of players) out[p.uid] = { cls: p.cls, seat: p.seat, perQ: {}, score: 0, unanswered: keys.length, done: 0 };
  for (const a of answers) {
    const s = out[a.uid];
    if (!s || !a.first || a.key in s.perQ || !qmap[a.key]) continue;
    const r = scoreAnswer(qmap[a.key], a.sel);
    s.perQ[a.key] = r.points;
    s.score += r.points;
    s.done++;
    s.unanswered = keys.length - s.done;
  }
  return out;
}

// 答錯最多的題目：每題算「答錯的人數」（同一人同題只算一次）
export function topWrong(answers, qmap, limit = 3) {
  const wrong = new Map();
  for (const a of answers) {
    const q = qmap[a.key];
    if (!q || scoreAnswer(q, a.sel).correct) continue;
    if (!wrong.has(a.key)) wrong.set(a.key, new Set());
    wrong.get(a.key).add(a.uid);
  }
  return [...wrong.entries()]
    .map(([key, s]) => ({ key, n: s.size }))
    .sort((x, y) => y.n - x.n)
    .slice(0, limit);
}

// 學生端：依自己的作答紀錄，算出下一題要出哪一題
// 先出這一類還沒答過的；都答過了，再出第一次答錯、還沒重答的題目（每題只重答一次）
export function nextQuestion(tier, keys, qmap, myAnswers) {
  const tried = new Set(), retried = new Set(), wrongFirst = new Set();
  for (const a of myAnswers) {
    if (a.first) {
      tried.add(a.key);
      if (!scoreAnswer(qmap[a.key], a.sel).correct) wrongFirst.add(a.key);
    } else retried.add(a.key);
  }
  const ofTier = keys.filter(k => qmap[k] && qmap[k].tier === tier);
  const fresh = ofTier.filter(k => !tried.has(k));
  if (fresh.length) return { key: fresh[0], first: true, left: fresh.length };
  const again = ofTier.filter(k => wrongFirst.has(k) && !retried.has(k));
  if (again.length) return { key: again[0], first: false, left: again.length };
  return null;
}

export function progress(keys, myAnswers) {
  const tried = new Set(myAnswers.filter(a => a.first).map(a => a.key));
  return { done: keys.filter(k => tried.has(k)).length, total: keys.length };
}
