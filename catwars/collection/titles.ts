/**
 * 称号と 基地のかざり（2026-11-16 CW-4c）。どちらも 見た目だけ（強さには ひびかない）。docs/REBUILD_SPEC.md §3d。
 *
 * 開き方は バッジの段の数・シールの しゅるいの数 だけ（どちらも学習の成果から）。
 * シールで開くものは「半分（25しゅるい）」まで（そろえると もらえる ごほうび＝コンプガチャ に しない）。
 */

export interface UnlockNeed {
  /** 取ったバッジの段の数 */
  badgeTiers?: number;
  /** 持っているシールの しゅるい */
  stickers?: number;
  /** このバッジを この段まで */
  badge?: { id: string; tier: number };
}

export interface TitleDef {
  id: string;
  name: string;
  need: UnlockNeed;
  /** 開き方の文 */
  how: string;
}

export const TITLES: TitleDef[] = [
  { id: 'rookie', name: 'しんまい たいいん', need: {}, how: 'はじめから' },
  { id: 'solver', name: 'もんだい ハンター', need: { badgeTiers: 5 }, how: 'バッジを 5こ（段も 1こと かぞえる）' },
  { id: 'steady', name: 'コツコツ ネコ', need: { badge: { id: 'streak', tier: 2 } }, how: '「れんぞく がくしゅう」の 銀' },
  { id: 'reviewer', name: 'ふくしゅう はかせ', need: { badge: { id: 'review', tier: 2 } }, how: '「ふくしゅう」の 銀' },
  { id: 'collector', name: 'シール あつめ', need: { stickers: 10 }, how: 'シールを 10しゅるい' },
  { id: 'scholar', name: 'ぎんがの まなびや', need: { badgeTiers: 15 }, how: 'バッジを 15こ' },
  { id: 'precise', name: 'せいかく むひ', need: { badge: { id: 'run', tier: 3 } }, how: '「れんぞく せいかい」の 金' },
  { id: 'album', name: 'アルバム めいじん', need: { stickers: 25 }, how: 'シールを 25しゅるい' },
  { id: 'professor', name: 'はかせネコ', need: { badgeTiers: 35 }, how: 'バッジを 35こ' },
  { id: 'master', name: 'でんせつの たいちょう', need: { badgeTiers: 60 }, how: 'バッジを 60こ' },
  { id: 'extreme', name: 'げきむずの ほし', need: { badge: { id: 'extreme-perfect', tier: 1 } }, how: '「げきむず パーフェクト」を とる' },
];

export interface DecorDef {
  id: string;
  name: string;
  /** はたの 絵文字（仮。docs/ART_LIST.md の絵に差しかえる） */
  emoji: string;
  /** はたの 色（2色のしま） */
  colors: [string, string];
  image?: string;
  need: UnlockNeed;
  how: string;
}

export const DECORS: DecorDef[] = [
  { id: 'flag-blue', name: 'あおい はた', emoji: '🏳️', colors: ['#2563eb', '#38bdf8'], need: {}, how: 'はじめから' },
  { id: 'flag-paw', name: 'にくきゅうの はた', emoji: '🐾', colors: ['#f97316', '#fde68a'], need: { badgeTiers: 3 }, how: 'バッジを 3こ' },
  { id: 'flag-star', name: 'ほしの はた', emoji: '⭐', colors: ['#1e1b4b', '#facc15'], need: { badgeTiers: 12 }, how: 'バッジを 12こ' },
  { id: 'flag-rainbow', name: 'にじの はた', emoji: '🌈', colors: ['#ec4899', '#22d3ee'], need: { stickers: 15 }, how: 'シールを 15しゅるい' },
  { id: 'flag-moon', name: 'つきよの はた', emoji: '🌙', colors: ['#312e81', '#c4b5fd'], need: { stickers: 25 }, how: 'シールを 25しゅるい' },
  { id: 'flag-gold', name: 'きんの はた', emoji: '👑', colors: ['#a16207', '#fde047'], need: { badgeTiers: 40 }, how: 'バッジを 40こ' },
];

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.id, t]));
export const DECOR_BY_ID: Record<string, DecorDef> = Object.fromEntries(DECORS.map((d) => [d.id, d]));

/** 開いているか（純粋な関数） */
export function isOpen(need: UnlockNeed, have: { badgeTiers: number; stickers: number; badges: Record<string, number> }): boolean {
  if (need.badgeTiers != null && have.badgeTiers < need.badgeTiers) return false;
  if (need.stickers != null && have.stickers < need.stickers) return false;
  if (need.badge && (have.badges[need.badge.id] ?? 0) < need.badge.tier) return false;
  return true;
}
