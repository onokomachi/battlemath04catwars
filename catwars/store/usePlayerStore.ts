import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GameState, BuildingType, BuildingStatus } from '../types';
import { BUILDING_STATS, INITIAL_TROOPS } from '../constants';
import { syncPlayerState } from '../utils/syncToSupabase';

import { START_CREDITS, MAX_CREDITS } from '../data/rewards';

const INITIAL_PLAYER_STATE: GameState = {
  // 💠 のはじめの額。施設は 💠 で買って持ちつづける（2026-11-15 CW-4a）。上限は事実上なし
  resources: { gold: START_CREDITS, maxGold: MAX_CREDITS },
  buildings: [
    {
      id: 'th-1',
      type: BuildingType.TOWN_HALL,
      level: 1,
      position: { x: 7, y: 7 },
      hp: BUILDING_STATS[BuildingType.TOWN_HALL].hp,
      maxHp: BUILDING_STATS[BuildingType.TOWN_HALL].hp,
      status: BuildingStatus.ACTIVE,
    },
  ],
  troops: INITIAL_TROOPS.map((t) => ({ ...t, count: 5 })),
  lastTick: Date.now(),
};

interface PlayerStore extends GameState {
  setGameState: (updater: (prev: GameState) => GameState) => void;
  addTroops: (troopId: string, n: number) => void;
  addResources: (gold: number) => void;
  spendResources: (gold: number) => boolean;
  loadFromCloud: (data: Partial<GameState>) => void;
  reset: () => void;
}

/** 既存セーブに無い新系統の兵士を補完する（図鑑拡張時の互換） */
function mergeTroops(existing: GameState['troops']): GameState['troops'] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  return INITIAL_TROOPS.map((base) => byId.get(base.id) ?? { ...base, count: 5 });
}

function syncState(s: GameState) {
  syncPlayerState({
    resources: s.resources,
    buildings: s.buildings,
    troops: s.troops,
    last_tick: s.lastTick,
  });
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set) => ({
      ...INITIAL_PLAYER_STATE,
      setGameState: (updater) =>
        set((s) => {
          const prev: GameState = {
            resources: s.resources,
            buildings: s.buildings,
            troops: s.troops,
            lastTick: s.lastTick,
          };
          const next = updater(prev);
          syncState(next);
          return next;
        }),
      addTroops: (troopId, n) =>
        set((s) => {
          const next = { troops: s.troops.map((t) => t.id === troopId ? { ...t, count: t.count + n } : t) };
          syncState({ ...s, ...next });
          return next;
        }),
      addResources: (gold) =>
        set((s) => {
          const next = {
            resources: {
              ...s.resources,
              gold: Math.min(s.resources.maxGold, s.resources.gold + gold),
            },
          };
          syncState({ ...s, ...next });
          return next;
        }),
      spendResources: (gold) => {
        let canAfford = false;
        set((s) => {
          if (s.resources.gold >= gold) {
            canAfford = true;
            const next = {
              resources: { ...s.resources, gold: s.resources.gold - gold },
            };
            syncState({ ...s, ...next });
            return next;
          }
          return s;
        });
        return canAfford;
      },
      loadFromCloud: (data) =>
        set((s) => ({
          resources: data.resources ?? s.resources,
          buildings: data.buildings ?? s.buildings,
          troops: data.troops ?? s.troops,
          lastTick: data.lastTick ?? s.lastTick,
        })),
      reset: () => {
        const initial = { ...INITIAL_PLAYER_STATE, lastTick: Date.now() };
        syncState(initial);
        return set(initial);
      },
    }),
    {
      name: 'neo-academia-player',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.troops = mergeTroops(Array.isArray(state.troops) ? state.troops : []);
          // 前は上限 8000 だった（施設を持ちつづける形にしたので 上限を外す）
          const gold = Number(state.resources?.gold) || 0;
          state.resources = { gold, maxGold: MAX_CREDITS };
        }
      },
    }
  )
);
