// 學生手機頁
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, onSnapshot, runTransaction, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, $, esc, loadBanks, passageHtml, lessonLabel, rulesHtml } from "./common.js";
import { CONFIG, TIERS } from "./config.js";
import { missionHtml, defeatedHtml } from "./mission.js";
import { scoreAnswer, nextQuestion, progress, shuffle, computeScores } from "./game.js";

const main = $("main");
const params = new URLSearchParams(location.search);
const SAVE = "canglang-student";
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const save = v => { try { localStorage.setItem(SAVE, JSON.stringify(v)); } catch {} };

const S = {
  uid: null, roomId: (params.get("room") || "").toUpperCase(), room: null, cls: null, seat: null,
  qmap: null, order: [], mine: [], cur: null, picked: new Set(), result: null, busy: false, err: "",
  unsubRoom: null, unsubMe: null, banksFor: "",
};

// 依學生 uid 打亂出題順序，鄰座拿到的題目順序不同
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

onAuthStateChanged(auth, u => {
  if (!u) { signInAnonymously(auth).catch(e => fatal("無法連線，請確認網路後重新整理。" + e.code)); return; }
  S.uid = u.uid;
  const saved = load();
  if (saved.room && saved.room === S.roomId && saved.uid === u.uid) { S.cls = saved.cls; S.seat = saved.seat; join(true); }
  else renderJoin();
});

const howto = open => `<details class="howto card" ${open ? "open" : ""}><summary>遊戲怎麼玩？</summary>${rulesHtml()}</details>`;

function fatal(msg) { main.innerHTML = `<div class="card center err">${esc(msg)}</div>`; }

// 任何沒接住的錯誤都顯示在畫面上，不留空白，方便老師判斷原因
function showCrash(e) {
  const msg = e?.message || e?.reason?.message || String(e?.reason || e);
  main.insertAdjacentHTML("afterbegin", `<div class="card err">畫面出錯了，請重新整理；還是不行請截圖給老師。<br><small>${esc(msg)}</small></div>`);
}
addEventListener("error", showCrash);
addEventListener("unhandledrejection", showCrash);

/* ---------- 加入 ---------- */
function renderJoin() {
  $("who").textContent = "";
  main.innerHTML = `
    <div class="card form">
      <div class="big">加入遊戲</div>
      <label>房間代碼<input id="roomIn" inputmode="numeric" autocomplete="off" maxlength="6" value="${esc(S.roomId)}"></label>
      <label>班級<select id="clsIn">${CONFIG.classes.map(c => `<option ${c === S.cls ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>座號<input id="seatIn" type="number" inputmode="numeric" min="1" max="${CONFIG.maxSeat}" value="${S.seat ?? ""}"></label>
      <p class="muted" style="margin:0">不用填姓名，只要班級和座號。</p>
      <div class="err" id="err">${esc(S.err)}</div>
      <button class="primary wide" id="joinBtn">加入</button>
    </div>
    ${howto(false)}`;
  $("joinBtn").onclick = () => {
    const seat = parseInt($("seatIn").value, 10);
    S.roomId = $("roomIn").value.trim().toUpperCase();
    S.cls = $("clsIn").value;
    if (!S.roomId) return showErr("請輸入房間代碼");
    if (!(seat >= 1 && seat <= CONFIG.maxSeat)) return showErr(`座號請填 1 到 ${CONFIG.maxSeat}`);
    S.seat = seat;
    join(false);
  };
}
function showErr(m) { S.err = m; const e = $("err"); if (e) e.textContent = m; }

async function join(resume) {
  const roomRef = doc(db, "cl_rooms", S.roomId);
  const pRef = doc(db, "cl_rooms", S.roomId, "players", `${S.cls}_${S.seat}`);
  try {
    const r = await getDoc(roomRef);
    if (!r.exists() || ["closed"].includes(r.data().status)) { S.err = "找不到這個房間，請看投影幕上的代碼"; save({}); return renderJoin(); }
    await runTransaction(db, async tx => {
      const p = await tx.get(pRef);
      if (p.exists()) {
        if (p.data().uid !== S.uid) throw new Error("taken");
        tx.update(pRef, { lastSeen: serverTimestamp() });
      } else {
        tx.set(pRef, { uid: S.uid, cls: S.cls, seat: S.seat, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
      }
    });
  } catch (e) {
    const taken = e.message === "taken" || e.code === "permission-denied";
    S.err = taken ? "這個座號已經有人加入，請找老師" : `加入失敗（${e.code || e.message}），請再試一次`;
    if (resume) save({});
    return renderJoin();
  }
  S.err = "";
  save({ room: S.roomId, uid: S.uid, cls: S.cls, seat: S.seat });
  $("who").innerHTML = `${esc(S.cls)} 班 ${S.seat} 號<br>房間 ${esc(S.roomId)}`;
  const mineSnap = await getDocs(query(collection(db, "cl_rooms", S.roomId, "answers"), where("uid", "==", S.uid)));
  S.mine = mineSnap.docs.map(d => d.data()).sort((a, b) => (a.at || 0) - (b.at || 0));
  S.unsubMe = onSnapshot(pRef, s => { if (!s.exists()) kicked(); });
  S.unsubRoom = onSnapshot(roomRef,
    s => onRoom(s.exists() ? s.data() : null).catch(showCrash),
    e => fatal(`和房間的連線中斷（${e.code}），請重新整理。`));
  setInterval(() => updateDoc(pRef, { lastSeen: serverTimestamp() }).catch(() => {}), CONFIG.heartbeatMs);
}

function kicked() {
  if (S.room?.status === "closed") return;
  S.unsubRoom?.(); S.unsubMe?.();
  save({});
  S.err = "老師已把這個座號移出房間。請確認班級座號後重新加入。";
  renderJoin();
}

/* ---------- 房間狀態 ---------- */
async function onRoom(room) {
  if (!room || room.status === "closed") { save({}); return fatal("這場遊戲已經結束並清除，謝謝參與！"); }
  const prevStatus = S.room?.status, prevSeg = S.room?.seg;
  S.room = room;
  const sig = (room.lessons || []).join(",");
  if (S.banksFor !== sig) {
    const { qmap } = await loadBanks(room.lessons);
    S.qmap = qmap; S.banksFor = sig;
    S.order = shuffle(room.keys, seeded(S.uid + S.roomId));
  }
  if (room.status !== "answering" || prevSeg !== room.seg) { if (!S.result) S.cur = null; }
  if (room.status !== "answering") { S.cur = null; S.result = null; }
  if (prevStatus === room.status && room.status === "answering" && (S.cur || S.result)) return tick();
  render();
}

function battleMini(b) {
  if (!b) return "";
  const r = b.bossMax ? b.boss / b.bossMax : 1;
  return `
    <div class="card mini">
      <div class="scene"><div class="bosswrap"><div class="bossbob">
        <img class="bossimg" alt="" src="${esc(S.room.boss.imageDefeated)}" style="opacity:${(1 - r).toFixed(2)};--s:${(0.72 + 0.28 * r).toFixed(3)}">
        <img class="bossimg" alt="" src="${esc(S.room.boss.image)}" style="opacity:${r.toFixed(2)};--s:${(0.72 + 0.28 * r).toFixed(3)}">
      </div></div></div>
      <div class="meters">
        <div class="mrow"><span>${esc(S.room.boss.name)}</span><b>${Math.ceil(b.boss)} / ${b.bossMax}</b></div>
        <div class="track"><div class="fill mud" style="width:${r * 100}%"></div></div>
        <div class="mrow"><span>全班心志</span><b>${b.morale}</b></div>
        <div class="track"><div class="fill heart" style="width:${b.morale}%"></div></div>
      </div>
    </div>`;
}

function render() {
  const room = S.room;
  if (!room || !S.qmap) return;
  const head = `<div class="muted">${esc(lessonLabel(room.lessonNames || []))}・${room.mode === "trial" ? "試玩版（不計分）" : "正式版"}</div>`;
  if (room.status === "lobby") {
    main.innerHTML = `${head}<div class="card center"><div class="big">已加入，等老師開始</div><p class="muted">開始後，每次選一種行動，就會拿到一題。</p></div>${missionHtml(room.boss)}${howto(true)}`;
    return;
  }
  if (room.status === "result") {
    const pg = progress(room.keys, S.mine);
    main.innerHTML = `${head}<div class="card center"><div class="big">時間到，請看投影幕</div><p>老師講解中。你已完成 ${pg.done} / ${pg.total} 題。</p></div>${battleMini(room.battle)}${howto(false)}`;
    return;
  }
  if (room.status === "ended") return renderEnd(head);
  // answering
  if (S.result) return renderResult(head);
  if (S.cur) return renderQuestion(head);
  renderChoose(head);
}

function timerHtml() { return `<span class="timer" id="timer"></span>`; }
let tickTimer = null;
function tick() {
  clearTimeout(tickTimer);
  const el = $("timer");
  if (!el || S.room?.status !== "answering") return;
  const left = Math.max(0, Math.round((S.room.segEndsAt - Date.now()) / 1000));
  el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  el.classList.toggle("low", left <= 30);
  tickTimer = setTimeout(tick, 500);
}

function renderChoose(head) {
  const pg = progress(S.room.keys, S.mine);
  const opts = ["m", "u", "a"].map(t => ({ t, nq: nextQuestion(t, S.order, S.qmap, S.mine) }));
  const allDone = opts.every(o => !o.nq);
  main.innerHTML = `
    ${head}
    <div class="bar"><span>第 ${S.room.seg} 段・已完成 <b>${pg.done}</b> / ${pg.total} 題</span>${timerHtml()}</div>
    ${allDone ? `<div class="card center"><div class="big">全部完成！</div><p>題目都答過了，等老師結算。</p></div>` : `
    <div class="big">選一種行動</div>
    <div class="tiers">${opts.map(({ t, nq }) => `
      <button class="tier ${t}" data-tier="${t}" ${nq ? "" : "disabled"}>
        <span class="tag ${t}">${TIERS[t].action}</span><span class="tname">${TIERS[t].name}</span>
        <span class="tdesc">${TIERS[t].desc}</span>
        <span class="tleft">${nq ? (nq.first ? `還有 ${nq.left} 題` : `重答 ${nq.left} 題（不改成績）`) : "這一類都答完了"}</span>
      </button>`).join("")}
    </div>`}
    <div class="err">${esc(S.err)}</div>
    ${battleMini(S.room.battle)}`;
  S.err = "";
  main.querySelectorAll("[data-tier]").forEach(b => b.onclick = () => pick(b.dataset.tier));
  tick();
}

function pick(tier) {
  const nq = nextQuestion(tier, S.order, S.qmap, S.mine);
  if (!nq) return;
  const q = S.qmap[nq.key];
  S.cur = { ...nq, tier, perm: shuffle(q.options.map((_, i) => i)) };
  S.picked = new Set();
  render();
  scrollTo(0, 0);
}

function qBlock(q, tier, first) {
  return `
    <div class="qhead"><span class="tag ${tier}">${TIERS[tier].name}</span>${q.type === "multi" ? `<span class="tag multi">多選</span>` : ""}${first ? "" : `<span class="tag" style="background:var(--muted)">重答</span>`}${q.exam ? `<span class="src">${esc(q.exam)}</span>` : ""}</div>
    ${passageHtml(q.passage)}
    <div class="stem">${esc(q.stem)}</div>`;
}

function renderQuestion(head) {
  const q = S.qmap[S.cur.key];
  const multi = q.type === "multi";
  main.innerHTML = `
    <div class="bar">${head}${timerHtml()}</div>
    <div class="card" style="display:grid; gap:14px">
      ${qBlock(q, S.cur.tier, S.cur.first)}
      ${multi ? `<div class="muted">多選題：選出所有正確的選項，再按「送出」。全部選對才算答對。</div>` : ""}
      <div class="opts">${S.cur.perm.map((oi, i) => `
        <button class="opt ${S.picked.has(oi) ? "sel" : ""}" data-o="${oi}"><span class="k">${"ABCDE"[i]}</span><span>${esc(q.options[oi])}</span></button>`).join("")}
      </div>
    </div>
    ${multi ? `<div class="sticky"><button class="primary wide" id="sendBtn" ${S.picked.size && !S.busy ? "" : "disabled"}>送出（已選 ${S.picked.size} 個）</button></div>` : ""}
    <div class="err" id="err">${esc(S.err)}</div>`;
  main.querySelectorAll("[data-o]").forEach(b => b.onclick = () => {
    if (S.busy) return;
    const oi = +b.dataset.o;
    if (multi) { S.picked.has(oi) ? S.picked.delete(oi) : S.picked.add(oi); renderQuestion(head); }
    else submit([oi]);
  });
  if (multi) $("sendBtn").onclick = () => submit([...S.picked].sort((a, b) => a - b));
  tick();
}

async function submit(sel) {
  if (S.busy) return;
  S.busy = true; S.err = "";
  const { key, first, tier } = S.cur;
  const rec = { uid: S.uid, cls: S.cls, seat: S.seat, seg: S.room.seg, key, sel, first, at: Date.now(), ts: serverTimestamp() };
  try {
    await addDoc(collection(db, "cl_rooms", S.roomId, "answers"), rec);
  } catch (e) {
    S.busy = false;
    S.cur = null;
    // 段落已結束（時間到）時會被安全規則擋下，這題沒有記錄，下一段會再出現
    S.err = S.room.status === "answering" ? "沒有送出成功，請再選一次行動。" : "";
    render();
    return;
  }
  S.busy = false;
  S.mine.push(rec);
  const q = S.qmap[key];
  S.result = { ...S.cur, sel, r: scoreAnswer(q, sel) };
  S.cur = null;
  render();
  scrollTo(0, 0);
}

function renderResult(head) {
  const { key, sel, r, perm, first, tier } = S.result;
  const q = S.qmap[key];
  const right = new Set(q.answer), chosen = new Set(sel);
  const fx = TIERS[tier];
  let verdict = r.correct ? `<div class="verdict ok">答對了！</div>` : (q.type === "multi" && r.points > 0 ? `<div class="verdict part">差一點</div>` : `<div class="verdict no">再想一想</div>`);
  const pts = first ? `本題得分：<b>${r.points}</b> 分` : "重答不改變成績";
  main.innerHTML = `
    <div class="bar">${head}${timerHtml()}</div>
    <div class="card" style="display:grid; gap:14px">
      <div class="bar">${verdict}<span>${pts}</span></div>
      ${r.correct ? `<div class="muted">${fx.name}：${fx.desc.replace("答對：", "")}</div>` : (first ? `<div class="muted">這題稍後可以再答一次（不改成績）。</div>` : "")}
      ${qBlock(q, tier, first)}
      <div class="opts">${perm.map((oi, i) => {
        const cls = right.has(oi) ? "right" : (chosen.has(oi) ? "wrong" : "");
        return `<button class="opt ${cls}" disabled><span class="k">${"ABCDE"[i]}</span><span>${esc(q.options[oi])}${right.has(oi) ? "　✓" : (chosen.has(oi) ? "　✗" : "")}</span></button>`;
      }).join("")}</div>
      <div class="exp">${esc(q.explanation)}</div>
    </div>
    <div class="sticky"><button class="primary wide" id="nextBtn">下一題</button></div>`;
  $("nextBtn").onclick = () => { S.result = null; render(); scrollTo(0, 0); };
  tick();
}

function renderEnd(head) {
  const room = S.room;
  const pg = progress(room.keys, S.mine);
  const sc = computeScores([{ uid: S.uid, cls: S.cls, seat: S.seat }], S.mine, room.keys, S.qmap)[S.uid];
  const formal = room.mode !== "trial";
  main.innerHTML = `
    ${head}
    <div class="card center" style="display:grid; gap:10px; justify-items:center">
      <div class="big">${room.battle?.boss <= 0 ? `${esc(room.boss.name)}被打倒了！` : "遊戲結束"}</div>
      ${room.battle?.boss <= 0 ? defeatedHtml(room.boss) : ""}
      <div class="muted">${formal ? "你這一課的成績" : "試玩版得分（不計成績）"}</div>
      <div class="score">${sc.score}<span style="font-size:1.4rem"> / ${room.keys.length * CONFIG.pointsPerQuestion}</span></div>
      <div>完成 ${pg.done} / ${pg.total} 題${sc.unanswered ? `・未作答 ${sc.unanswered} 題` : ""}</div>
    </div>
    ${battleMini(room.battle)}`;
}

