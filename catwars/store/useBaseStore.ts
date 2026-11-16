import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BuildingType, DeployedBuilding } from '../types';
import { SAVE_KEYS } from '../portal/saveKeys';
import {
  FACILITY_MAX_COUNT, MAX_FACILITY_LEVEL, buyCost, upgradeCost,
} from '../data/facilities';

// ── 基地ストア（持ちつづける施設・2026-11-15 CW-4a）─────────────────────────────
//
// 施設は 💠クレジットで買い、レベルを上げ、ずっと持ちつづける（日付で消えない）。
// その日に戦闘へ出せる数は「きょう まちがえずに解いた数」で決まる（data/facilities.ts の activeFacilityLimit）。
// 値段・持てる数・レベルの効き目は data/facilities.ts。
//
// 前の形（当日リセット・⚡で建てる）は 'catwars-base' に入っていた。形がちがうので 新しい鍵にする
// （いま遊んでいる子はいないので、前のセーブは引きつがない。残っていても読まない）。

export type FacilityCounts = Partial<Record<BuildingType, number>>;

interface BaseStore {
  /** 持っている数（コアは数えない＝いつも1つ） */
  owned: FacilityCounts;
  /** 種類ごとのレベル（1〜10。無ければ1） */
  levels: FacilityCounts;
  /** 章ごとの配置（先に置いた順。日付で消さない） */
  layouts: Record<string, DeployedBuilding[]>;

  countOf: (type: BuildingType) => number;
  levelOf: (type: BuildingType) => number;
  /** 1つ買う。上限・💠不足なら false */
  buy: (type: BuildingType, spend: (n: number) => boolean) => boolean;
  /** レベルを1つ上げる。上限・💠不足なら false */
  upgrade: (type: BuildingType, spend: (n: number) => boolean) => boolean;
  getLayout: (chapterId: string) => DeployedBuilding[];
  setLayout: (chapterId: string, layout: DeployedBuilding[]) => void;
  reset: () => void;
}

export const useBaseStore = create<BaseStore>()(
  persist(
    (set, get) => ({
      owned: {},
      levels: {},
      layouts: {},

      countOf: (type) => (type === BuildingType.TOWN_HALL ? 1 : get().owned[type] ?? 0),
      levelOf: (type) => Math.max(1, Math.min(MAX_FACILITY_LEVEL, get().levels[type] ?? 1)),

      buy: (type, spend) => {
        if (type === BuildingType.TOWN_HALL) return false;
        const have = get().owned[type] ?? 0;
        if (have >= FACILITY_MAX_COUNT[type]) return false;
        if (!spend(buyCost(type, have + 1))) return false;
        set(s => ({ owned: { ...s.owned, [type]: have + 1 } }));
        return true;
      },

      upgrade: (type, spend) => {
        const lv = get().levelOf(type);
        if (lv >= MAX_FACILITY_LEVEL) return false;
        if (type !== BuildingType.TOWN_HALL && (get().owned[type] ?? 0) <= 0) return false;
        if (!spend(upgradeCost(type, lv))) return false;
        set(s => ({ levels: { ...s.levels, [type]: lv + 1 } }));
        return true;
      },

      getLayout: (chapterId) => {
        // 持っている数より多く置いてあるとき（あとから数が変わった等）は、先に置いた順に 持っている数まで
        const raw = get().layouts[chapterId];
        const layout = Array.isArray(raw) ? raw : [];
        const used: FacilityCounts = {};
        const out: DeployedBuilding[] = [];
        for (const d of layout) {
          const n = (used[d.type] ?? 0) + 1;
          if (n > get().countOf(d.type)) continue;
          used[d.type] = n;
          out.push(d);
        }
        return out;
      },

      setLayout: (chapterId, layout) => set(s => ({ layouts: { ...s.layouts, [chapterId]: layout } })),

      reset: () => set({ owned: {}, levels: {}, layouts: {} }),
    }),
    {
      name: SAVE_KEYS.base,
      // 形が合わないセーブ（手でいじった等）でも落ちないように、足りない所を空でうめる
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BaseStore>;
        const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
        return {
          ...current,
          owned: obj(p.owned) as FacilityCounts,
          levels: obj(p.levels) as FacilityCounts,
          layouts: obj(p.layouts) as Record<string, DeployedBuilding[]>,
        };
      },
    }
  )
);
