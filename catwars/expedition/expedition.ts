/**
 * 週がわりの遠征（CW-6a・2026-11-17）。docs/REBUILD_SPEC.md §5a。
 *
 * - **週の番号だけから決まる**（サーバに置かない。だれの端末でも 同じ週なら 同じ遠征）：戦場（第2〜8章の マップのどれか）・
 *   敵の組みあわせ（その章の ふつう の敵＋週の敵1種）・ルール1つ（expedition/rules.ts の 8しゅるい）・主役の系統。
 * - 遊び方は ふだんの出撃と同じ（関門・スタミナ・問題カード）。難易度は その章の「ふつう」を Lv1 の めやすまで下げたものに、
 *   **今の脅威レベルのしくみ**（expeditionThreatMult。基準 Lv1）をかけて 手持ちのレベルに合わせる
 *   ＝手持ちが その章の めやす（CHAPTER_BASE_LEVEL）なら ほぼ その章の ふつう、それより下なら やさしく、上なら つよく。
 *   サポートモード・げきむず の カードの まいすうは 無し。はじめの ⚡ は 30（章は 60）。
 * - 記録に残るのは その週の いちばん良い星（0〜3。星は ふだんと同じ starsFor＝まちがえずに解けた割合）。
 */
import {
  CAMPAIGN, tierDifficulty, chapterBaseLevel, withThreat,
  type CampaignChapter, type ChapterDifficulty, type EnemyUnitKind,
} from '../data/campaign';
import { BATTLE_MAP_BY_ID } from '../data/battleMaps';
import { levelMult, LEVEL_STEP } from '../data/characters';
import type { BattleMap } from '../types';
import type { SimConfig } from '../sim/types';
import { EXPEDITION_RULES, HERO_FAMILIES, applyRuleToConfig, type ExpeditionRule, type RuleContext } from './rules';
import { weekIndexOf, weekStartOfIndex } from './week';

/** 遠征の めやすの レベル（脅威レベルの基準）。ここより育っているぶん 敵も強くなる */
export const EXPEDITION_BASE_LEVEL = 1;
/** 学級の目標：学級の人数 × これ（サーバの catwars_expedition_class と同じ。サーバが決めた数を出す） */
export const EXPEDITION_GOAL_PER_STUDENT = 1.5;
/** 学級の目標を こえた週の ごほうび（シールコイン。その週に 遠征で 1問いじょう まちがえずに といた子だけ。1週に1回） */
export const EXPEDITION_GOAL_COINS = 4;

/**
 * 遠征の はじめの ⚡（章は PLAYER_START_ENERGY＝60＝基本のネコ2回ぶん）。遠征は 手持ちが 育った子も 来るので、
 * はじめの ネコだけで おしきれないよう 1回ぶんに する（「とかない」子が 育った手持ちで 勝てた。test:expedition:balance）。
 */
export const EXPEDITION_START_ENERGY = 30;

/**
 * 戦場の順（章の番号）。7週で1回ずつ。となりの週が となりの章に ならないよう まぜてある。
 * 第1章（ルナ・アウトポスト）は入れない：まもりの施設が無く、育った手持ちだと「とかない」子が勝ててしまった（test:expedition:balance）。
 */
export const MAP_ORDER = [3, 6, 8, 4, 2, 7, 5] as const;
/** 週の敵（その章の ふつう の敵に足す1種） */
export const EXTRA_ENEMIES: EnemyUnitKind[] = ['shooter', 'runner', 'medic', 'kamikaze', 'brute', 'guard'];

export interface Expedition {
  week: number;
  /** その週の月曜の日づけ（サーバの週の名前と同じ） */
  weekStart: string;
  chapter: CampaignChapter;
  map: BattleMap;
  rule: ExpeditionRule;
  ctx: RuleContext;
  /** 週の敵（ルールが敵を決めるときは 使われない） */
  extraEnemy: EnemyUnitKind;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 週の番号 → 遠征（決定的） */
export function expeditionForWeek(week: number): Expedition {
  const chNo = MAP_ORDER[mod(week, MAP_ORDER.length)];
  const chapter = CAMPAIGN.find((c) => c.no === chNo) ?? CAMPAIGN[0];
  const map = BATTLE_MAP_BY_ID[chapter.mapId];
  // ルール：週の番号 mod 8（戦場は mod 7 なので、56週で 戦場×ルール の ぜんぶの組みあわせが 1回ずつ）。なりたたなければ 次のルール
  const R = EXPEDITION_RULES.length;
  let ri = mod(week, R);
  for (let i = 0; i < R && EXPEDITION_RULES[ri].fits && !EXPEDITION_RULES[ri].fits!(map); i++) ri = mod(ri + 1, R);
  const rule = EXPEDITION_RULES[ri];
  const ctx: RuleContext = { heroFamily: HERO_FAMILIES[mod(Math.floor(week / 2), HERO_FAMILIES.length)] };
  const extraEnemy = EXTRA_ENEMIES[mod(week * 5 + 1, EXTRA_ENEMIES.length)];
  return { week, weekStart: weekStartOfIndex(week), chapter, map, rule, ctx, extraEnemy };
}

/** いまの遠征（端末の時計。記録の週は サーバの時計で決まる） */
export function currentExpedition(nowMs = Date.now()): Expedition {
  return expeditionForWeek(weekIndexOf(nowMs));
}

/** 敵の基地（ルールで変わる） */
export function expeditionEnemyBase(e: Expedition): BattleMap['enemyBase'] {
  return e.rule.enemyBase ? e.rule.enemyBase(e.map, e.map.enemyBase) : e.map.enemyBase;
}

/**
 * 遠征の難易度（脅威をかける前）：その章の ふつう を Lv1 の めやすまで下げ、週の敵を足し、ルールをあてる。
 * 敵の兵・施設の HP・こうげきに levelMult(Lv1) ÷ levelMult(章の めやす) をかける。
 */
export function expeditionBaseDifficulty(e: Expedition): ChapterDifficulty {
  const d = tierDifficulty(e.chapter, 'normal');
  const k = levelMult(EXPEDITION_BASE_LEVEL) / levelMult(chapterBaseLevel(e.chapter, 'normal'));
  const pool = d.unitPool.includes(e.extraEnemy) ? d.unitPool : [...d.unitPool, e.extraEnemy];
  const base: ChapterDifficulty = {
    ...d,
    enemyHpMult: d.enemyHpMult * k, enemyDamageMult: d.enemyDamageMult * k,
    defenseHpMult: d.defenseHpMult * k, defenseDamageMult: d.defenseDamageMult * k,
    unitPool: pool,
    startEnergy: EXPEDITION_START_ENERGY,
  };
  return e.rule.difficulty ? e.rule.difficulty(base) : base;
}

/** 手持ち（上位5系統の平均レベル）に合わせた 遠征の難易度（脅威レベルのしくみ。基準 Lv1） */
export function expeditionDifficulty(e: Expedition, avgLevel: number): ChapterDifficulty {
  const d = withThreat(expeditionBaseDifficulty(e), expeditionThreatMult(avgLevel));
  const b = behindRatio(e, avgLevel);
  if (b <= 0) return d;
  return {
    ...d,
    enemySpawnRatePerSec: d.enemySpawnRatePerSec * (1 - BEHIND_SPAWN_CUT * b),
    defenseDamageMult: d.defenseDamageMult * (1 - BEHIND_DEFENSE_CUT * b),
  };
}

/**
 * 手持ちが その章の めやすより 育っていない ぶん（0〜1）。
 * 敵の HP・こうげきは 脅威レベルのしくみで 手持ちに そろうが、おくの章の 戦場は 砲台・敵の出口が多い。
 * 育っていない子（施設・バフ・スキルも少ない）が おくの章の週でも 勝てるよう、出現の速さと砲台の こうげきを 少し下げる
 *（下がる方向だけ。サポートモードと同じ考え方）。数は test:expedition:balance で決めた。
 */
export const BEHIND_SPAWN_CUT = 0.3;
export const BEHIND_DEFENSE_CUT = 0.25;
export function behindRatio(e: Expedition, avgLevel: number): number {
  return behindRatioOf(e.chapter, avgLevel);
}
/** 章だけから（なかまの基地を攻める CW-6b も 同じ式を使う） */
export function behindRatioOf(chapter: CampaignChapter, avgLevel: number): number {
  const base = chapterBaseLevel(chapter, 'normal');
  if (base <= EXPEDITION_BASE_LEVEL) return 0;
  return Math.max(0, Math.min(1, (base - avgLevel) / (base - EXPEDITION_BASE_LEVEL)));
}

/**
 * 遠征の 脅威の倍率。しくみは 章と同じ（threatMultFor：levelMult(基準 + G×育てた分) ÷ levelMult(基準)）。
 * ちがいは2つ（どちらも test:expedition:balance で決めた）：
 *   - 基準が Lv1 なので 章の上限（+120%）を Lv35 で こえる → 上限は EXPEDITION_THREAT_MAX（Lv60 でも かからない）。
 *   - G は 1.1（章は 0.99）。遠征の基準は Lv1 で、育った子は スキル・出撃バフ・施設のレベルも 持っている（脅威は数えない）。
 *     0.99 のままだと Lv40〜60 で「とかない」子が 敵を たおした分の ⚡ で勝てた。
 */
export const EXPEDITION_THREAT_MAX = 3.6;
export const EXPEDITION_THREAT_GROWTH = 1.1;
export function expeditionThreatMult(avgLevel: number): number {
  const grown = Math.max(0, avgLevel - EXPEDITION_BASE_LEVEL);
  return Math.min(EXPEDITION_THREAT_MAX, levelMult(EXPEDITION_BASE_LEVEL + EXPEDITION_THREAT_GROWTH * grown) / levelMult(EXPEDITION_BASE_LEVEL));
}

/** 画面に出す「敵の つよさ Lv.n」（手持ちに合わせて上がる。脅威の上限で止まる） */
export function expeditionEnemyLevel(avgLevel: number): number {
  // 敵の倍率 ＝ levelMult(n) ÷ levelMult(Lv1) となる n（脅威の上限で止まった分も そのまま出る）
  const mult = expeditionThreatMult(avgLevel);
  return Math.max(1, Math.round(1 + (mult * levelMult(EXPEDITION_BASE_LEVEL) - 1) / LEVEL_STEP));
}

/** 試合の前に ネコの性能表に ルールを あてる（BattleScene・想定プレイヤーの試験が 同じものを使う） */
export function tuneExpeditionConfig(e: Expedition, cfg: SimConfig): SimConfig {
  return applyRuleToConfig(cfg, e.rule, e.ctx);
}

/** 戦闘の画面に わたす 章（文だけ 遠征のものにする。id・no・地図・ごほうびは その章のまま） */
export function expeditionChapter(e: Expedition): CampaignChapter {
  return {
    ...e.chapter,
    title: `週がわりの遠征「${e.rule.name}」`,
    briefing: `${e.rule.desc(e.ctx)}（戦場：第${e.chapter.no}章の ${e.map.name}）`,
    hint: e.rule.hint,
    victoryLine: 'ネコたちは ぶじに 遠征から かえってきた。今週は なんかいでも ちょうせん できるよ。',
    defeatLine: 'こんどの 遠征は きびしい。ルールに あわせて ネコの くみあわせを かえてみよう。',
  };
}

/** 学級の目標（人数 × 1.5。小数は 切り上げ。サーバと同じ） */
export function classGoal(size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, size) * EXPEDITION_GOAL_PER_STUDENT));
}
