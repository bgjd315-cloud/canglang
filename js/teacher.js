// 投影畫面＋控制台（老師電腦）
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, query, where, writeBatch, increment, serverTimestamp, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, $, esc, loadManifest, loadBanks, bossOf, lessonLabel, passageHtml, rulesHtml } from "./common.js";
import { CONFIG, TIERS, ULTIMATE_NAME } from "./config.js";
import { loadMissions, missionHtml, defeatedHtml } from "./mission.js";
import { pickQuestions, replay, computeScores, topWrong, scoreAnswer, progress, thresholds } from "./game.js";

const app = $("app"), overlay = $("overlay"), corner = $("corner");
const SAVE = "canglang-teacher";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(SAVE))?.[k]; } catch { return undefined; } },
  set(k, v) { try { const o = JSON.parse(localStorage.getItem(SAVE)) || {}; o[k] = v; localStorage.setItem(SAVE, JSON.stringify(o)); } catch {} },
};

const T = {
  tab: "game", manifest: [], pick: [], mode: "formal", minutes: store.get("minutes") || CONFIG.defaultSegmentMinutes,
  roomId: null, room: null, players: [], answers: [], qmap: {}, banksFor: "",
  battle: null, prevBattle: null, unsubs: [], lastWrite: 0, writeTimer: null, timer: null, busy: false, msg: "",
};

/* ---------- 登入 ---------- */
onAuthStateChanged(auth, async u => {
  if (!u || u.isAnonymous) return renderLogin();
  if (u.email !== CONFIG.teacherEmail) { await signOut(auth); return renderLogin(`${u.email} 不是老師帳號，請改用 ${CONFIG.teacherEmail} 登入。`); }
  try { T.manifest = await loadManifest(); } catch (e) { app.innerHTML = `<div class="card bad">${esc(e.message)}</div>`; return; }
  const saved = store.get("room");
  if (saved) {
    const r = await getDoc(doc(db, "cl_rooms", saved)).catch(() => null);
    if (r?.exists() && r.data().status !== "closed") return openRoom(saved);
    store.set("room", null);
  }
  render();
});

// LINE、Facebook、Instagram 等 App 內建瀏覽器：Google 不允許在裡面登入
const IN_APP = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);

function renderLogin(msg = "") {
  corner.classList.add("hidden");
  if (IN_APP) {
    app.innerHTML = `
      <div class="card" style="max-width:560px; margin:10vh auto; display:grid; gap:16px">
        <h1>滄浪闖關・控制台</h1>
        <p class="bad" style="margin:0; font-size:1.15rem">這是 LINE 等 App 的內建瀏覽器，Google 不允許在這裡登入。</p>
        <p style="margin:0">請點右下角（或右上角）的選單，選「用 Safari 開啟」或「用 Chrome 開啟」，再按登入。<br>上課投影建議用教室電腦的 Chrome 開這個網址。</p>
        <p class="small" style="margin:0; overflow-wrap:anywhere">${esc(location.href)}</p>
      </div>`;
    return;
  }
  app.innerHTML = `
    <div class="card" style="max-width:560px; margin:10vh auto; display:grid; gap:16px">
      <h1>滄浪闖關・控制台</h1>
      <p style="margin:0">請用老師的 Google 帳號登入。</p>
      ${msg ? `<p class="bad" style="margin:0">${esc(msg)}</p>` : ""}
      <button class="primary" id="loginBtn" style="font-size:1.2rem; padding:.7em 1em">用 Google 登入</button>
    </div>`;
  $("loginBtn").onclick = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(e => {
      if (e.code === "auth/popup-blocked") return renderLogin("瀏覽器擋下了登入視窗。請在網址列右側允許這個網站的彈出式視窗，再按一次登入。");
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") renderLogin(`登入失敗：${e.code}`);
    });
  };
}

/* ---------- 網頁內對話框（有些瀏覽器會擋 confirm／prompt／alert，所以自己畫） ---------- */
const dlg = document.createElement("div");
dlg.className = "overlay hidden";
dlg.style.zIndex = 40;
document.body.appendChild(dlg);
function ask(message, { okText = "確定", cancelText = "取消", input = false, danger = false } = {}) {
  return new Promise(resolve => {
    dlg.innerHTML = `
      <div class="ovcard" role="dialog" aria-modal="true" style="max-width:560px">
        <p style="margin:0; font-size:1.2rem; white-space:pre-line">${esc(message)}</p>
        ${input ? `<input id="dlgIn" style="font-size:1.2rem" autocomplete="off">` : ""}
        <div class="row">
          <button class="primary ${danger ? "danger" : ""}" id="dlgOk" style="font-size:1.15rem">${esc(okText)}</button>
          ${cancelText ? `<button id="dlgNo" style="font-size:1.15rem">${esc(cancelText)}</button>` : ""}
        </div>
      </div>`;
    dlg.classList.remove("hidden");
    const done = v => { dlg.classList.add("hidden"); dlg.innerHTML = ""; resolve(v); };
    $("dlgOk").onclick = () => done(input ? $("dlgIn").value : true);
    if (cancelText) $("dlgNo").onclick = () => done(input ? null : false);
    (input ? $("dlgIn") : $("dlgOk")).focus();
  });
}
const tell = message => ask(message, { cancelText: "" });

/* ---------- 共用畫面 ---------- */
function topbar(sub, statsHtml = "") {
  return `
    <header class="topbar">
      <div><h1>滄浪闖關</h1><div class="sub">${sub}</div></div>
      <div class="stats">${statsHtml}</div>
      <nav class="nav">
        ${[["game", "遊戲"], ["scores", "成績"], ["stats", "統計"]].map(([k, n]) => `<button data-tab="${k}" class="${T.tab === k ? "cur" : ""}">${n}</button>`).join("")}
        <button id="rulesBtn">規則</button>
      </nav>
    </header>`;
}
app.addEventListener("click", e => {
  const b = e.target.closest("[data-tab]");
  if (b) { T.tab = b.dataset.tab; render(); }
  if (e.target.closest("#rulesBtn")) showRules();
});

// 投影遊戲規則（字放大給後排看）
function showRules() {
  overlay.innerHTML = `
    <div class="ovcard" role="dialog" aria-modal="true" style="font-size:clamp(1.15rem, 1.8vw, 1.6rem)">
      <h2>滄浪闖關・遊戲規則</h2>
      ${rulesHtml()}
      <div><button class="primary" id="ovClose" style="font-size:1.2rem">關閉</button></div>
    </div>`;
  overlay.classList.remove("hidden");
  $("ovClose").onclick = () => overlay.classList.add("hidden");
}

function render() {
  if (T.tab === "scores") return renderScores();
  if (T.tab === "stats") return renderStats();
  if (!T.room) return renderSetup();
  renderGame();
}

/* ---------- 建立遊戲 ---------- */
function renderSetup() {
  corner.classList.add("hidden");
  const L = T.manifest;
  app.innerHTML = `
    ${topbar("高三國文總複習・全班合力魔王戰")}
    <div class="card setup page">
      <h2>選擇要複習的課</h2>
      <p class="muted" style="margin:0">勾一課＝單課 20 題；勾多課＝跨課複習，從各課平均抽出 20 題，魔王用第一個勾的課。</p>
      <div class="lessons">${L.map(l => {
        const i = T.pick.indexOf(l.id);
        return `<label class="lesson">
          <input type="checkbox" data-lesson="${esc(l.id)}" ${i >= 0 ? "checked" : ""} ${l.count ? "" : "disabled"}>
          <span>〈${esc(l.lesson)}〉<br><span class="small">${l.count} 題・魔王「${esc(l.boss)}」</span>
            ${l.hasImage ? "" : `<span class="warnchip">缺魔王圖</span>`}
            ${l.warn.map(w => `<span class="warnchip">⚠ ${esc(w)}</span>`).join("")}</span>
          ${i >= 0 && T.pick.length > 1 ? `<span class="ord">${i + 1}</span>` : ""}
        </label>`;
      }).join("")}</div>
      <div class="row">
        <label><input type="radio" name="mode" value="formal" ${T.mode === "formal" ? "checked" : ""}> 正式版（計分，20 題）</label>
        <label><input type="radio" name="mode" value="trial" ${T.mode === "trial" ? "checked" : ""}> 試玩版（不計分，${CONFIG.trialQuestions} 題）</label>
        <label>每段作答 <select id="minSel">${CONFIG.segmentMinutes.map(m => `<option value="${m}" ${m === T.minutes ? "selected" : ""}>${m} 分鐘</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <button class="primary" id="createBtn" style="font-size:1.2rem; padding:.6em 1.6em" ${T.pick.length && !T.busy ? "" : "disabled"}>建立遊戲</button>
        <span class="muted">${T.pick.length ? lessonLabel(T.pick.map(id => L.find(l => l.id === id).lesson)) : "還沒選課"}</span>
        <span class="bad">${esc(T.msg)}</span>
      </div>
      <div class="row small"><span>登入：${esc(auth.currentUser?.email || "")}</span><button id="logoutBtn">登出</button></div>
    </div>`;
  app.querySelectorAll("[data-lesson]").forEach(c => c.onchange = () => {
    const id = c.dataset.lesson;
    T.pick = c.checked ? [...T.pick, id] : T.pick.filter(x => x !== id);
    renderSetup();
  });
  app.querySelectorAll("[name=mode]").forEach(r => r.onchange = () => { T.mode = r.value; });
  $("minSel").onchange = e => { T.minutes = +e.target.value; store.set("minutes", T.minutes); };
  $("createBtn").onclick = createRoom;
  $("logoutBtn").onclick = () => signOut(auth);
}

async function createRoom() {
  T.busy = true; T.msg = ""; renderSetup();
  try {
    const ids = T.pick.slice();
    const { banks } = await loadBanks(ids);
    const keys = pickQuestions(banks, ids, T.mode);
    const first = T.manifest.find(l => l.id === ids[0]);
    let roomId;
    for (let i = 0; i < 20; i++) {
      const c = String(1000 + Math.floor(Math.random() * 9000));
      const r = await getDoc(doc(db, "cl_rooms", c));
      if (!r.exists() || r.data().status === "closed") { roomId = c; break; }
    }
    if (!roomId) throw new Error("找不到可用的房間代碼，請再試一次");
    await setDoc(doc(db, "cl_rooms", roomId), {
      status: "lobby", mode: T.mode, lessons: ids, lessonNames: ids.map(id => banks[id].lesson),
      lessonKey: ids.length === 1 ? ids[0] : "mix-" + ids.join("+"), keys,
      boss: { ...bossOf(banks[ids[0]], first?.hasImage), ...((await loadMissions())[ids[0]] || {}) },
      segMinutes: T.minutes, seg: 0, segEndsAt: 0, n: 0,
      battle: null, createdAt: serverTimestamp(), teacher: auth.currentUser.uid,
    });
    T.busy = false;
    openRoom(roomId);
  } catch (e) {
    T.busy = false; T.msg = `建立失敗：${e.code || e.message}`; renderSetup();
  }
}

/* ---------- 房間 ---------- */
function openRoom(roomId) {
  T.unsubs.forEach(u => u());
  T.roomId = roomId; store.set("room", roomId);
  T.room = null; T.players = []; T.answers = []; T.battle = null; T.prevBattle = null;
  const rRef = doc(db, "cl_rooms", roomId);
  T.unsubs = [
    onSnapshot(rRef, async s => {
      const room = s.data();
      if (!room || room.status === "closed") { leaveRoom(); return; }
      T.room = room;
      const sig = room.lessons.join(",");
      if (T.banksFor !== sig) { T.qmap = (await loadBanks(room.lessons)).qmap; T.banksFor = sig; }
      recompute(); render(); armTimer();
    }),
    onSnapshot(collection(rRef, "players"), s => {
      T.players = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.cls.localeCompare(b.cls) || a.seat - b.seat);
      if (T.room) { recompute(); render(); checkAllDone(); }
    }),
    onSnapshot(collection(rRef, "answers"), s => {
      T.answers = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at || 0) - (b.at || 0));
      if (!T.room) return;
      const prev = T.battle;
      recompute(); render();
      if (prev && T.battle) animate(prev, T.battle);
      checkAllDone();
    }),
  ];
}

function leaveRoom() {
  T.unsubs.forEach(u => u()); T.unsubs = [];
  clearInterval(T.timer);
  T.room = null; T.roomId = null; store.set("room", null);
  T.pick = []; render();
}

const segDone = () => !T.room ? 0 : (T.room.status === "answering" ? T.room.seg - 1 : T.room.seg);
const nPlayers = () => T.room.n || T.players.length || 1;

// 依作答紀錄重算戰況，必要時寫回房間給學生看
function recompute() {
  const room = T.room;
  if (!room || room.seg === 0) { T.battle = null; return; }
  const b = replay(nPlayers(), room.mode, T.answers, T.qmap, segDone());
  T.battle = b;
  scheduleWrite();
}

function battleForRoom(b) {
  return b && { boss: b.boss, bossMax: b.bossMax, morale: b.morale, shield: b.shield, energy: b.energy, ultimates: b.ultimates, defeatedSeg: b.defeatedSeg };
}
function scheduleWrite(now = false) {
  if (!T.battle || !T.room) return;
  const same = JSON.stringify(battleForRoom(T.battle)) === JSON.stringify(T.room.battle);
  if (same) return;
  clearTimeout(T.writeTimer);
  const wait = now ? 0 : Math.max(0, CONFIG.roomWriteThrottleMs - (Date.now() - T.lastWrite));
  T.writeTimer = setTimeout(() => {
    T.lastWrite = Date.now();
    updateDoc(doc(db, "cl_rooms", T.roomId), { battle: battleForRoom(T.battle) }).catch(() => {});
  }, wait);
}

function animate(prev, b) {
  const sc = $("scene");
  if (!sc) return;
  sc.classList.remove("hit", "ult", "struck"); void sc.offsetWidth;
  if (b.boss < prev.boss) sc.classList.add("hit");
  if (b.ultimates > prev.ultimates) { $("flash").classList.add("gold"); sc.classList.add("ult"); banner(`${ULTIMATE_NAME}！`); }
  if (b.defeatedSeg && !prev.defeatedSeg) banner(`${T.room.boss.name}被打倒了！`);
}
function banner(text) {
  const d = document.createElement("div");
  d.className = "banner"; d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1900);
}

/* ---------- 計時 ---------- */
function armTimer() {
  clearInterval(T.timer);
  if (T.room?.status !== "answering") return;
  const tick = () => {
    const left = Math.max(0, Math.round((T.room.segEndsAt - Date.now()) / 1000));
    const el = $("bigTimer"), el2 = $("timerStat");
    const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (el) { el.textContent = txt; el.classList.toggle("low", left <= 30); }
    if (el2) el2.textContent = txt;
    if (left <= 0) endSegment();
  };
  tick();
  T.timer = setInterval(tick, 500);
}

function playerDone(p) { return progress(T.room.keys, T.answers.filter(a => a.uid === p.uid)).done >= T.room.keys.length; }
function checkAllDone() {
  if (T.room?.status === "answering" && T.players.length && T.players.every(playerDone)) endSegment(true);
}

/* ---------- 控制 ---------- */
async function act(fn) {
  if (T.busy) return;
  T.busy = true; renderCorner();
  try { await fn(); } catch (e) { tell(`操作失敗：${e.code || e.message}`); }
  T.busy = false; renderCorner();
}

function startSegment() {
  return act(async () => {
    const r = T.room;
    const n = r.n || T.players.length;
    if (!n) throw new Error("還沒有學生加入");
    const upd = { status: "answering", seg: r.seg + 1, segEndsAt: Date.now() + r.segMinutes * 60000, n };
    if (r.seg === 0) {
      const b = replay(n, r.mode, [], T.qmap, 0);
      upd.battle = battleForRoom(b);
    }
    await updateDoc(doc(db, "cl_rooms", T.roomId), upd);
  });
}

let ending = false;
async function endSegment(allDone = false) {
  if (ending || T.room?.status !== "answering") return;
  ending = true;
  clearInterval(T.timer);
  try {
    const b = replay(nPlayers(), T.room.mode, T.answers, T.qmap, T.room.seg);
    await updateDoc(doc(db, "cl_rooms", T.roomId), { status: "result", segEndsAt: 0, battle: battleForRoom(b), allDone: !!allDone });
  } catch (e) { tell(`結算失敗：${e.code || e.message}`); }
  ending = false;
}

function endGame() {
  return act(async () => {
    const b = replay(nPlayers(), T.room.mode, T.answers, T.qmap, segDone());
    await updateDoc(doc(db, "cl_rooms", T.roomId), { status: "ended", segEndsAt: 0, battle: battleForRoom(b) });
  });
}

async function deleteInBatches(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const wb = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => wb.delete(r));
    await wb.commit();
  }
}

async function settleAndClear(save) {
  const formal = T.room.mode !== "trial";
  const msg = save && formal
    ? `確定結算並清除？\n成績會寫入成績頁，再刪除本場的作答紀錄。\n（已加入 ${T.players.length} 人）`
    : "確定清除本堂資料？\n本場的作答紀錄會全部刪除，不寫入成績。";
  if (!(await ask(msg, { danger: !save }))) return;
  return act(async () => {
    const room = T.room, rRef = doc(db, "cl_rooms", T.roomId);
    if (save && formal) {
      const sc = computeScores(T.players, T.answers, room.keys, T.qmap);
      const date = new Date().toISOString().slice(0, 10);
      const lessonName = lessonLabel(room.lessonNames);
      const ops = [];
      for (const p of T.players) {
        const s = sc[p.uid];
        ops.push(wb => wb.set(doc(db, "cl_scores", `${room.lessonKey}_${p.cls}_${p.seat}`), {
          lessonKey: room.lessonKey, lessonName, cls: p.cls, seat: p.seat, score: s.score, perQ: s.perQ,
          unanswered: s.unanswered, total: room.keys.length * CONFIG.pointsPerQuestion, date, roomId: T.roomId,
        }));
      }
      // 各題累計答錯率：只看第一次作答
      const agg = {};
      const seen = new Set();
      for (const a of T.answers) {
        const q = T.qmap[a.key];
        if (!a.first || !q || seen.has(a.uid + a.key)) continue;
        seen.add(a.uid + a.key);
        const id = `${a.cls}_${a.key.replace(":", "_")}`;
        agg[id] ??= { cls: a.cls, key: a.key, bankId: q.bankId, lesson: q.lesson, attempts: 0, wrong: 0 };
        agg[id].attempts++;
        if (!scoreAnswer(q, a.sel).correct) agg[id].wrong++;
      }
      for (const [id, v] of Object.entries(agg)) {
        ops.push(wb => wb.set(doc(db, "cl_stats", id), {
          cls: v.cls, key: v.key, bankId: v.bankId, lesson: v.lesson, attempts: increment(v.attempts), wrong: increment(v.wrong),
        }, { merge: true }));
      }
      for (let i = 0; i < ops.length; i += 400) {
        const wb = writeBatch(db);
        ops.slice(i, i + 400).forEach(f => f(wb));
        await wb.commit();
      }
    }
    // 先關房間，學生手機才會顯示「遊戲已結束」而不是「被移出」
    const [ans, pls] = await Promise.all([getDocs(collection(rRef, "answers")), getDocs(collection(rRef, "players"))]);
    await updateDoc(rRef, { status: "closed", keys: [], battle: null });
    await deleteInBatches([...ans.docs, ...pls.docs].map(d => d.ref));
  });
}

async function kick(p) {
  if (!(await ask(`把 ${p.cls} 班 ${p.seat} 號移出房間？\n這個座號的作答紀錄也會刪除，讓正確的學生重新加入。`, { okText: "移出" }))) return;
  await act(async () => {
    const rRef = doc(db, "cl_rooms", T.roomId);
    const ans = await getDocs(query(collection(rRef, "answers"), where("uid", "==", p.uid)));
    await deleteInBatches(ans.docs.map(d => d.ref));
    await deleteDoc(doc(rRef, "players", p.id));
  });
}

/* ---------- 投影畫面 ---------- */
function bossScene(b) {
  const r = b ? b.boss / b.bossMax : 1;
  const s = (0.72 + 0.28 * r).toFixed(3);
  return `
    <div class="scene" id="scene">
      <div class="bosswrap"><div class="bossbob">
        <img class="bossimg" alt="" src="${esc(T.room.boss.imageDefeated)}" style="opacity:${(1 - r).toFixed(2)};--s:${s}">
        <img class="bossimg" alt="" src="${esc(T.room.boss.image)}" style="opacity:${r.toFixed(2)};--s:${s}">
      </div></div>
      <div class="flash" id="flash"></div>
      <div class="bossname">${esc(T.room.boss.name)}</div>
    </div>`;
}

function meters(b) {
  const n = nPlayers();
  const th = thresholds(n);
  if (!b) return `<div class="meters"><div class="mrow"><span>魔王血量</span><b>開始後依人數計算</b></div></div>`;
  return `
    <div class="meters">
      <div><div class="mrow"><span>魔王血量</span><b>${Math.ceil(b.boss)} / ${b.bossMax}</b></div>
        <div class="track"><div class="fill mud" style="width:${b.boss / b.bossMax * 100}%"></div></div></div>
      <div><div class="mrow"><span>全班心志</span><b>${b.morale} / ${CONFIG.moraleMax}</b></div>
        <div class="track"><div class="fill heart" style="width:${b.morale / CONFIG.moraleMax * 100}%"></div></div></div>
      <div><div class="mrow"><span>護盾</span><b>${b.shield} 點<span class="small">（每 ${th.shieldUnit} 點擋 ${CONFIG.shieldBlock}）</span></b></div>
        <div class="track"><div class="fill shield" style="width:${Math.min(1, b.shield / (th.shieldUnit * CONFIG.shieldBlockMax / CONFIG.shieldBlock)) * 100}%"></div></div></div>
      <div><div class="mrow"><span>能量（${ULTIMATE_NAME}）</span><b>${b.energy} / ${th.ultimateAt}</b></div>
        <div class="track"><div class="fill energy" style="width:${b.energy / th.ultimateAt * 100}%"></div></div></div>
      ${b.failedSeg ? `<div class="bad">全班心志歸零，魔王戰失敗；作答繼續，成績不受影響。</div>` : ""}
    </div>`;
}

function segAnswers(seg) { return T.answers.filter(a => a.seg === seg); }
function tierStats(list) {
  const t = { m: [0, 0], u: [0, 0], a: [0, 0] };
  for (const a of list) {
    const q = T.qmap[a.key];
    if (!q) continue;
    t[q.tier][1]++;
    if (scoreAnswer(q, a.sel).correct) t[q.tier][0]++;
  }
  return `<div class="tierstats">${["m", "u", "a"].map(k => `<div><span>${TIERS[k].name}（${TIERS[k].action}）</span><b>${t[k][0]} / ${t[k][1]}</b><span class="small">答對／作答${t[k][1] ? `・${Math.round(t[k][0] / t[k][1] * 100)}%` : ""}</span></div>`).join("")}</div>`;
}
function wrongList(list, limit) {
  const w = topWrong(list, T.qmap, limit);
  if (!list.length) return `<p class="muted line">這一段沒有人作答。</p>`;
  if (!w.length) return `<p class="muted line">沒有人答錯，太厲害了！</p>`;
  return `<div class="wrongs">${w.map(({ key, n }, i) => {
    const q = T.qmap[key];
    return `<button class="wrong" data-show="${esc(key)}"><span class="tag ${q.tier}">${i + 1}</span><span class="s">${esc(q.stem)}${T.room.lessons.length > 1 ? `<span class="small">〈${esc(q.lesson)}〉</span>` : ""}</span><span class="n">${n} 人答錯</span></button>`;
  }).join("")}</div>`;
}

function renderGame() {
  const room = T.room, b = T.battle;
  const st = { lobby: "等待加入", answering: `第 ${room.seg} 段作答中`, result: `第 ${room.seg} 段結算`, ended: "遊戲結束" }[room.status] || "";
  const finished = T.players.filter(playerDone).length;
  const statsHtml = `
    <div class="stat">房間<b>${esc(T.roomId)}</b></div>
    <div class="stat">已加入<b>${T.players.length}</b></div>
    ${room.seg ? `<div class="stat">全部答完<b>${finished}</b></div>` : ""}
    ${room.status === "answering" ? `<div class="stat alert">剩餘<b id="timerStat"></b></div>` : ""}`;
  app.innerHTML = `
    ${topbar(`${esc(lessonLabel(room.lessonNames))}・${room.mode === "trial" ? "試玩版（不計分）" : "正式版"}・${st}`, statsHtml)}
    <main class="stage">
      <section class="field">${bossScene(b)}${meters(b)}</section>
      <section class="panel" id="panel">${panelHtml()}</section>
    </main>
    <div style="height:90px"></div>`;
  if (room.status === "lobby") drawQr();
  app.querySelectorAll("[data-show]").forEach(x => x.onclick = () => showQuestion(x.dataset.show));
  app.querySelectorAll("[data-kick]").forEach(x => x.onclick = () => kick(T.players.find(p => p.id === x.dataset.kick)));
  renderCorner();
  armTimer();
}

function studentUrl() { return new URL(`index.html?room=${T.roomId}`, location.href).href; }
function drawQr() {
  const el = $("qr");
  if (!el || !window.QRCode) return;
  el.innerHTML = "";
  new window.QRCode(el, { text: studentUrl(), width: 340, height: 340, correctLevel: window.QRCode.CorrectLevel.M });
}

function seatChips(kickable) {
  if (!T.players.length) return `<p class="muted line">還沒有人加入</p>`;
  const now = Date.now();
  return `<div class="seats">${T.players.map(p => {
    const off = p.lastSeen?.toMillis && now - p.lastSeen.toMillis() > CONFIG.heartbeatMs * 2.5;
    const done = T.room.seg && playerDone(p);
    return kickable
      ? `<button class="seat ${off ? "off" : ""} ${done ? "done" : ""}" data-kick="${esc(p.id)}" title="點一下可移出">${esc(p.cls)}-${p.seat}</button>`
      : `<span class="seat ${off ? "off" : ""} ${done ? "done" : ""}">${esc(p.cls)}-${p.seat}</span>`;
  }).join("")}</div>`;
}

function panelHtml() {
  const room = T.room, b = T.battle;
  if (room.status === "lobby") {
    return `
      <div class="lobby">
        <div id="qr"></div>
        <div style="display:grid; gap:12px">
          <div class="line">手機掃 QR Code，或輸入房間代碼</div>
          <div class="code">${esc(T.roomId)}</div>
          <div class="url">${esc(studentUrl())}</div>
          <div class="line">已加入 <b>${T.players.length}</b> 人</div>
        </div>
      </div>
      ${seatChips(true)}
      <p class="small" style="margin:0">座號點一下可以移出（學生填錯座號時用）。</p>
      ${missionHtml(room.boss, { big: true })}`;
  }
  if (room.status === "answering") {
    const list = segAnswers(room.seg);
    return `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px">
        <div><div class="line muted">第 ${room.seg} 段・剩餘時間</div><div class="giant" id="bigTimer"></div></div>
        <div style="text-align:right"><div class="line muted">本段已作答</div><div class="huge">${list.length} 人次</div></div>
      </div>
      ${tierStats(list)}
      ${b?.defeatedSeg ? `<div class="huge" style="color:var(--good)">${esc(room.boss.name)}被打倒了！繼續作答，把 ${room.keys.length} 題答完。</div>` : ""}
      <details><summary class="muted">座號（綠色＝已答完全部 ${room.keys.length} 題）</summary>${seatChips(true)}</details>`;
  }
  if (room.status === "result") {
    const n = nPlayers();
    const before = replay(n, room.mode, T.answers.filter(a => a.seg < room.seg), T.qmap, room.seg - 1);
    const counter = b?.counters.find(c => c.seg === room.seg);
    const ultNow = (b?.ultimates || 0) - before.ultimates;
    const finished = T.players.filter(playerDone).length;
    const nextCounter = room.seg % CONFIG.counterEvery === 0 ? CONFIG.counterEvery : CONFIG.counterEvery - room.seg % CONFIG.counterEvery;
    return `
      <div class="huge">${room.allDone ? "全班都答完了！" : `第 ${room.seg} 段戰果`}</div>
      <ul class="fxlist">
        <li>魔王血量 −${Math.round((before.boss - (b?.boss ?? before.boss)) * 10) / 10}${b?.boss <= 0 ? `　<span class="good">${esc(room.boss.name)}已被打倒！</span>` : `（剩 ${Math.ceil(b?.boss ?? 0)}）`}</li>
        ${ultNow > 0 ? `<li class="big">發動 ${ULTIMATE_NAME} ${ultNow} 次</li>` : ""}
        <li>護盾 ${b?.shield ?? 0} 點、能量 ${b?.energy ?? 0} / ${thresholds(n).ultimateAt}</li>
        ${counter ? `<li class="boss">魔王反擊！護盾擋下 ${counter.blocked}，全班心志 −${counter.damage}</li>` : (b?.boss > 0 ? `<li class="muted">再 ${nextCounter} 段後魔王反擊</li>` : "")}
        <li>全班已完成 ${finished} / ${T.players.length} 人（${room.keys.length} 題全答完）</li>
      </ul>
      <h2>本段最多人答錯</h2>
      ${wrongList(segAnswers(room.seg), 3)}`;
  }
  // ended
  const sc = computeScores(T.players, T.answers, room.keys, T.qmap);
  const arr = Object.values(sc);
  const avg = arr.length ? arr.reduce((s, x) => s + x.score, 0) / arr.length : 0;
  const unans = arr.filter(x => x.unanswered).length;
  return `
    <div class="huge">${b?.boss <= 0 ? `${esc(room.boss.name)}被打倒了！` : `${esc(room.boss.name)}還剩 ${Math.ceil(b?.boss ?? 0)} 血`}</div>
    ${b?.boss <= 0 ? defeatedHtml(room.boss) : ""}
    <div class="row line">
      <span>${room.mode === "trial" ? "試玩平均" : "全班平均"} <b class="huge" style="font-size:clamp(2rem,3.5vw,3rem)">${avg.toFixed(1)}</b> 分</span>
      <span class="muted">${arr.length} 人${unans ? `・${unans} 人有未作答題目` : ""}</span>
    </div>
    <h2>各行動答對率（含重答）</h2>
    ${tierStats(T.answers)}
    <h2>全場答錯最多的題目</h2>
    ${wrongList(T.answers, 8)}`;
}

function renderCorner() {
  if (T.tab !== "game" || !T.room) { corner.classList.add("hidden"); return; }
  corner.classList.remove("hidden");
  const s = T.room.status, dis = T.busy ? "disabled" : "";
  const btn = (id, text, cls = "") => `<button id="${id}" class="${cls}" ${dis}>${text}</button>`;
  corner.innerHTML = [
    s === "lobby" && btn("cStart", "開始作答", "primary"),
    s === "answering" && btn("cEndSeg", "提前結束本段"),
    s === "result" && !T.room.allDone && btn("cNext", "開始下一段", "primary"),
    (s === "result" || s === "answering") && btn("cEnd", "結束遊戲", T.room.allDone ? "primary" : ""),
    s === "ended" && T.room.mode !== "trial" && btn("cSettle", "結算並清除", "primary"),
    btn("cClear", s === "ended" && T.room.mode === "trial" ? "清除本堂資料" : "清除本堂資料（不計分）", "danger"),
  ].filter(Boolean).join("");
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on("cStart", startSegment);
  on("cEndSeg", async () => (await ask("提前結束本段？")) && endSegment());
  on("cNext", startSegment);
  on("cEnd", async () => (await ask("結束遊戲，顯示總結果？")) && endGame());
  on("cSettle", () => settleAndClear(true));
  on("cClear", () => settleAndClear(false));
}

function showQuestion(key) {
  const q = T.qmap[key];
  if (!q) return;
  const right = new Set(q.answer);
  overlay.innerHTML = `
    <div class="ovcard" role="dialog" aria-modal="true">
      <div class="row"><span class="tag ${q.tier}">${TIERS[q.tier].name}</span>${q.type === "multi" ? `<span class="tag multi">多選</span>` : ""}<span class="muted">〈${esc(q.lesson)}〉${q.exam ? `・${esc(q.exam)}` : ""}</span></div>
      ${passageHtml(q.passage)}
      <div class="stem">${esc(q.stem)}</div>
      <div class="ovopts">${q.options.map((o, i) => `<div class="ovopt ${right.has(i) ? "right" : ""}">${right.has(i) ? "✓ " : ""}${esc(o)}</div>`).join("")}</div>
      <div class="exp">${esc(q.explanation)}</div>
      <div><button class="primary" id="ovClose" style="font-size:1.2rem">關閉</button></div>
    </div>`;
  overlay.classList.remove("hidden");
  $("ovClose").onclick = () => overlay.classList.add("hidden");
}
overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.add("hidden"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.classList.add("hidden"); });

/* ---------- 成績頁 ---------- */
let scoreCache = null;
async function fetchScores(force) {
  if (!scoreCache || force) scoreCache = (await getDocs(collection(db, "cl_scores"))).docs.map(d => d.data());
  return scoreCache;
}

async function renderScores() {
  corner.classList.add("hidden");
  app.innerHTML = `${topbar("成績頁")}<div class="card">讀取中……</div>`;
  let all;
  try { all = await fetchScores(true); } catch (e) { app.innerHTML = `${topbar("成績頁")}<div class="card bad">讀取失敗：${esc(e.code || e.message)}</div>`; return; }
  const cls = store.get("scoreCls") || CONFIG.classes[0];
  const rows = all.filter(s => s.cls === cls);
  const lessons = [...new Map(rows.map(s => [s.lessonKey, s.lessonName])).entries()];
  const seats = [...new Set(rows.map(s => s.seat))].sort((a, b) => a - b);
  const cell = {};
  rows.forEach(s => cell[`${s.lessonKey}|${s.seat}`] = s);
  app.innerHTML = `
    ${topbar("成績頁：每位學生每課 100 分制")}
    <div class="card page">
      <div class="row">
        <label>班級 <select id="clsSel">${CONFIG.classes.map(c => `<option ${c === cls ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <button id="csvBtn" ${rows.length ? "" : "disabled"}>下載成績（Excel 可開）</button>
        <button id="pdfBtn" ${rows.length ? "" : "disabled"}>列印／存成 PDF</button>
      </div>
      <div class="printonly">
        <h2>滄浪闖關成績・${esc(cls)} 班</h2>
        <p style="margin:0">列印日期：${new Date().toLocaleDateString("zh-TW")}　每課滿分 100 分</p>
      </div>
      ${rows.length ? `
      <div class="tablewrap"><table>
        <thead><tr><th>座號</th>${lessons.map(([, n]) => `<th class="l">${esc(n)}</th>`).join("")}</tr></thead>
        <tbody>${seats.map(seat => `<tr><td>${seat}</td>${lessons.map(([k]) => {
          const s = cell[`${k}|${seat}`];
          return `<td>${s ? `${s.score}${s.unanswered ? `<br><span class="small bad">未作答 ${s.unanswered} 題</span>` : ""}` : `<span class="small">—</span>`}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="small" style="margin:0">「—」表示這個座號那一課沒有加入遊戲。同一課重玩時，成績以最後一次結算為準。</p>` : `<p class="muted">這個班還沒有成績。正式版遊戲結束後按「結算並清除」，成績就會出現在這裡。</p>`}
      <hr style="border:none; border-top:1px solid var(--line); width:100%">
      <div class="row"><button class="danger" id="wipeBtn">刪除本學年成績</button><span class="small">成績與統計全部刪除，無法復原。學年結束時再按。</span></div>
    </div>`;
  $("clsSel").onchange = e => { store.set("scoreCls", e.target.value); renderScores(); };
  const table = () => [["座號", ...lessons.map(([, n]) => n), ...lessons.map(([, n]) => `${n} 未作答題數`)],
    ...seats.map(seat => [seat, ...lessons.map(([k]) => cell[`${k}|${seat}`]?.score ?? ""), ...lessons.map(([k]) => cell[`${k}|${seat}`]?.unanswered ?? "")])];
  if (rows.length) {
    $("csvBtn").onclick = () => {
      const csv = table().map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `滄浪闖關成績_${cls}班_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };
    $("pdfBtn").onclick = () => print();
  }
  $("wipeBtn").onclick = wipeYear;
}

async function wipeYear() {
  const word = await ask("刪除本學年全部成績與統計，無法復原。\n確定的話請輸入「刪除」兩個字：", { input: true, okText: "刪除", danger: true });
  if (word !== "刪除") return;
  const [s1, s2] = await Promise.all([getDocs(collection(db, "cl_scores")), getDocs(collection(db, "cl_stats"))]);
  await deleteInBatches([...s1.docs, ...s2.docs].map(d => d.ref));
  scoreCache = null;
  await tell(`已刪除 ${s1.size} 筆成績、${s2.size} 筆統計。`);
  render();
}

/* ---------- 統計頁 ---------- */
async function renderStats() {
  corner.classList.add("hidden");
  app.innerHTML = `${topbar("統計頁")}<div class="card">讀取中……</div>`;
  let stats, scores;
  try {
    [stats, scores] = await Promise.all([getDocs(collection(db, "cl_stats")).then(s => s.docs.map(d => d.data())), fetchScores(true)]);
  } catch (e) { app.innerHTML = `${topbar("統計頁")}<div class="card bad">讀取失敗：${esc(e.code || e.message)}</div>`; return; }
  const cls = store.get("statCls") || CONFIG.classes[0];
  const st = stats.filter(s => s.cls === cls);
  const sc = scores.filter(s => s.cls === cls);
  const bankIds = [...new Set(st.map(s => s.bankId))];
  const { qmap } = await loadBanks(bankIds.filter(id => T.manifest.some(l => l.id === id))).catch(() => ({ qmap: {} }));
  // 每課平均（只看單課成績）與各題答錯率
  const byLesson = bankIds.map(id => {
    const items = st.filter(s => s.bankId === id).map(s => ({ ...s, rate: s.attempts ? s.wrong / s.attempts : 0 })).sort((a, b) => b.rate - a.rate);
    const ss = sc.filter(s => s.lessonKey === id);
    const avg = ss.length ? ss.reduce((t, s) => t + s.score, 0) / ss.length : null;
    const wrongRate = items.reduce((t, s) => t + s.wrong, 0) / Math.max(1, items.reduce((t, s) => t + s.attempts, 0));
    return { id, lesson: items[0]?.lesson || id, items, avg, n: ss.length, wrongRate };
  }).sort((a, b) => b.wrongRate - a.wrongRate);
  const tierAgg = { m: [0, 0], u: [0, 0], a: [0, 0] };
  st.forEach(s => { const q = qmap[s.key]; if (q) { tierAgg[q.tier][0] += s.wrong; tierAgg[q.tier][1] += s.attempts; } });
  app.innerHTML = `
    ${topbar("統計頁：找出最弱的課與考點")}
    <div class="card page">
      <div class="row"><label>班級 <select id="clsSel">${CONFIG.classes.map(c => `<option ${c === cls ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <span class="small">答錯率只算每人每題的第一次作答；課依答錯率由高到低排列。</span></div>
      ${!byLesson.length ? `<p class="muted">這個班還沒有統計資料。</p>` : `
      <div class="tierstats">${["m", "u", "a"].map(k => `<div><span>${TIERS[k].name}</span><b>${tierAgg[k][1] ? Math.round(tierAgg[k][0] / tierAgg[k][1] * 100) : 0}%</b><span class="small">答錯率（${tierAgg[k][1]} 人次）</span></div>`).join("")}</div>
      ${byLesson.map(L => `
        <details>
          <summary style="font-size:1.15rem"><b>〈${esc(L.lesson)}〉</b>　答錯率 <span class="${L.wrongRate >= 0.5 ? "bad" : ""}">${Math.round(L.wrongRate * 100)}%</span>　${L.avg != null ? `全班平均 ${L.avg.toFixed(1)} 分（${L.n} 人）` : `<span class="small">只出現在跨課複習</span>`}</summary>
          <div class="tablewrap" style="margin-top:8px"><table>
            <thead><tr><th>答錯率</th><th>題型</th><th>考點</th><th class="l">題目</th><th>人次</th></tr></thead>
            <tbody>${L.items.map(s => { const q = qmap[s.key]; return `<tr>
              <td><span class="rate ${s.rate >= 0.5 ? "bad" : ""}">${Math.round(s.rate * 100)}%</span></td>
              <td>${q ? `<span class="tag ${q.tier}">${TIERS[q.tier].name}</span>` : ""}</td>
              <td>${esc(q?.topic || "")}</td>
              <td class="l">${q ? `<a href="#" data-q="${esc(s.key)}">${esc(q.stem)}</a>` : esc(s.key)}</td>
              <td>${s.wrong} / ${s.attempts}</td></tr>`; }).join("")}</tbody>
          </table></div>
        </details>`).join("")}`}
    </div>`;
  $("clsSel").onchange = e => { store.set("statCls", e.target.value); renderStats(); };
  app.querySelectorAll("[data-q]").forEach(a => a.onclick = e => { e.preventDefault(); Object.assign(T.qmap, qmap); showQuestion(a.dataset.q); });
}
