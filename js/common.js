// 共用：Firebase 初始化、題庫載入、畫面小工具
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { qKey } from "./game.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SILHOUETTE = { image: "assets/bosses/_silhouette.svg", imageDefeated: "assets/bosses/_silhouette-defeated.svg" };

export async function loadManifest() {
  const r = await fetch(`banks/index.json?v=${Date.now()}`);
  if (!r.ok) throw new Error("讀不到題庫清單 banks/index.json");
  return (await r.json()).lessons;
}

const bankCache = {};
export async function loadBank(id) {
  if (!bankCache[id]) {
    const r = await fetch(`banks/${encodeURIComponent(id)}.json`);
    if (!r.ok) throw new Error(`讀不到題庫 ${id}`);
    bankCache[id] = await r.json();
  }
  return bankCache[id];
}

// 載入多課題庫，回傳 { banks, qmap（key → 題目，附 bankId 與課名） }
export async function loadBanks(ids) {
  const banks = {}, qmap = {};
  for (const id of ids) {
    const b = await loadBank(id);
    banks[id] = b;
    for (const q of b.questions) qmap[qKey(id, q.id)] = { ...q, bankId: id, lesson: b.lesson };
  }
  return { banks, qmap };
}

// 魔王圖：題庫檔沒有圖或圖檔不存在時用通用剪影
export function bossOf(bank, hasImage) {
  const b = bank?.boss || {};
  return { name: b.name || "無名魔王", ...(hasImage && b.image ? { image: b.image, imageDefeated: b.imageDefeated } : SILHOUETTE) };
}

export function lessonLabel(names) {
  return names.length === 1 ? `〈${names[0]}〉` : `跨課：${names.map(n => `〈${n}〉`).join("")}`;
}

// 遊戲規則（學生手機與投影畫面共用）
export function rulesHtml() {
  return `
    <div class="rules">
      <p><b>全班一起答題打魔王。</b>每人用手機答 20 題選擇題，答對就扣魔王的血。</p>
      <div class="rule"><span class="tag m">攻擊</span><span>語文知識（字音、字義、文法、修辭）　答對：魔王扣 1 滴血</span></div>
      <div class="rule"><span class="tag u">護盾</span><span>文意理解　答對：扣半滴血，存一點護盾</span></div>
      <div class="rule"><span class="tag a">蓄力</span><span>綜合判斷（文學史、跨課比較）　答對：扣 2 滴血，存一格能量</span></div>
      <ul>
        <li><b>計分</b>：每題 5 分，滿分 100，只算第一次作答。多選照學測：全對 5 分、錯 1 個 3 分、錯 2 個 1 分。</li>
        <li><b>重答</b>：答錯的題目之後可以再答一次，答對一樣打魔王，但不加分。</li>
        <li><b>合力一擊</b>：全班能量集滿自動發動，魔王一次扣一大段血。</li>
        <li><b>魔王反擊</b>：每兩段反擊一次，護盾存越多擋越多。</li>
        <li><b>時間到</b>：手機顯示「看投影幕」，聽老師講解答錯最多的題目。</li>
      </ul>
    </div>`;
}

// 引文：保留換行
export const passageHtml = p => p ? `<div class="quote">${esc(p)}</div>` : "";
