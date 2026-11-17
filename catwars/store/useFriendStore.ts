/**
 * なかまの 基地を 攻めた 自分の記録（CW-6b・2026-11-17）。鍵 SAVE_KEYS.friend（サーバのセーブにも入る。数十バイト）。
 *
 * - day／stars：**きょう**（日本時間の日づけ）の 枠（A・B・C）ごとの いちばん良い星（0〜3）。日が かわったら 空にもどる。
 *   **自分の星だけ**。サーバには 送らない（攻められた なかまには 何も 伝わらない・攻めた記録も サーバに 残さない）。
 * - bonusDay：「その日 1回目の 勝ち」の 💠 を もらった日。1日に1回（やくそく：遠征・章と 二重取りに ならない 小さな ごほうび）。
 * - settledBattleId：結果を入れた 出撃の id（二重に 入れない。utils/settleBattle.ts・settleExpedition.ts と同じ考え方）。
 * 判定は 純粋な関数（recordStars・claimBonus）。試験は scripts/friendTest.ts。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAVE_KEYS } from '../portal/saveKeys';

export interface FriendSave {
  day: string | null;
  stars: Record<string, number>;
  bonusDay: string | null;
  settledBattleId: string | null;
}

const isDay = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const SLOTS = ['A', 'B', 'C'];
const clampStars = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : null;

/** きょうの星を入れる（前より良いときだけ上書き。日が かわっていたら きのうの分を すてる） */
export function recordStars(s: FriendSave, day: string, slot: string, stars: number): { save: FriendSave; improved: boolean } {
  const st = clampStars(stars) ?? 0;
  const base = s.day === day ? s.stars : {};
  const prev = base[slot];
  if (s.day === day && prev !== undefined && prev >= st) return { save: s, improved: false };
  return { save: { ...s, day, stars: { ...base, [slot]: st } }, improved: true };
}

/** きょうの 💠 を もらえるか（まだ もらっていない日だけ） */
export const bonusAvailable = (s: FriendSave, day: string): boolean => s.bonusDay !== day;

export function sanitizeFriend(raw: unknown): FriendSave {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<FriendSave>;
  const stars: Record<string, number> = {};
  if (p.stars && typeof p.stars === 'object') {
    for (const [k, v] of Object.entries(p.stars)) { const s = clampStars(v); if (SLOTS.includes(k) && s !== null) stars[k] = s; }
  }
  return {
    day: isDay(p.day) ? p.day : null, stars: isDay(p.day) ? stars : {},
    bonusDay: isDay(p.bonusDay) ? p.bonusDay : null,
    settledBattleId: typeof p.settledBattleId === 'string' ? p.settledBattleId : null,
  };
}

interface FriendStore extends FriendSave {
  /**
   * 結果を入れる（勝ち負けが決まった瞬間に1回。battleId で二重を止める）。
   * perfect＝その戦いで まちがえずに といた数（0 なら 星も 💠 も 入れない＝放置で ごほうびに ならない）。
   * 返す：null＝同じ battleId の2回目・bonus＝その日 1回目の 勝ちで もらえる 💠 を もらう（もらったら 1）
   */
  settle: (r: { battleId: string; day: string; slot: string; win: boolean; stars: number; perfect: number }) => { recorded: boolean; bonus: boolean } | null;
  reset: () => void;
}

const empty = (): FriendSave => ({ day: null, stars: {}, bonusDay: null, settledBattleId: null });

export const useFriendStore = create<FriendStore>()(
  persist(
    (set, get) => ({
      ...empty(),
      settle: ({ battleId, day, slot, win, stars, perfect }) => {
        const s = get();
        if (s.settledBattleId === battleId) return null;
        if (perfect <= 0) { set({ settledBattleId: battleId }); return { recorded: false, bonus: false }; }
        const r = recordStars(s, day, slot, win ? stars : 0);
        const bonus = win && bonusAvailable(s, day);
        set({ ...r.save, bonusDay: bonus ? day : s.bonusDay, settledBattleId: battleId });
        return { recorded: true, bonus };
      },
      reset: () => set(empty()),
    }),
    {
      name: SAVE_KEYS.friend,
      partialize: (s) => ({ day: s.day, stars: s.stars, bonusDay: s.bonusDay, settledBattleId: s.settledBattleId }),
      merge: (persisted, current) => ({ ...current, ...sanitizeFriend(persisted) }),
    },
  ),
);
