/**
 * スキル（系統ごとに3つ・計24。2026-11-15 CW-4b）。
 *
 * - **学習で開く**：その系統の かけら（learn/shards.ts。結びつけた単元を まちがえずに解くと増える・0〜8）が
 *   2／4／6 になると、1つめ／2つめ／3つめが開く。開いたスキルは いつも効く（えらぶ・つけかえる は無い）。
 * - 全部「いつも効く」か「条件で自動に効く」もの（ボタンで使うものは無い）。
 * - 効き目の数値は ここ1か所。sim には **試合開始時に** 開いているスキルの id を渡し、
 *   `resolveUnitStats`（sim/setup.ts）が `UnitStatLine.skills`（解決ずみの数値）に焼きこむ。sim の中からストアは読まない。
 * - 効き目の計算は sim/simulate.ts（`applyHit`・死んだときの処理・回復）。**数を変えるときは ここ、きまりを変えるときは sim**。
 * - 脅威レベルは レベルだけで決まる（スキルは 学習で手に入る「脅威に追いつかれない強さ」＝学習のごほうび）。
 */

/** 解決ずみの効き目（その系統で開いているスキルを合わせたもの。無いものは undefined） */
export interface SkillEffects {
  // 近接
  /** 敵をたおすと 自分の最大HPの この割合を回復 */
  healOnKillPct?: number;
  /** HPが半分以下のとき こうげきの間かくに掛ける（0.75＝25%はやい） */
  lowHpAtkIntervalMult?: number;
  /** まわり（packRadius）に味方が packAllies 体以上いると、うけるダメージに packTakenMult を掛ける */
  packAllies?: number; packRadius?: number; packTakenMult?: number;
  // 遠距離・飛行
  /** 空中の敵への ダメージ倍率 */
  vsFlyerMult?: number;
  /** 射程に足す（setup で焼きこむ） */
  rangeBonus?: number;
  /** さいしょの1発の ダメージ倍率 */
  firstHitMult?: number;
  // タンク
  /** まわり（coverRadius）の味方が 施設から うけるダメージの この割合を、タンクが ひきうける */
  coverPct?: number; coverRadius?: number;
  /** たおれるとき まわり（deathHealRadius）の味方を 最大HPの この割合 回復 */
  deathHealPct?: number; deathHealRadius?: number;
  /** 施設へのダメージ倍率に 足す（setup で焼きこむ） */
  buildingDamageBonus?: number;
  // 魔法
  /** 盾持ちへの ダメージに さらに掛ける */
  vsGuardMult?: number;
  /** あたった敵の まわり（splashRadius）の ほかの敵にも この割合 */
  splashPct?: number; splashRadius?: number;
  /** この種類の敵が preferRadius 以内にいると 先にねらう */
  preferKind?: string; preferRadius?: number;
  /** preferKind の敵への ダメージ倍率 */
  vsPreferMult?: number;
  // 高速
  /** 出てから この時間（ms） ダメージを うけない */
  spawnGuardMs?: number;
  /** 発電所・キャンプ・兵舎（こうげきしない施設）への ダメージ倍率 */
  vsSupportMult?: number;
  // 飛行
  /** 砲台が この ネコを ねらうまでの時間に 足す（ms） */
  aimDelayMs?: number;
  /** 壁の ちかく（1.5マス）にいると 1秒ごとに 最大HPの この割合 回復 */
  wallRestHealPct?: number;
  // 回復
  /** healIntervalMs ごとに まわり（healRadius）の味方を 最大HPの healPct 回復 */
  healPct?: number; healRadius?: number; healIntervalMs?: number;
  /** 回復のはんいに 足す */
  healRadiusBonus?: number;
  /** シールドのある ボスが まわり（bossWeakenRadius）にいると、ボスの こうげきに (1 − この割合) を掛ける */
  bossWeakenPct?: number; bossWeakenRadius?: number;
  // 爆発
  /** 壁への ダメージ倍率 */
  vsWallMult?: number;
  /** たおれるとき まわり（deathBlastRadius）の敵に こうげき力 × この倍率 */
  deathBlastMult?: number; deathBlastRadius?: number;
}

export interface SkillDef {
  id: string;
  /** 系統ID（characters.ts の id） */
  family: string;
  /** 1〜3（開く順） */
  slot: 1 | 2 | 3;
  name: string;
  /** 子ども向けの説明（ひらがな多め・20字ほど） */
  desc: string;
  effect: SkillEffects;
}

/** n番めのスキルが開く かけらの数（1つめ 2・2つめ 4・3つめ 6） */
export const SKILL_SHARDS: Record<1 | 2 | 3, number> = { 1: 2, 2: 4, 3: 6 };

export const SKILLS: SkillDef[] = [
  // ── 近接：たたかいつづける ──
  { id: 'melee_feast', family: 'barbarian', slot: 1, name: 'かちどき', desc: 'てきを たおすと すこし げんきに なる', effect: { healOnKillPct: 0.2 } },
  { id: 'melee_rally', family: 'barbarian', slot: 2, name: 'ふんばり', desc: 'HPが はんぶんより へると こうげきが はやい', effect: { lowHpAtkIntervalMult: 0.75 } },
  { id: 'melee_pack', family: 'barbarian', slot: 3, name: 'えんじん', desc: 'なかまが 3びき ちかくに いると かたくなる', effect: { packAllies: 3, packRadius: 1.6, packTakenMult: 0.8 } },
  // ── 遠距離：とおくから ねらう ──
  { id: 'ranged_sky', family: 'archer', slot: 1, name: 'そらうち', desc: 'そらの てきに 1.5ばいの ダメージ', effect: { vsFlyerMult: 1.5 } },
  { id: 'ranged_reach', family: 'archer', slot: 2, name: 'ロングショット', desc: 'しゃていが 0.5マス のびる', effect: { rangeBonus: 0.5 } },
  { id: 'ranged_first', family: 'archer', slot: 3, name: 'せんせいの いちげき', desc: 'さいしょの 1ぱつが 2ばいの ダメージ', effect: { firstHitMult: 2 } },
  // ── タンク：なかまを まもる ──
  { id: 'tank_cover', family: 'giant', slot: 1, name: 'かばう', desc: 'ちかくの なかまへの ほうだいの こうげきを うける', effect: { coverPct: 0.3, coverRadius: 2 } },
  { id: 'tank_last', family: 'giant', slot: 2, name: 'さいごの はげまし', desc: 'たおれるとき まわりの なかまを かいふく', effect: { deathHealPct: 0.25, deathHealRadius: 2.5 } },
  { id: 'tank_smash', family: 'giant', slot: 3, name: 'てっつい', desc: 'たてものへの ダメージが ふえる', effect: { buildingDamageBonus: 0.5 } },
  // ── 魔法：とくべつな てきに つよい ──
  { id: 'magic_pierce', family: 'magic', slot: 1, name: 'たてやぶり', desc: 'たてもちに もっと つよくなる', effect: { vsGuardMult: 1.33 } },
  { id: 'magic_burst', family: 'magic', slot: 2, name: 'ひろがる まほう', desc: 'あたった まわりの てきにも すこし あたる', effect: { splashPct: 0.35, splashRadius: 1.0 } },
  { id: 'magic_seek', family: 'magic', slot: 3, name: 'かいふくやを ねらえ', desc: 'かいふく役の てきを さきに ねらう', effect: { preferKind: 'medic', preferRadius: 5, vsPreferMult: 1.25 } },
  // ── 高速：すばやく うごく ──
  { id: 'speed_stop', family: 'speed', slot: 1, name: 'ばくだん とめ', desc: 'じばくロボを さきに ねらって つよい', effect: { preferKind: 'kamikaze', preferRadius: 5, vsPreferMult: 1.5 } },
  { id: 'speed_dash', family: 'speed', slot: 2, name: 'ダッシュ', desc: 'でてから 3びょうは ダメージを うけない', effect: { spawnGuardMs: 3000 } },
  { id: 'speed_raid', family: 'speed', slot: 3, name: 'うらまわり', desc: 'はつでんしょや キャンプに 2ばいの ダメージ', effect: { vsSupportMult: 2 } },
  // ── 飛行：そらから せめる ──
  { id: 'fly_dodge', family: 'flying', slot: 1, name: 'ジグザグ ひこう', desc: 'ほうだいに ねらわれるのが おそくなる', effect: { aimDelayMs: 600 } },
  { id: 'fly_ace', family: 'flying', slot: 2, name: 'くうちゅうせん', desc: 'そらの てきに 1.5ばいの ダメージ', effect: { vsFlyerMult: 1.5 } },
  { id: 'fly_perch', family: 'flying', slot: 3, name: 'はねやすめ', desc: 'かべの ちかくで やすむと かいふく', effect: { wallRestHealPct: 0.04 } },
  // ── 回復：なかまを ささえる ──
  { id: 'heal_aura', family: 'healer', slot: 1, name: 'いやしの ひかり', desc: 'ちかくの なかまを すこしずつ かいふく', effect: { healPct: 0.06, healRadius: 2.5, healIntervalMs: 2000 } },
  { id: 'heal_wide', family: 'healer', slot: 2, name: 'ひろい ひかり', desc: 'かいふくの はんいが 1マス ひろがる', effect: { healRadiusBonus: 1 } },
  { id: 'heal_calm', family: 'healer', slot: 3, name: 'しずめの うた', desc: 'シールドの ボスの こうげきを よわめる', effect: { bossWeakenPct: 0.3, bossWeakenRadius: 3 } },
  // ── 爆発：まとめて こわす ──
  { id: 'bomb_blast', family: 'bomber', slot: 1, name: 'ひろがる ばくはつ', desc: 'ばくはつが まわりの てきにも あたる', effect: { splashPct: 0.4, splashRadius: 1.2 } },
  { id: 'bomb_wall', family: 'bomber', slot: 2, name: 'かべくずし', desc: 'かべに 3ばいの ダメージ', effect: { vsWallMult: 3 } },
  { id: 'bomb_last', family: 'bomber', slot: 3, name: 'さいごの ばくはつ', desc: 'たおれるとき まわりの てきに ばくはつ', effect: { deathBlastMult: 1, deathBlastRadius: 1.5 } },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map(s => [s.id, s]));

/** その系統のスキル（slot の順） */
export function skillsForFamily(familyId: string): SkillDef[] {
  return SKILLS.filter(s => s.family === familyId).sort((a, b) => a.slot - b.slot);
}

/** かけらの数 → 開いているスキルの id（slot の順） */
export function unlockedSkillIds(familyId: string, shards: number): string[] {
  return skillsForFamily(familyId).filter(s => shards >= SKILL_SHARDS[s.slot]).map(s => s.id);
}

/** 開いているスキルの効き目を 1つに合わせる（同じ系統の中では 同じ項目は重ならない） */
export function mergeSkillEffects(ids: string[]): SkillEffects | undefined {
  if (ids.length === 0) return undefined;
  const out: SkillEffects = {};
  for (const id of ids) {
    const s = SKILL_BY_ID[id];
    if (s) Object.assign(out, s.effect);
  }
  return out;
}
