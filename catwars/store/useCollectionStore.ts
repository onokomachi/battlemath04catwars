import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CAPSULE_RULES, EXCHANGE_COST, STICKER_BY_ID, exchangeSticker, pullCapsule, type CapsuleState, type PullResult,
} from '../collection/stickers';
import { coinsForPerfect, COIN_RULES, BADGE_COINS } from '../collection/coins';
import { BADGE_BY_ID, coinTierOf } from '../collection/badges';
import { markKey } from '../collection/dex';
import { TITLE_BY_ID, DECOR_BY_ID } from '../collection/titles';

// ── 収集の記録（2026-11-16 CW-4c。端末の中だけ）─────────────────────────────
//
// 図鑑・バッジ・シール・称号・かざり と、バッジの判定に使う学習の数を **ここ1か所** に持つ。
// あとで（CW-5）サーバの保存（catwars_save）に入れるので、形は小さく・JSON だけ（id の配列と数）。
//   exportSave() → CollectionSave（そのまま JSON にできる）／ importSave(obj) → 形を確かめて読みこむ
// まちがえずに といた数・単元ごとの数・かけら は useStudyStore（perfect）から毎回かぞえる（二重に持たない）。

/** 日づけ（端末の時計の その日。YYYY-MM-DD） */
export function localDay(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function prevDay(day: string): string {
  const [y, m, dd] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, dd - 1));
}

/** ふくしゅうを 待っている項目を 覚えておく上限 */
export const REVIEW_PENDING_MAX = 60;

export interface CollectionStats {
  /** dayPerfect の日 */
  day: string;
  /** その日 まちがえずに といた数（シールコインの数え方） */
  dayPerfect: number;
  bestDayPerfect: number;
  studyDays: number;
  streak: number;
  bestStreak: number;
  lastStudyDay: string;
  reviewCleared: number;
  /** まちがえて まだ ふくしゅうしていない項目（"単元/skill_id"） */
  reviewPending: string[];
  run: number;
  bestRun: number;
  hardPerfect: number;
  star3Battles: number;
  /** げきむず を まちがい0 で勝った 章 */
  extremePerfect: string[];
  shieldBreaks: number;
  bestBattlePerfect: number;
  bestBattleShield: number;
}

/** 保存する形（CW-5 で サーバの catwars_save に入れる） */
export interface CollectionSave {
  v: 1;
  coins: number;
  /** これまでに もらった シールコインの合計 */
  coinsTotal: number;
  /** シール（持っている まいすう）・天井の かぞえ・シールのかけら・回した回数 */
  cap: CapsuleState & { pulls: number };
  /** バッジ（id → 段） */
  badges: Record<string, number>;
  /** 知らせを出した段（id → 段） */
  badgesSeen: Record<string, number>;
  /** 見つけた ネコ（「系統:段階」） */
  cats: string[];
  /** 見た敵（「unit:grunt」「boss:ch1」） */
  enemySeen: string[];
  /** たおした数 */
  enemyDefeated: Record<string, number>;
  /** 段ごとの 勝ちのしるし（「unit:grunt@hard」） */
  marks: string[];
  stats: CollectionStats;
  title: string;
  decor: string;
}

export function emptyStats(): CollectionStats {
  return {
    day: '', dayPerfect: 0, bestDayPerfect: 0, studyDays: 0, streak: 0, bestStreak: 0, lastStudyDay: '',
    reviewCleared: 0, reviewPending: [], run: 0, bestRun: 0, hardPerfect: 0, star3Battles: 0,
    extremePerfect: [], shieldBreaks: 0, bestBattlePerfect: 0, bestBattleShield: 0,
  };
}
export function emptySave(): CollectionSave {
  return {
    v: 1, coins: 0, coinsTotal: 0,
    cap: { stickers: {}, sinceUp: 0, frag: 0, pulls: 0 },
    badges: {}, badgesSeen: {}, cats: [], enemySeen: [], enemyDefeated: {}, marks: [],
    stats: emptyStats(), title: 'rookie', decor: 'flag-blue',
  };
}

// ── 読みこむときの形の確かめ（こわれた・古いデータでも落ちない）──
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numMap = (v: unknown): Record<string, number> => {
  if (!v || typeof v !== 'object') return {};
  const o: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const nn = num(x, -1); if (nn > 0) o[k] = nn; }
  return o;
};
/** 外から来たデータを CollectionSave の形にする（知らない id は捨てる） */
export function sanitizeSave(raw: unknown): CollectionSave {
  const e = emptySave();
  if (!raw || typeof raw !== 'object') return e;
  const p = raw as Partial<CollectionSave>;
  const cap = (p.cap ?? {}) as Partial<CollectionSave['cap']>;
  const st = (p.stats ?? {}) as Partial<CollectionStats>;
  const stickers = Object.fromEntries(Object.entries(numMap(cap.stickers)).filter(([k]) => STICKER_BY_ID[k]));
  const badges = Object.fromEntries(Object.entries(numMap(p.badges)).filter(([k]) => BADGE_BY_ID[k]));
  const s = typeof st === 'object' ? st : {};
  return {
    v: 1,
    coins: num(p.coins), coinsTotal: num(p.coinsTotal),
    cap: { stickers, sinceUp: Math.min(CAPSULE_RULES.pity - 1, num(cap.sinceUp)), frag: num(cap.frag), pulls: num(cap.pulls) },
    badges, badgesSeen: numMap(p.badgesSeen),
    cats: strs(p.cats), enemySeen: strs(p.enemySeen), enemyDefeated: numMap(p.enemyDefeated), marks: strs(p.marks),
    stats: {
      day: typeof s.day === 'string' ? s.day : '', dayPerfect: num(s.dayPerfect), bestDayPerfect: num(s.bestDayPerfect),
      studyDays: num(s.studyDays), streak: num(s.streak), bestStreak: num(s.bestStreak),
      lastStudyDay: typeof s.lastStudyDay === 'string' ? s.lastStudyDay : '',
      reviewCleared: num(s.reviewCleared), reviewPending: strs(s.reviewPending).slice(-REVIEW_PENDING_MAX),
      run: num(s.run), bestRun: num(s.bestRun), hardPerfect: num(s.hardPerfect), star3Battles: num(s.star3Battles),
      extremePerfect: strs(s.extremePerfect), shieldBreaks: num(s.shieldBreaks),
      bestBattlePerfect: num(s.bestBattlePerfect), bestBattleShield: num(s.bestBattleShield),
    },
    title: typeof p.title === 'string' && TITLE_BY_ID[p.title] ? p.title : e.title,
    decor: typeof p.decor === 'string' && DECOR_BY_ID[p.decor] ? p.decor : e.decor,
  };
}

/**
 * 1問ぶんの記録（純粋な関数。画面と 試験 が同じものを使う）。
 * まちがえた項目は ふくしゅう待ちに入れ、あとで まちがえずに とけたら「ふくしゅう」を1つ数える。
 * シールコインは まちがえずに とけたときだけ（coinsForPerfect）。
 */
export function applyAnswer(
  save: CollectionSave,
  a: { unitKey: string; skillId: string; difficulty?: number; perfect: boolean },
  today: string,
): { save: CollectionSave; coins: number } {
  const st = { ...save.stats };
  const key = `${a.unitKey}/${a.skillId}`;
  if (!a.perfect) {
    st.run = 0;
    st.reviewPending = [...st.reviewPending.filter((k) => k !== key), key].slice(-REVIEW_PENDING_MAX);
    return { save: { ...save, stats: st }, coins: 0 };
  }
  // その日の はじめて
  if (st.day !== today) {
    st.day = today; st.dayPerfect = 0;
  }
  if (st.lastStudyDay !== today) {
    st.studyDays += 1;
    st.streak = st.lastStudyDay === prevDay(today) ? st.streak + 1 : 1;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.lastStudyDay = today;
  }
  const coins = coinsForPerfect(st.dayPerfect);
  st.dayPerfect += 1;
  st.bestDayPerfect = Math.max(st.bestDayPerfect, st.dayPerfect);
  st.run += 1;
  st.bestRun = Math.max(st.bestRun, st.run);
  if ((a.difficulty ?? 3) >= 4) st.hardPerfect += 1;
  if (st.reviewPending.includes(key)) {
    st.reviewPending = st.reviewPending.filter((k) => k !== key);
    st.reviewCleared += 1;
  }
  return { save: { ...save, stats: st, coins: save.coins + coins, coinsTotal: save.coinsTotal + coins }, coins };
}

export interface BattleRecord {
  chapterId: string;
  tier: string;
  win: boolean;
  /** 勝ったときの星（1〜3） */
  stars?: number;
  /** この章・この段の 前の星（あたらしく ふえた星に シールコイン） */
  prevStars: number;
  answered: number;
  perfect: number;
  /** この戦いで わった シールド */
  shields: number;
  /** この戦いで見た 敵（図鑑の鍵） */
  seen: string[];
  /** この戦いで たおした数（図鑑の鍵 → 数） */
  defeated: Record<string, number>;
}

/** 戦いの記録（純粋な関数）。あたらしく図鑑に のった鍵と、もらった シールコインを返す */
export function applyBattle(save: CollectionSave, b: BattleRecord): { save: CollectionSave; newDex: string[]; coins: number } {
  const st = { ...save.stats };
  const seenSet = new Set(save.enemySeen);
  const newDex: string[] = [];
  for (const k of b.seen) if (!seenSet.has(k)) { seenSet.add(k); newDex.push(k); }
  const defeated = { ...save.enemyDefeated };
  const marks = new Set(save.marks);
  for (const [k, c] of Object.entries(b.defeated)) {
    if (c <= 0) continue;
    defeated[k] = (defeated[k] ?? 0) + c;
    marks.add(markKey(k, b.tier));
  }
  let coins = 0;
  if (b.win) {
    const bk = `boss:${b.chapterId}`;
    defeated[bk] = (defeated[bk] ?? 0) + 1;
    marks.add(markKey(bk, b.tier));
    const s = b.stars ?? 1;
    if (s >= 3) st.star3Battles += 1;
    if (s > b.prevStars) coins += (s - b.prevStars) * COIN_RULES.star;
    if (b.tier === 'extreme' && b.answered >= 3 && b.perfect === b.answered && !st.extremePerfect.includes(b.chapterId)) {
      st.extremePerfect = [...st.extremePerfect, b.chapterId];
    }
  }
  if (b.answered > 0 && b.perfect === b.answered) st.bestBattlePerfect = Math.max(st.bestBattlePerfect, b.perfect);
  st.shieldBreaks += Math.max(0, b.shields);
  st.bestBattleShield = Math.max(st.bestBattleShield, b.shields);
  return {
    save: {
      ...save, stats: st, enemySeen: [...seenSet], enemyDefeated: defeated, marks: [...marks],
      coins: save.coins + coins, coinsTotal: save.coinsTotal + coins,
    },
    newDex, coins,
  };
}

/** バッジを入れる（純粋な関数）。あたらしく取った段と シールコインを返す（段は下がらない） */
export function applyBadges(save: CollectionSave, earned: Record<string, number>): { save: CollectionSave; gained: { id: string; tier: number }[]; coins: number } {
  const badges = { ...save.badges };
  const gained: { id: string; tier: number }[] = [];
  let coins = 0;
  for (const [id, t] of Object.entries(earned)) {
    const def = BADGE_BY_ID[id];
    const prev = badges[id] ?? 0;
    if (!def || t <= prev) continue;
    for (let k = prev + 1; k <= t; k++) coins += BADGE_COINS[coinTierOf(def, k)];
    badges[id] = t;
    gained.push({ id, tier: t });
  }
  if (!gained.length) return { save, gained, coins: 0 };
  return { save: { ...save, badges, coins: save.coins + coins, coinsTotal: save.coinsTotal + coins }, gained, coins };
}

interface CollectionStore extends CollectionSave {
  recordAnswer: (a: { unitKey: string; skillId: string; difficulty?: number; perfect: boolean }) => number;
  recordBattle: (b: BattleRecord) => { newDex: string[]; coins: number };
  setBadges: (earned: Record<string, number>) => { id: string; tier: number }[];
  setCats: (keys: string[]) => string[];
  markBadgesSeen: (ids?: string[]) => void;
  /** カプセルを1回（シールコインが たりないときは null） */
  pull: (rand?: () => number) => PullResult | null;
  exchange: (id: string) => boolean;
  setTitle: (id: string) => void;
  setDecor: (id: string) => void;
  exportSave: () => CollectionSave;
  importSave: (raw: unknown) => void;
  reset: () => void;
}

const pick = (s: CollectionStore): CollectionSave => ({
  v: 1, coins: s.coins, coinsTotal: s.coinsTotal, cap: s.cap, badges: s.badges, badgesSeen: s.badgesSeen,
  cats: s.cats, enemySeen: s.enemySeen, enemyDefeated: s.enemyDefeated, marks: s.marks, stats: s.stats,
  title: s.title, decor: s.decor,
});

export const useCollectionStore = create<CollectionStore>()(
  persist(
    (set, get) => ({
      ...emptySave(),

      recordAnswer: (a) => {
        const r = applyAnswer(pick(get()), a, localDay());
        set(r.save);
        return r.coins;
      },

      recordBattle: (b) => {
        const r = applyBattle(pick(get()), b);
        set(r.save);
        return { newDex: r.newDex, coins: r.coins };
      },

      setBadges: (earned) => {
        const r = applyBadges(pick(get()), earned);
        if (r.gained.length) set(r.save);
        return r.gained;
      },

      setCats: (keys) => {
        const have = new Set(get().cats);
        const fresh = keys.filter((k) => !have.has(k));
        if (fresh.length) set({ cats: [...get().cats, ...fresh] });
        return fresh;
      },

      markBadgesSeen: (ids) => set((s) => {
        const seen = { ...s.badgesSeen };
        for (const [id, t] of Object.entries(s.badges)) if (!ids || ids.includes(id)) seen[id] = t;
        return { badgesSeen: seen };
      }),

      pull: (rand = Math.random) => {
        const s = get();
        if (s.coins < CAPSULE_RULES.cost) return null;
        const r = pullCapsule(s.cap, rand);
        set({ coins: s.coins - CAPSULE_RULES.cost, cap: { ...r.next, pulls: s.cap.pulls + 1 } });
        return r;
      },

      exchange: (id) => {
        const s = get();
        const def = STICKER_BY_ID[id];
        if (!def || s.cap.frag < EXCHANGE_COST[def.rarity]) return false;
        const next = exchangeSticker(s.cap, id);
        if (next === s.cap) return false;
        set({ cap: { ...next, pulls: s.cap.pulls } });
        return true;
      },

      setTitle: (id) => { if (TITLE_BY_ID[id]) set({ title: id }); },
      setDecor: (id) => { if (DECOR_BY_ID[id]) set({ decor: id }); },

      exportSave: () => JSON.parse(JSON.stringify(pick(get()))) as CollectionSave,
      importSave: (raw) => set(sanitizeSave(raw)),
      reset: () => set(emptySave()),
    }),
    {
      name: 'catwars-collection-v1',
      partialize: (s) => pick(s as CollectionStore),
      merge: (persisted, current) => ({ ...current, ...sanitizeSave(persisted) }),
    },
  ),
);
