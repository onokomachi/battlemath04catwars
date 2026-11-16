import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { syncProgressState } from '../utils/syncToSupabase';
import { BuffType, BuffTier, ActiveDailyBuff } from '../types';
import { SAVE_KEYS } from '../portal/saveKeys';

export interface LoginBonusResult {
  dailyStarsGained: number;
  superStarsGained: number;
  loginStreak: number;
  dailyGoalCompleted: boolean;
}

interface ProgressStore {
  stars: number;           // スーパースター（永続・ExchangePanel用）
  dailyStars: number;      // デイリースター（当日リセット・バフ購入用）
  dailyStarsDate: string;
  totalCorrect: number;
  totalAnswered: number;
  dailyStreak: number;
  lastPlayDate: string;
  todayAnswered: number;
  dailyGoal: number;
  dueUnitIds: string[];
  lastLoginDate: string;
  loginStreak: number;
  activeDailyBuffs: ActiveDailyBuff[];
  lastBuffDate: string;
  unlockedToday: string[];
  unlockedTodayDate: string;
  permanentUnlocks: string[];
  specialItems: string[];

  addStars: (n: number) => void;
  rollSuperStar: () => number;
  spendStars: (n: number) => boolean;
  addDailyStars: (n: number) => void;
  spendDailyStars: (n: number) => boolean;
  getTodayDailyStars: () => number;
  buyDailyBuff: (type: BuffType) => boolean;
  getTodayBuffs: () => ActiveDailyBuff[];
  recordAnswer: (unitId: string, correct: boolean, subTopicId?: string) => void;
  updateDailyStreak: () => void;
  setDailyGoal: (n: number) => void;
  checkLoginBonus: () => LoginBonusResult | null;
  unlockCharacterToday: (id: string) => boolean;
  unlockCharacterWithSuperStar: (id: string, cost: number) => boolean;
  addPermanentUnlock: (id: string) => void;
  addSpecialItem: (item: string) => void;
  loadFromCloud: (data: Partial<ProgressStore>) => void;
  reset: () => void;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export interface BuffTierInfo {
  tier: BuffTier;
  name: string;
  color: string;
  unlockLabel: string;
}

export const BUFF_TIERS: Record<BuffTier, BuffTierInfo> = {
  1: { tier: 1, name: 'ブロンズ',   color: '#94a3b8', unlockLabel: 'いつでも' },
  2: { tier: 2, name: 'シルバー',   color: '#38bdf8', unlockLabel: 'きょう10問' },
  3: { tier: 3, name: 'ゴールド',   color: '#a78bfa', unlockLabel: 'きょう25問 か 5日つづけて' },
  4: { tier: 4, name: 'でんせつ',   color: '#facc15', unlockLabel: 'きょう40問 と 3日つづけて' },
};

export const BUFF_CONFIG: Record<BuffType, { label: string; icon: string; description: string; cost: number; tier: BuffTier }> = {
  // T1 一般
  FAST_DEPLOY:    { tier: 1, label: 'すぐに 出撃',     icon: '⚡',  description: 'ネコを 出したあとの まち時間が みじかくなる',         cost: 15 },
  COST_REDUCTION: { tier: 1, label: 'ネコ やすうり',  icon: '💸',  description: 'ネコを 出す ⚡ が やすくなる',   cost: 20 },
  GOLD_RUSH:      { tier: 1, label: 'エナジー ラッシュ', icon: '⚡', description: 'はじめの ⚡ が ふえる',              cost: 15 },
  GOLD_BOOST:     { tier: 1, label: 'カード エナジー',  icon: '📈',  description: 'もんだいカードで もらえる ⚡ が ふえる',       cost: 18 },
  // T2 上級
  RARE_BARBARIAN: { tier: 2, label: 'レア・近接系', icon: '⚔️💥', description: '近接系の HPと こうげきが アップ',          cost: 30 },
  RARE_ARCHER:    { tier: 2, label: 'レア・遠距離系', icon: '🏹✨', description: '遠距離系の しゃていが のびて、うつのが はやくなる',           cost: 25 },
  POWER_BOOST:    { tier: 2, label: 'みんな パワーアップ',          icon: '💪',  description: 'ぜんぶの ネコの こうげきが アップ',           cost: 35 },
  EXTRA_TROOPS:   { tier: 2, label: 'おうえん エナジー',        icon: '🪖',  description: 'はじめの ⚡ が ふえる',                cost: 40 },
  SWIFT_ARMY:     { tier: 2, label: 'はやあし ぐんだん',        icon: '👟',  description: 'ぜんぶの ネコが はやく うごく',         cost: 28 },
  // T3 精鋭
  HEAL_AURA:      { tier: 3, label: 'かいふく オーラ', icon: '💚',  description: 'ぜんぶの ネコが 3びょうごとに すこし かいふく',        cost: 50 },
  GIANT_FORTRESS: { tier: 3, label: 'てつの とりで',         icon: '🛡️', description: 'タンク系の HPが アップ',             cost: 55 },
  DOUBLE_LOOT:    { tier: 3, label: 'ごほうび アップ',   icon: '💎',  description: '勝ったときの 💠 が ふえる',            cost: 65 },
  WIZARD_SUPPORT: { tier: 3, label: 'まほうの おうえん',     icon: '🔮',  description: 'はじめの ⚡ が ふえる',                cost: 60 },
  // T4 伝説
  DRAGON_SUMMON:  { tier: 4, label: 'ドラゴンの たから',   icon: '🐉',  description: 'はじめの ⚡ が たくさん ふえる',                cost: 100 },
  ARMAGEDDON:     { tier: 4, label: 'アルマゲドン',     icon: '☄️', description: 'ぜんぶの ネコの こうげきが 大きく アップ',           cost: 90 },
  GENIUS_COMMANDER:{tier: 4, label: 'てんさい たいちょう',       icon: '👑',  description: 'ぜんぶの ネコの HPと こうげきが アップ',        cost: 80 },
};

// 各バフのレベル別効果量（小・中・大）。表示と戦闘計算の両方で使う。
export const BUFF_LEVEL_INFO: Record<BuffType, { values: [number, number, number]; unit: string }> = {
  FAST_DEPLOY:     { values: [30, 60, 100], unit: '%短縮' },
  COST_REDUCTION:  { values: [10, 20, 30],  unit: '%オフ' },
  GOLD_RUSH:       { values: [50, 100, 150], unit: '⚡' },
  GOLD_BOOST:      { values: [20, 35, 50],  unit: '%' },
  RARE_BARBARIAN:  { values: [20, 35, 50],  unit: '%' },
  RARE_ARCHER:     { values: [15, 30, 45],  unit: '%' },
  POWER_BOOST:     { values: [15, 30, 45],  unit: '%' },
  EXTRA_TROOPS:    { values: [60, 110, 160], unit: '⚡' },
  SWIFT_ARMY:      { values: [15, 30, 45],  unit: '%' },
  HEAL_AURA:       { values: [3, 5, 8],     unit: '%/3秒' },
  GIANT_FORTRESS:  { values: [50, 100, 150], unit: '%' },
  DOUBLE_LOOT:     { values: [50, 100, 150], unit: '%' },
  WIZARD_SUPPORT:  { values: [70, 130, 200], unit: '⚡' },
  DRAGON_SUMMON:   { values: [80, 160, 240], unit: '⚡' },
  ARMAGEDDON:      { values: [25, 50, 75],  unit: '%' },
  GENIUS_COMMANDER:{ values: [10, 20, 30],  unit: '%' },
};

/** 本日の学習状況からティアの解放可否を判定 */
export function buffTierUnlocked(tier: BuffTier, todayAnswered: number, loginStreak: number): boolean {
  switch (tier) {
    case 1: return true;
    case 2: return todayAnswered >= 10;
    case 3: return todayAnswered >= 25 || loginStreak >= 5;
    case 4: return todayAnswered >= 40 && loginStreak >= 3;
  }
}

function calcLoginBonus(streak: number, dailyGoalDone: boolean): { ds: number; ss: number } {
  let ds = 3;
  let ss = 0;
  if (streak >= 10) { ds = 25; ss = 10; }
  else if (streak >= 7) { ds = 20; ss = 5; }
  else if (streak >= 5) { ds = 12; ss = 2; }
  else if (streak >= 3) { ds = 8; ss = 1; }
  else if (streak >= 2) { ds = 5; }
  if (dailyGoalDone) ds += 5;
  return { ds, ss };
}

function pickSync(s: ProgressStore) {
  syncProgressState({
    stars: s.stars,
    total_correct: s.totalCorrect,
    total_answered: s.totalAnswered,
    daily_streak: s.dailyStreak,
    last_play_date: s.lastPlayDate,
    today_answered: s.todayAnswered,
    daily_goal: s.dailyGoal,
    daily_stars: s.dailyStars,
    last_login_date: s.lastLoginDate,
    login_streak: s.loginStreak,
    daily_buffs: s.activeDailyBuffs,
    last_buff_date: s.lastBuffDate,
  });
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      stars: 0,
      dailyStars: 0,
      dailyStarsDate: '',
      totalCorrect: 0,
      totalAnswered: 0,
      dailyStreak: 0,
      lastPlayDate: '',
      todayAnswered: 0,
      dailyGoal: 10,
      dueUnitIds: [],
      lastLoginDate: '',
      loginStreak: 0,
      activeDailyBuffs: [],
      lastBuffDate: '',
      unlockedToday: [],
      unlockedTodayDate: '',
      permanentUnlocks: [],
      specialItems: [],

      addStars: (n) =>
        set((s) => {
          const next = { stars: s.stars + n };
          pickSync({ ...s, ...next });
          return next;
        }),

      // スーパースターはまれにランダムで湧く（変動比率強化）。
      // 正解1回ごとに呼ぶ: 3%で+2, さらに7%で+1, それ以外は0。
      rollSuperStar: () => {
        const r = Math.random();
        const gained = r < 0.03 ? 2 : r < 0.10 ? 1 : 0;
        if (gained > 0) {
          set((s) => {
            const next = { stars: s.stars + gained };
            pickSync({ ...s, ...next });
            return next;
          });
        }
        return gained;
      },

      spendStars: (n) => {
        const { stars } = get();
        if (stars < n) return false;
        set((s) => {
          const next = { stars: s.stars - n };
          pickSync({ ...s, ...next });
          return next;
        });
        return true;
      },

      addDailyStars: (n) =>
        set((s) => {
          const today = todayString();
          const current = s.dailyStarsDate === today ? s.dailyStars : 0;
          const next = { dailyStars: current + n, dailyStarsDate: today };
          pickSync({ ...s, ...next });
          return next;
        }),

      spendDailyStars: (n) => {
        const { dailyStars, dailyStarsDate } = get();
        const today = todayString();
        const current = dailyStarsDate === today ? dailyStars : 0;
        if (current < n) return false;
        set((s) => {
          const next = { dailyStars: s.dailyStars - n };
          pickSync({ ...s, ...next });
          return next;
        });
        return true;
      },

      getTodayDailyStars: () => {
        const { dailyStars, dailyStarsDate } = get();
        return dailyStarsDate === todayString() ? dailyStars : 0;
      },

      buyDailyBuff: (type) => {
        const cfg = BUFF_CONFIG[type];
        const s = get();
        const todayCount = s.lastPlayDate === todayString() ? s.todayAnswered : 0;
        if (!buffTierUnlocked(cfg.tier, todayCount, s.loginStreak)) return false;

        const today = todayString();
        const existing = (s.lastBuffDate === today ? s.activeDailyBuffs : []).find(b => b.type === type);
        const curLevel = existing?.level ?? 0;
        if (curLevel >= 3) return false;

        const nextLevel = (curLevel + 1) as 1 | 2 | 3;
        const baseCost = cfg.cost;
        const lvlCosts = [0, Math.round(baseCost * 0.6), baseCost, Math.round(baseCost * 1.6)];
        const incrementalCost = lvlCosts[nextLevel] - lvlCosts[curLevel];

        if (!s.spendDailyStars(incrementalCost)) return false;

        set((st) => {
          const freshBuffs = (s.lastBuffDate === today ? s.activeDailyBuffs : []).filter(b => b.type !== type);
          const next = {
            activeDailyBuffs: [
              ...freshBuffs,
              { type, activatedAt: Date.now(), expiresAt: endOfToday(), level: nextLevel },
            ],
            lastBuffDate: today,
          };
          pickSync({ ...st, ...next });
          return next;
        });
        return true;
      },

      getTodayBuffs: () => {
        const { activeDailyBuffs, lastBuffDate } = get();
        const today = todayString();
        if (lastBuffDate !== today) return [];
        return activeDailyBuffs.filter(b => b.expiresAt > Date.now());
      },

      // 学習の量（きょうの問題数・正解の数）。項目ごとの くりかえしの記録（mastery）は CW-5b で消した
      // （どこからも読まれず、サーバのセーブを ふくらませていた。項目ごとの記録は useStudyStore とサーバの learning_event）
      recordAnswer: (_unitId, correct) =>
        set((s) => {
          const today = todayString();
          const next = {
            totalAnswered: s.totalAnswered + 1,
            totalCorrect: s.totalCorrect + (correct ? 1 : 0),
            todayAnswered: s.lastPlayDate === today ? s.todayAnswered + 1 : 1,
            lastPlayDate: today,
          };
          pickSync({ ...s, ...next });
          return next;
        }),

      updateDailyStreak: () =>
        set((s) => {
          const today = todayString();
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          if (s.lastPlayDate === today) return {};
          const newStreak = s.lastPlayDate === yesterday ? s.dailyStreak + 1 : 1;
          const next = { dailyStreak: newStreak, lastPlayDate: today, todayAnswered: 0 };
          pickSync({ ...s, ...next });
          return next;
        }),

      checkLoginBonus: () => {
        const { lastLoginDate, loginStreak, todayAnswered, dailyGoal } = get();
        const today = todayString();
        if (lastLoginDate === today) return null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = lastLoginDate === yesterday ? loginStreak + 1 : 1;
        const dailyGoalDone = todayAnswered >= dailyGoal;
        const { ds, ss } = calcLoginBonus(newStreak, dailyGoalDone);
        set((s) => {
          const next = {
            lastLoginDate: today,
            loginStreak: newStreak,
            dailyStars: (s.dailyStarsDate === today ? s.dailyStars : 0) + ds,
            dailyStarsDate: today,
            stars: s.stars + ss,
          };
          pickSync({ ...s, ...next });
          return next;
        });
        return { dailyStarsGained: ds, superStarsGained: ss, loginStreak: newStreak, dailyGoalCompleted: dailyGoalDone };
      },

      setDailyGoal: (n) =>
        set((s) => {
          const next = { dailyGoal: n };
          pickSync({ ...s, ...next });
          return next;
        }),

      unlockCharacterToday: (id) => {
        const { dailyStars, dailyStarsDate, unlockedToday, unlockedTodayDate } = get();
        const today = todayString();
        const currentDailyStars = dailyStarsDate === today ? dailyStars : 0;
        if (currentDailyStars < 15) return false;
        const freshUnlocked = unlockedTodayDate === today ? unlockedToday : [];
        if (freshUnlocked.includes(id)) return true;
        set((s) => {
          const next = {
            dailyStars: s.dailyStars - 15,
            unlockedToday: [...freshUnlocked, id],
            unlockedTodayDate: today,
          };
          pickSync({ ...s, ...next });
          return next;
        });
        return true;
      },

      unlockCharacterWithSuperStar: (id, cost) => {
        const { stars } = get();
        if (stars < cost) return false;
        const today = todayString();
        set((s) => {
          const baseList = s.unlockedTodayDate === today ? s.unlockedToday : [];
          const next = {
            stars: s.stars - cost,
            unlockedToday: baseList.includes(id) ? baseList : [...baseList, id],
            unlockedTodayDate: today,
          };
          pickSync({ ...s, ...next });
          return next;
        });
        return true;
      },

      addPermanentUnlock: (id) =>
        set((s) => {
          if (s.permanentUnlocks.includes(id)) return {};
          return { permanentUnlocks: [...s.permanentUnlocks, id] };
        }),

      addSpecialItem: (item) =>
        set((s) => {
          if (s.specialItems.includes(item)) return {};
          return { specialItems: [...s.specialItems, item] };
        }),

      loadFromCloud: (data) =>
        set((s) => ({
          stars: (data.stars as number) ?? s.stars,
          dailyStars: (data.dailyStars as number) ?? s.dailyStars,
          dailyStarsDate: (data.dailyStarsDate as string) ?? s.dailyStarsDate,
          totalCorrect: (data.totalCorrect as number) ?? s.totalCorrect,
          totalAnswered: (data.totalAnswered as number) ?? s.totalAnswered,
          dailyStreak: (data.dailyStreak as number) ?? s.dailyStreak,
          lastPlayDate: (data.lastPlayDate as string) ?? s.lastPlayDate,
          todayAnswered: (data.todayAnswered as number) ?? s.todayAnswered,
          dailyGoal: (data.dailyGoal as number) ?? s.dailyGoal,
          lastLoginDate: (data.lastLoginDate as string) ?? s.lastLoginDate,
          loginStreak: (data.loginStreak as number) ?? s.loginStreak,
          activeDailyBuffs: (data.activeDailyBuffs as ActiveDailyBuff[]) ?? s.activeDailyBuffs,
          lastBuffDate: (data.lastBuffDate as string) ?? s.lastBuffDate,
          unlockedToday: (data.unlockedToday as string[]) ?? s.unlockedToday,
          unlockedTodayDate: (data.unlockedTodayDate as string) ?? s.unlockedTodayDate,
          permanentUnlocks: (data.permanentUnlocks as string[]) ?? s.permanentUnlocks,
          specialItems: (data.specialItems as string[]) ?? s.specialItems,
        })),

      reset: () => {
        const next = {
          stars: 0, dailyStars: 0, dailyStarsDate: '',
          totalCorrect: 0, totalAnswered: 0,
          dailyStreak: 0, lastPlayDate: '', todayAnswered: 0, dailyGoal: 10, dueUnitIds: [],
          lastLoginDate: '', loginStreak: 0, activeDailyBuffs: [], lastBuffDate: '',
          unlockedToday: [], unlockedTodayDate: '', permanentUnlocks: [], specialItems: [],
        };
        syncProgressState({ stars: 0, total_correct: 0, total_answered: 0, daily_streak: 0, last_play_date: '', today_answered: 0, daily_goal: 10, daily_stars: 0 });
        return set(next);
      },
    }),
    {
      name: SAVE_KEYS.progress,
      // CW-5b より前の セーブに のこっている mastery（項目ごとの くりかえしの記録。もう使わない）は 読みこまない
      merge: (persisted, current) => {
        const { mastery: _old, ...rest } = (persisted ?? {}) as Partial<ProgressStore> & { mastery?: unknown };
        return { ...current, ...rest };
      },
    }
  )
);
