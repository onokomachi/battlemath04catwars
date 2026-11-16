import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CAMPAIGN, assistLevelForLosses, tierKey, type ChapterTier } from '../data/campaign';
import { SAVE_KEYS } from '../portal/saveKeys';

interface CampaignStore {
  /** クリアずみの章ID（**ふつう だけ**。章の開放・「n/8章クリア」に使う） */
  clearedChapters: string[];
  /** ふつう いがいの段のクリア（`tierKey(章ID, 段)`＝「ch3:hard」など） */
  tierCleared: string[];
  /** 連敗数（鍵は tierKey。勝つと0にもどる）。サポートモードの判定に使う */
  lossStreak: Record<string, number>;
  /** 挑戦回数（鍵は tierKey。記録・分析用） */
  attempts: Record<string, number>;
  /** 星（1〜3。いちばんよかったとき。鍵は tierKey）。まちがえずに解けた割合で決まる */
  stars: Record<string, 1 | 2 | 3>;
  /** 最後に選んだ章（つづきから遊べるように） */
  lastChapterId: string;

  isUnlocked: (chapterId: string) => boolean;
  isCleared: (chapterId: string) => boolean;
  /** その段をクリアしたか */
  isTierCleared: (chapterId: string, tier: ChapterTier) => boolean;
  /** その段が開いているか（ふつう＝章が開いている／むずかしい＝ふつうをクリア／げきむず＝むずかしいをクリア） */
  isTierUnlocked: (chapterId: string, tier: ChapterTier) => boolean;
  /** その段の星（まだなら 0） */
  starsFor: (chapterId: string, tier: ChapterTier) => 0 | 1 | 2 | 3;
  assistLevelFor: (chapterId: string, tier?: ChapterTier) => 0 | 1 | 2;
  recordAttempt: (chapterId: string, tier?: ChapterTier) => void;
  recordResult: (chapterId: string, win: boolean, stars?: 1 | 2 | 3, tier?: ChapterTier) => void;
  /** まだクリアしていない最初の章（全クリアなら最終章） */
  nextChapterId: () => string;
  setLastChapter: (chapterId: string) => void;
  reset: () => void;
}

export const useCampaignStore = create<CampaignStore>()(
  persist(
    (set, get) => ({
      clearedChapters: [],
      tierCleared: [],
      lossStreak: {},
      attempts: {},
      stars: {},
      lastChapterId: CAMPAIGN[0].id,

      // 第1章は常に開放。以降は「前の章をクリア」で開放（線形進行）。
      // 進行を1本にすることで「どこまで来たか」が子どもにも一目でわかる。
      isUnlocked: (chapterId) => {
        const idx = CAMPAIGN.findIndex(c => c.id === chapterId);
        if (idx <= 0) return idx === 0;
        return (get().clearedChapters ?? []).includes(CAMPAIGN[idx - 1].id);
      },

      isCleared: (chapterId) => (get().clearedChapters ?? []).includes(chapterId),

      isTierCleared: (chapterId, tier) => tier === 'normal'
        ? (get().clearedChapters ?? []).includes(chapterId)
        : (get().tierCleared ?? []).includes(tierKey(chapterId, tier)),

      isTierUnlocked: (chapterId, tier) => {
        if (tier === 'normal') return get().isUnlocked(chapterId);
        if (tier === 'hard') return get().isTierCleared(chapterId, 'normal');
        return get().isTierCleared(chapterId, 'hard');
      },

      starsFor: (chapterId, tier) => (get().stars ?? {})[tierKey(chapterId, tier)] ?? 0,

      assistLevelFor: (chapterId, tier = 'normal') =>
        assistLevelForLosses((get().lossStreak ?? {})[tierKey(chapterId, tier)] ?? 0),

      recordAttempt: (chapterId, tier = 'normal') =>
        set(s => {
          const k = tierKey(chapterId, tier);
          const attempts = s.attempts ?? {};
          return { attempts: { ...attempts, [k]: (attempts[k] ?? 0) + 1 }, lastChapterId: chapterId };
        }),

      recordResult: (chapterId, win, stars, tier = 'normal') =>
        set(s => {
          const k = tierKey(chapterId, tier);
          const prevStars = s.stars ?? {};
          const cleared = s.clearedChapters ?? [];
          const tierCleared = s.tierCleared ?? [];
          const loss = s.lossStreak ?? {};
          return {
            stars: win && stars && stars > (prevStars[k] ?? 0) ? { ...prevStars, [k]: stars } : prevStars,
            clearedChapters: win && tier === 'normal' && !cleared.includes(chapterId) ? [...cleared, chapterId] : cleared,
            tierCleared: win && tier !== 'normal' && !tierCleared.includes(k) ? [...tierCleared, k] : tierCleared,
            // 勝ったら連敗リセット（＝サポートモードも解除）。負けたら+1。段ごとに数える
            lossStreak: { ...loss, [k]: win ? 0 : (loss[k] ?? 0) + 1 },
          };
        }),

      nextChapterId: () => {
        const cleared = get().clearedChapters ?? [];
        const next = CAMPAIGN.find(c => !cleared.includes(c.id));
        return (next ?? CAMPAIGN[CAMPAIGN.length - 1]).id;
      },

      setLastChapter: (chapterId) => set({ lastChapterId: chapterId }),

      reset: () => set({ clearedChapters: [], tierCleared: [], lossStreak: {}, attempts: {}, stars: {}, lastChapterId: CAMPAIGN[0].id }),
    }),
    {
      name: SAVE_KEYS.campaign,
      // 古いセーブ（段の無いころ）に新しい項目が無くても落ちないように
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CampaignStore>;
        return {
          ...current, ...p,
          clearedChapters: p.clearedChapters ?? [],
          tierCleared: p.tierCleared ?? [],
          lossStreak: p.lossStreak ?? {},
          attempts: p.attempts ?? {},
          stars: p.stars ?? {},
        };
      },
    }
  )
);
