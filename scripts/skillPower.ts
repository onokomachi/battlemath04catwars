/**
 * スキルの強さの めやす（2026-11-15 CW-4b）。
 *
 *   npx tsx scripts/skillPower.ts
 *
 * ふつうの段・第8章で、「にがて」の想定プレイヤー（勝ち負けが ゆれやすい）の勝率を、
 * 手持ち Lv24（スキルなし）／Lv24＋スキル（5枠の系統に 1つ・2つ・3つ）／スキルなしで レベルだけ上げた手持ち とでくらべる。
 * スキルありの勝率と同じになるレベルの倍率（levelMult）を「スキルの強さ」とみる（脅威レベルは はたらかせない）。
 */
import { playOnce, seedFor, WEAK_SKILL, loadoutForLevel, BOT_FORMATION } from './botSim';
import { levelMult } from '../catwars/data/characters';
import { unlockedSkillIds } from '../catwars/data/skills';

const RUNS = Number(process.env.RUNS ?? 48);
const CH = Number(process.env.CH ?? 8) - 1;
const BASE = Number(process.env.LV ?? 24);
const rate = (level: number, shards: number) => {
  const kit = loadoutForLevel(level, CH + 1, 'normal');
  kit.skills = Object.fromEntries(BOT_FORMATION.map(f => [f, unlockedSkillIds(f, shards)]));
  let w = 0;
  for (let r = 0; r < RUNS; r++) if (playOnce(CH, seedFor(r), { skill: WEAK_SKILL, loadout: kit, noThreat: true }).win) w++;
  return (w / RUNS) * 100;
};
console.log(`第${CH + 1}章（ふつう）・にがて・各 ${RUNS}回・手持ち Lv${BASE}`);
for (const [label, sh] of [['スキルなし', 0], ['1つ（かけら2）', 2], ['2つ（かけら4）', 4], ['3つ（かけら8）', 8]] as const) {
  console.log(`  ${label.padEnd(10)} ${rate(BASE, sh).toFixed(0)}%`);
}
for (const plus of [4, 8, 12, 16, 20]) {
  console.log(`  スキルなし Lv${BASE + plus}（強さ ×${(levelMult(BASE + plus) / levelMult(BASE)).toFixed(2)}）  ${rate(BASE + plus, 0).toFixed(0)}%`);
}
