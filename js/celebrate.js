// 得分與勝利的跳出動畫：投影控制台、學生手機、單人版共用
// popScore：答對時從畫面上浮起「+5 分」；victory：打倒魔王時跳出「某某勝利！」大字卡

let layer = null;
function host() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "celebrate";
    layer.setAttribute("aria-live", "polite");
    document.body.appendChild(layer);
  }
  return layer;
}

// at：{x, y} 畫面座標（px），或一個元素（在它範圍內隨機挑一點）；不給就在畫面中間偏上
function pointOf(at) {
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    if (r.width && r.height) return { x: r.left + r.width * (0.2 + Math.random() * 0.6), y: r.top + r.height * (0.35 + Math.random() * 0.3) };
  }
  if (at && typeof at.x === "number") return at;
  return { x: innerWidth * (0.4 + Math.random() * 0.2), y: innerHeight * 0.45 };
}

export function popScore(text, { sub = "", tone = "good", at = null, big = false } = {}) {
  const d = document.createElement("div");
  d.className = `pop ${tone}${big ? " big" : ""}`;
  const b = document.createElement("b");
  b.textContent = text;
  d.appendChild(b);
  if (sub) { const s = document.createElement("small"); s.textContent = sub; d.appendChild(s); }
  // 元素捲出畫面時改在畫面裡顯示，也不要貼邊被切掉
  const p = pointOf(at);
  const x = Math.min(innerWidth * 0.78, Math.max(innerWidth * 0.22, p.x));
  const y = p.y < innerHeight * 0.12 || p.y > innerHeight * 0.85 ? innerHeight * (0.38 + Math.random() * 0.12) : p.y;
  d.style.left = `${Math.round(x)}px`;
  d.style.top = `${Math.round(y)}px`;
  host().appendChild(d);
  setTimeout(() => d.remove(), 1900);
}

// 很多人同時答對時排隊一個一個浮出，最多同時排 10 個，其餘合併成一則
const queue = [];
let qTimer = null;
export function popQueued(text, opts = {}) {
  if (queue.length >= 10) { queue.extra = (queue.extra || 0) + 1; return; }
  queue.push([text, opts]);
  if (!qTimer) drain();
}
function drain() {
  const item = queue.shift();
  if (!item) {
    if (queue.extra) { popScore(`還有 ${queue.extra} 人答對`, { tone: "good" }); queue.extra = 0; }
    qTimer = null; return;
  }
  popScore(...item);
  qTimer = setTimeout(drain, 220);
}

export function victory({ title, sub = "", image = "", tone = "win", ms = 4200 } = {}) {
  host().querySelectorAll(".victory").forEach(v => v.remove());
  const v = document.createElement("div");
  v.className = `victory ${tone}`;
  v.setAttribute("role", "status");
  const card = document.createElement("div");
  card.className = "vcard";
  if (image) { const img = document.createElement("img"); img.src = image; img.alt = ""; card.appendChild(img); }
  const h = document.createElement("div"); h.className = "vtitle"; h.textContent = title; card.appendChild(h);
  if (sub) { const s = document.createElement("div"); s.className = "vsub"; s.textContent = sub; card.appendChild(s); }
  v.appendChild(card);
  // 向外噴開的墨點與金箔
  if (tone === "win") {
    for (let i = 0; i < 22; i++) {
      const p = document.createElement("i");
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3, r = 38 + Math.random() * 18;
      p.style.setProperty("--dx", `${Math.cos(a) * r}vmin`);
      p.style.setProperty("--dy", `${Math.sin(a) * r}vmin`);
      p.style.setProperty("--d", `${0.9 + Math.random() * 0.5}s`);
      p.className = ["gold", "red", "ink"][i % 3];
      v.appendChild(p);
    }
  }
  const close = () => v.remove();
  v.addEventListener("click", close);
  host().appendChild(v);
  setTimeout(close, ms);
}
