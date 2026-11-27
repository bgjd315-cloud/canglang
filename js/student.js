// 學生手機頁
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, onSnapshot, runTransaction, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db, $, esc, loadBanks, passageHtml, lessonLabel, rulesHtml } from "./common.js";
import { CONFIG, TIERS } from "./config.js";
import { missionHtml, defeatedHtml } from "./mission.js";
import { loadCards } from "./cards.js";
import { qBlock, feedbackHtml, collectReview, reviewHtml } from "./review.js";
import { loadSentences, klQuestion, loadTopics, topicsFor } from "./stages.js";
import { scoreAnswer, nextQuestion, progress, shuffle, computeScores } from "./game.js";
import { popScore, victory } from "./celebrate.js";

const main = $("main");
const params = new URLSearchParams(location.search);
const SAVE = "canglang-student";
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const save = v => { try { localStorage.setItem(SAVE, JSON.stringify(v)); } catch {} };

const S = {
  uid: null, roomId: (params.get("room") || "").toUpperCase(), room: null, cls: null, seat: null,
  qmap: null, order: [], mine: [], cur: null, picked: new Set(), result: null, busy: false, err: "",
  unsubRoom: null, unsubMe: null, banksFor: "",
  // 三段式：player＝自己的座位文件（熟句關作答、身世卡進度）；kl＝熟句關畫面狀態；selfCards＝自行前進到身世卡
  player: null, pRef: null, sentences: null, topics: null, klQ: null, klFb: null, flipped: new Set(), selfCards: false,
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
    const roster = CONFIG.roster?.[S.cls];
    if (roster && !roster.includes(seat)) return showErr(`${S.cls} 班沒有 ${seat} 號，請確認班級和座號`);
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
    if (r.data().cls && r.data().cls !== S.cls) { S.err = `這個房間是 ${r.data().cls} 班的，請確認班級`; if (resume) save({}); return renderJoin(); }
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
    S.err = taken ? "這個座號已經有人加入，請舉手告訴老師（老師可以把錯填的人移出）" : `加入失敗（${e.code || e.message}），請再試一次`;
    if (resume) save({});
    return renderJoin();
  }
  S.err = "";
  save({ room: S.roomId, uid: S.uid, cls: S.cls, seat: S.seat });
  $("who").innerHTML = `${esc(S.cls)} 班 ${S.seat} 號<br>房間 ${esc(S.roomId)}`;
  const mineSnap = await getDocs(query(collection(db, "cl_rooms", S.roomId, "answers"), where("uid", "==", S.uid)));
  S.mine = mineSnap.docs.map(d => d.data()).sort((a, b) => (a.at || 0) - (b.at || 0));
  S.pRef = pRef;
  S.unsubMe = onSnapshot(pRef, s => { if (!s.exists()) kicked(); else S.player = s.data(); });
  S.unsubRoom = onSnapshot(roomRef,
    s => onRoom(s.exists() ? s.data() : null).catch(showCrash),
    e => fatal(`和房間的連線中斷（${e.code}），請重新整理。`));
  clearInterval(S.heartbeat); // 被移出後重新加入時，不要留著舊座號的心跳
  S.heartbeat = setInterval(() => updateDoc(pRef, { lastSeen: serverTimestamp() }).catch(() => {}), CONFIG.heartbeatMs);
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
  if (!room || room.status === "closed") {
    // 先記下房間已關閉，接著座號被刪除時才不會誤顯示「被老師移出」
    S.room = { ...(S.room || {}), status: "closed" };
    S.unsubMe?.(); S.unsubMe = null;
    save({}); return fatal("這場遊戲已經結束並清除，謝謝參與！");
  }
  const prevStatus = S.room?.status, prevSeg = S.room?.seg;
  const wasDefeated = S.room ? Boolean(S.room.battle?.defeatedSeg) : null;
  S.room = room;
  // 這支手機在線上看到魔王倒下的那一刻才放（剛加入或重新整理時不補放）
  if (wasDefeated === false && room.battle?.defeatedSeg) {
    victory({ title: "全班勝利！", sub: `${room.boss?.name || "魔王"}被打倒了！`, image: room.boss?.imageDefeated || "" });
  }
  const sig = (room.lessons || []).join(",");
  if (S.banksFor !== sig) {
    const { qmap } = await loadBanks(room.lessons);
    S.cards = await loadCards();
    S.qmap = qmap; S.banksFor = sig;
    S.order = shuffle(room.keys, seeded(S.uid + S.roomId));
    [S.sentences, S.topics] = await Promise.all([loadSentences(room.lessons), loadTopics().then(t => topicsFor(t, room.lessons))]);
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
    const stage = room.stage || "join";
    const klDone = (room.klSids || []).every(sid => sid in (S.player?.kl || {}));
    if (stage === "keyline" && !(klDone && room.selfPace && S.selfCards)) return renderKeyline(head);
    if ((stage === "cards" || (stage === "keyline" && S.selfCards)) && !S.player?.cardsRead) return renderCards(head);
    const tip = stage === "join" ? "老師會先帶大家闖熟句關、看身世卡，再開始魔王戰。" : "開始後，每次選一種行動，就會拿到一題。";
    main.innerHTML = `${head}<div class="card center"><div class="big">${stage === "join" ? "已加入，等老師開始" : "準備好了，等老師開始魔王戰"}</div><p class="muted">${tip}</p></div>${missionHtml(room.boss)}${howto(stage === "join")}`;
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
    ${allDone ? `<div class="card center"><div class="big">全部完成！</div><p>題目都答過了，等老師結算。</p>${(S.topics || []).length ? `<button id="peekCards">先翻身世卡</button>` : ""}</div>${S.peek ? peekCardsHtml() : ""}` : `
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
  if ($("peekCards")) $("peekCards").onclick = () => { S.peek = !S.peek; renderChoose(head); };
  main.querySelectorAll(".peek [data-c]").forEach(b => b.onclick = () => b.classList.toggle("on"));
  tick();
}

// 規格書 P4：等結算的空檔翻本課身世卡（只看卡片，不計分、不顯示題目答案）
function peekCardsHtml() {
  const cards = (S.topics || []).flatMap(t => t.cards.map(c => ({ ...c, topic: t.title })));
  return `<div class="flipcards peek">${cards.map((c, i) => `
      <button class="flipcard" data-c="${esc(c.id)}">
        <span class="fc-front"><small>${esc(c.topic)}・${i + 1}</small><b>${esc(c.title)}</b><i>點一下翻面</i></span>
        <span class="fc-back">${esc(c.body)}</span>
      </button>`).join("")}</div>`;
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
  // 網路慢或暫時斷線時，送出會等比較久；先讓學生知道已經按到了
  const pending = $("err");
  if (pending) { pending.className = "muted"; pending.textContent = "送出中……網路慢時請稍等，不要關掉畫面"; }
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
  const { r } = S.result;
  if (first ? r.points > 0 : r.correct) popScore(first ? `+${r.points} 分` : "重答答對", { sub: first ? `${TIERS[tier].action}命中` : "效果減半", tone: r.correct ? "good" : "part", big: true });
}

function renderResult(head) {
  const res = S.result;
  const q = S.qmap[res.key];
  const fx = TIERS[res.tier];
  const firstSel = res.first ? null : S.mine.find(a => a.first && a.key === res.key)?.sel;
  const effect = res.first ? `${fx.name}：${fx.desc.replace("答對：", "")}` : "重答答對：戰鬥效果減半，不加分。";
  main.innerHTML = `
    <div class="bar">${head}${timerHtml()}</div>
    <div class="card" style="display:grid; gap:14px">${feedbackHtml(q, res, { cards: S.cards, firstSel, effect })}</div>
    <div class="sticky"><button class="primary wide" id="nextBtn">下一題</button></div>`;
  $("nextBtn").onclick = () => { S.result = null; render(); scrollTo(0, 0); };
  tick();
}

/* ---------- 第一段：熟句關（認得課文，不計入魔王戰成績） ---------- */
function renderKeyline(head) {
  const sids = (S.room.klSids || []).filter(sid => S.sentences?.[sid]);
  const done = S.player?.kl || {};
  if (!sids.length) { main.innerHTML = `${head}<div class="card center"><div class="big">這一課沒有熟句關</div><p class="muted">等老師開放下一段。</p></div>`; return; }
  const next = sids.find(sid => !(sid in done));
  const nDone = sids.filter(sid => sid in done).length;
  const bar = `<div class="bar"><span><b>熟句關</b>・第 ${Math.min(nDone + (S.klFb ? 0 : 1), sids.length)} / ${sids.length} 句</span><span class="muted">不計入魔王戰成績</span></div>`;
  if (S.klFb) return renderKlFeedback(head, bar);
  if (!next) {
    const right = sids.filter(sid => done[sid]).length;
    main.innerHTML = `${head}${bar}
      <div class="card center" style="display:grid; gap:10px"><div class="big">熟句關完成！</div><div class="score">${right}<span style="font-size:1.4rem"> / ${sids.length}</span></div>
      <p class="muted" style="margin:0">${S.room.selfPace ? "可以先去看身世卡。" : "等老師開放身世卡，或看投影幕上大家最不熟的句子。"}</p>
      ${S.room.selfPace ? `<button class="primary wide" id="toCards">進入身世卡</button>` : ""}</div>`;
    const b = $("toCards"); if (b) b.onclick = () => { S.selfCards = true; render(); scrollTo(0, 0); };
    return;
  }
  if (!S.klQ || S.klQ.sid !== next) S.klQ = klQuestion(S.sentences, next, sids.indexOf(next));
  const q = S.klQ;
  main.innerHTML = `${head}${bar}
    <div class="card" style="display:grid; gap:12px">
      ${q.sentence ? `<div class="quote kl-sent">${esc(q.sentence)}</div>` : ""}
      <div class="stem">${esc(q.prompt)}</div>
      <div class="opts">${q.options.map((o, i) => `<button class="opt" data-k="${i}"><span class="k">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>
    </div>
    <div class="err" id="err">${esc(S.err)}</div>`;
  S.err = "";
  main.querySelectorAll("[data-k]").forEach(b => b.onclick = () => answerKeyline(q, +b.dataset.k));
}

async function answerKeyline(q, k) {
  if (S.busy) return;
  const ok = q.options[k] === q.answer;
  S.busy = true;
  try {
    // 只記第一次作答；寫在自己的座位文件，安全規則允許學生更新自己的座位
    await updateDoc(S.pRef, { [`kl.${q.sid}`]: ok });
    S.player = { ...(S.player || {}), kl: { ...(S.player?.kl || {}), [q.sid]: ok } };
  } catch (e) {
    S.busy = false; S.err = "沒有送出成功，請再按一次。"; return render();
  }
  S.busy = false;
  S.klFb = { q, k, ok };
  S.klQ = null;
  render(); scrollTo(0, 0);
}

function renderKlFeedback(head, bar) {
  const { q, k, ok } = S.klFb;
  const s = S.sentences[q.sid];
  const refs = (s.exam_refs || []).map(r => `${r.year} ${r.exam} 第 ${r.no} 題`);
  main.innerHTML = `${head}${bar}
    <div class="card" style="display:grid; gap:12px">
      <div class="verdict ${ok ? "ok" : "no"}">${ok ? "答對了！" : "看一下白話"}</div>
      <div class="opts">${q.options.map((o, i) => `<button class="opt ${o === q.answer ? "right" : i === k ? "wrong" : ""}" disabled><span class="k">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>
      <div class="exp"><b>${esc(s.sentence)}</b><br>${esc(s.meaning)}<br><span class="muted">〈${esc(s.lesson)}〉第 ${esc(s.paragraph)} 段${refs.length ? `・大考考過：${esc(refs.join("、"))}` : ""}</span></div>
    </div>
    <div class="sticky"><button class="primary wide" id="klNext">下一句</button></div>`;
  $("klNext").onclick = () => { S.klFb = null; render(); scrollTo(0, 0); };
}

/* ---------- 第二段：身世卡（不出題，看完按「我看懂了」） ---------- */
function renderCards(head) {
  const cards = (S.topics || []).flatMap(t => t.cards.map(c => ({ ...c, topic: t.title })));
  if (!cards.length) { main.innerHTML = `${head}<div class="card center"><div class="big">這一課沒有身世卡</div><p class="muted">等老師開始魔王戰。</p></div>`; return; }
  main.innerHTML = `${head}
    <div class="bar"><span><b>身世卡</b>・點卡片翻面，${cards.length} 張都看完再按「我看懂了」</span></div>
    <div class="flipcards">${cards.map((c, i) => `
      <button class="flipcard ${S.flipped.has(c.id) ? "on" : ""}" data-c="${esc(c.id)}">
        <span class="fc-front"><small>${esc(c.topic)}・${i + 1}</small><b>${esc(c.title)}</b><i>點一下翻面</i></span>
        <span class="fc-back">${esc(c.body)}</span>
      </button>`).join("")}</div>
    <div class="err" id="err">${esc(S.err)}</div>
    <div class="sticky"><button class="primary wide" id="cardsOk" ${cards.every(c => S.flipped.has(c.id)) && !S.busy ? "" : "disabled"}>我看懂了</button></div>`;
  S.err = "";
  main.querySelectorAll("[data-c]").forEach(b => b.onclick = () => {
    const id = b.dataset.c;
    S.flipped.has(id) && b.classList.contains("on") ? b.classList.remove("on") : (S.flipped.add(id), b.classList.add("on"));
    $("cardsOk").disabled = !cards.every(c => S.flipped.has(c.id));
  });
  $("cardsOk").onclick = async () => {
    S.busy = true;
    try { await updateDoc(S.pRef, { cardsRead: true }); S.player = { ...(S.player || {}), cardsRead: true }; }
    catch { S.err = "沒有送出成功，請再按一次。"; }
    S.busy = false; render(); scrollTo(0, 0);
  };
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
    ${room.status === "ended" ? reviewHtml(collectReview(room.keys, S.mine, S.qmap, scoreAnswer), { cards: S.cards, scoreAnswer }) : ""}
    ${battleMini(room.battle)}`;
}

