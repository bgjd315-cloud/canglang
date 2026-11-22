#!/usr/bin/env node
// 檢查題庫的「線索」（questions[].hint）：規格書 2026-11-17 P1-3
//   1. 每題都要有 hint（缺的列入 index.json 的 warn，但不擋上線）
//   2. hint 不可包含正解選項中任何連續 6 個字以上的片段（避免直接給答案）
//   3. hint 建議 40 字以內（超過只提醒）
//
// 用法：
//   node tools/check-hints.mjs                 只檢查 banks/*.json，列出問題
//   node tools/check-hints.mjs --write-index   另外把「缺線索」寫進 banks/index.json 的 warn
//   node tools/check-hints.mjs --hints 目錄     檢查線索草稿（目錄裡每課一個 <課>.json，內容 { 題號: 線索 }）
// 建題庫索引的程式可以 import { checkBank } 一起跑。
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEAK_LEN = 6;
const MAX_LEN = 40;
export const WARN_PREFIX = "線索：";

// 標點與空白不算字，比對時先拿掉
const norm = s => String(s ?? "").replace(/[\s，。、；：？！「」『』（）()《》〈〉．·…—\-,.;:?!"'“”‘’／/]/g, "");
const chars = s => [...norm(s)];

// hint 裡和正解選項重複的最長片段（以字為單位）
export function longestLeak(hint, answerText) {
  const h = chars(hint), a = chars(answerText);
  let best = "";
  for (let i = 0; i < h.length; i++) {
    for (let j = 0; j < a.length; j++) {
      let k = 0;
      while (i + k < h.length && j + k < a.length && h[i + k] === a[j + k]) k++;
      if (k > best.length) best = h.slice(i, i + k).join("");
    }
  }
  return best;
}

// 檢查一課；hints 可另外傳入（草稿），否則讀題目的 hint 欄位
export function checkBank(bank, hints = null) {
  const missing = [], leaks = [], long = [];
  for (const q of bank.questions || []) {
    const hint = hints ? hints[q.id] : q.hint;
    if (!hint || !String(hint).trim()) { missing.push(q.id); continue; }
    if ([...hint].length > MAX_LEN) long.push({ id: q.id, len: [...hint].length });
    for (const i of q.answer || []) {
      const leak = longestLeak(hint, q.options[i]);
      if ([...leak].length >= LEAK_LEN) leaks.push({ id: q.id, leak, option: q.options[i] });
    }
  }
  return { missing, leaks, long };
}

function main() {
  const args = process.argv.slice(2);
  const hintDir = args.includes("--hints") ? args[args.indexOf("--hints") + 1] : null;
  const writeIndex = args.includes("--write-index");
  const bankDir = join(ROOT, "banks");
  const ids = readdirSync(bankDir).filter(f => f.endsWith(".json") && f !== "index.json").map(f => f.slice(0, -5)).sort();
  let bad = 0;
  const report = {};
  for (const id of ids) {
    const bank = JSON.parse(readFileSync(join(bankDir, id + ".json"), "utf8"));
    let hints = null;
    if (hintDir) {
      const p = join(hintDir, id + ".json");
      if (!existsSync(p)) continue;
      hints = JSON.parse(readFileSync(p, "utf8"));
    }
    const r = checkBank(bank, hints);
    report[id] = r;
    const parts = [];
    if (r.missing.length) parts.push(`缺線索 ${r.missing.length} 題（${r.missing.join("、")}）`);
    if (r.leaks.length) { bad += r.leaks.length; parts.push(`可能洩漏答案：${r.leaks.map(l => `${l.id}「${l.leak}」`).join("、")}`); }
    if (r.long.length) parts.push(`超過 ${MAX_LEN} 字：${r.long.map(l => `${l.id}（${l.len} 字）`).join("、")}`);
    console.log(`${id}：${parts.length ? parts.join("；") : "OK"}`);
  }
  if (writeIndex && !hintDir) {
    const p = join(bankDir, "index.json");
    const raw = readFileSync(p, "utf8");
    const idx = JSON.parse(raw);
    for (const l of idx.lessons) {
      const r = report[l.id];
      l.warn = (l.warn || []).filter(w => !w.startsWith(WARN_PREFIX));
      if (r?.missing.length) l.warn.push(`${WARN_PREFIX}缺 ${r.missing.length} 題`);
      if (r?.leaks.length) l.warn.push(`${WARN_PREFIX}${r.leaks.length} 題可能洩漏答案`);
    }
    writeFileSync(p, JSON.stringify(idx, null, 1) + (raw.endsWith("\n") ? "\n" : ""));
    console.log("已更新 banks/index.json 的 warn");
  }
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
