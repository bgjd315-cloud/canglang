// 魔王任務說明：讀 assets/bosses/missions.json，三個頁面共用的顯示方式
let cache = null;
export async function loadMissions() {
  if (!cache) {
    try { cache = await (await fetch(`assets/bosses/missions.json?v=${Date.now()}`)).json(); }
    catch { cache = {}; }
  }
  return cache;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// boss：{ name, image, intro, mission }；沒有說明時只顯示名稱
export function missionHtml(boss, { title = "本關魔王", big = false } = {}) {
  if (!boss) return "";
  return `
    <div class="mission card ${big ? "big" : ""}">
      ${boss.image ? `<img class="mthumb" alt="" src="${esc(boss.image)}">` : ""}
      <div class="mtext">
        <div class="mlabel">${esc(title)}</div>
        <div class="mname">${esc(boss.name)}</div>
        ${boss.intro ? `<p>${esc(boss.intro)}</p>` : ""}
        ${boss.mission ? `<p><b>任務：</b>${esc(boss.mission)}</p>` : ""}
      </div>
    </div>`;
}

export function defeatedHtml(boss) {
  if (!boss?.defeated) return "";
  return `<p class="mdefeated">${esc(boss.defeated)}</p>`;
}
