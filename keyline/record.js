// 紀錄模組（第一階段）：進度只存在這支手機的 localStorage，只記座號不記姓名。
// 第二階段若要看全班錯題，只要換掉這個檔案裡的讀寫，遊戲本體不用改。
window.KeylineRecord = (function () {
  const KEY = "cl_keyline_v1";
  let mem = { seat: "", cls: "", level: "normal", lessons: {}, lastDay: "", streak: 0, points: 0, wins: 0, rounds: 0, pending: 0, pendingWin: false, best: {} };
  try { mem = Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* 私密視窗讀不到時，只留在記憶體 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 同上 */ } };
  const today = () => new Date().toLocaleDateString("sv");
  const lesson = (id) => (mem.lessons[id] = mem.lessons[id] || {});
  return {
    seat: () => mem.seat,
    setSeat(v) { mem.seat = v; save(); },
    streak: () => mem.streak || 0,
    cls: () => mem.cls || "",
    setCls(v) { mem.cls = v; save(); },
    level: () => mem.level || "normal",
    setLevel(v) { mem.level = v; save(); },
    totals: () => ({ points: mem.points || 0, wins: mem.wins || 0, rounds: mem.rounds || 0, best: mem.best || {} }),
    masteredAll: () => Object.values(mem.lessons).reduce((a, l) => a + Object.values(l).filter((c) => c.box === 3).length, 0),
    // 一回對戰結束：累積在這支手機；還沒上傳到排行榜的分數放在 pending
    addResult(lessonId, gained, score, win) {
      mem.points = (mem.points || 0) + gained;
      mem.rounds = (mem.rounds || 0) + 1;
      if (win) mem.wins = (mem.wins || 0) + 1;
      mem.best = mem.best || {};
      mem.best[lessonId] = Math.max(mem.best[lessonId] || 0, score);
      mem.pending = (mem.pending || 0) + gained;
      mem.pendingWin = !!win;
      save();
    },
    pending: () => ({ points: mem.pending || 0, win: !!mem.pendingWin }),
    sent(n) { mem.pending = Math.max(0, (mem.pending || 0) - n); mem.pendingWin = false; save(); },
    // 這句的紀錄：box 1–3（Leitner 盒子）、seen 練過、lastWrong 上次答錯
    card: (lessonId, sid) => lesson(lessonId)[sid] || { box: 1, seen: false, lastWrong: false },
    mastered: (lessonId) => Object.values(mem.lessons[lessonId] || {}).filter((c) => c.box === 3).length,
    answer(lessonId, sid, correct) {
      const c = this.card(lessonId, sid);
      lesson(lessonId)[sid] = { box: correct ? Math.min(3, c.box + 1) : 1, seen: true, lastWrong: !correct };
      save();
    },
    finishRound() {
      const t = today();
      if (mem.lastDay === t) return;
      const y = new Date(Date.now() - 864e5).toLocaleDateString("sv");
      mem.streak = mem.lastDay === y ? (mem.streak || 0) + 1 : 1;
      mem.lastDay = t;
      save();
    },
  };
})();
