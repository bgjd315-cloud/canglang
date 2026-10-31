// 關鍵句練功坊：學生練習（一回十句、Leitner 三盒）與教師投影模式
const Rec = window.KeylineRecord;
const app = document.getElementById("app");
const ROUND = 10;
const RANKS = [[0, "初入書房"], [.25, "字字有得"], [.6, "句句分明"], [1, "爐火純青"]];
const cache = {};
let lessons = [];
let examStats = null;

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rankOf = (pct) => RANKS.filter(([p]) => pct >= p).pop()[1];

async function loadLesson(id) {
  if (!cache[id]) cache[id] = await (await fetch(`data/${id}.json`)).json();
  return cache[id];
}

// ---------- 圖片：有 Gemini 圖就用，還沒有時畫一幅程式水墨，版面不會空 ----------
function inkArt(seed) {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const r = (n) => { h = (h * 137 + 71) % 9973; return h % n; };
  const ridge = (base, amp, step) => {
    let d = `M0 450L0 ${base}`;
    for (let x = step; x <= 800 + step; x += step) d += `Q${x - step / 2} ${base - amp / 2 - r(amp)} ${x} ${base - r(amp)}`;
    return d + "L800 450Z";
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9E3D2"/><stop offset="1" stop-color="#CFD8D2"/></linearGradient></defs><rect width="800" height="450" fill="url(#s)"/><circle cx="${140 + r(520)}" cy="${80 + r(50)}" r="44" fill="#B8402F" opacity=".78"/><path d="${ridge(240, 90, 110)}" fill="#8FA39C" opacity=".55"/><path d="${ridge(300, 100, 90)}" fill="#5F7A72" opacity=".65"/><path d="${ridge(370, 70, 70)}" fill="#26383A" opacity=".85"/></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}
function art(name, seed, cls = "", alt = "") {
  return `<img class="${cls}" src="img/${name}.webp" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src=inkArt('${seed}')">`;
}
window.inkArt = inkArt;
const portrait = (id) => `<img class="kl-portrait" src="img/char-${id}.webp" alt="" onerror="this.remove()">`;

// ---------- 進度統計 ----------
function stats(doc) {
  const boxes = [0, 0, 0];
  for (const s of doc.sentences) boxes[Rec.card(doc.lesson_id, s.id).box - 1]++;
  return { boxes, mastered: boxes[2], total: doc.sentences.length, pct: boxes[2] / doc.sentences.length };
}

// 畫卷顯影：每練熟一句，揭開一格霧
function scroll(doc, mastered, fresh = 0) {
  const n = doc.sentences.length;
  const cols = Math.ceil(Math.sqrt(n * 16 / 9));
  const rows = Math.ceil(n / cols);
  let seed = 11;
  for (const c of doc.lesson_id) seed = (seed * 31 + c.charCodeAt(0)) % 997;
  const order = [...Array(cols * rows).keys()].sort((a, b) => ((a * 73 + seed) % 101) - ((b * 73 + seed) % 101));
  const openAt = new Map(order.map((t, i) => [t, i]));
  let tiles = "";
  for (let t = 0; t < cols * rows; t++) {
    const i = openAt.get(t);
    const open = mastered >= n || i < mastered - fresh;
    const anim = mastered < n ? i >= mastered - fresh && i < mastered : fresh > 0;
    // 每格是清晰原圖的一小塊，蓋在霧化的底圖上，格與格之間才不會有接縫
    const pos = `${(t % cols) / Math.max(1, cols - 1) * 100}% ${Math.floor(t / cols) / Math.max(1, rows - 1) * 100}%`;
    tiles += `<i class="${open && !anim ? "open" : ""} ${anim ? "reveal" : ""}" style="--d:${anim ? (Math.max(0, i - (mastered - fresh))) * .22 : 0}s;background-image:url(img/cover-${doc.lesson_id}.webp);background-size:${cols * 100}% ${rows * 100}%;background-position:${pos}"></i>`;
  }
  return `<div class="kl-scroll">${art("cover-" + doc.lesson_id, doc.lesson_id, "kl-base", doc.lesson + "畫卷")}<div class="kl-mist" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${tiles}</div></div>`;
}

// ---------- 首頁 ----------
// 首頁的考情數據：讓學生看見為什麼值得練
function examShare() {
  const s = examStats;
  if (!s) return "";
  const hit = s.years.reduce((a, y) => a + y.hit, 0);
  const total = s.years.reduce((a, y) => a + y.total, 0);
  const late = s.years.slice(-2);
  const lateHit = late.reduce((a, y) => a + y.hit, 0);
  const lateTotal = late.reduce((a, y) => a + y.total, 0);
  return `
    <section class="kl-share" aria-label="部定古文出題比例">
      <p class="kl-share-kicker">近五年學測</p>
      <p class="kl-share-hero">每 <b>4</b> 題，就有 <b>1</b> 題<br>用到部定古文</p>
      <p class="kl-share-sub">${total} 題裡有 ${hit} 題。最近兩年更多：${lateTotal} 題裡有 ${lateHit} 題，將近五分之二。</p>
      <ul class="kl-bars">
        ${s.years.map((y) => `<li title="${y.year} 學測：${y.total} 題中有 ${y.hit} 題"><span>${y.year}</span><i><u style="width:${y.hit / y.total * 100}%"></u></i><b>${y.hit} / ${y.total} 題</b></li>`).join("")}
      </ul>
      <p class="kl-share-sub">這裡要練的 ${lessons.reduce((a, l) => a + l.sentence_count, 0)} 句，有 <b>${lessons.reduce((a, l) => a + (l.exam_sentences || 0), 0)} 句</b>在學測或指考出現過。</p>
      <small>依大考中心原卷統計。題目或題組引文用到十五篇就算一題，包含只考一個字詞的題目。</small>
    </section>`;
}

function home() {
  // 首頁只讀課程清單，不載入十五課的句子，手機開起來才快
  const open = lessons.filter((l) => l.available);
  const masteredOf = (l) => Rec.mastered(l.id);
  const done = open.reduce((a, l) => a + masteredOf(l), 0);
  const all = open.reduce((a, l) => a + l.sentence_count, 0);
  app.innerHTML = `
    <header class="kl-hero">
      ${art("hero", "keyline", "kl-hero-img")}
      <div class="kl-hero-text">
        <p class="kl-eyebrow">滄浪闖關・基礎篇</p>
        <h1><small>部定古文</small>關鍵句練功坊</h1>
        <p class="kl-hero-sub">每回十句，五分鐘。<br>讀懂關鍵字，掌握整句意。<br>一句句練熟，讓古文閱讀更有底氣。</p>
      </div>
    </header>
    ${examShare()}
    <section class="kl-stats" aria-label="我的進度">
      <div><b>${done}</b><span>句已練熟</span></div>
      <div><b>${all - done}</b><span>句待修煉</span></div>
      <div><b>${Rec.streak()}</b><span>天連續修煉</span></div>
    </section>
    <h2 class="kl-section">${open.length >= 15 ? "部定十五篇" : "試行篇章"}</h2>
    <section class="kl-cards">
      ${open.map((l) => { const m = masteredOf(l); const pct = m / l.sentence_count; return `
        <a class="kl-card" href="#/lesson/${l.id}">
          ${art("thumb-" + l.id, l.id, "kl-card-img")}
          <div class="kl-card-body">
            <div class="kl-card-head"><h3>${l.lesson}</h3><span>${l.author}</span></div>
            <p class="kl-tagline">${esc(l.tagline)}</p>
            <div class="kl-track" role="img" aria-label="已練熟 ${m} 句，共 ${l.sentence_count} 句"><i style="width:${pct * 100}%"></i></div>
            <div class="kl-card-foot"><span>${m} / ${l.sentence_count} 句・${rankOf(pct)}</span><span class="kl-exam">近五年學測 ${l.count} 處</span></div>
          </div>
        </a>`; }).join("")}
    </section>
    ${open.length < lessons.length ? `<h2 class="kl-section">即將開放</h2>
    <section class="kl-soon" aria-label="即將開放的篇章">
      ${lessons.filter((l) => !l.available).map((l) => `<div>${art("thumb-" + l.id, l.id)}<span>${l.lesson}</span></div>`).join("")}
    </section>` : ""}`;
}

// ---------- 課程頁 ----------
async function lessonPage(id) {
  const doc = await loadLesson(id);
  const st = stats(doc);
  app.innerHTML = `
    <nav class="kl-top"><a href="#/">‹ 返回</a><span>${doc.author}</span></nav>
    <header class="kl-head">
      <div><h1 class="kl-title">${doc.lesson}</h1><p class="kl-tagline">${doc.tagline}</p></div>
      <img class="kl-figure" src="img/char-${id}.webp" alt="" onerror="this.remove()">
    </header>
    ${scroll(doc, st.mastered)}
    <p class="kl-caption">每練熟一句，畫卷就顯影一格。全部練熟，才看得到整幅畫。</p>
    <section class="kl-boxes" aria-label="三盒進度">
      <div><b>${st.boxes[0]}</b><span>第一盒・待練</span></div>
      <div><b>${st.boxes[1]}</b><span>第二盒・再一次</span></div>
      <div class="gold"><b>${st.boxes[2]}</b><span>第三盒・練熟</span></div>
    </section>
    <div class="kl-seat">
      <label for="seat">座號</label>
      <input id="seat" inputmode="numeric" maxlength="3" autocomplete="off" value="${esc(Rec.seat())}" placeholder="例如 12">
      <small>只存在這支手機，不用填姓名</small>
    </div>
    <button class="primary kl-go" id="go">開始修煉（十句）</button>
    <a class="kl-project" href="#/project/${id}">老師投影模式</a>`;
  document.getElementById("go").onclick = () => {
    Rec.setSeat(document.getElementById("seat").value.trim());
    location.hash = `#/play/${id}`;
  };
}

// ---------- 出題 ----------
function pickRound(doc) {
  const id = doc.lesson_id;
  const cards = doc.sentences.map((s) => ({ s, c: Rec.card(id, s.id) }));
  const wrong = shuffle(cards.filter((x) => x.c.lastWrong));
  const first = shuffle(cards.filter((x) => x.c.box === 1 && !x.c.lastWrong));
  const second = shuffle(cards.filter((x) => x.c.box === 2 && !x.c.lastWrong));
  const third = shuffle(cards.filter((x) => x.c.box === 3));
  const out = [];
  const take = (list, upto) => { while (list.length && out.length < upto) out.push(list.shift()); };
  take(wrong, 5); take(first, 7); take(second, 9); take(third, ROUND);
  take(wrong, ROUND); take(first, ROUND); take(second, ROUND); take(third, ROUND);
  return shuffle(out).map((x) => makeQuestion(x.s, x.c.box));
}
function makeQuestion(s, box) {
  // 第一盒先認字；第二盒考整句；第三盒隨機
  const type = box === 1 ? "word" : box === 2 ? "meaning" : (Math.random() < .5 ? "word" : "meaning");
  if (type === "word") {
    const kw = s.keywords[Math.floor(Math.random() * s.keywords.length)];
    // 選項只放字義本身；注音、補充說明留到答後，才不會因為比較長而洩題
    const answer = kw.gloss.split(/[，；（]/)[0];
    return { s, type, kw, answer, prompt: `「${kw.word}」在這句是什麼意思？`, options: shuffle([answer, ...kw.distractors]) };
  }
  const answer = s.meaning.split("。")[0] + "。";
  return { s, type, kw: s.keywords[0], answer, prompt: "這句話的意思是？", options: shuffle([answer, ...s.meaning_distractors]) };
}
function markSentence(q) {
  if (q.type !== "word") return `<span class="kl-whole">${esc(q.s.sentence)}</span>`;
  const i = q.s.sentence.indexOf(q.kw.word);
  return esc(q.s.sentence.slice(0, i)) + `<mark>${esc(q.kw.word)}</mark>` + esc(q.s.sentence.slice(i + q.kw.word.length));
}
// 作答前就給情境與前後文，讓學生從上下文推論字義、句意
function questionCard(q) {
  const s = q.s;
  return `
    <p class="kl-scene">${esc(s.scene)}</p>
    <blockquote class="kl-passage">${esc(s.context_before)}<span class="kl-sentence">${markSentence(q)}</span>${esc(s.context_after)}</blockquote>
    <p class="kl-prompt">${esc(q.prompt)}</p>`;
}
// 比一比的出處：篇名加〈〉，「成語」「詞語」這類或已含作者的寫法照原樣
function sourceName(name) {
  return /成語|詞語|俗語|現代|講義|學測|〈/.test(name) ? `（${esc(name)}）` : `〈${esc(name)}〉`;
}
function reveal(q) {
  const s = q.s;
  const exam = (s.exam_refs || []).map((r) => `<span class="kl-stamp">${r.year} ${r.exam} 第 ${r.no} 題${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>`).join("");
  const conf = (s.confusables || []).filter((c) => q.type !== "word" || c.word === q.kw.word).slice(0, 2);
  return `
    <dl class="kl-explain">
      ${s.keywords.map((k) => `<div><dt>${esc(k.word)}</dt><dd>${esc(k.gloss)}<em>${esc(k.pos)}</em></dd></div>`).join("")}
      <div class="whole"><dt>句意</dt><dd>${esc(s.meaning)}</dd></div>
      <div><dt>出處</dt><dd>${esc(s.lesson)}第 ${s.paragraph} 段</dd></div>
    </dl>
    ${conf.length ? `<div class="kl-compare"><b>比一比</b>${conf.map((c) => `<p>${esc(c.other)}<span>${sourceName(c.other_lesson)}</span><br><i class="${c.same ? "same" : "diff"}">${c.same ? "相同" : "不同"}</i>${esc(c.note)}</p>`).join("")}</div>` : ""}
    ${exam ? `<div class="kl-stamps"><b>大考考過</b>${exam}</div>` : ""}`;
}

// ---------- 一回練習 ----------
async function play(id) {
  const doc = await loadLesson(id);
  const before = stats(doc).mastered;
  const qs = pickRound(doc);
  const results = [];
  let i = 0, combo = 0, best = 0;
  const show = () => {
    const q = qs[i];
    app.innerHTML = `
      <nav class="kl-top"><a href="#/lesson/${id}">‹ 離開</a><span class="kl-combo ${combo >= 2 ? "on" : ""}">${combo >= 2 ? `連中 ${combo} 句` : doc.lesson}</span></nav>
      <ol class="kl-dots" aria-label="第 ${i + 1} 句，共 ${qs.length} 句">${qs.map((_, k) => `<li class="${k < i ? (results[k] ? "ok" : "no") : k === i ? "cur" : ""}"></li>`).join("")}</ol>
      <article class="kl-q">${questionCard(q)}</article>
      <div class="kl-options">${q.options.map((o, k) => `<button data-o="${esc(o)}"><span>${"ABCD"[k]}</span>${esc(o)}</button>`).join("")}</div>
      <div id="after"></div>`;
    window.scrollTo(0, 0);
    app.querySelectorAll(".kl-options button").forEach((b) => (b.onclick = () => answer(q, b)));
  };
  const answer = (q, btn) => {
    const ok = btn.dataset.o === q.answer;
    Rec.answer(id, q.s.id, ok);
    results[i] = ok;
    combo = ok ? combo + 1 : 0;
    best = Math.max(best, combo);
    app.querySelectorAll(".kl-options button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.o === q.answer) b.classList.add("right");
    });
    if (!ok) btn.classList.add("wrong");
    const after = document.getElementById("after");
    after.innerHTML = `
      <section class="kl-feedback ${ok ? "good" : "bad"}">
        <div class="kl-verdict">${portrait(id)}<span class="kl-seal">${ok ? "中" : "再"}</span><div><b>${ok ? "答對了" : "這句會再回來"}</b><small>${ok ? "往下一盒移動" : "回到第一盒，下一回優先出現"}</small></div></div>
        ${reveal(q)}
      </section>
      <button class="primary kl-go kl-next" id="next">${i + 1 < qs.length ? "下一句" : "看這回成績"}</button>`;
    after.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("next").onclick = () => { i++; i < qs.length ? show() : finish(); };
  };
  const finish = () => {
    Rec.finishRound();
    const st = stats(doc);
    const score = results.filter(Boolean).length;
    const fresh = Math.max(0, st.mastered - before);
    const wrong = qs.filter((_, k) => !results[k]);
    app.innerHTML = `
      <nav class="kl-top"><a href="#/">‹ 回首頁</a><span>${doc.lesson}</span></nav>
      <section class="kl-result">
        <div class="kl-score"><b>${score}</b><span>／${qs.length}</span></div>
        <h1>${score === qs.length ? "十句全中" : score >= 7 ? "功力漸長" : score >= 4 ? "再練一回更穩" : "先認字，慢慢來"}</h1>
        <p>${rankOf(st.pct)}${best >= 2 ? `・最高連中 ${best} 句` : ""}${Rec.streak() ? `・連續修煉 ${Rec.streak()} 天` : ""}</p>
      </section>
      ${scroll(doc, st.mastered, fresh)}
      <p class="kl-caption">${fresh ? `這回畫卷多顯影 ${fresh} 格，` : ""}已練熟 ${st.mastered} / ${st.total} 句</p>
      ${wrong.length ? `<h2 class="kl-section">下一回會再遇到</h2><ul class="kl-wrong">${wrong.map((q) => `<li><b>${esc(q.s.sentence)}</b>${esc(q.s.meaning)}</li>`).join("")}</ul>` : ""}
      <button class="primary kl-go" id="again">再修煉一回</button>
      <a class="kl-project" href="#/lesson/${id}">看畫卷與三盒進度</a>`;
    window.scrollTo(0, 0);
    document.getElementById("again").onclick = () => play(id);
  };
  show();
}

// ---------- 教師投影：逐題揭曉，不寫入學生紀錄 ----------
async function project(id) {
  const doc = await loadLesson(id);
  const qs = shuffle(doc.sentences).slice(0, ROUND).map((s, k) => makeQuestion(s, k % 2 ? 2 : 1));
  let i = 0, shown = false;
  const draw = () => {
    const q = qs[i];
    app.innerHTML = `
      <div class="kl-projector">
        <header><a href="#/lesson/${id}">離開投影</a><b>${doc.lesson}</b><span>${i + 1} / ${qs.length}</span></header>
        ${questionCard(q)}
        <div class="kl-options">${q.options.map((o, k) => `<div class="${shown && o === q.answer ? "right" : ""} ${shown && o !== q.answer ? "dim" : ""}"><span>${"ABCD"[k]}</span>${esc(o)}</div>`).join("")}</div>
        ${shown ? `<section class="kl-feedback good">${reveal(q)}</section>` : ""}
        <footer><button class="primary" id="step">${shown ? (i + 1 < qs.length ? "下一題" : "結束") : "揭曉答案"}</button><small>也可以按空白鍵</small></footer>
      </div>`;
    window.scrollTo(0, 0);
    document.getElementById("step").onclick = step;
  };
  const step = () => {
    if (!shown) { shown = true; draw(); return; }
    if (i + 1 < qs.length) { i++; shown = false; draw(); return; }
    document.removeEventListener("keydown", key);
    location.hash = `#/lesson/${id}`;
  };
  const key = (e) => {
    if (!location.hash.startsWith("#/project")) { document.removeEventListener("keydown", key); return; }
    if (e.code === "Space") { e.preventDefault(); step(); }
  };
  document.addEventListener("keydown", key);
  draw();
}

// ---------- 路由 ----------
async function route() {
  const [, page, id] = location.hash.split("/");
  const known = lessons.some((l) => l.id === id && l.available);
  document.body.classList.toggle("kl-projecting", page === "project" && known);
  try {
    if (page === "lesson" && known) await lessonPage(id);
    else if (page === "play" && known) await play(id);
    else if (page === "project" && known) await project(id);
    else await home();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="kl-error">資料讀取失敗，請確認網路後重新整理。</p>`;
  }
}
window.addEventListener("hashchange", route);
fetch("data/lessons.json").then((r) => r.json()).then((d) => { lessons = d.lessons; examStats = d.exam_share; route(); })
  .catch(() => { app.innerHTML = `<p class="kl-error">資料讀取失敗，請確認網路後重新整理。</p>`; });
