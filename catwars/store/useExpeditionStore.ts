/**
 * 週がわりの遠征の 自分の記録（CW-6a・2026-11-17）。鍵 SAVE_KEYS.expedition（サーバのセーブにも入る）。
 *
 * - best：週（月曜の日づけ）→ その週の いちばん良い星（0〜3）。**遠征で 1問いじょう まちがえずに といた戦いだけ** 入れる
 *   （0 は「ちょうせんした」。学級の ごほうびは ちょうせんした子だけ＝放置で もらえない）。直近 KEEP_WEEKS 週だけ のこす。
 * - pending：サーバに まだ とどいていない星（名乗っているときだけ。とどいたら 消す。週が かわったら すてる）。
 * - claimed：学級の目標の ごほうびを もらった週（2回 もらわない。セーブに入るので 別の端末でも 2回目は無い）。
 * - settledBattleId：結果を入れた出撃の id（二重に入れない。utils/settleBattle.ts と同じ考え方）。
 * 判定は 純粋な関数（recordBest・pruneWeeks）。試験は scripts/expeditionTest.ts。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAVE_KEYS } from '../portal/saveKeys';

export const KEEP_WEEKS = 8;

export interface ExpeditionSave {
  best: Record<string, number>;
  pending: { weekStart: string; stars: number } | null;
  claimed: string[];
  settledBattleId: string | null;
}

const isWeek = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const clampStars = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : null;

/** 新しい順に KEEP_WEEKS 週だけ のこす */
export function pruneWeeks(best: Record<string, number>): Record<string, number> {
  const keys = Object.keys(best).filter(isWeek).sort().reverse().slice(0, KEEP_WEEKS);
  return Object.fromEntries(keys.map((k) => [k, best[k]]));
}

/** その週の星を入れる（前より良いときだけ上書き）。上書きしたら improved */
export function recordBest(best: Record<string, number>, weekStart: string, stars: number): { best: Record<string, number>; improved: boolean } {
  const s = clampStars(stars) ?? 0;
  const prev = best[weekStart];
  if (prev !== undefined && prev >= s) return { best, improved: false };
  return { best: pruneWeeks({ ...best, [weekStart]: s }), improved: true };
}

export function sanitizeExpedition(raw: unknown): ExpeditionSave {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<ExpeditionSave>;
  const best: Record<string, number> = {};
  if (p.best && typeof p.best === 'object') {
    for (const [k, v] of Object.entries(p.best)) { const s = clampStars(v); if (isWeek(k) && s !== null) best[k] = s; }
  }
  const pend = p.pending && isWeek(p.pending.weekStart) && clampStars(p.pending.stars) !== null
    ? { weekStart: p.pending.weekStart, stars: clampStars(p.pending.stars)! } : null;
  const claimed = Array.isArray(p.claimed) ? [...new Set(p.claimed.filter(isWeek))].sort().slice(-KEEP_WEEKS * 2) : [];
  return {
    best: pruneWeeks(best), pending: pend, claimed,
    settledBattleId: typeof p.settledBattleId === 'string' ? p.settledBattleId : null,
  };
}

interface ExpeditionStore extends ExpeditionSave {
  /**
   * 遠征の戦いの結果を入れる（勝ち負けが決まった瞬間に1回。battleId で二重を止める）。
   * perfect＝その戦いで まちがえずに といた数（0 なら 記録しない）。send＝名乗っている（サーバに送る星を pending に）。
   * 同じ battleId の2回目は null。perfect が 0 なら { recorded: false }（星は のこさない）。
   */
  settle: (r: { battleId: string; weekStart: string; stars: number; perfect: number; send: boolean }) => { recorded: boolean; improved: boolean } | null;
  /** サーバに とどいた（同じ週の pending を消す） */
  markSent: (weekStart: string, stars: number) => void;
  /** 週が かわった pending を すてる */
  dropStale: (currentWeekStart: string) => void;
  /** 学級の目標の ごほうびを その週に もらう（もらえたら true） */
  claim: (weekStart: string) => boolean;
  reset: () => void;
}

const empty = (): ExpeditionSave => ({ best: {}, pending: null, claimed: [], settledBattleId: null });

export const useExpeditionStore = create<ExpeditionStore>()(
  persist(
    (set, get) => ({
      ...empty(),
      settle: ({ battleId, weekStart, stars, perfect, send }) => {
        const s = get();
        if (s.settledBattleId === battleId) return null;
        if (perfect <= 0) { set({ settledBattleId: battleId }); return { recorded: false, improved: false }; }
        const r = recordBest(s.best, weekStart, stars);
        const prevPending = s.pending && s.pending.weekStart === weekStart ? s.pending.stars : -1;
        const pending = send && r.improved && stars > prevPending ? { weekStart, stars: clampStars(stars) ?? 0 } : s.pending;
        // サーバに とどいていない「ちょうせん」（0）も 送る（学級の ごほうびの しるし）
        set({ best: r.best, pending, settledBattleId: battleId });
        return { recorded: true, improved: r.improved };
      },
      markSent: (weekStart, stars) => set((s) => (
        s.pending && s.pending.weekStart === weekStart && s.pending.stars <= stars ? { pending: null } : {}
      )),
      dropStale: (w) => set((s) => (s.pending && s.pending.weekStart !== w ? { pending: null } : {})),
      claim: (weekStart) => {
        if (get().claimed.includes(weekStart)) return false;
        set((s) => ({ claimed: [...s.claimed, weekStart].sort().slice(-KEEP_WEEKS * 2) }));
        return true;
      },
      reset: () => set(empty()),
    }),
    {
      name: SAVE_KEYS.expedition,
      partialize: (s) => ({ best: s.best, pending: s.pending, claimed: s.claimed, settledBattleId: s.settledBattleId }),
      merge: (persisted, current) => ({ ...current, ...sanitizeExpedition(persisted) }),
    },
  ),
);
