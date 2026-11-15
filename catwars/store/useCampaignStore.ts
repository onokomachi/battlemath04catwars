import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CAMPAIGN, assistLevelForLosses } from '../data/campaign';

interface CampaignStore {
  /** クリアずみの章ID */
  clearedChapters: string[];
  /** 章IDごとの連敗数（勝つと0にもどる）。サポートモードの判定に使う */
  lossStreak: Record<string, number>;
  /** 章IDごとの挑戦回数（記録・分析用） */
  attempts: Record<string, number>;
  /** 章IDごとの星（1〜3。いちばんよかったとき）。まちがえずに解けた割合で決まる */
  stars: Record<string, 1 | 2 | 3>;
  /** 最後に選んだ章（つづきから遊べるように） */
  lastChapterId: string;

  isUnlocked: (chapterId: string) => boolean;
  isCleared: (chapterId: string) => boolean;
  assistLevelFor: (chapterId: string) => 0 | 1 | 2;
  recordAttempt: (chapterId: string) => void;
  recordResult: (chapterId: string, win: boolean, stars?: 1 | 2 | 3) => void;
  /** まだクリアしていない最初の章（全クリアなら最終章） */
  nextChapterId: () => string;
  setLastChapter: (chapterId: string) => void;
  reset: () => void;
}

export const useCampaignStore = create<CampaignStore>()(
  persist(
    (set, get) => ({
      clearedChapters: [],
      lossStreak: {},
      attempts: {},
      stars: {},
      lastChapterId: CAMPAIGN[0].id,

      // 第1章は常に開放。以降は「前の章をクリア」で開放（線形進行）。
      // 進行を1本にすることで「どこまで来たか」が子どもにも一目でわかる。
      isUnlocked: (chapterId) => {
        const idx = CAMPAIGN.findIndex(c => c.id === chapterId);
        if (idx <= 0) return idx === 0;
        return get().clearedChapters.includes(CAMPAIGN[idx - 1].id);
      },

      isCleared: (chapterId) => get().clearedChapters.includes(chapterId),

      assistLevelFor: (chapterId) => assistLevelForLosses(get().lossStreak[chapterId] ?? 0),

      recordAttempt: (chapterId) =>
        set(s => ({
          attempts: { ...s.attempts, [chapterId]: (s.attempts[chapterId] ?? 0) + 1 },
          lastChapterId: chapterId,
        })),

      recordResult: (chapterId, win, stars) =>
        set(s => ({
          stars: win && stars && stars > (s.stars?.[chapterId] ?? 0)
            ? { ...(s.stars ?? {}), [chapterId]: stars } : (s.stars ?? {}),
          clearedChapters: win && !s.clearedChapters.includes(chapterId)
            ? [...s.clearedChapters, chapterId]
            : s.clearedChapters,
          // 勝ったら連敗リセット（＝サポートモードも解除）。負けたら+1。
          lossStreak: { ...s.lossStreak, [chapterId]: win ? 0 : (s.lossStreak[chapterId] ?? 0) + 1 },
        })),

      nextChapterId: () => {
        const cleared = get().clearedChapters;
        const next = CAMPAIGN.find(c => !cleared.includes(c.id));
        return (next ?? CAMPAIGN[CAMPAIGN.length - 1]).id;
      },

      setLastChapter: (chapterId) => set({ lastChapterId: chapterId }),

      reset: () => set({ clearedChapters: [], lossStreak: {}, attempts: {}, stars: {}, lastChapterId: CAMPAIGN[0].id }),
    }),
    { name: 'catwars-campaign' }
  )
);
