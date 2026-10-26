// 滄浪闖關手機版：所有可調整的數值集中在這裡。試玩後只要改這個檔案、重新部署即可。

export const CONFIG = {
  // 老師帳號：只有這個 Google 帳號能登入控制台（安全規則 firestore.rules 裡也要寫同一個）
  teacherEmail: "bgjd315@gmail.com",

  // 班級選項
  classes: ["301", "307"],
  maxSeat: 45,

  // 每課固定題數與每題分數
  questionsPerLesson: 20,
  pointsPerQuestion: 5,
  // 試玩版題數
  trialQuestions: 5,

  // 每段作答時間（分鐘）
  segmentMinutes: [3, 4, 5],
  defaultSegmentMinutes: 4,

  // 魔王血量 = 人數 × 倍數
  bossHpPerPlayer: { formal: 25, trial: 6 },

  // 三種行動答對時的效果
  effects: {
    m: { damage: 1, shield: 0, energy: 0 },   // 語文知識（攻擊）
    u: { damage: 0.5, shield: 1, energy: 0 }, // 文意理解（護盾）
    a: { damage: 2, shield: 0, energy: 1 },   // 綜合判斷（蓄力）
  },

  // 合力一擊：能量到 ceil(N × energyRatio) 時自動發動，造成 N × ultimatePerPlayer 傷害
  ultimateEnergyRatio: 1 / 2,
  ultimatePerPlayer: 2,

  // 魔王反擊：每 counterEvery 段結算時反擊一次
  counterEvery: 2,
  counterDamage: 30,
  // 護盾點數每滿 ceil(N × shieldUnitRatio) 點擋下 shieldBlock，最多擋 shieldBlockMax
  shieldUnitRatio: 1 / 5,
  shieldBlock: 10,
  shieldBlockMax: 30,

  // 全班心志
  moraleMax: 100,

  // 投影畫面寫回房間狀態的最短間隔（毫秒），省 Firestore 讀寫量
  roomWriteThrottleMs: 4000,
  // 學生手機回報在線的間隔（毫秒）
  heartbeatMs: 60000,
};

export const TIERS = {
  m: { name: "語文知識", action: "攻擊", desc: "答對：魔王血量 −1" },
  u: { name: "文意理解", action: "護盾", desc: "答對：血量 −0.5，護盾 +1" },
  a: { name: "綜合判斷", action: "蓄力", desc: "答對：血量 −2，能量 +1" },
};

export const ULTIMATE_NAME = "合力一擊";
