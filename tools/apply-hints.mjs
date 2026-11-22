#!/usr/bin/env node
// 把老師審過的線索寫回題庫：tools/hint-drafts/<課>.md 對照表的「線索」欄 → banks/<課>.json 各題的 hint 欄位
// 只動 hint，不改題目、選項與答案；寫入前先跑 check-hints 的檢查，有洩漏答案的線索就不寫。
// 用法：node tools/apply-hints.mjs 課代號 [課代號…]      例：node tools/apply-hints.mjs chushi datong
//       node tools/apply-hints.mjs --all
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBank } from "./check-hints.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRAFTS = join(ROOT, "tools", "hint-drafts");
const args = process.argv.slice(2);
const ids = args.includes("--all") ? readdirSync(DRAFTS).filter(f => f.endsWith(".md")).map(f => f.slice(0, -3)) : args;

// 讀對照表：| 題號 | 題型 | 題幹 | 線索 |
function readTable(id) {
  const hints = {};
  for (const line of readFileSync(join(DRAFTS, id + ".md"), "utf8").split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 4 || !/^[A-Za-z]+\d+/.test(cells[0])) continue;
    const hint = cells[cells.length - 1];
    if (hint && hint !== "（缺）") hints[cells[0]] = hint;
  }
  return hints;
}
if (!ids.length) { console.log("請指定課代號，例如：node tools/apply-hints.mjs chushi"); process.exit(1); }

for (const id of ids) {
  const bankPath = join(ROOT, "banks", id + ".json");
  const raw = readFileSync(bankPath, "utf8");
  const bank = JSON.parse(raw);
  const hints = readTable(id);
  const r = checkBank(bank, hints);
  if (r.leaks.length) { console.log(`${id}：有線索可能洩漏答案（${r.leaks.map(l => l.id).join("、")}），整課先不寫入`); process.exitCode = 1; continue; }
  let n = 0;
  for (const q of bank.questions) if (hints[q.id]) { q.hint = hints[q.id]; n++; }
  // 保留原檔的縮排與結尾換行
  const indent = (raw.match(/\n( +)"/) || [, " "])[1].length;
  writeFileSync(bankPath, JSON.stringify(bank, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
  console.log(`${id}：寫入 ${n} 題線索${r.missing.length ? `，還缺 ${r.missing.length} 題` : ""}`);
}
console.log("完成。記得再跑 node tools/check-hints.mjs --write-index 更新 banks/index.json 的提醒。");
