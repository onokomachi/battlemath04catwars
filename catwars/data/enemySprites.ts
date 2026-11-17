// 敵とボスの絵（2026-11-17。持ち主が Gemini で作った絵。256×256・背景透過。`docs/ART_LIST.md`）。
// 絵は もとから 左むき（ネコと 向かいあう）なので、反転しない。
// 同じ名前で上書きしない（新しい名前で足して、ここを書きかえる）。
import type { EnemyUnitKind } from './campaign';

const DIR = '/assets/sprites/enemies';

/** 敵の兵の種類 → 絵（boss＝皇帝の親衛隊） */
export const ENEMY_UNIT_SPRITE: Record<EnemyUnitKind, string> = {
  grunt: `${DIR}/enemy-grunt.png`,
  shooter: `${DIR}/enemy-shooter.png`,
  runner: `${DIR}/enemy-runner.png`,
  brute: `${DIR}/enemy-brute.png`,
  guard: `${DIR}/enemy-guard.png`,
  medic: `${DIR}/enemy-medic.png`,
  kamikaze: `${DIR}/enemy-kamikaze.png`,
  flyer: `${DIR}/enemy-flyer.png`,
  boss: `${DIR}/enemy-elite.png`,
};

const BOSS_CHAPTERS = new Set(['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8']);

/** 章のボスの絵（章の id → 絵。絵の無い章は undefined） */
export function bossSprite(chapterId: string): string | undefined {
  return BOSS_CHAPTERS.has(chapterId) ? `${DIR}/boss-${chapterId}.png` : undefined;
}

/** 戦闘の敵の兵（sim の kind）→ 絵。kind の無いもの（対戦の相手のネコなど）は undefined */
export function enemyUnitSprite(kind: string | undefined): string | undefined {
  return kind && kind in ENEMY_UNIT_SPRITE ? ENEMY_UNIT_SPRITE[kind as EnemyUnitKind] : undefined;
}
