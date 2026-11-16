// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 全モジュールの問題ジェネレーターの入口。
 *
 * skillId を1つ渡せば問題が1問返る形に統一してある。こうすることで
 *  - 練習モジュール（レベル選択・おまかせ）
 *  - 本番テストモード
 *  - ボス戦
 *  - 検証スクリプト
 * が同じ関数を通り、「練習にはあるがテストに出ないレベル」が構造的に生まれない。
 */
import { GeoProblem, LevelDef } from './problemTypes';
import { ModuleId } from '../store/progressStore';

import { RELATION_LEVELS, RelationLevel, generateRelation } from './problems/relation';
import { DRAW_LEVELS, DrawLevel, generateDraw } from './problems/draw';
import { NAME_LEVELS, NameLevel, generateName } from './problems/name';
import { PROPERTY_LEVELS, PropertyLevel, generateProperty } from './problems/property';
import { DIAGONAL_LEVELS, DiagonalLevel, generateDiagonal } from './problems/diagonal';
import { TILING_LEVELS, TilingLevel, generateTiling } from './problems/tiling';
import { LIFE_LEVELS, LifeLevel, generateLife } from './problems/life';
import { ERROR_LEVELS, ErrorLevel, generateError } from './problems/errorHunter';

export * from './problemTypes';
export { RELATION_LEVELS, DRAW_LEVELS, NAME_LEVELS, PROPERTY_LEVELS, DIAGONAL_LEVELS, TILING_LEVELS, LIFE_LEVELS, ERROR_LEVELS };
export type { RelationLevel, DrawLevel, NameLevel, PropertyLevel, DiagonalLevel, TilingLevel, LifeLevel, ErrorLevel };

/** この単元で扱う全スキル（＝練習できる最小単位）のID。 */
export type SkillId =
  | RelationLevel
  | DrawLevel
  | NameLevel
  | PropertyLevel
  | DiagonalLevel
  | TilingLevel
  | LifeLevel
  | ErrorLevel;

/** モジュールごとのレベル定義。ハブ・本番テスト・検証がすべてここを見る。 */
export const MODULE_LEVELS: Record<Exclude<ModuleId, 'mock-test' | 'boss-battle'>, LevelDef[]> = {
  relation: RELATION_LEVELS,
  draw: DRAW_LEVELS,
  name: NAME_LEVELS,
  property: PROPERTY_LEVELS,
  diagonal: DIAGONAL_LEVELS,
  tiling: TILING_LEVELS,
  life: LIFE_LEVELS,
  'error-hunter': ERROR_LEVELS,
};

/** 全スキルIDの一覧（検証スクリプトで「1つも取りこぼしていない」ことを確かめるのに使う）。 */
export const ALL_SKILL_IDS: SkillId[] = Object.values(MODULE_LEVELS).flatMap((ls) => ls.map((l) => l.id as SkillId));

/**
 * skillId から1問つくる。
 * 未知の skillId は投げる（テスト設定の書きまちがいを実行時に静かに握りつぶさない）。
 */
export function generate(skillId: SkillId): GeoProblem {
  if (skillId.startsWith('rel-')) return generateRelation(skillId as RelationLevel);
  if (skillId.startsWith('draw-')) return generateDraw(skillId as DrawLevel);
  if (skillId.startsWith('name-')) return generateName(skillId as NameLevel);
  if (skillId.startsWith('prop-')) return generateProperty(skillId as PropertyLevel);
  if (skillId.startsWith('diag-')) return generateDiagonal(skillId as DiagonalLevel);
  if (skillId.startsWith('tile-')) return generateTiling(skillId as TilingLevel);
  if (skillId.startsWith('life-')) return generateLife(skillId as LifeLevel);
  if (skillId.startsWith('eh-')) return generateError(skillId as ErrorLevel);
  throw new Error(`generate: 未知の skillId "${skillId}"`);
}

/** レベル定義を skillId から引く。 */
export function levelDef(skillId: string): LevelDef | undefined {
  for (const levels of Object.values(MODULE_LEVELS)) {
    const hit = levels.find((l) => l.id === skillId);
    if (hit) return hit;
  }
  return undefined;
}
