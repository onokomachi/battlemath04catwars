/**
 * バッジ（2026-11-16 CW-4c）。docs/REBUILD_SPEC.md §3d。
 *
 * **学習の量と質だけ**で取れる：まちがえずに といた数・単元ごとの かけら・れんぞくで学習した日・ふくしゅう・
 * 全単元に ふれた・げきむず を まちがい0 で勝った・章の星（星は「まちがえずに とけた割合」で きまる）など。
 * 速さ・勝ち負けの数だけ・ログインの時間・放置・対戦の勝ち数は 条件にしない。
 *
 * 段は 銅（1）・銀（2）・金（3）。段が1つだけのバッジもある。かくしバッジは3つ（取るまで 名前と条件を出さない）。
 * 判定は BadgeInput（数だけ）からの純粋な関数（evalBadges）。画面は collection/record.ts、進み方の計算は scripts/progressionSim.ts。
 */
import { PACK_UNITS } from '../learn/gradePack';
import { CAMPAIGN, tierKey, type ChapterTier } from '../data/campaign';

/** バッジの判定に使う数（ぜんぶ 学習の量と質から） */
export interface BadgeInput {
  /** まちがえずに といた問題の合計 */
  perfectTotal: number;
  /** 1日に まちがえずに といた数の いちばん多い日 */
  bestDayPerfect: number;
  /** れんぞくで学習した日数の いちばん長いもの（まちがえずに 1問いじょう とけた日） */
  bestStreak: number;
  /** 学習した日の数 */
  studyDays: number;
  /** まちがえた項目を あとで まちがえずに といた数（ふくしゅう） */
  reviewCleared: number;
  /** 単元ごとの まちがえずに といた数 */
  unitPerfect: Record<string, number>;
  /** 単元ごとの かけら（0〜8） */
  unitShards: Record<string, number>;
  /** れんぞくで まちがえずに といた いちばん長い数 */
  bestRun: number;
  /** むずかしさ4〜5 の問題を まちがえずに といた数 */
  hardPerfect: number;
  /** ★3 を とった 戦い の数 */
  star3Battles: number;
  /** 章の星（tierKey → 1〜3） */
  stars: Record<string, number>;
  /** げきむず を まちがい0（3問いじょう）で 勝った 章の数 */
  extremePerfectChapters: number;
  /** ふくしゅうカードで わった ボスの シールドの数 */
  shieldBreaks: number;
  /** 開いたスキルの数（かけらで開く） */
  skillsOpen: number;
  /** スキルが 1つでも 開いた系統の数 */
  familiesWithSkill: number;
  /** 系統の数（スキルのある系統） */
  familiesTotal: number;
  /** 1回の戦いで まちがい0 のまま といた いちばん多い数 */
  bestBattlePerfect: number;
  /** 1回の戦いで わった シールドの いちばん多い数 */
  bestBattleShield: number;
}

export type BadgeGroup = 'study' | 'unit' | 'battle' | 'hidden';

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  /** 絵柄（SVG。public/assets/badges/<id>.svg）。メダルの台は badgeFrame。読めないときは icon */
  image?: string;
  group: BadgeGroup;
  /** 段の しきい値（1つ＝段なし／3つ＝銅・銀・金） */
  tiers: number[];
  measure: (i: BadgeInput) => number;
  /** 条件の文（しきい値を入れる） */
  cond: (need: number) => string;
  hidden?: boolean;
}

export const TIER_NAME: Record<1 | 2 | 3, string> = { 1: '銅', 2: '銀', 3: '金' };
export const TIER_COLOR: Record<1 | 2 | 3, string> = { 1: '#d97706', 2: '#cbd5e1', 3: '#facc15' };

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + (b || 0), 0);
const starsOf = (i: BadgeInput, tier: ChapterTier) => CAMPAIGN.reduce((a, c) => a + (i.stars[tierKey(c.id, tier)] ?? 0), 0);
const allStar3 = (i: BadgeInput, tier: ChapterTier) => CAMPAIGN.every((c) => (i.stars[tierKey(c.id, tier)] ?? 0) >= 3);

/** 単元ごとの バッジ（学年パックから作る。ゲーム本体に単元名を書かない） */
const UNIT_BADGES: BadgeDef[] = PACK_UNITS.map((u) => ({
  id: `unit-${u.key}`,
  name: `${u.name} マスター`,
  icon: '💎',
  group: 'unit' as const,
  tiers: [2, 4, 8],
  measure: (i: BadgeInput) => i.unitShards[u.key] ?? 0,
  cond: (need: number) => `『${u.name}』の かけらを ${need}こ（項目を まちがえずに 3回ずつ）`,
}));

const allUnitsTen = (i: BadgeInput) => (PACK_UNITS.every((u) => (i.unitPerfect[u.key] ?? 0) >= 10) ? 1 : 0);
const unitsTouched = (i: BadgeInput) => PACK_UNITS.filter((u) => (i.unitPerfect[u.key] ?? 0) >= 1).length;

/** 絵柄（docs/ART_STYLE.md）。34こ ぜんぶ 手で書いた SVG がある */
const withArt = (list: BadgeDef[]): BadgeDef[] => list.map((b) => ({ ...b, image: b.image ?? `/assets/badges/${b.id}.svg` }));

export const BADGES: BadgeDef[] = withArt([
  // ── 学習の量 ──
  { id: 'first-step', name: 'はじめの いっぽ', icon: '👣', group: 'study', tiers: [1],
    measure: (i) => i.perfectTotal, cond: () => '問題を 1問 まちがえずに とく' },
  { id: 'perfect-total', name: 'まちがえずに とく', icon: '✅', group: 'study', tiers: [200, 1500, 6000],
    measure: (i) => i.perfectTotal, cond: (n) => `まちがえずに ${n}問 とく（ぜんぶで）` },
  { id: 'day-perfect', name: 'きょうの がんばり', icon: '🌞', group: 'study', tiers: [15, 40, 100],
    measure: (i) => i.bestDayPerfect, cond: (n) => `1日に まちがえずに ${n}問 とく` },
  { id: 'streak', name: 'れんぞく がくしゅう', icon: '🔥', group: 'study', tiers: [3, 10, 30],
    measure: (i) => i.bestStreak, cond: (n) => `${n}日 つづけて 学習する（1日1問 まちがえずに とけば OK）` },
  { id: 'study-days', name: 'がくしゅう カレンダー', icon: '📅', group: 'study', tiers: [7, 25, 60],
    measure: (i) => i.studyDays, cond: (n) => `学習した日が ${n}日（つづけなくても よい）` },
  { id: 'review', name: 'ふくしゅう', icon: '🔁', group: 'study', tiers: [10, 80, 400],
    measure: (i) => i.reviewCleared, cond: (n) => `まちがえた 項目を あとで まちがえずに とく（${n}かい）` },
  { id: 'units-touched', name: 'たんけんか', icon: '🧭', group: 'study', tiers: [4, 8, PACK_UNITS.length],
    measure: unitsTouched, cond: (n) => `${n}つの 単元で 1問いじょう まちがえずに とく` },
  { id: 'all-units-10', name: 'どの単元も 10問', icon: '🗺️', group: 'study', tiers: [1],
    measure: allUnitsTen, cond: () => `${PACK_UNITS.length}の 単元 ぜんぶで まちがえずに 10問ずつ とく` },
  // ── 学習の質 ──
  { id: 'run', name: 'れんぞく せいかい', icon: '🎯', group: 'study', tiers: [10, 20, 60],
    measure: (i) => i.bestRun, cond: (n) => `${n}問 れんぞくで まちがえずに とく` },
  { id: 'hard', name: 'むずかしい 問題', icon: '🧗', group: 'study', tiers: [50, 200, 1500],
    measure: (i) => i.hardPerfect, cond: (n) => `むずかしい カードを まちがえずに ${n}問 とく` },
  { id: 'shards', name: 'かけら あつめ', icon: '💠', group: 'study', tiers: [8, 24, PACK_UNITS.length * 8],
    measure: (i) => sum(i.unitShards), cond: (n) => `単元の かけらを あわせて ${n}こ` },
  { id: 'skills', name: 'スキル', icon: '✨', group: 'study', tiers: [3, 12, 24],
    measure: (i) => i.skillsOpen, cond: (n) => `スキルを ${n}こ ひらく（単元を まちがえずに とくと ひらく）` },
  // ── 戦い（星は まちがえずに とけた割合で きまる。速さ・勝った数では きまらない）──
  { id: 'star3-battles', name: '★3の たたかい', icon: '🌟', group: 'battle', tiers: [5, 40, 200],
    measure: (i) => i.star3Battles, cond: (n) => `★3（8問いじょう・9わり まちがえない）で ${n}かい 勝つ` },
  { id: 'stars', name: 'ほし あつめ', icon: '⭐', group: 'battle', tiers: [10, 25, CAMPAIGN.length * 9],
    measure: (i) => sum(i.stars), cond: (n) => `章の 星を あわせて ${n}こ（3つの 段で 1章 9こ まで）` },
  { id: 'star3-normal', name: 'ふつう ぜんぶ ★3', icon: '🥉', group: 'battle', tiers: [1],
    measure: (i) => (allStar3(i, 'normal') ? 1 : 0), cond: () => 'ふつう の 全章で ★3' },
  { id: 'star3-hard', name: 'むずかしい ぜんぶ ★3', icon: '🥈', group: 'battle', tiers: [1],
    measure: (i) => (allStar3(i, 'hard') ? 1 : 0), cond: () => 'むずかしい の 全章で ★3' },
  { id: 'star3-extreme', name: 'げきむず ぜんぶ ★3', icon: '🥇', group: 'battle', tiers: [1],
    measure: (i) => (allStar3(i, 'extreme') ? 1 : 0), cond: () => 'げきむず の 全章で ★3' },
  { id: 'extreme-perfect', name: 'げきむず パーフェクト', icon: '💯', group: 'battle', tiers: [1, 4, CAMPAIGN.length],
    measure: (i) => i.extremePerfectChapters, cond: (n) => `げきむず を まちがい0（3問いじょう）で 勝つ（${n}章）` },
  { id: 'shield', name: 'シールド わり', icon: '🛡️', group: 'battle', tiers: [5, 50, 500],
    measure: (i) => i.shieldBreaks, cond: (n) => `ふくしゅうカードで ボスの シールドを ${n}まい わる` },
  // ── かくし（取るまで 名前と条件を出さない）──
  { id: 'secret-allskill', name: 'みんな とくい', icon: '🌈', group: 'hidden', hidden: true, tiers: [1],
    measure: (i) => (i.familiesTotal > 0 && i.familiesWithSkill >= i.familiesTotal ? 1 : 0),
    cond: () => '8つの 系統 ぜんぶで スキルを 1つずつ ひらく' },
  { id: 'secret-battle15', name: 'しずかな しゅうちゅう', icon: '🧘', group: 'hidden', hidden: true, tiers: [15],
    measure: (i) => i.bestBattlePerfect, cond: () => '1回の 戦いで 1問も まちがえずに 15問 とく' },
  { id: 'secret-shield3', name: 'ふくしゅうの ちから', icon: '🔮', group: 'hidden', hidden: true, tiers: [3],
    measure: (i) => i.bestBattleShield, cond: () => '1回の 戦いで シールドを 3まい わる' },
  ...UNIT_BADGES,
]);

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** そのバッジの段（0＝まだ） */
export function badgeTier(def: BadgeDef, input: BadgeInput): number {
  const v = def.measure(input);
  return def.tiers.filter((t) => v >= t).length;
}

/** ぜんぶのバッジの段（id → 段。0 は入れない） */
export function evalBadges(input: BadgeInput): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of BADGES) {
    const t = badgeTier(b, input);
    if (t > 0) out[b.id] = t;
  }
  return out;
}

/** 段を1つと数えた ぜんぶの数（うまり具合の分母） */
export const BADGE_TIER_TOTAL = BADGES.reduce((a, b) => a + b.tiers.length, 0);
/** 取った段の数 */
export function badgeTierCount(earned: Record<string, number>): number {
  return BADGES.reduce((a, b) => a + Math.min(b.tiers.length, earned[b.id] ?? 0), 0);
}

/** 段の名前（段が1つのバッジは「取った」） */
export function tierLabel(def: BadgeDef, tier: number): string {
  if (def.tiers.length === 1) return '';
  return TIER_NAME[Math.max(1, Math.min(3, tier)) as 1 | 2 | 3];
}

/** 見た目の色（段が1つのバッジは 金） */
export function tierColor(def: BadgeDef, tier: number): string {
  if (tier <= 0) return 'rgba(255,255,255,0.25)';
  if (def.tiers.length === 1) return TIER_COLOR[3];
  return TIER_COLOR[Math.min(3, tier) as 1 | 2 | 3];
}

/** メダルの台（わく）の絵：段が1つのバッジは 紺と水色、ほかは 銅・銀・金（まだ取っていないときは 銅の台を 灰色にして出す） */
export function badgeFrame(def: BadgeDef, tier: number): string {
  if (def.tiers.length === 1) return '/assets/badges/frame-solo.svg';
  const t = Math.max(1, Math.min(3, tier));
  return `/assets/badges/frame-${t === 1 ? 'bronze' : t === 2 ? 'silver' : 'gold'}.svg`;
}

/** バッジの段を取ったときの シールコインの段（段が1つのバッジは 銀と同じ） */
export function coinTierOf(def: BadgeDef, tier: number): 1 | 2 | 3 {
  if (def.tiers.length === 1) return 2;
  return Math.max(1, Math.min(3, tier)) as 1 | 2 | 3;
}

/** 空の入力（試験・はじめ） */
export function emptyBadgeInput(): BadgeInput {
  return {
    perfectTotal: 0, bestDayPerfect: 0, bestStreak: 0, studyDays: 0, reviewCleared: 0,
    unitPerfect: {}, unitShards: {}, bestRun: 0, hardPerfect: 0, star3Battles: 0, stars: {},
    extremePerfectChapters: 0, shieldBreaks: 0, skillsOpen: 0, familiesWithSkill: 0, familiesTotal: 8,
    bestBattlePerfect: 0, bestBattleShield: 0,
  };
}
