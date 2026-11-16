import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAVE_KEYS } from '../portal/saveKeys';

/**
 * まちがえた項目（ふくしゅうの もと。2026-11-15）。
 *
 * ボスのシールドは「その子の ふくしゅうの問題」を解くと われる（docs/REBUILD_SPEC.md §2）。
 * ポータルにつなぐ前なので、「復習の時期が来た項目」（サーバの next_due_ts）の代わりに、
 * 問題カードで **まちがえた項目** をここに覚えておく。つないだら、サーバの復習の時期に置きかえる。
 */
export interface MissItem {
  unitKey: string;
  skillId: string;
  /** まちがえた回数 */
  n: number;
}

/** 覚えておく上限（古いものから消す） */
export const REVIEW_MAX = 50;

interface ReviewStore {
  misses: MissItem[];
  /** まちがえた（同じ項目なら回数を足して、いちばん新しくする） */
  addMiss: (item: { unitKey: string; skillId: string }) => void;
  /** ふくしゅうで まちがえずに解けた（その項目を消す） */
  clearOne: (item: { unitKey: string; skillId: string }) => void;
  reset: () => void;
}

const same = (a: { unitKey: string; skillId: string }, b: { unitKey: string; skillId: string }) =>
  a.unitKey === b.unitKey && a.skillId === b.skillId;

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set) => ({
      misses: [],
      addMiss: (item) => set((s) => {
        const list = s.misses ?? [];
        const old = list.find((m) => same(m, item));
        const rest = list.filter((m) => !same(m, item));
        const next = [...rest, { unitKey: item.unitKey, skillId: item.skillId, n: (old?.n ?? 0) + 1 }];
        return { misses: next.slice(-REVIEW_MAX) };
      }),
      clearOne: (item) => set((s) => ({ misses: (s.misses ?? []).filter((m) => !same(m, item)) })),
      reset: () => set({ misses: [] }),
    }),
    {
      name: SAVE_KEYS.review,
      merge: (persisted, current) => ({ ...current, misses: ((persisted ?? {}) as Partial<ReviewStore>).misses ?? [] }),
    },
  ),
);
