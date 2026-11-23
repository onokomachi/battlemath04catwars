import type { IconName } from './icons';

/** 遠征の ルール（id）→ アイコン。データの絵文字は 画面に出さない（docs/UI_STYLE.md） */
export const RULE_ICON: Record<string, IconName> = {
  sky: 'wings', fog: 'cloud', swarm: 'swarm', nowall: 'wall', hero: 'star', armor: 'shield', boss: 'crown', towers: 'tower',
};

/** 出撃バフ（BuffType）→ アイコン */
export const BUFF_ICON: Record<string, IconName> = {
  FAST_DEPLOY: 'energy', COST_REDUCTION: 'coin', GOLD_RUSH: 'energy', GOLD_BOOST: 'chartup',
  RARE_BARBARIAN: 'sortie', RARE_ARCHER: 'bow', POWER_BOOST: 'power', EXTRA_TROOPS: 'helmet', SWIFT_ARMY: 'boot',
  HEAL_AURA: 'heal', GIANT_FORTRESS: 'shield', DOUBLE_LOOT: 'credit', WIZARD_SUPPORT: 'orb',
  DRAGON_SUMMON: 'dragon', ARMAGEDDON: 'comet', GENIUS_COMMANDER: 'crown',
};

/** 敵の とくちょう（EnemyUnitKind）→ アイコン */
export const TRAIT_ICON: Record<string, IconName> = { flyer: 'wings', guard: 'shield', medic: 'heal', kamikaze: 'bomb' };

export const iconOr = (map: Record<string, IconName>, key: string, fallback: IconName = 'star'): IconName => map[key] ?? fallback;
