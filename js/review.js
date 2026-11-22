// 作答回饋與錯題本：全班版手機頁（student.js）與單人版（solo.js）共用。不碰 Firebase。
// 規格書 2026-11-17：初答答錯只給線索、不揭曉；重答之後才顯示正解與解析。
import { TIERS } from "./config.js";
import { linkedCardsHtml } from "./cards.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEYS = "ABCDE";

// 題目的線索；題庫還沒有 hint 時用備援文字
export const hintText = q => q.hint ? `線索：${q.hint}` : `線索：這題考「${q.topic || "本課重點"}」。回到課文相關段落，再讀一次。`;

export function qBlock(q, tier, first) {
  return `
    <div class="qhead"><span class="tag ${tier}">${TIERS[tier].name}</span>${q.type === "multi" ? `<span class="tag multi">多選</span>` : ""}${first ? "" : `<span class="tag" style="background:var(--muted)">重答</span>`}${q.exam ? `<span class="src">${esc(q.exam)}</span>` : ""}</div>
    ${q.passage ? `<div class="quote">${esc(q.passage)}</div>` : ""}
    <div class="stem">${esc(q.stem)}</div>`;
}

// 選項文字（原始序號 → 文字），多個用「；」分開
const optText = (q, sel) => (sel || []).map(i => esc(q.options[i])).join("；") || "（沒有選）";
// 依這次畫面上的排列，把原始序號換成 A–E
const letters = (perm, sel) => (sel || []).map(i => KEYS[perm.indexOf(i)] ?? "?").sort().join("、");

// 作答後的回饋卡內容（不含外層 card 與「下一題」按鈕）
// res：{ key, sel, r, perm, first, tier }；firstSel：重答時，這題初答選了哪些（原始序號）
export function feedbackHtml(q, res, { cards = {}, firstSel = null, effect = "" } = {}) {
  const { sel, r, perm, first, tier } = res;
  const chosen = new Set(sel), right = new Set(q.answer);
  const multi = q.type === "multi";
  // 初答答錯：不揭曉
  if (first && !r.correct) {
    const verdict = multi ? `<div class="verdict ${r.points > 0 ? "part" : "no"}">差一點：錯 ${r.errors} 個</div>` : `<div class="verdict no">再想一想</div>`;
    return `
      <div class="bar">${verdict}<span>本題得分：<b>${r.points}</b> 分</span></div>
      ${qBlock(q, tier, first)}
      <div class="opts">${perm.map((oi, i) => {
        // 單選：選的標 ✗；多選：只標「你選的」，不說哪幾個對、哪幾個錯
        const mark = chosen.has(oi) ? (multi ? "　（你選的）" : "　✗") : "";
        return `<button class="opt ${chosen.has(oi) ? (multi ? "sel" : "wrong") : ""}" disabled><span class="k">${KEYS[i]}</span><span>${esc(q.options[oi])}${mark}</span></button>`;
      }).join("")}</div>
      <div class="hint">${esc(hintText(q))}</div>
      <div class="small muted">這題稍後可以重答一次（不改成績）。</div>`;
  }
  // 初答答對，或重答之後（不論對錯）：揭曉正解、解析、身世卡
  const verdict = r.correct ? `<div class="verdict ok">${first ? "答對了！" : "重答答對了！"}</div>` : `<div class="verdict no">還是不對，看看解析</div>`;
  const twice = !first && !r.correct && firstSel
    ? `<div class="twice">你的選擇：初答 <b>${letters(perm, firstSel)}</b> → 重答 <b>${letters(perm, sel)}</b>（依本題目前的選項順序）</div>` : "";
  return `
    <div class="bar">${verdict}<span>${first ? `本題得分：<b>${r.points}</b> 分` : "重答不改變成績"}</span></div>
    ${r.correct && effect ? `<div class="muted">${effect}</div>` : ""}
    ${qBlock(q, tier, first)}
    <div class="opts">${perm.map((oi, i) => {
      const cls = right.has(oi) ? "right" : (chosen.has(oi) ? "wrong" : "");
      return `<button class="opt ${cls}" disabled><span class="k">${KEYS[i]}</span><span>${esc(q.options[oi])}${right.has(oi) ? "　✓" : (chosen.has(oi) ? "　✗" : "")}</span></button>`;
    }).join("")}</div>
    ${twice}
    <div class="exp">${esc(q.explanation)}</div>
    ${linkedCardsHtml(q, cards)}`;
}

// 從自己的作答紀錄整理錯題本：初答答錯的題（依出題順序），未作答的排最後
// mine：[{ key, sel, first }]；keys：本場題目
export function collectReview(keys, mine, qmap, scoreAnswer) {
  const firstOf = {}, retryOf = {};
  for (const a of mine) {
    if (a.first) { if (!(a.key in firstOf)) firstOf[a.key] = a.sel; }
    else if (!(a.key in retryOf)) retryOf[a.key] = a.sel;
  }
  const wrong = [], skipped = [];
  for (const k of keys) {
    const q = qmap[k];
    if (!q) continue;
    if (!(k in firstOf)) skipped.push({ key: k, q, unanswered: true });
    else if (!scoreAnswer(q, firstOf[k]).correct) wrong.push({ key: k, q, firstSel: firstOf[k], retrySel: retryOf[k] ?? null });
  }
  return { wrong, skipped, answered: Object.keys(firstOf).filter(k => keys.includes(k)).length };
}

// 錯題本畫面
export function reviewHtml({ wrong, skipped, answered }, { cards = {}, scoreAnswer } = {}) {
  if (!wrong.length && !skipped.length) return answered ? `<div class="card center"><b>本課全部一次答對</b>，太厲害了！</div>` : "";
  const item = it => {
    const q = it.q;
    let mine;
    if (it.unanswered) mine = `<div class="tag" style="background:var(--muted)">未作答</div>`;
    else {
      const retryOk = it.retrySel && scoreAnswer ? scoreAnswer(q, it.retrySel).correct : false;
      mine = `<div><b>我的初答：</b>${optText(q, it.firstSel)}　✗</div>
        ${it.retrySel ? `<div><b>我的重答：</b>${optText(q, it.retrySel)}　${retryOk ? "✓" : "✗"}</div>` : ""}`;
    }
    return `<div class="card">${qBlock(q, q.tier, true)}${mine}<div><b>正解：</b>${optText(q, q.answer)}</div><div class="exp">${esc(q.explanation)}</div>${linkedCardsHtml(q, cards)}</div>`;
  };
  return `
    <div class="big">我的錯題本</div>
    ${wrong.length ? `<div class="muted">初答答錯 ${wrong.length} 題</div>` : `<div class="muted">作答過的題目全部一次答對</div>`}
    <div class="review">${wrong.map(item).join("")}${skipped.map(item).join("")}</div>`;
}
