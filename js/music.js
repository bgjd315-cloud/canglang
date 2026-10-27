// 古曲風配樂：用 Web Audio 即時合成古箏／琵琶音色，不用下載音檔。
// setMood("calm" | "battle" | "victory" | "defeat" | "off")，同一個情境重複呼叫不會重來。
// 瀏覽器規定要先有人點過畫面才能出聲，所以第一次點擊後才會開始播放。

const KEY = "cl_music";
const midiHz = m => 440 * 2 ** ((m - 69) / 12);
const rnd = a => a[Math.floor(Math.random() * a.length)];

let ctx = null, master = null, verb = null, noise = null;
let mood = "off", wanted = "off", bus = null, nextTime = 0, step = 0, gen = null, timer = null;
let muted = (() => { try { return localStorage.getItem(KEY) === "off"; } catch { return false; } })();
let btn = null;

/* ---------- 音色 ---------- */
function setupAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  // 簡單殘響：一段衰減的雜訊當空間感
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  verb.connect(wet).connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}

function newBus() {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
  g.connect(master);
  g.connect(verb);
  return g;
}

// 撥弦：三角波＋泛音，快起慢收，濾波器由亮轉暗；bend＝從低幾個半音滑上來（古箏的按滑音）
function pluck(t, m, { dur = 1.8, vol = 0.22, bend = 0, bright = 3200, out = bus } = {}) {
  const f = midiHz(m);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(bright, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + dur * 0.7);
  for (const [type, mul, amp] of [["triangle", 1, 1], ["sine", 2, 0.35], ["sine", 3, 0.12]]) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type;
    if (bend) {
      o.frequency.setValueAtTime(f * mul * 2 ** (-bend / 12), t);
      o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.14);
    } else o.frequency.setValueAtTime(f * mul, t);
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lp.connect(g).connect(out);
}

// 堂鼓
function drum(t, vol = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.5);
}

// 梆子（木魚般的短促敲擊）
function clack(t, vol = 0.18) {
  const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 9;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  s.connect(bp).connect(g).connect(bus);
  s.start(t);
  s.stop(t + 0.1);
}

// 刮奏：沿音階快速滑過一串音
function gliss(t, scale, from, n, dir = 1, gap = 0.035, vol = 0.12) {
  let i = scale.indexOf(from);
  if (i < 0) i = 0;
  for (let k = 0; k < n; k++) {
    const j = Math.min(scale.length - 1, Math.max(0, i + k * dir));
    pluck(t + k * gap, scale[j], { dur: 1.4, vol });
  }
}

/* ---------- 曲調產生器（每次呼叫產生一拍裡的音） ---------- */

// 悠揚（大廳、結算）：D 宮調，慢板，像〈高山流水〉那樣疏朗的撥弦
function calmGen() {
  const scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]; // D4 宮調五聲
  const roots = [[50, 57], [50, 57], [47, 54], [45, 52]];      // D、D、B、A
  let idx = 3;
  return {
    dur: 60 / 70 / 2,
    play(s, t) {
      const bar = Math.floor(s / 8), pos = s % 8;
      if (pos === 0) {
        const [r, fifth] = roots[Math.floor(bar / 2) % roots.length];
        pluck(t, r, { dur: 3.2, vol: 0.2, bright: 1300 });
        pluck(t + 0.18, fifth, { dur: 2.6, vol: 0.12, bright: 1300 });
      }
      if (pos === 4 && Math.random() < 0.5) pluck(t, roots[Math.floor(bar / 2) % roots.length][1] + 12, { dur: 2, vol: 0.08, bright: 1500 });
      if (s % 64 === 56) { gliss(t, scale, 62, 7); return; }
      if (Math.random() < (pos % 2 ? 0.35 : 0.65)) {
        idx = Math.min(scale.length - 1, Math.max(0, idx + rnd([-2, -1, -1, 1, 1, 2, 0])));
        pluck(t, scale[idx], { dur: 2.4, vol: 0.17, bend: Math.random() < 0.15 ? 2 : 0 });
      }
    },
  };
}

// 緊湊（作答、對戰）：A 羽調，快板，堂鼓＋梆子＋琵琶輪指，像〈十面埋伏〉的氣勢
function battleGen() {
  const scale = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
  const roots = [45, 45, 43, 40, 45, 45, 48, 43];
  let idx = 5, roll = 0, rollNote = 69;
  return {
    dur: 60 / 136 / 4,
    play(s, t) {
      const bar = Math.floor(s / 16), pos = s % 16, root = roots[bar % roots.length];
      if ([0, 3, 6, 8, 11, 14].includes(pos)) pluck(t, pos === 6 || pos === 14 ? root + 7 : root, { dur: 0.5, vol: 0.2, bright: 1600 });
      if (pos === 0 || pos === 8 || (pos === 10 && bar % 2)) drum(t, pos === 0 ? 0.55 : 0.4);
      if (pos === 4 || pos === 12) clack(t);
      else if (Math.random() < 0.12) clack(t, 0.07);
      if (s % 128 === 120) { gliss(t, scale, 57, 9, 1, 0.025, 0.1); return; }
      if (roll > 0) { pluck(t, rollNote, { dur: 0.35, vol: 0.09 + roll * 0.01, bright: 4200 }); roll--; return; }
      if (pos % 2 === 0 && Math.random() < 0.7) {
        idx = Math.min(scale.length - 1, Math.max(2, idx + rnd([-2, -1, 1, 1, 2, -1, 0])));
        pluck(t, scale[idx], { dur: 0.9, vol: 0.16, bright: 4000 });
        if (pos % 4 === 0 && Math.random() < 0.3) { roll = 3; rollNote = scale[idx]; } // 輪指：同一音快速連彈
      }
    },
  };
}

// 照譜彈奏一段，彈完接回悠揚的曲調
function scoreGen(notes, beat, after = "calm") {
  return {
    dur: beat,
    play(s, t) {
      if (s >= notes.length + 6) { queueMicrotask(() => switchTo(after)); return; }
      const n = notes[s];
      if (n == null) return;
      for (const [k, m] of [].concat(n).entries()) pluck(t + k * 0.03, m, { dur: 2.2, vol: 0.18, bright: 3800 });
      if (s % 4 === 0 && beat < 0.3) drum(t, 0.45);
    },
  };
}

// 凱旋：D 宮調上行，最後琶音和弦
const VICTORY = [62, 66, 69, 74, null, 74, 76, 78, 81, null, 78, 76, [74, 78], null, 76, 78, [69, 74, 78, 81], null, null, null, [62, 69, 74, 78, 81, 86]];
// 落敗：緩緩下行，帶一點不甘
const DEFEAT = [69, null, 67, 64, null, 62, null, 60, 57, null, null, [45, 52, 57]];

const GENS = {
  calm: calmGen,
  battle: battleGen,
  victory: () => scoreGen(VICTORY, 0.24),
  defeat: () => scoreGen(DEFEAT, 0.5),
};

/* ---------- 排程 ---------- */
function tick() {
  if (!ctx || muted || !gen) return;
  const now = ctx.currentTime;
  if (nextTime < now) nextTime = now + 0.05; // 分頁在背景時計時器會變慢，回來後不補彈
  while (nextTime < now + 0.25 && gen) {
    gen.play(step++, nextTime);
    nextTime += gen.dur;
  }
}

function switchTo(m) {
  mood = m;
  if (!ctx) return;
  if (bus) {
    const old = bus;
    old.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.setValueAtTime(old.gain.value || 0.0001, ctx.currentTime);
    old.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
    setTimeout(() => old.disconnect(), 1500);
    bus = null;
  }
  gen = GENS[m]?.() || null;
  if (!gen) return;
  bus = newBus();
  step = 0;
  nextTime = ctx.currentTime + 0.1;
}

export function setMood(m) {
  if (m === wanted) return; // 投影畫面常重繪，同一情境不重來（凱旋曲彈完會自己轉回悠揚）
  wanted = m;
  switchTo(m);
}

// 第一次點擊畫面才能出聲（瀏覽器規定）
function unlock() {
  if (!ctx) {
    setupAudio();
    switchTo(mood);
    timer = setInterval(tick, 60);
  }
  if (ctx.state !== "running") ctx.resume();
}

function paint() {
  if (!btn) return;
  btn.textContent = muted ? "♪ 配樂關" : "♪ 配樂開";
  btn.classList.toggle("off", muted);
  btn.setAttribute("aria-pressed", String(!muted));
}

// 左下角的開關鍵；選擇會記在這台裝置上
export function mountMusicToggle() {
  btn = document.createElement("button");
  btn.className = "musicbtn";
  btn.type = "button";
  btn.title = "背景配樂開關";
  btn.onclick = () => {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch {}
    if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.15);
      if (!muted) nextTime = ctx.currentTime + 0.1;
    }
    paint();
  };
  paint();
  document.body.appendChild(btn);
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}
