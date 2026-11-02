// 練功坊教師後台：查看排行榜紀錄、匯出、刪除。只有老師帳號能刪除（firestore.rules 的 cl_kl_board）。
// 網址加上 #demo 是範例資料，不連資料庫，可先看畫面與練習操作。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../js/firebase-config.js";

const TEACHER = "bgjd315@gmail.com";
const CLASSES = ["301", "307"];
const SUSPECT_AVG = 180; // 每回平均超過這個分數才標示，正常打到全對困難也很難一直維持
const IDLE_DAYS = 7;
const DEMO = location.hash === "#demo";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById("admin");
const dlg = document.getElementById("dlg");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const S = { rows: [], cls: localStorage.getItem("cl_kl_admin_cls") || CLASSES[0], sort: "points", desc: true, q: "", sel: new Set(), msg: "", user: "" };
const idOf = (r) => `${r.cls}_${r.seat}`;

function demoRows() {
  const now = Date.now(), day = 864e5;
  const rows = [];
  [["301", [[12, 640, 9, 14, 88, 0], [3, 512, 6, 11, 40, 1], [27, 388, 5, 9, 31, 2], [8, 260, 2, 7, 12, 9], [33, 1240, 6, 6, 5, 0], [19, 96, 0, 3, 2, 21]]],
   ["307", [[5, 702, 11, 16, 102, 0], [21, 455, 7, 10, 47, 3], [14, 120, 1, 4, 6, 12]]]]
    .forEach(([cls, list]) => list.forEach(([seat, points, wins, rounds, mastered, ago]) =>
      rows.push({ cls, seat, points, wins, rounds, mastered, at: new Date(now - ago * day - 36e5) })));
  return rows;
}

async function load() {
  if (DEMO) { if (!S.rows.length) S.rows = demoRows(); return; }
  const snap = await getDocs(collection(db, "cl_kl_board"));
  S.rows = snap.docs.map((d) => { const r = d.data(); return { ...r, at: r.updated?.toDate ? r.updated.toDate() : null }; });
  const ids = new Set(S.rows.map(idOf));
  S.sel = new Set([...S.sel].filter((x) => ids.has(x)));
}

async function removeIds(ids) {
  if (DEMO) { S.rows = S.rows.filter((r) => !ids.includes(idOf(r))); return; }
  for (let i = 0; i < ids.length; i += 400) { // Firestore 一批最多 500 筆
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, "cl_kl_board", id)));
    await b.commit();
  }
}

const avg = (r) => (r.rounds ? r.points / r.rounds : 0);
const winRate = (r) => (r.rounds ? r.wins / r.rounds : 0);
const daysAgo = (r) => (r.at ? (Date.now() - r.at.getTime()) / 864e5 : Infinity);
const fmtAt = (r) => (r.at ? r.at.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const SORT = { seat: (r) => r.seat, points: (r) => r.points, wins: (r) => r.wins, rounds: (r) => r.rounds, rate: winRate, avg, mastered: (r) => r.mastered, at: (r) => (r.at ? r.at.getTime() : 0) };

function classRows() { return S.rows.filter((r) => r.cls === S.cls); }
function shownRows() {
  const rows = classRows().filter((r) => !S.q || String(r.seat) === S.q.trim());
  const f = SORT[S.sort];
  return rows.sort((a, b) => (S.desc ? f(b) - f(a) : f(a) - f(b)) || a.seat - b.seat);
}

function render() {
  const all = classRows();
  const rankBy = [...all].sort((a, b) => b.points - a.points);
  const rank = new Map(rankBy.map((r, i) => [idOf(r), i + 1]));
  const rows = shownRows();
  const rounds = all.reduce((a, r) => a + r.rounds, 0);
  const active = all.filter((r) => daysAgo(r) <= IDLE_DAYS).length;
  const mean = all.length ? Math.round(all.reduce((a, r) => a + r.points, 0) / all.length) : 0;
  const th = (k, label) => `<th class="${S.sort === k ? "on" : ""}" aria-sort="${S.sort === k ? (S.desc ? "descending" : "ascending") : "none"}"><button data-sort="${k}">${label}${S.sort === k ? (S.desc ? " ▼" : " ▲") : ""}</button></th>`;
  const allChecked = rows.length && rows.every((r) => S.sel.has(idOf(r)));
  root.innerHTML = `
    <header class="ad-top"><div><h1>練功坊教師後台</h1><small>${DEMO ? "範例資料" : esc(S.user)}</small></div>
      <div class="ad-bar"><a href="./" target="_blank" rel="noopener">開啟學生版</a>${DEMO ? "" : `<button id="logout">登出</button>`}</div></header>
    ${DEMO ? `<p class="ad-demo">這是範例資料，刪除只影響這個畫面，重新整理就會復原。</p>` : ""}
    <div class="ad-bar">
      <div class="kl-tabs">${CLASSES.map((c) => `<button data-c="${c}" aria-pressed="${c === S.cls}">${c} 班（${S.rows.filter((r) => r.cls === c).length}）</button>`).join("")}</div>
      <input id="q" inputmode="numeric" placeholder="查座號" aria-label="查座號" value="${esc(S.q)}">
      <span class="sp"></span>
      <button id="weekly">查每週最高分</button>
      <button id="reload">重新整理</button>
      <button id="csv" ${all.length ? "" : "disabled"}>下載 CSV</button>
    </div>
    <section class="ad-tiles" aria-label="${S.cls} 班摘要">
      <div><b>${all.length}</b><span>上榜人數</span></div>
      <div><b>${active}</b><span>${IDLE_DAYS} 天內有練</span></div>
      <div><b>${rounds}</b><span>總對戰回數</span></div>
      <div><b>${mean}</b><span>平均積分</span></div>
    </section>
    <div class="ad-bar">
      <button id="delSel" class="ad-danger" ${S.sel.size ? "" : "disabled"}>刪除勾選（${S.sel.size}）</button>
      <button id="clear" class="ad-danger" ${all.length ? "" : "disabled"}>清空 ${S.cls} 班</button>
      <span class="ad-msg" role="status">${esc(S.msg)}</span>
    </div>
    <div class="ad-wrap">${rows.length ? `<table>
      <thead><tr><th class="l"><input type="checkbox" id="checkAll" aria-label="全選" ${allChecked ? "checked" : ""}></th><th>名次</th>${th("seat", "座號")}${th("points", "積分")}${th("wins", "勝場")}${th("rounds", "對戰")}${th("rate", "勝率")}${th("avg", "每回平均")}${th("mastered", "練熟句")}${th("at", "最後練習")}<th></th></tr></thead>
      <tbody>${rows.map((r) => { const id = idOf(r); return `<tr class="${S.sel.has(id) ? "sel" : ""}">
        <td class="l"><input type="checkbox" data-id="${id}" aria-label="選取 ${r.seat} 號" ${S.sel.has(id) ? "checked" : ""}></td>
        <td>${rank.get(id)}</td><td><b>${r.seat}</b></td>
        <td><b>${r.points}</b>${avg(r) > SUSPECT_AVG ? `<span class="ad-flag" title="每回平均超過 ${SUSPECT_AVG} 分">請留意</span>` : ""}</td>
        <td>${r.wins}</td><td>${r.rounds}</td><td>${Math.round(winRate(r) * 100)}%</td><td>${Math.round(avg(r))}</td><td>${r.mastered}</td>
        <td class="${daysAgo(r) > IDLE_DAYS ? "ad-idle" : ""}">${fmtAt(r)}</td>
        <td><button class="ad-del" data-del="${id}">刪除</button></td></tr>`; }).join("")}</tbody></table>`
    : `<p class="ad-empty">${S.q ? `${esc(S.cls)} 班沒有 ${esc(S.q)} 號的紀錄。` : `${esc(S.cls)} 班還沒有人上榜。`}</p>`}</div>
    <p class="ad-note">刪除後，該座號會從排行榜消失、積分歸零，也會釋出座號，換手機或填錯座號的學生就能重新上榜。學生手機上的練習進度不受影響。刪除無法復原，要留底請先下載 CSV。</p>`;
  bind();
}

function bind() {
  root.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { S.cls = b.dataset.c; S.sel.clear(); S.q = ""; S.msg = ""; try { localStorage.setItem("cl_kl_admin_cls", S.cls); } catch (e) { /* 無痕視窗 */ } render(); }));
  root.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { const k = b.dataset.sort; if (S.sort === k) S.desc = !S.desc; else { S.sort = k; S.desc = k !== "seat"; } render(); }));
  root.querySelectorAll("[data-id]").forEach((c) => (c.onchange = () => { c.checked ? S.sel.add(c.dataset.id) : S.sel.delete(c.dataset.id); render(); }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { const id = b.dataset.del; const [c, s] = id.split("_"); confirmDelete([id], `刪除 ${c} 班 ${s} 號的紀錄？`); }));
  const q = document.getElementById("q");
  q.oninput = () => { S.q = q.value; S.sel.clear(); render(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  const all = document.getElementById("checkAll");
  if (all) all.onchange = () => { shownRows().forEach((r) => (all.checked ? S.sel.add(idOf(r)) : S.sel.delete(idOf(r)))); render(); };
  document.getElementById("weekly").onclick = weeklyTop;
  document.getElementById("reload").onclick = refresh;
  document.getElementById("csv").onclick = downloadCsv;
  document.getElementById("delSel").onclick = () => confirmDelete([...S.sel], `刪除勾選的 ${S.sel.size} 筆紀錄？`);
  document.getElementById("clear").onclick = () => { const ids = classRows().map(idOf); confirmDelete(ids, `清空 ${S.cls} 班全部 ${ids.length} 筆紀錄？`, S.cls); };
  const lo = document.getElementById("logout");
  if (lo) lo.onclick = () => signOut(auth);
}

// ---------- 每週最高分 ----------
// 各班結算日不同。資料庫只存目前累計，所以每週的紀錄存在老師這台電腦的瀏覽器：
// 按一次記一次，結算日當天按的會蓋掉這一輪較早的紀錄
const CHECK_DAY = { "307": 1, "301": 2 };
const WEEK_KEY = "cl_kl_admin_weeks";
const WEEK_KEEP = 30;
const DAY_NAME = "日一二三四五六";
const checkDateOf = (c, d) => { const m = new Date(d); m.setDate(m.getDate() - (m.getDay() - CHECK_DAY[c] + 7) % 7); return m.toLocaleDateString("sv"); };
const mdOf = (d) => new Date(d).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });

function readWeeks() {
  if (DEMO) { // 範例：上一輪的紀錄，看得到「增加最多」和歷史
    const last = new Date(Date.now() - 7 * 864e5);
    const rec = (c, points) => ({ [checkDateOf(c, last)]: { at: last.toISOString(), points } });
    return { "301": rec("301", { 12: 560, 3: 300, 33: 1240 }), "307": rec("307", { 5: 650, 21: 400 }) };
  }
  try { return JSON.parse(localStorage.getItem(WEEK_KEY) || "{}"); } catch (e) { return {}; }
}
function saveWeeks(w) {
  const out = {};
  for (const c of CLASSES) out[c] = Object.fromEntries(Object.keys(w[c] || {}).sort().slice(-WEEK_KEEP).map((k) => [k, w[c][k]]));
  try { localStorage.setItem(WEEK_KEY, JSON.stringify(out)); } catch (e) { /* 無痕視窗存不了，這次仍可查看 */ }
}
// 回傳分數最高的座號（同分都列）；沒有人得分時回傳 null
function topOf(entries) {
  const best = Math.max(0, ...entries.map((e) => e[1]));
  if (!best) return null;
  return { points: best, seats: entries.filter((e) => e[1] === best).map((e) => +e[0]).sort((a, b) => a - b) };
}
const seatsText = (t) => t.seats.map((s) => `${s} 號`).join("、");

async function weeklyTop() {
  try { await load(); } catch (e) { console.error(e); S.msg = `讀取失敗（${e.code || e.message}）。`; render(); return; }
  const now = new Date(), weeks = readWeeks();
  const card = (c) => {
    const list = S.rows.filter((r) => r.cls === c);
    const rec = (weeks[c] = weeks[c] || {});
    const key = checkDateOf(c, now), isDay = now.getDay() === CHECK_DAY[c];
    if (isDay || !rec[key]) rec[key] = { at: now.toISOString(), points: Object.fromEntries(list.map((r) => [r.seat, r.points])) };
    const past = Object.keys(rec).sort().reverse().filter((k) => k < key);
    const prev = past[0] && rec[past[0]];
    const top = topOf(list.map((r) => [r.seat, r.points]));
    const flagged = top && list.some((r) => top.seats.includes(r.seat) && avg(r) > SUSPECT_AVG);
    const gain = prev && topOf(list.map((r) => [r.seat, r.points - (prev.points[r.seat] || 0)]));
    const history = past.slice(0, 8).map((k) => { const t = topOf(Object.entries(rec[k].points)); return `<li>${mdOf(rec[k].at)}：${t ? `${seatsText(t)}（${t.points} 分）` : "沒有人上榜"}</li>`; }).join("");
    return `<div class="ad-week"><h3>${c} 班・每週${DAY_NAME[CHECK_DAY[c]]}</h3>
      <small>${isDay ? "今天是結算日" : `今天不是結算日，這是截至 ${mdOf(now)} 的分數`}</small>
      <p>累計最高：${top ? `<b>${seatsText(top)}</b>，${top.points} 分${flagged ? `<span class="ad-flag" title="每回平均超過 ${SUSPECT_AVG} 分">請留意</span>` : ""}` : "還沒有人上榜"}</p>
      ${prev ? `<p>比 ${mdOf(prev.at)} 增加最多：${gain ? `<b>${seatsText(gain)}</b>，多 ${gain.points} 分` : "沒有人增加"}</p>` : ""}
      ${history ? `<ul class="ad-history">${history}</ul>` : ""}</div>`;
  };
  const cards = [...CLASSES].sort((a, b) => CHECK_DAY[a] - CHECK_DAY[b]).map(card).join("");
  if (!DEMO) saveWeeks(weeks);
  dlg.innerHTML = `<h2>每週累計最高分</h2>${cards}
    <p class="ad-note">${DEMO ? "範例資料，不會存檔。" : "每週紀錄存在這台電腦的瀏覽器，換電腦或清除瀏覽資料就看不到；結算日沒有按，那一輪就不會有當天的紀錄。"}</p>
    <div class="ad-acts"><button id="ok">關閉</button></div>`;
  dlg.querySelector("#ok").onclick = () => dlg.close();
  dlg.showModal();
  render();
}

// typed 有值時，要輸入相同文字才能確認（清空全班用）
function confirmDelete(ids, title, typed) {
  dlg.innerHTML = `<h2>${esc(title)}</h2><p>刪除後積分會歸零，而且無法復原。要留底請先下載 CSV。</p>
    ${typed ? `<label for="typed">請輸入班級「${esc(typed)}」確認</label><input id="typed" inputmode="numeric" autocomplete="off">` : ""}
    <div class="ad-acts"><button id="no">取消</button><button id="yes" class="go" ${typed ? "disabled" : ""}>確定刪除</button></div>`;
  dlg.querySelector("#no").onclick = () => dlg.close();
  if (typed) { const t = dlg.querySelector("#typed"); t.oninput = () => { dlg.querySelector("#yes").disabled = t.value.trim() !== typed; }; }
  dlg.querySelector("#yes").onclick = async () => {
    dlg.querySelector("#yes").disabled = true;
    try {
      await removeIds(ids);
      ids.forEach((i) => S.sel.delete(i));
      S.msg = `已刪除 ${ids.length} 筆。`;
      dlg.close();
      await load();
    } catch (e) {
      console.error(e);
      S.msg = `刪除失敗（${e.code || e.message}），資料沒有變動，請重新整理後再試。`;
      dlg.close();
    }
    render();
  };
  dlg.showModal();
}

function downloadCsv() {
  const head = ["班級", "座號", "積分", "勝場", "對戰回數", "勝率", "每回平均", "練熟句", "最後練習"];
  const lines = shownRows().map((r) => [r.cls, r.seat, r.points, r.wins, r.rounds, `${Math.round(winRate(r) * 100)}%`, Math.round(avg(r)), r.mastered, r.at ? r.at.toLocaleString("zh-TW", { hour12: false }) : ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `練功坊排行榜_${S.cls}班_${new Date().toLocaleDateString("sv")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function refresh() {
  S.msg = "";
  try { await load(); } catch (e) { console.error(e); S.msg = `讀取失敗（${e.code || e.message}）。`; }
  render();
}

function renderLogin(msg = "") {
  root.innerHTML = `<section class="card ad-login"><h1>練功坊教師後台</h1><p class="ad-note">請用老師的 Google 帳號登入。</p>
    <button class="primary" id="login">用 Google 登入</button>${msg ? `<p class="ad-msg" role="alert" style="color:var(--bad)">${esc(msg)}</p>` : ""}
    <p class="ad-note"><a href="#demo" onclick="setTimeout(()=>location.reload())">先看範例畫面</a></p></section>`;
  document.getElementById("login").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => {
    if (e.code === "auth/popup-blocked") return renderLogin("瀏覽器擋下了登入視窗，請允許這個網站的彈出式視窗，再按一次登入。");
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") renderLogin(`登入失敗：${e.code}`);
  });
}

if (DEMO) {
  refresh();
} else {
  onAuthStateChanged(auth, async (u) => {
    if (!u || u.isAnonymous) return renderLogin();
    if (u.email !== TEACHER) { await signOut(auth); return renderLogin(`${u.email} 不是老師帳號，請改用老師帳號登入。`); }
    S.user = u.email;
    refresh();
  });
}
