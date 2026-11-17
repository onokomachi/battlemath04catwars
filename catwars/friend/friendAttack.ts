/**
 * なかまの 基地を 攻める（CW-6b・2026-11-17）。docs/REBUILD_SPEC.md §5b。週がわりの遠征（expedition/expedition.ts）と同じ作り方：
 * **試合の前に 入力（敵の基地・難易度）を つくるだけ**。sim（catwars/sim/）には手を入れない＝決定性は そのまま。
 *
 * - 戦場：いまのマップのうち「右はし（敵陣）が 水・岩・溶岩で ふさがっておらず、まもりの施設が ある」もの（FRIEND_MAPS＝第2・4・5・6・8章）。
 *   どの戦場で攻めるかは 日と 3つの枠から 決まる（みんな同じ日の同じ枠は 同じ戦場）。
 * - 敵の基地：なかまの 配置を 左右反転して 右に置く（baseShape.placeOnMap）。砲台2つ・キャンプ1つ いじょうに そろえる（下限）。
 * - 敵の強さ：遠征と同じく 手持ち（上位5系統の平均レベル）に合わせる（その章の ふつう を Lv1 の めやすまで下げ、脅威レベルのしくみ・基準 Lv1）。
 *   さらに、なかまの 基地の 火力（砲台・電撃トラップの数×レベル）を その戦場の 標準の火力に そろえる（FIRE_MIN〜FIRE_MAX の 上限・下限つき）
 *   ＝なかまの 施設が 多すぎ／少なすぎ・レベルが 高すぎ／低すぎ でも 勝ち負けが はじめから 決まらない。
 *   増援の出る速さも 同じ（キャンプの数で 変わる分を そろえる）。ボスは いない（なかまの 基地なので）。兵舎の いらない敵（重装・飛行・たて）は 出ない。
 * - 星：ふだんと同じ starsFor。**攻められた側には 何も送らない・見せない**（サーバに 攻めた記録は 残さない）。
 */
import {
  CAMPAIGN, BARRACKS_ONLY_UNITS, chapterBaseLevel, tierDifficulty, withThreat, type CampaignChapter, type ChapterDifficulty,
} from '../data/campaign';
import { BATTLE_MAPS } from '../data/battleMaps';
import { levelMult } from '../data/characters';
import type { BattleMap } from '../types';
import {
  EXPEDITION_BASE_LEVEL, EXPEDITION_START_ENERGY, BEHIND_SPAWN_CUT, BEHIND_DEFENSE_CUT,
  behindRatioOf, expeditionEnemyLevel, expeditionThreatMult,
} from '../expedition/expedition';
import { jstDayIndex } from '../expedition/week';
import {
  firepower, placeOnMap, productionBonus, rightSideClear, type FriendBase,
} from './baseShape';
import { SAMPLE_BASES, sampleBase } from './samples';

export type FriendSlot = 'A' | 'B' | 'C';
export const FRIEND_SLOTS: FriendSlot[] = ['A', 'B', 'C'];

/** その日 1回目の 勝ちの 💠（まちがえずに 1問いじょう といたとき）。章の ふつう（300〜1200）の 1/3 いかの 小さな ごほうび */
export const FRIEND_ATTACK_CREDITS = 100;

/** 火力を そろえる 倍率の 上限・下限（砲台・電撃トラップの こうげきに かける）。scripts/friendTest.ts の BALANCE=1 で決めた */
export const FIRE_MIN = 0.3;
export const FIRE_MAX = 1.4;
/**
 * 増援の出る速さ：どの基地も「キャンプ1つぶん（+0.35）」に そろえる（キャンプが 2つでも 速く ならない・下限の1つは足す）。
 * その戦場の 生産施設ぜんぶ（兵舎・発電所まで）に そろえると、基地しだいで 敵が あふれ（敵をたおした ⚡ が ふえ）、
 * 育った子が 問題を とかずに 勝てる組みが 出た（scripts/friendTest.ts の BALANCE=1）。
 */
export const SPAWN_REF_BONUS = 0.35;
/**
 * 敵の強さの 上がりかた：遠征と同じ しくみ（expeditionThreatMult。基準 Lv1・上限 ×3.6）の「育ったぶん」（倍率−1＝x）を 太らせる。
 * なかまの 基地には 兵舎・ボスが いない（増援が 少ない）ぶん、育った子の 手持ちが 強くなるほど 敵 1体ずつを 強くする。
 *   x が 1（Lv28 ごろ）まで：×1.4／それより 上：×2.2（Lv40 で 敵 約3.5ばい・Lv60 で 約5.2ばい）。Lv1 の 子には かからない（x=0）。
 * 1.0 だと Lv60 の「とかない」子が 勝てる基地が あり、上まで ×1.8 では Lv12〜24 の「ふつう」が 半分ちかく 負けた（scripts/friendTest.ts の BALANCE=1）。
 */
export const FRIEND_THREAT_EXCESS = 1.4;
export const FRIEND_THREAT_EXCESS_HIGH = 2.2;
export const FRIEND_THREAT_KNEE = 1.0;
export function friendThreatMult(avgLevel: number): number {
  const x = expeditionThreatMult(avgLevel) - 1;
  return 1 + FRIEND_THREAT_EXCESS * Math.min(x, FRIEND_THREAT_KNEE) + FRIEND_THREAT_EXCESS_HIGH * Math.max(0, x - FRIEND_THREAT_KNEE);
}

/** 攻める戦場の 候補（右はしが ふさがっていない・まもりの施設がある。第2・4・5・6・8章） */
export const FRIEND_MAPS: BattleMap[] = BATTLE_MAPS.filter((m) => rightSideClear(m) && firepower(m.enemyBase) > 0);

export interface FriendTarget {
  slot: FriendSlot;
  /** みほん（コンピュータが つくった 基地）か */
  sample: boolean;
  /** 画面に出す名前（「なかまの 基地 A」「みほん：かべの ひろば」）。**番号・名前は 出さない** */
  label: string;
  base: FriendBase;
  /** 戦場の 章の番号 */
  chapterNo: number;
}

export const jstDateOf = (ms: number): string => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 日の番号 → 3つの枠の戦場（章の番号）。同じ日の同じ枠は 同じ戦場 */
export function mapChapterNo(dayIndex: number, slotIndex: number): number {
  const m = FRIEND_MAPS[((dayIndex * 3 + slotIndex) % FRIEND_MAPS.length + FRIEND_MAPS.length) % FRIEND_MAPS.length];
  return (CAMPAIGN.find((c) => c.mapId === m.id) ?? CAMPAIGN[1]).no;
}

/**
 * その日の 3つ。real＝サーバが 返した なかまの 基地（枠 A から 順・見なおしずみ）。たりない枠は みほんで うめる
 * （名乗っていない・たりない学級）。みほんは 日ごとに 3つが 入れかわる。
 */
export function buildTargets(dayIndex: number, real: FriendBase[] = []): FriendTarget[] {
  return FRIEND_SLOTS.map((slot, i) => {
    const chapterNo = mapChapterNo(dayIndex, i);
    if (real[i]) return { slot, sample: false, label: `なかまの 基地 ${slot}`, base: real[i], chapterNo };
    const s = SAMPLE_BASES[(((dayIndex * 3 + i) % SAMPLE_BASES.length) + SAMPLE_BASES.length) % SAMPLE_BASES.length];
    return { slot, sample: true, label: `みほん：${s.name}`, base: sampleBase(s), chapterNo };
  });
}

export const chapterOfNo = (no: number): CampaignChapter => CAMPAIGN.find((c) => c.no === no) ?? CAMPAIGN[1];

export interface FriendSetup {
  /** 戦闘の画面に わたす 章（文だけ なかまの 基地用。id・no・地図は その章のまま） */
  chapter: CampaignChapter;
  map: BattleMap;
  /** 敵の基地（なかまの配置を 反転して 右に置いた もの＋足した砲台・キャンプ） */
  enemyBase: BattleMap['enemyBase'];
  difficulty: ChapterDifficulty;
  /** 画面に出す「てき Lv.n」 */
  enemyLevel: number;
}

/**
 * 火力の そろえぐあい（砲台・電撃トラップの こうげきに かける）。その戦場の 標準の火力 ÷ なかまの 基地の 火力（足した砲台・レベルまで）。
 * FIRE_MIN〜FIRE_MAX の 中に おさめる（多すぎ／少なすぎの 基地でも 勝ち負けが はじめから 決まらない）。
 */
export function fireFactor(map: BattleMap, base: FriendBase, enemyBase: BattleMap['enemyBase']): number {
  const mine = firepower(enemyBase, (t) => base.levels[t] ?? 1);
  const std = firepower(map.enemyBase);
  return mine > 0 ? Math.max(FIRE_MIN, Math.min(FIRE_MAX, std / mine)) : FIRE_MAX;
}

/** 難易度（手持ちの平均レベルに合わせる）。enemyBase は placeOnMap の結果 */
export function friendDifficulty(chapter: CampaignChapter, map: BattleMap, base: FriendBase, enemyBase: BattleMap['enemyBase'], avgLevel: number): ChapterDifficulty {
  const d = tierDifficulty(chapter, 'normal');
  const k = levelMult(EXPEDITION_BASE_LEVEL) / levelMult(chapterBaseLevel(chapter, 'normal'));
  // 兵舎の無い基地には 重装・飛行・たて が 出ない（出ない敵を 画面に出さない）。空になったら 兵士だけ
  let pool = d.unitPool.filter((u) => !BARRACKS_ONLY_UNITS.includes(u));
  if (pool.length === 0) pool = ['grunt'];
  // 火力を その戦場の 標準に そろえる（なかまの 基地の 砲台・電撃トラップが 多い／少ない・レベルが 高い／低い を ならす。上限・下限つき）
  const fire = fireFactor(map, base, enemyBase);
  // 増援の速さも そろえる（キャンプ1つぶん）
  const rate = d.enemySpawnRatePerSec * (1 + SPAWN_REF_BONUS) / (1 + productionBonus(enemyBase));
  const scaled: ChapterDifficulty = {
    ...d,
    enemyHpMult: d.enemyHpMult * k, enemyDamageMult: d.enemyDamageMult * k,
    defenseHpMult: d.defenseHpMult * k, defenseDamageMult: d.defenseDamageMult * k * fire,
    enemySpawnRatePerSec: rate,
    unitPool: pool,
    startEnergy: EXPEDITION_START_ENERGY,
    bossAtSpawnCount: undefined, bossShield: 0,
  };
  const out = withThreat(scaled, friendThreatMult(avgLevel));
  const b = behindRatioOf(chapter, avgLevel);
  if (b <= 0) return out;
  return {
    ...out,
    enemySpawnRatePerSec: out.enemySpawnRatePerSec * (1 - BEHIND_SPAWN_CUT * b),
    defenseDamageMult: out.defenseDamageMult * (1 - BEHIND_DEFENSE_CUT * b),
  };
}

/** 戦闘の画面に わたす 章（文だけ 変える） */
export function friendChapter(chapter: CampaignChapter, label: string): CampaignChapter {
  return {
    ...chapter,
    title: label,
    enemyName: 'しゅびたい',
    enemyTitle: 'なかまの 基地を まもる ロボ',
    background: 'なかまが つくった 基地を、コンピュータの ロボが まもっているよ。ほんものの なかまは 戦わない。こわしても だれも こまらないから 思いきって せめよう！',
    briefing: `なかまの 基地の 配置に せめこもう。まもりの 施設の 場所を よく見て、どこから くずすか 考えよう。（戦場：第${chapter.no}章の ${BATTLE_MAPS.find((m) => m.id === chapter.mapId)?.name ?? ''}）`,
    hint: '砲台・電撃トラップを 先に こわすと 楽になるよ。キャンプを つぶすと 敵の 増援が へる。',
    victoryLine: 'なかまの 基地の 守りを ぬけた！ その配置、まねしてみよう。',
    defeatLine: 'まもりが かたかった。配置を よく見て、ネコの くみあわせを かえて もう一回！',
  };
}

/** 画面（CatWars.tsx）・想定プレイヤー（botSim）が 同じものを使う */
export function friendSetup(t: FriendTarget, avgLevel: number): FriendSetup {
  const chapter = chapterOfNo(t.chapterNo);
  const map = BATTLE_MAPS.find((m) => m.id === chapter.mapId) ?? FRIEND_MAPS[0];
  const enemyBase = placeOnMap(map, t.base);
  return {
    chapter: friendChapter(chapter, t.label), map, enemyBase,
    difficulty: friendDifficulty(chapter, map, t.base, enemyBase, avgLevel),
    enemyLevel: expeditionEnemyLevel(avgLevel),
  };
}

/** 日の番号（日本時間） */
export const dayIndexOf = (ms: number): number => jstDayIndex(ms);

