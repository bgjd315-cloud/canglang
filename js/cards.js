// 魔王戰連動身世卡：題目有 linkedCards 時，答題後顯示對應的身世卡。
// 身世卡沿用「滄浪拾遺・藏書樓」的資料（keyline/fanwai/data/guoxue.json），兩邊只要維護一份。
// 學生手機、單人版、老師投影共用；不碰資料庫，讀不到檔案時就不顯示，不影響作答。
let cache = null;

export async function loadCards() {
  if (!cache) {
    cache = {};
    try {
      const r = await fetch("keyline/fanwai/data/guoxue.json");
      if (r.ok) {
        const d = await r.json();
        for (const t of d.topics || []) for (const c of t.cards || []) cache[c.id] = { ...c, topic: t.title };
      }
    } catch { /* 讀不到就不顯示身世卡 */ }
  }
  return cache;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 題目的身世卡區塊；沒有連動或讀不到卡片時回傳空字串
export function linkedCardsHtml(q, cards, { button = false } = {}) {
  const list = (q?.linkedCards || []).map(id => cards?.[id]).filter(Boolean);
  if (!list.length) return "";
  return `
    <div class="cardlink">
      <div class="cardlink-head"><b>身世卡</b><span>${esc(list[0].topic)}</span>${button ? `<button class="cardlink-btn" type="button" data-cards="${esc(q.linkedCards.join(","))}">投影身世卡</button>` : ""}</div>
      ${list.map(c => `<div class="cardlink-card"><b>${esc(c.title)}</b><p>${esc(c.body)}</p></div>`).join("")}
    </div>`;
}

// 老師投影用：身世卡放大顯示
export function cardsProjectHtml(ids, cards) {
  const list = ids.map(id => cards?.[id]).filter(Boolean);
  if (!list.length) return "";
  return `
    <div class="cardproj">
      <div class="cardproj-topic">${esc(list[0].topic)}</div>
      ${list.map((c, i) => `<div class="cardproj-card"><small>身世卡 ${i + 1}</small><b>${esc(c.title)}</b><p>${esc(c.body)}</p></div>`).join("")}
    </div>`;
}
