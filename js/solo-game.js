// 單人版（和電腦對手比賽）的戰鬥規則。純函式，網頁與模擬腳本共用。
export const SOLO = {
  bossHp: 75,
  effects: {
    m: { damage: 3, shield: 0, energy: 0 },
    u: { damage: 2, shield: 1, energy: 0 },
    a: { damage: 4, shield: 0, energy: 1 },
  },
  ultimateAt: 2,      // 能量幾格發動必殺
  ultimateDamage: 8,  // 必殺對自己魔王的傷害
  jamHeal: 5,         // 必殺干擾：對手的魔王回血
  maxShield: 3,
  // 電腦難度：答對率、每題思考秒數範圍
  levels: {
    easy: { name: "簡單", accuracy: 0.5, think: [14, 22] },
    normal: { name: "普通", accuracy: 0.7, think: [13, 20] },
    hard: { name: "困難", accuracy: 0.85, think: [11, 18] },
  },
};

export function newSide() {
  return { hp: SOLO.bossHp, shield: 0, energy: 0, right: 0, answered: 0 };
}

// 一方答完一題。回傳事件（給畫面播動畫、寫戰報）
export function applySolo(me, foe, tier, correct) {
  me.answered++;
  if (!correct) return [];
  me.right++;
  const fx = SOLO.effects[tier];
  const ev = [];
  me.hp = Math.max(0, me.hp - fx.damage);
  me.shield = Math.min(SOLO.maxShield, me.shield + fx.shield);
  me.energy += fx.energy;
  ev.push({ type: "hit", damage: fx.damage, tier });
  if (me.energy >= SOLO.ultimateAt) {
    me.energy = 0;
    me.hp = Math.max(0, me.hp - SOLO.ultimateDamage);
    ev.push({ type: "ultimate", damage: SOLO.ultimateDamage });
    if (foe.hp > 0) {
      if (foe.shield > 0) { foe.shield--; ev.push({ type: "blocked" }); }
      else { foe.hp = Math.min(SOLO.bossHp, foe.hp + SOLO.jamHeal); ev.push({ type: "jam", heal: SOLO.jamHeal }); }
    }
  }
  return ev;
}

// 電腦選行動：有能量快滿就蓄力，護盾少時偶爾補護盾，其他隨機
export function cpuTier(side, rand = Math.random) {
  if (side.energy === SOLO.ultimateAt - 1 && rand() < 0.6) return "a";
  if (side.shield === 0 && rand() < 0.35) return "u";
  return ["m", "u", "a"][Math.floor(rand() * 3)];
}
