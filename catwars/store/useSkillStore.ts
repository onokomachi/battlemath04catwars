import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAVE_KEYS } from '../portal/saveKeys';

// ── スキルの「見せた」記録（2026-11-15 CW-4b）──────────────────────────────
// 新しく開いたスキルは、戦闘のあとの結果画面か 図鑑で「✨ あたらしい スキル！」を1回だけ出す。
// どのスキルを もう見せたかを ここに持つ（端末の中だけ）。開いているかどうかは かけら（learn/shards.ts）で毎回きめる。

interface SkillSeenStore {
  seen: string[];
  markSeen: (ids: string[]) => void;
}

export const useSkillStore = create<SkillSeenStore>()(
  persist(
    (set) => ({
      seen: [],
      markSeen: (ids) => set(s => ({ seen: [...new Set([...s.seen, ...ids])] })),
    }),
    {
      name: SAVE_KEYS.skillsSeen,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SkillSeenStore>;
        return { ...current, seen: Array.isArray(p.seen) ? p.seen.filter((x): x is string => typeof x === 'string') : [] };
      },
    }
  )
);
