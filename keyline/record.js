// 紀錄模組（第一階段）：進度只存在這支手機的 localStorage，只記座號不記姓名。
// 第二階段若要看全班錯題，只要換掉這個檔案裡的讀寫，遊戲本體不用改。
window.KeylineRecord = (function () {
  const KEY = "cl_keyline_v1";
  let mem = { seat: "", lessons: {}, lastDay: "", streak: 0 };
  try { mem = Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* 私密視窗讀不到時，只留在記憶體 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* 同上 */ } };
  const today = () => new Date().toLocaleDateString("sv");
  const lesson = (id) => (mem.lessons[id] = mem.lessons[id] || {});
  return {
    seat: () => mem.seat,
    setSeat(v) { mem.seat = v; save(); },
    streak: () => mem.streak || 0,
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
