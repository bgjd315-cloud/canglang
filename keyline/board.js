// 班級排行榜（Firestore 集合 cl_kl_board，文件 id = 班級_座號）。只存班級、座號與分數，不存姓名。
// 由 keyline.js 需要時才載入，連不上時練習不受影響。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../js/firebase-config.js";
import { weekOf, RESET_TEXT } from "./week.js";

export { RESET_TEXT };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const MAX_PER_WRITE = 260;

let ready = null;
function signedIn() {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const off = onAuthStateChanged(auth, (u) => {
        if (u) { off(); resolve(u); return; }
        signInAnonymously(auth).catch(reject);
      }, reject);
    });
  }
  return ready;
}

// 回傳 {ok:true, points} 或 {ok:false, reason:"taken"|"wait"|"error"}
export async function submit({ cls, seat, points, win, mastered }) {
  const u = await signedIn();
  const ref = doc(db, "cl_kl_board", `${cls}_${seat}`);
  const send = Math.min(points, MAX_PER_WRITE);
  let cur = null;
  try {
    const snap = await getDoc(ref);
    cur = snap.exists() ? snap.data() : null;
  } catch (e) {
    return { ok: false, reason: "error", code: e.code };
  }
  if (cur && cur.uid !== u.uid) return { ok: false, reason: "taken" };
  // 每週重置：紀錄停在之前的週，這次就從 0 開始算，並把上一筆的積分留在 prev（後台看上週用）。
  // 座號的擁有者（uid）不變，換週不會釋出座號。
  const week = weekOf();
  const same = cur && cur.week === week;
  const base = same ? cur : null;
  const next = {
    uid: u.uid, cls, seat, week,
    points: (base ? base.points : 0) + send,
    wins: (base ? base.wins : 0) + (win ? 1 : 0),
    rounds: (base ? base.rounds : 0) + 1,
    mastered,
    updated: serverTimestamp(),
  };
  if (same && "prev" in cur) { next.prev = cur.prev; next.prevWeek = cur.prevWeek; }
  if (cur && !same) { next.prev = cur.points; next.prevWeek = typeof cur.week === "number" ? cur.week : -1; }
  try {
    await setDoc(ref, next);
    return { ok: true, sent: send, points: next.points };
  } catch (e) {
    return { ok: false, reason: e.code === "permission-denied" && cur ? "wait" : "error", code: e.code };
  }
}

export async function top(cls, n = 10) {
  await signedIn();
  // 一班最多四十幾筆，直接在手機上排序，不需要另外建 Firestore 索引
  // 只排本週的紀錄；上週以前的紀錄等學生下次上傳時才會歸零，這裡先不列
  const week = weekOf();
  const snap = await getDocs(query(collection(db, "cl_kl_board"), where("cls", "==", cls)));
  return snap.docs.map((d) => d.data()).filter((r) => r.week === week).sort((a, b) => b.points - a.points).slice(0, n);
}
