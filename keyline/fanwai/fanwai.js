// 練功坊番外篇：國學常識（身世卡＋小關）、論孟名句、應用文情境題。
// 不用登入、不接資料庫；進度只存在這台裝置的瀏覽器裡。
const app = document.getElementById("app");
const ROUND = 10;
const KEY = "cl_fanwai_v1";
const D = {}; // guoxue、lunmeng、yingyong 三份資料

// ---------- 小工具 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickN = (a, n) => shuffle(a).slice(0, n);

// 進度：讀過哪些身世卡、各關最佳成績（私密視窗讀不到時只留在記憶體）
let mem = { read: {}, best: {} };
try { mem = Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* 只留在記憶體 */ }
const saveMem = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 同上 */ } };
const setBest = (k, v) => { if (!(mem.best[k] >= v)) { mem.best[k] = v; saveMem(); return true; } return false; };

const draft = () => Object.values(D).some((d) => d && d.status === "待審")
  ? `<p class="fw-draft">試行版：內容還在等老師審定，若發現錯誤請告訴老師。</p>` : "";
const navBar = (back, label, right = "") => `<nav class="kl-top"><a href="${back}">‹ ${esc(label)}</a><span>${esc(right)}</span></nav>`;

// ---------- 首頁 ----------
function home() {
  const gx = D.guoxue.topics;
  const read = gx.filter((t) => mem.read[t.id]).length;
  const b = mem.best;
  const best = (k) => (b[k] != null ? `最佳 ${b[k]} / ${ROUND}` : "還沒挑戰");
  app.innerHTML = `
    <header class="fw-head">
      <p class="kl-eyebrow">滄浪闖關・番外篇</p>
      <h1>練功坊番外篇</h1>
      <p>國學常識、論孟名句、應用文。<br>不另開單元死背，跟著課文順手帶走。</p>
    </header>
    ${draft()}
    <section class="fw-modes">
      <a class="fw-mode" href="#/guoxue">
        <span class="kl-seal">常</span>
        <div><h2>國學常識闖關</h2><p>先翻身世卡，看懂文體、作者與時代為什麼重要，再闖三題小關。</p>
        <small>${read} / ${gx.length} 個主題看過・綜合闖關${b["gx-mix"] != null ? ` 最佳 ${b["gx-mix"]} / ${ROUND}` : " 還沒挑戰"}</small></div>
      </a>
      <a class="fw-mode" href="#/lunmeng">
        <span class="kl-seal">論</span>
        <div><h2>論孟名句闖關</h2><p>${D.lunmeng.items.length} 句《論語》《孟子》名句，其中 ${D.lunmeng.items.filter((x) => x.exam && x.exam.length).length} 句近十年大考考過。看白話、配情境，再連回讀過的課文。</p>
        <small>${best("lunmeng")}${b["lunmeng-exam"] != null ? `・大考題 最佳 ${b["lunmeng-exam"]} / ${ROUND}` : ""}</small></div>
      </a>
      <a class="fw-mode" href="#/yingyong">
        <span class="kl-seal">應</span>
        <div><h2>應用文番外關</h2><p>寫信給老師、稱呼朋友的父親、同學的哥哥結婚送什麼題辭，全用情境來練。</p>
        <small>${best("yingyong")}</small></div>
      </a>
    </section>
    <p class="fw-return"><a href="../">回到關鍵句練功坊</a></p>`;
}

// ---------- 國學常識 ----------
function guoxueList() {
  const gx = D.guoxue.topics;
  app.innerHTML = `
    ${navBar("#/", "番外篇", "國學常識")}
    <h1 class="kl-title">國學常識闖關</h1>
    <p class="kl-tagline">每個主題先看身世卡，按「我看懂了」再闖三題。全部看過，就去挑戰綜合闖關。</p>
    ${draft()}
    <a class="primary kl-go fw-go" href="#/guoxue-mix">綜合闖關（隨機 ${ROUND} 題）</a>
    <ul class="fw-topics">${gx.map((t) => `
      <li><a href="#/guoxue/${t.id}">
        <b>${esc(t.title)}${mem.read[t.id] ? `<i class="fw-done">看過</i>` : ""}</b>
        <span>${t.lessonNames.map((n) => (/^[〈《]/.test(n) || /選|詩$/.test(n) ? esc(n) : `〈${esc(n)}〉`)).join("、")}・${t.cards.length} 張卡${mem.best["gx-" + t.id] != null ? `・小關 ${mem.best["gx-" + t.id]} / ${t.questions.length}` : ""}</span>
        ${t.examRef ? `<em class="kl-stamp">${esc(t.examRef)}</em>` : ""}
      </a></li>`).join("")}
    </ul>`;
}

// 身世卡：點一下翻面；全部翻過才能按「我看懂了」
function guoxueTopic(id) {
  const t = D.guoxue.topics.find((x) => x.id === id);
  if (!t) return guoxueList();
  const flipped = new Set();
  app.innerHTML = `
    ${navBar("#/guoxue", "國學常識", `${t.cards.length} 張身世卡`)}
    <h1 class="kl-title">${esc(t.title)}</h1>
    ${t.examRef ? `<div class="kl-stamps"><b>大考依據</b><span class="kl-stamp">${esc(t.examRef)}</span></div>` : ""}
    <p class="kl-tagline">點卡片翻面，看完每一張再往下。</p>
    <section class="fw-cards">${t.cards.map((c, i) => `
      <button class="fw-card" data-i="${i}" aria-pressed="false">
        <span class="fw-front"><small>身世卡 ${i + 1}</small><b>${esc(c.title)}</b><i>點一下翻面</i></span>
        <span class="fw-back">${esc(c.body)}</span>
      </button>`).join("")}
    </section>
    <button class="primary kl-go" id="ok" disabled>我看懂了，闖 ${t.questions.length} 題</button>`;
  const ok = document.getElementById("ok");
  app.querySelectorAll(".fw-card").forEach((b) => (b.onclick = () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", on);
    flipped.add(b.dataset.i);
    ok.disabled = flipped.size < t.cards.length;
  }));
  ok.onclick = () => {
    mem.read[t.id] = true; saveMem();
    quiz({
      title: t.title, back: "#/guoxue", backLabel: "國學常識", bestKey: "gx-" + t.id,
      qs: shuffle(t.questions).map((q) => gxQuestion(q, t)),
      again: () => guoxueTopic(id),
    });
  };
}

function gxQuestion(q, t) {
  const cards = t.cards.filter((c) => (q.linkedCards || []).includes(c.id));
  return {
    prompt: q.stem, options: shuffle(q.options), answer: q.options[q.answer[0]], tag: t.title,
    explain: `<p class="fw-exp">${esc(q.explanation)}</p>${cards.map((c) => `<div class="fw-linked"><b>身世卡：${esc(c.title)}</b><p>${esc(c.body)}</p></div>`).join("")}`,
    review: q.stem,
  };
}

function guoxueMix() {
  const all = D.guoxue.topics.flatMap((t) => t.questions.map((q) => gxQuestion(q, t)));
  quiz({ title: "國學常識綜合闖關", back: "#/guoxue", backLabel: "國學常識", bestKey: "gx-mix", qs: pickN(all, ROUND), again: guoxueMix });
}

// ---------- 論孟名句 ----------
function lunmengHome() {
  const examN = D.lunmeng.items.filter((x) => x.exam && x.exam.length).length;
  app.innerHTML = `
    ${navBar("#/", "番外篇", "論孟名句")}
    <h1 class="kl-title">論孟名句闖關</h1>
    <p class="kl-tagline">大考很少整題考論孟，卻年年把它放進選項和對讀材料。一回 ${ROUND} 題：有時給句子選白話，有時給情境選句子。</p>
    ${draft()}
    <button class="primary kl-go" id="go">全部名句（${D.lunmeng.items.length} 句隨機 ${ROUND} 題）</button>
    <button class="kl-go fw-go2" id="goExam">只練近十年大考考過的（${examN} 句）</button>
    <a class="kl-project" href="#/lunmeng/list">名句一覽</a>`;
  document.getElementById("go").onclick = () => lunmengPlay(false);
  document.getElementById("goExam").onclick = () => lunmengPlay(true);
}

const examStamps = (it) => (it.exam && it.exam.length
  ? `<div class="kl-stamps"><b>大考考過</b>${it.exam.map((x) => `<span class="kl-stamp">${esc(x)}</span>`).join("")}</div>` : "");

function lmLinks(it) {
  if (!it.links.length) return "";
  return `<div class="fw-links"><b>對讀課文</b>${it.links.map((l) => `<p><a href="../#/lesson/${esc(l.lesson)}">〈${esc(l.name)}〉</a>${esc(l.note)}</p>`).join("")}</div>`;
}

function lunmengPlay(onlyExam) {
  const items = D.lunmeng.items;
  const pool = onlyExam ? items.filter((x) => x.exam && x.exam.length) : items;
  const qs = pickN(pool, ROUND).map((it, k) => {
    const explain = `<dl class="kl-explain"><div><dt>原句</dt><dd>${esc(it.text)}<em>${esc(it.src)}</em></dd></div><div class="whole"><dt>白話</dt><dd>${esc(it.plain)}</dd></div></dl>${examStamps(it)}${lmLinks(it)}`;
    if (k % 2 === 0) {
      return { prompt: "這句話的意思是？", sentence: it.text, src: it.src, options: shuffle([it.plain, ...it.plain_distractors]), answer: it.plain, explain, review: it.text };
    }
    // 情境選句子：錯誤選項取其他主題的句子，避免兩句都說得通
    const others = pickN(items.filter((x) => x.theme !== it.theme), 3).map((x) => x.text);
    return { prompt: it.scene, options: shuffle([it.text, ...others]), answer: it.text, explain, review: it.text };
  });
  const title = onlyExam ? "論孟名句・大考題" : "論孟名句闖關";
  quiz({ title, back: "#/lunmeng", backLabel: "論孟名句", bestKey: onlyExam ? "lunmeng-exam" : "lunmeng", qs: shuffle(qs), again: () => lunmengPlay(onlyExam) });
}

// 名句一覽：可依出處或「大考考過」篩選
function lunmengList(filter = "all") {
  const F = { all: ["全部", () => true], lun: ["論語", (x) => x.src.includes("論語")], meng: ["孟子", (x) => x.src.includes("孟子")], exam: ["大考考過", (x) => x.exam && x.exam.length] };
  const list = D.lunmeng.items.filter(F[filter][1]);
  app.innerHTML = `
    ${navBar("#/lunmeng", "論孟名句", `${list.length} 句`)}
    <h1 class="kl-title">名句一覽</h1>
    ${draft()}
    <div class="fw-tabs" role="tablist">${Object.entries(F).map(([k, [n, f]]) => `<button role="tab" data-f="${k}" aria-selected="${k === filter}">${n}（${D.lunmeng.items.filter(f).length}）</button>`).join("")}</div>
    <ul class="fw-list">${list.map((it) => `
      <li><b>${esc(it.text)}</b><small>${esc(it.src)}</small><p>${esc(it.plain)}</p>${examStamps(it)}${lmLinks(it)}</li>`).join("")}
    </ul>`;
  app.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => lunmengList(b.dataset.f)));
}

// ---------- 應用文 ----------
function yingyongHome(tab) {
  const g = D.yingyong.glossary;
  const cur = g.find((x) => x.id === tab) || g[0];
  app.innerHTML = `
    ${navBar("#/", "番外篇", "應用文")}
    <h1 class="kl-title">應用文番外關</h1>
    <p class="kl-tagline">不考格式背誦，全用生活情境來練。先翻翻下面的詞語表，再闖 ${ROUND} 題。</p>
    ${draft()}
    <button class="primary kl-go" id="go">開始闖關（${ROUND} 題）</button>
    <h2 class="kl-section">常見詞語</h2>
    <div class="fw-tabs" role="tablist">${g.map((x) => `<button role="tab" data-t="${x.id}" aria-selected="${x === cur}">${esc(x.title)}</button>`).join("")}</div>
    <section class="fw-gloss" role="tabpanel">
      <p class="kl-tagline">${esc(cur.hint)}</p>
      <dl>${cur.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    </section>
    ${D.yingyong.examBasis?.length ? `<div class="kl-stamps"><b>大考依據</b>${D.yingyong.examBasis.map((x) => `<span class="kl-stamp">${esc(x)}</span>`).join("")}</div>` : ""}`;
  app.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => yingyongHome(b.dataset.t)));
  document.getElementById("go").onclick = yingyongPlay;
}

function yingyongPlay() {
  const g = D.yingyong.glossary;
  const qs = pickN(D.yingyong.questions, ROUND).map((q) => {
    const cat = g.find((x) => x.id === q.cat);
    return {
      prompt: q.stem, options: shuffle(q.options), answer: q.options[q.answer[0]], tag: cat ? cat.title : "",
      explain: `<p class="fw-exp">${esc(q.explanation)}</p>${cat ? `<div class="fw-linked"><b>${esc(cat.title)}速查</b><dl class="fw-mini">${cat.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>` : ""}`,
      review: q.stem,
    };
  });
  quiz({ title: "應用文番外關", back: "#/yingyong", backLabel: "應用文", bestKey: "yingyong", qs, again: yingyongPlay });
}

// ---------- 共用作答流程：答錯立刻看解釋，再進下一題 ----------
function quiz({ title, back, backLabel, bestKey, qs, again }) {
  let i = 0;
  const results = [];
  const show = () => {
    const q = qs[i];
    app.innerHTML = `
      ${navBar(back, "離開", `${title}・${i + 1} / ${qs.length}`)}
      <ol class="kl-dots" style="grid-template-columns:repeat(${qs.length}, minmax(0,1fr))" aria-label="第 ${i + 1} 題，共 ${qs.length} 題">${qs.map((_, k) => `<li class="${k < i ? (results[k] ? "ok" : "no") : k === i ? "cur" : ""}"></li>`).join("")}</ol>
      <article class="kl-q">
        ${q.tag ? `<p class="kl-scene">${esc(q.tag)}</p>` : ""}
        ${q.sentence ? `<blockquote class="kl-passage"><span class="kl-sentence">${esc(q.sentence)}</span></blockquote>${q.src ? `<p class="kl-scene">${esc(q.src)}</p>` : ""}` : ""}
        <p class="kl-prompt">${esc(q.prompt)}</p>
      </article>
      <div class="kl-options">${q.options.map((o, k) => `<button data-k="${k}"><span>${"ABCD"[k]}</span>${esc(o)}</button>`).join("")}</div>
      <div id="after"></div>`;
    window.scrollTo(0, 0);
    app.querySelectorAll(".kl-options button").forEach((b) => (b.onclick = () => answer(q, b)));
  };
  const answer = (q, btn) => {
    const ok = q.options[+btn.dataset.k] === q.answer;
    results[i] = ok;
    app.querySelectorAll(".kl-options button").forEach((b) => {
      b.disabled = true;
      if (q.options[+b.dataset.k] === q.answer) b.classList.add("right");
    });
    if (!ok) btn.classList.add("wrong");
    const after = document.getElementById("after");
    after.innerHTML = `
      <section class="kl-feedback ${ok ? "good" : "bad"}">
        <div class="kl-verdict"><span class="kl-seal">${ok ? "中" : "再"}</span><div><b>${ok ? "答對了" : "再看一次解釋"}</b><small>${ok ? "記住它，下一題" : "正確答案已標成綠色"}</small></div></div>
        ${q.explain}
      </section>
      <button class="primary kl-go kl-next" id="next">${i + 1 < qs.length ? "下一題" : "看這回成績"}</button>`;
    after.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("next").onclick = () => { i++; i < qs.length ? show() : finish(); };
  };
  const finish = () => {
    const score = results.filter(Boolean).length;
    const isNew = setBest(bestKey, score);
    const wrong = qs.filter((_, k) => !results[k]);
    app.innerHTML = `
      ${navBar(back, backLabel, title)}
      <section class="kl-result">
        <div class="fw-score"><b>${score}</b><span>/ ${qs.length}</span></div>
        <h1>${score === qs.length ? "全部答對" : score >= qs.length * 0.7 ? "過關" : "再練一回"}</h1>
        <p>${isNew && mem.best[bestKey] ? "新紀錄！" : mem.best[bestKey] != null ? `這台裝置上的最佳成績：${mem.best[bestKey]} / ${qs.length}` : ""}</p>
      </section>
      ${wrong.length ? `<h2 class="kl-section">再看一次</h2><ul class="kl-wrong">${wrong.map((q) => `<li><b>${esc(q.review)}</b>正確答案：${esc(q.answer)}</li>`).join("")}</ul>` : ""}
      <button class="primary kl-go" id="again">再闖一回</button>
      <a class="kl-project" href="${back}">回到${esc(backLabel)}</a>`;
    window.scrollTo(0, 0);
    // 成績頁重新整理時回到上一層，不要停在作答中的狀態
    try { history.replaceState(null, "", back); } catch (e) { /* 舊瀏覽器維持原樣 */ }
    document.getElementById("again").onclick = again;
  };
  show();
}

// ---------- 路由 ----------
function route() {
  const [, page, sub] = location.hash.split("/");
  if (page === "guoxue" && sub) return guoxueTopic(sub);
  if (page === "guoxue") return guoxueList();
  if (page === "guoxue-mix") return guoxueMix();
  if (page === "lunmeng" && sub === "list") return lunmengList();
  if (page === "lunmeng") return lunmengHome();
  if (page === "yingyong") return yingyongHome();
  return home();
}

Promise.all(["guoxue", "lunmeng", "yingyong"].map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })))
  .then(([g, l, y]) => {
    D.guoxue = g; D.lunmeng = l; D.yingyong = y;
    window.addEventListener("hashchange", route);
    route();
  })
  .catch(() => { app.innerHTML = `<p class="kl-error">資料讀取失敗，請確認網路後重新整理。</p>`; });
