// 單人版：學生和電腦對手各打一隻魔王，比誰先打倒。不用登入、不用資料庫，成績存在學生自己的裝置。
import { TIERS, CONFIG } from "./config.js";
import { scoreAnswer, nextQuestion, shuffle, pickQuestions, qKey, progress } from "./game.js";
import { SOLO, newSide, applySolo, cpuTier } from "./solo-game.js";
import { loadMissions, missionHtml, defeatedHtml } from "./mission.js";
import { setMood, mountMusicToggle } from "./music.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = $("main");
const SAVE = "canglang-solo";
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const save = patch => { try { localStorage.setItem(SAVE, JSON.stringify({ ...load(), ...patch })); } catch {} };
const SILHOUETTE = { image: "assets/bosses/_silhouette.svg", imageDefeated: "assets/bosses/_silhouette-defeated.svg" };

const G = { manifest: [], pick: load().pick || [], level: load().level || "normal" };

addEventListener("error", e => crash(e.message));
addEventListener("unhandledrejection", e => crash(e.reason?.message || e.reason));
function crash(msg) { main.insertAdjacentHTML("afterbegin", `<div class="card err">畫面出錯了，請重新整理。<br><small>${esc(msg)}</small></div>`); }

mountMusicToggle();
init();
async function init() {
  const r = await fetch(`banks/index.json?v=${Date.now()}`);
  G.manifest = (await r.json()).lessons.filter(l => l.count && !l.warn.length);
  G.pick = G.pick.filter(id => G.manifest.some(l => l.id === id));
  renderSetup();
}

async function loadBanks(ids) {
  const banks = {}, qmap = {};
  for (const id of ids) {
    const b = await (await fetch(`banks/${encodeURIComponent(id)}.json`)).json();
    banks[id] = b;
    for (const q of b.questions) qmap[qKey(id, q.id)] = { ...q, bankId: id, lesson: b.lesson };
  }
  return { banks, qmap };
}

/* ---------- 選課與難度 ---------- */
function renderSetup() {
  stopCpu();
  setMood("calm");
  const best = load().best || {};
  main.innerHTML = `
    <div class="card" style="display:grid; gap:14px">
      <div class="big">選要複習的課</div>
      <p class="muted" style="margin:0">勾一課＝這課 20 題；勾多課＝從各課抽出 20 題。</p>
      <div class="lessons">${G.manifest.map(l => `
        <label class="lesson"><input type="checkbox" data-id="${esc(l.id)}" ${G.pick.includes(l.id) ? "checked" : ""}>
          <span>〈${esc(l.lesson)}〉${best[l.id] != null ? `<span class="best">最佳 ${best[l.id]} 分</span>` : ""}</span></label>`).join("")}
      </div>
      <p class="small" style="margin:0">「最佳」是你在這台手機或電腦上，這一課考過的最高分（滿分 100）。紀錄只存在這個瀏覽器裡，不會上傳，換裝置或清除瀏覽資料就會消失。</p>
      <div class="big">電腦對手</div>
      <div class="levels">${Object.entries(SOLO.levels).map(([k, v]) => `
        <button data-level="${k}" class="${G.level === k ? "cur" : ""}">${v.name}<small>答對率約 ${Math.round(v.accuracy * 100)}%</small></button>`).join("")}
      </div>
      <button class="primary wide" id="goBtn" ${G.pick.length ? "" : "disabled"}>開始比賽</button>
    </div>
    <details class="howto card"><summary>單人挑戰怎麼玩？</summary>${rulesSolo()}</details>`;
  main.querySelectorAll("[data-id]").forEach(c => c.onchange = () => {
    const id = c.dataset.id;
    G.pick = c.checked ? [...G.pick, id] : G.pick.filter(x => x !== id);
    save({ pick: G.pick });
    $("goBtn").disabled = !G.pick.length;
  });
  main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { G.level = b.dataset.level; save({ level: G.level }); renderSetup(); });
  $("goBtn").onclick = start;
}

function rulesSolo() {
  const e = SOLO.effects;
  return `
    <div class="rules">
      <p><b>你和電腦各打一隻魔王，誰先打倒誰贏。</b>電腦也在答題，答對率看你選的難度。</p>
      <div class="rule"><span class="tag m">攻擊</span><span>語文知識　答對：魔王扣 ${e.m.damage} 滴血</span></div>
      <div class="rule"><span class="tag u">護盾</span><span>文意理解　答對：扣 ${e.u.damage} 滴血，存一面護盾（擋下對手一次干擾）</span></div>
      <div class="rule"><span class="tag a">蓄力</span><span>綜合判斷　答對：扣 ${e.a.damage} 滴血，存一格能量</span></div>
      <ul>
        <li><b>必殺</b>：能量集滿 ${SOLO.ultimateAt} 格自動發動，自己的魔王扣 ${SOLO.ultimateDamage} 滴血，同時干擾對手，讓對手的魔王回 ${SOLO.jamHeal} 滴血；對手有護盾就會擋下。</li>
        <li><b>計分</b>：每題 5 分，滿分 100，只算第一次作答。多選照學測：全對 5 分、錯 1 個 3 分、錯 2 個 1 分。</li>
        <li><b>重答</b>：答錯的題目之後可以再答一次，答對一樣打魔王，但不加分。</li>
        <li>分出勝負後可以繼續把題目答完，拿到完整成績。</li>
      </ul>
    </div>`;
}

/* ---------- 比賽 ---------- */
let S = null;
let cpuTimer = null;
function stopCpu() { clearTimeout(cpuTimer); cpuTimer = null; }

async function start() {
  const ids = G.pick.slice();
  const { banks, qmap } = await loadBanks(ids);
  const keys = pickQuestions(banks, ids, "formal");
  const first = G.manifest.find(l => l.id === ids[0]);
  const b = banks[ids[0]].boss || {};
  S = {
    ids, keys, qmap, order: shuffle(keys), mine: [],
    lessonKey: ids.length === 1 ? ids[0] : null,
    lessonName: ids.length === 1 ? `〈${banks[ids[0]].lesson}〉` : `跨課 ${ids.length} 課`,
    boss: { name: b.name || "魔王", ...(first?.hasImage && b.image ? { image: b.image, imageDefeated: b.imageDefeated } : SILHOUETTE), ...((await loadMissions())[ids[0]] || {}) },
    me: newSide(), cpu: newSide(), level: SOLO.levels[G.level],
    cpuLeft: keys.length, cpuRetry: 0, winner: null, cur: null, picked: new Set(), result: null,
    feed: { text: "比賽開始！", cls: "" }, startedAt: Date.now(),
  };
  // 先介紹本關魔王與任務，按下按鈕才開始計時比賽
  main.innerHTML = `
    ${missionHtml(S.boss, { title: `${S.lessonName}的魔王` })}
    <div class="card" style="display:grid; gap:8px">
      <p style="margin:0">你和電腦（${S.level.name}）各打一隻「${esc(S.boss.name)}」，誰先打倒誰贏。</p>
      <button class="primary wide" id="readyBtn">接受任務，開始比賽</button>
      <button id="backBtn">換課或換難度</button>
    </div>`;
  $("readyBtn").onclick = () => {
    S.startedAt = Date.now();
    setMood("battle");
    main.innerHTML = `<div id="duel"></div><div class="feed" id="feed"></div><div id="act" style="display:grid; gap:14px"></div>`;
    renderDuel();
    renderAct();
    scheduleCpu();
  };
  $("backBtn").onclick = renderSetup;
  scrollTo(0, 0);
}

function sideHtml(side, who, isCpu) {
  const r = side.hp / SOLO.bossHp;
  const s = (0.72 + 0.28 * r).toFixed(3);
  return `
    <div class="side ${isCpu ? "cpu" : ""}">
      <div class="who"><span>${who}</span><span>${Math.ceil(side.hp)}</span></div>
      <div class="scene" id="scene-${isCpu ? "cpu" : "me"}"><div class="bosswrap"><div class="bossbob">
        <img class="bossimg" alt="" src="${esc(S.boss.imageDefeated)}" style="opacity:${(1 - r).toFixed(2)};--s:${s}">
        <img class="bossimg" alt="" src="${esc(S.boss.image)}" style="opacity:${r.toFixed(2)};--s:${s}">
      </div></div><div class="flash"></div></div>
      <div class="track"><div class="fill mud" style="width:${r * 100}%"></div></div>
      <div class="icons"><span>護盾 ${"◆".repeat(side.shield) || "－"}</span><span>能量 ${side.energy}/${SOLO.ultimateAt}</span></div>
      ${isCpu ? `<div class="think" id="cpuThink">${S.winner ? "" : "思考中……"}</div>` : `<div class="think">已答 ${progress(S.keys, S.mine).done}/${S.keys.length} 題</div>`}
    </div>`;
}

function renderDuel() {
  const d = $("duel");
  if (!d) return;
  d.innerHTML = `<div class="duel">${sideHtml(S.me, "你", false)}${sideHtml(S.cpu, `電腦（${S.level.name}）`, true)}</div>`;
  const f = $("feed");
  f.textContent = S.feed.text;
  f.className = `feed ${S.feed.cls}`;
}

function shake(id, cls = "hit") {
  const sc = $(id);
  if (!sc) return;
  sc.classList.remove("hit", "struck", "ult"); void sc.offsetWidth; sc.classList.add(cls);
}
function banner(text) {
  const d = document.createElement("div");
  d.className = "banner"; d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1700);
}

// 事件 → 戰報文字與動畫
function report(ev, mine) {
  const who = mine ? "你" : "電腦";
  for (const e of ev) {
    if (e.type === "ultimate") { S.feed = { text: `${who}發動必殺！魔王扣 ${e.damage} 滴血`, cls: "gold" }; if (mine) banner("必殺！"); }
    if (e.type === "jam") S.feed = { text: `${who}的必殺干擾對手：${mine ? "電腦" : "你"}的魔王回了 ${e.heal} 滴血`, cls: mine ? "gold" : "bad" };
    if (e.type === "blocked") S.feed = { text: `${mine ? "電腦" : "你"}用護盾擋下了必殺干擾`, cls: mine ? "bad" : "good" };
  }
}

function checkWinner() {
  if (S.winner) return;
  if (S.me.hp <= 0) S.winner = "me";
  else if (S.cpu.hp <= 0) S.winner = "cpu";
  if (!S.winner) return;
  stopCpu();
  const left = S.keys.length - progress(S.keys, S.mine).done;
  if (S.winner === "me") { banner("你贏了！"); S.feed = { text: `你先打倒了${S.boss.name}！${left ? `繼續答完剩下 ${left} 題拿成績` : ""}`, cls: "good" }; }
  else S.feed = { text: `電腦先打倒魔王了。${left ? `繼續答完剩下 ${left} 題拿成績` : ""}`, cls: "bad" };
}

/* 電腦對手：每隔一段思考時間答一題 */
function scheduleCpu() {
  stopCpu();
  if (S.winner || S.cpuLeft + S.cpuRetry <= 0) return;
  const [a, b] = S.level.think;
  cpuTimer = setTimeout(cpuMove, (a + Math.random() * (b - a)) * 1000);
}
function cpuMove() {
  if (!S || S.winner) return;
  if (document.hidden) { cpuTimer = setTimeout(cpuMove, 1000); return; } // 切到別的畫面時電腦也暫停
  const first = S.cpuLeft > 0;
  if (first) S.cpuLeft--; else S.cpuRetry--;
  const ok = Math.random() < S.level.accuracy;
  if (first && !ok) S.cpuRetry++;
  const tier = cpuTier(S.cpu);
  const ev = applySolo(S.cpu, S.me, tier, ok);
  if (ok) {
    S.feed = { text: `電腦用「${TIERS[tier].name}」答對了，它的魔王扣 ${SOLO.effects[tier].damage} 滴血`, cls: "" };
    shake("scene-cpu");
  } else S.feed = { text: "電腦答錯了一題", cls: "" };
  report(ev, false);
  if (ev.some(e => e.type === "jam")) shake("scene-me", "struck");
  checkWinner();
  renderDuel();
  scheduleCpu();
}

/* 學生作答區（和全班版的手機頁相同的流程） */
function renderAct() {
  const act = $("act");
  if (S.result) return renderResult(act);
  if (S.cur) return renderQuestion(act);
  const pg = progress(S.keys, S.mine);
  const opts = ["m", "u", "a"].map(t => ({ t, nq: nextQuestion(t, S.order, S.qmap, S.mine) }));
  if (pg.done >= pg.total && opts.every(o => !o.nq)) return finish();
  act.innerHTML = `
    <div class="tiers">${opts.map(({ t, nq }) => `
      <button class="tier ${t}" data-tier="${t}" ${nq ? "" : "disabled"}>
        <span class="tag ${t}">${TIERS[t].action}</span><span class="tname">${TIERS[t].name}</span>
        <span class="tdesc">${nq ? (nq.first ? `還有 ${nq.left} 題` : `重答 ${nq.left} 題（不改成績）`) : "這一類都答完了"}</span>
      </button>`).join("")}
    </div>
    <button id="quitBtn">${pg.done >= pg.total ? "不重答了，看成績" : "結束比賽，看成績"}</button>`;
  act.querySelectorAll("[data-tier]").forEach(b => b.onclick = () => pick(b.dataset.tier));
  // 還有題目沒答時要按兩次（有些瀏覽器會擋 confirm 視窗）
  $("quitBtn").onclick = e => {
    const left = pg.total - pg.done;
    if (!left || e.target.dataset.sure) return finish();
    e.target.dataset.sure = "1";
    e.target.classList.add("danger");
    e.target.textContent = `還有 ${left} 題沒答，沒答的算 0 分。確定就再按一次`;
  };
}

function pick(tier) {
  const nq = nextQuestion(tier, S.order, S.qmap, S.mine);
  if (!nq) return;
  const q = S.qmap[nq.key];
  S.cur = { ...nq, tier, perm: shuffle(q.options.map((_, i) => i)) };
  S.picked = new Set();
  renderAct();
  $("act").scrollIntoView({ block: "start" });
}

function qBlock(q, tier, first) {
  return `
    <div class="qhead"><span class="tag ${tier}">${TIERS[tier].name}</span>${q.type === "multi" ? `<span class="tag multi">多選</span>` : ""}${first ? "" : `<span class="tag" style="background:var(--muted)">重答</span>`}${q.exam ? `<span class="src">${esc(q.exam)}</span>` : ""}</div>
    ${q.passage ? `<div class="quote">${esc(q.passage)}</div>` : ""}
    <div class="stem">${esc(q.stem)}</div>`;
}

function renderQuestion(act) {
  const q = S.qmap[S.cur.key];
  const multi = q.type === "multi";
  act.innerHTML = `
    <div class="card" style="display:grid; gap:14px">
      ${qBlock(q, S.cur.tier, S.cur.first)}
      ${multi ? `<div class="muted">多選題：選出所有正確的選項，再按「送出」。</div>` : ""}
      <div class="opts">${S.cur.perm.map((oi, i) => `
        <button class="opt ${S.picked.has(oi) ? "sel" : ""}" data-o="${oi}"><span class="k">${"ABCDE"[i]}</span><span>${esc(q.options[oi])}</span></button>`).join("")}
      </div>
    </div>
    ${multi ? `<div class="sticky"><button class="primary wide" id="sendBtn" ${S.picked.size ? "" : "disabled"}>送出（已選 ${S.picked.size} 個）</button></div>` : ""}`;
  act.querySelectorAll("[data-o]").forEach(b => b.onclick = () => {
    const oi = +b.dataset.o;
    if (multi) { S.picked.has(oi) ? S.picked.delete(oi) : S.picked.add(oi); renderQuestion(act); }
    else submit([oi]);
  });
  if (multi) $("sendBtn").onclick = () => submit([...S.picked].sort((a, b) => a - b));
}

function submit(sel) {
  const { key, first, tier } = S.cur;
  const q = S.qmap[key];
  const r = scoreAnswer(q, sel);
  S.mine.push({ key, sel, first });
  if (!S.winner) {
    const ev = applySolo(S.me, S.cpu, tier, r.correct);
    if (r.correct) { S.feed = { text: `答對！你的魔王扣 ${SOLO.effects[tier].damage} 滴血`, cls: "good" }; shake("scene-me"); }
    else S.feed = { text: "答錯了，這題之後可以再答一次", cls: "bad" };
    report(ev, true);
    if (ev.some(e => e.type === "jam")) shake("scene-cpu", "struck");
    checkWinner();
  }
  S.result = { ...S.cur, sel, r };
  S.cur = null;
  renderDuel();
  renderAct();
}

function renderResult(act) {
  const { key, sel, r, perm, first, tier } = S.result;
  const q = S.qmap[key];
  const right = new Set(q.answer), chosen = new Set(sel);
  const verdict = r.correct ? `<div class="verdict ok">答對了！</div>` : (q.type === "multi" && r.points > 0 ? `<div class="verdict part">差一點</div>` : `<div class="verdict no">再想一想</div>`);
  act.innerHTML = `
    <div class="card" style="display:grid; gap:14px">
      <div class="bar">${verdict}<span>${first ? `本題得分：<b>${r.points}</b> 分` : "重答不改變成績"}</span></div>
      ${qBlock(q, tier, first)}
      <div class="opts">${perm.map((oi, i) => {
        const cls = right.has(oi) ? "right" : (chosen.has(oi) ? "wrong" : "");
        return `<button class="opt ${cls}" disabled><span class="k">${"ABCDE"[i]}</span><span>${esc(q.options[oi])}${right.has(oi) ? "　✓" : (chosen.has(oi) ? "　✗" : "")}</span></button>`;
      }).join("")}</div>
      <div class="exp">${esc(q.explanation)}</div>
    </div>
    <div class="sticky"><button class="primary wide" id="nextBtn">下一題</button></div>`;
  $("nextBtn").onclick = () => { S.result = null; renderAct(); $("duel").scrollIntoView({ block: "start" }); };
}

/* ---------- 結束 ---------- */
function finish() {
  stopCpu();
  let score = 0, done = 0;
  const firstOf = {};
  for (const a of S.mine) if (a.first && !(a.key in firstOf)) firstOf[a.key] = a;
  const wrong = [];
  for (const k of S.keys) {
    const a = firstOf[k];
    if (!a) continue;
    done++;
    const r = scoreAnswer(S.qmap[k], a.sel);
    score += r.points;
    if (!r.correct) wrong.push(k);
  }
  const total = S.keys.length * CONFIG.pointsPerQuestion;
  // 學生先答完、還沒分出勝負：電腦把它剩下的題目一口氣答完，再比血量（不然答得快就一定贏）
  let cpuCatchUp = false;
  while (!S.winner && S.cpuLeft + S.cpuRetry > 0) {
    cpuCatchUp = true;
    const firstQ = S.cpuLeft > 0;
    if (firstQ) S.cpuLeft--; else S.cpuRetry--;
    const ok = Math.random() < S.level.accuracy;
    if (firstQ && !ok) S.cpuRetry++;
    applySolo(S.cpu, S.me, cpuTier(S.cpu), ok);
    if (S.cpu.hp <= 0) S.winner = "cpu";
  }
  const win = S.winner ? S.winner === "me" : S.me.hp < S.cpu.hp;
  const tie = !S.winner && S.me.hp === S.cpu.hp;
  setMood(win && !tie ? "victory" : "defeat");
  const best = load().best || {};
  let newBest = false;
  if (S.lessonKey && (best[S.lessonKey] == null || score > best[S.lessonKey])) { best[S.lessonKey] = score; save({ best }); newBest = true; }
  const mins = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
  $("duel").innerHTML = "";
  $("feed").textContent = "";
  $("act").innerHTML = `
    <div class="card center" style="display:grid; gap:10px; justify-items:center">
      <div class="big">${tie ? "平手！" : win ? "你贏了電腦！" : "這次電腦贏了"}</div>
      ${S.winner === "me" ? defeatedHtml(S.boss) : ""}
      <div class="muted">${esc(S.lessonName)}・對手：電腦（${S.level.name}）・約 ${mins} 分鐘</div>
      <div class="score">${score}<span style="font-size:1.4rem"> / ${total}</span></div>
      <div>答完 ${done} / ${S.keys.length} 題${done < S.keys.length ? `・未作答 ${S.keys.length - done} 題` : ""}${newBest ? "・<b style='color:var(--good)'>新紀錄！</b>" : ""}</div>
      ${S.lessonKey ? `<div class="small">這一課在這台裝置上的最佳成績：${best[S.lessonKey]} 分（只存在這個瀏覽器）</div>` : `<div class="small">跨課挑戰不記最佳成績</div>`}
      ${cpuCatchUp ? `<div class="muted">你先答完了，電腦接著把它剩下的題目答完${S.winner === "cpu" ? "，打倒了魔王" : ""}。</div>` : ""}
      ${!S.winner ? `<div class="muted">雙方都沒打倒魔王，比剩下的血量：你 ${Math.ceil(S.me.hp)}，電腦 ${Math.ceil(S.cpu.hp)}</div>` : ""}
      <div class="bar" style="justify-content:center">
        <button class="primary" id="againBtn">再比一次</button>
        <button id="setupBtn">換課或換難度</button>
      </div>
    </div>
    ${wrong.length ? `<div class="big">答錯的題目（${wrong.length} 題）</div>
    <div class="review">${wrong.map(k => {
      const q = S.qmap[k];
      return `<div class="card">${qBlock(q, q.tier, true)}<div><b>正解：</b>${q.answer.map(i => esc(q.options[i])).join("；")}</div><div class="exp">${esc(q.explanation)}</div></div>`;
    }).join("")}</div>` : (done ? `<div class="card center">第一次作答全對，太厲害了！</div>` : "")}`;
  $("againBtn").onclick = start;
  $("setupBtn").onclick = renderSetup;
  scrollTo(0, 0);
}
