import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAVE_KEYS } from '../portal/saveKeys';

// ── 学習の記録（端末の中だけ。2026-11-15 CW-4a）──────────────────────────────
//
// ・perfect：項目ごとに「まちがえずに解けた回数」（鍵は "単元のkey/skill_id"）。かけら（learn/shards.ts）に使う
// ・todayPerfect：きょう まちがえずに解いた数。その日に動かせる施設の数（data/facilities.ts）に使う
//
// ポータルにつないだら（CW-5）、かけらは kit の sanmonShards に置きかえる。

const todayStr = (): string => new Date().toISOString().slice(0, 10);

interface StudyStore {
  perfect: Record<string, number>;
  todayPerfect: number;
  todayDate: string;
  /** 1問ぶん記録する（まちがえずに解けたときだけ数がふえる） */
  record: (unitKey: string, skillId: string, perfect: boolean) => void;
  /** きょう まちがえずに解いた数（日付が変わっていれば 0） */
  getTodayPerfect: () => number;
  reset: () => void;
}

export const useStudyStore = create<StudyStore>()(
  persist(
    (set, get) => ({
      perfect: {},
      todayPerfect: 0,
      todayDate: '',

      record: (unitKey, skillId, perfect) => {
        if (!perfect) return;
        const key = `${unitKey}/${skillId}`;
        const t = todayStr();
        set(s => ({
          perfect: { ...s.perfect, [key]: (s.perfect[key] ?? 0) + 1 },
          todayPerfect: (s.todayDate === t ? s.todayPerfect : 0) + 1,
          todayDate: t,
        }));
      },

      getTodayPerfect: () => (get().todayDate === todayStr() ? get().todayPerfect : 0),

      reset: () => set({ perfect: {}, todayPerfect: 0, todayDate: '' }),
    }),
    {
      name: SAVE_KEYS.study,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StudyStore>;
        return {
          ...current,
          perfect: p.perfect && typeof p.perfect === 'object' ? p.perfect : {},
          todayPerfect: typeof p.todayPerfect === 'number' ? p.todayPerfect : 0,
          todayDate: typeof p.todayDate === 'string' ? p.todayDate : '',
        };
      },
    }
  )
);
