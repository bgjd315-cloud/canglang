// 排行榜每週重置：每週二晚上 21:00（臺灣時間）開新的一週。
// 不用排程或 Cloud Functions：每筆紀錄記著它是第幾週，重置後第一次上傳時才從 0 開始算，
// 還沒上傳的舊紀錄在排行榜上直接當作本週 0 分。
// 要改時間：ANCHOR 換成任一週「新的一週開始」的時刻，firestore.rules 的 klWeekNow() 要一起改。
export const ANCHOR = Date.UTC(2026, 0, 6, 13); // 2026-01-06（週二）21:00 臺灣時間 = 13:00 UTC
export const WEEK_MS = 7 * 864e5;
export const RESET_TEXT = "每週二晚上 9 點";

export const weekOf = (ms = Date.now()) => Math.floor((ms - ANCHOR) / WEEK_MS);
export const weekStart = (w) => new Date(ANCHOR + w * WEEK_MS);
// 例：「11/10（二）21:00」，一律以臺灣時間顯示
export const fmtStart = (w) => weekStart(w).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "narrow", hour: "2-digit", minute: "2-digit", hour12: false });
