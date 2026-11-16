import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { syncProgressState } from '../utils/syncToSupabase';
import { CHARACTERS, stageForLevel, xpToNext, MAX_LEVEL } from '../data/characters';
import { BATTLE_XP_LOSS, BATTLE_XP_WIN } from '../data/rewards';
import { familyLevelCap } from '../learn/shards';
import { SAVE_KEYS } from '../portal/saveKeys';

export interface ArmyEntry {
  level: number;
  xp: number;        // 現在レベル内の累積XP
  totalBattles: number;
}

export interface LevelUpEvent {
  familyId: string;
  fromLevel: number;
  toLevel: number;
  evolved: boolean;     // 進化段階が上がったか
  newStage: 1 | 2 | 3;
}

/** 出撃の枠の数 */
export const FORMATION_SIZE = 5;

interface ArmyStore {
  army: Record<string, ArmyEntry>;
  /** 出撃の5枠（系統ID。空なら はじめの形＝defaultFormation） */
  formation: string[];
  getEntry: (familyId: string) => ArmyEntry;
  getLevel: (familyId: string) => number;
  getStage: (familyId: string) => 1 | 2 | 3;
  addXp: (familyId: string, amount: number) => LevelUpEvent | null;
  grantBattleXp: (familyIds: string[], won: boolean) => LevelUpEvent[];
  setFormation: (ids: string[]) => void;
  loadFromCloud: (army: Record<string, ArmyEntry>) => void;
  reset: () => void;
}

function defaultArmy(): Record<string, ArmyEntry> {
  const a: Record<string, ArmyEntry> = {};
  for (const c of CHARACTERS) a[c.id] = { level: 1, xp: 0, totalBattles: 0 };
  return a;
}

/**
 * XP を足してレベルを上げる（上限＝その系統の かけら で決まる上限）。
 * 上限に達している系統には XP が入らない（学習で上限を上げると、また育つ）。
 */
function applyXp(entry: ArmyEntry, amount: number, cap: number): ArmyEntry {
  const top = Math.min(MAX_LEVEL, cap);
  if (entry.level >= top) return { ...entry, xp: 0 };
  let level = entry.level;
  let xp = entry.xp + amount;
  while (level < top && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
  }
  if (level >= top) xp = 0;
  return { level, xp, totalBattles: entry.totalBattles };
}

/**
 * はじめの5枠：使える系統から、近接・遠距離・タンク・爆発・魔法 の順に（無ければ 使える順に）うめる。
 */
export function defaultFormation(unlocked: string[]): string[] {
  const pref = ['barbarian', 'archer', 'giant', 'bomber', 'magic', 'speed', 'healer', 'flying'];
  const out = pref.filter(id => unlocked.includes(id));
  for (const id of unlocked) if (!out.includes(id)) out.push(id);
  return out.slice(0, FORMATION_SIZE);
}

/**
 * 保存された5枠を、いま使える系統だけにして返す。まだ1度もえらんでいない（空）ときは はじめの形。
 * えらんだ系統が全部使えなくなったときも はじめの形（出撃できない、を作らない）。
 * 子どもが自分で はずした枠は うめない（5つより少なくても出撃できる）。
 */
export function effectiveFormation(saved: string[], unlocked: string[]): string[] {
  const keep = (Array.isArray(saved) ? saved : []).filter(id => unlocked.includes(id));
  const uniq = Array.from(new Set(keep)).slice(0, FORMATION_SIZE);
  return uniq.length > 0 ? uniq : defaultFormation(unlocked);
}

export const useArmyStore = create<ArmyStore>()(
  persist(
    (set, get) => ({
      army: defaultArmy(),
      formation: [],

      getEntry: (familyId) => get().army[familyId] ?? { level: 1, xp: 0, totalBattles: 0 },
      getLevel: (familyId) => (get().army[familyId]?.level ?? 1),
      getStage: (familyId) => stageForLevel(get().army[familyId]?.level ?? 1),

      addXp: (familyId, amount) => {
        const entry = get().army[familyId] ?? { level: 1, xp: 0, totalBattles: 0 };
        const fromLevel = entry.level;
        const updated = applyXp(entry, amount, familyLevelCap(familyId));
        set((s) => {
          const army = { ...s.army, [familyId]: updated };
          syncProgressState({ army });
          return { army };
        });
        if (updated.level > fromLevel) {
          return {
            familyId, fromLevel, toLevel: updated.level,
            evolved: stageForLevel(updated.level) > stageForLevel(fromLevel),
            newStage: stageForLevel(updated.level),
          };
        }
        return null;
      },

      grantBattleXp: (familyIds, won) => {
        const events: LevelUpEvent[] = [];
        const base = won ? BATTLE_XP_WIN : BATTLE_XP_LOSS;
        const unique = Array.from(new Set(familyIds));
        set((s) => {
          const army = { ...s.army };
          for (const id of unique) {
            const entry = army[id] ?? { level: 1, xp: 0, totalBattles: 0 };
            const fromLevel = entry.level;
            const next = applyXp(entry, base, familyLevelCap(id));
            army[id] = { ...next, totalBattles: entry.totalBattles + 1 };
            if (next.level > fromLevel) {
              events.push({
                familyId: id, fromLevel, toLevel: next.level,
                evolved: stageForLevel(next.level) > stageForLevel(fromLevel),
                newStage: stageForLevel(next.level),
              });
            }
          }
          syncProgressState({ army });
          return { army };
        });
        return events;
      },

      setFormation: (ids) => set({ formation: Array.from(new Set(ids)).slice(0, FORMATION_SIZE) }),

      loadFromCloud: (army) =>
        set((s) => {
          if (!army || Object.keys(army).length === 0) return {};
          const merged = { ...defaultArmy(), ...s.army, ...army };
          return { army: merged };
        }),

      reset: () => {
        const army = defaultArmy();
        syncProgressState({ army });
        return set({ army, formation: [] });
      },
    }),
    {
      name: SAVE_KEYS.army,
      // 古いセーブ（Lv50まで・formation 無し）でも落ちないように うめる
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ArmyStore>;
        const army = { ...defaultArmy() };
        if (p.army && typeof p.army === 'object') {
          for (const [id, e] of Object.entries(p.army)) {
            if (!e || typeof e !== 'object') continue;
            army[id] = {
              level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(e.level) || 1))),
              xp: Math.max(0, Number(e.xp) || 0),
              totalBattles: Math.max(0, Number(e.totalBattles) || 0),
            };
          }
        }
        return { ...current, army, formation: Array.isArray(p.formation) ? p.formation.filter(x => typeof x === 'string') : [] };
      },
    }
  )
);
