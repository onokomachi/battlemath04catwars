/**
 * 戦闘の結果を入れる（2026-11-16。本物のサーバでの通しの確認で見つかったバグの直し）。
 *
 * **勝ち負けが決まった瞬間に1回だけ** 入れる（BattleScene の 戦闘終了の useEffect → CatWars.tsx の settle）。
 * 入れるもの：勝ちの 💠・章の記録（クリア・★・連敗の数＝サポートモードの判定）。
 * 前は 結果画面のボタン（「ごほうびを もらって かえる」）を押したときにしか入らず、結果画面のまま 読みなおす・タブを閉じると
 * 💠 と 章クリアが消えていた（XP・バッジ・シールコインは 戦闘終了のときに入るので のこっていた）。
 *
 * 二重に入れない：出撃ごとの id（battleTicket.id）を 章の記録と同じ ストア（campaign の settledBattleId）に 1回の set で しるす。
 * StrictMode の2回実行・ボタンの連打・結果画面のまま 放置しても 1回。結果画面のボタンは 画面を閉じるだけ
 * （まだ入れていなければ 入れる＝退却のとき。退却は 今までどおり 負けとして 連敗に数え、💠 は無し）。
 * 遊んでいる とちゅうで モードが閉じて ホームに もどされたときは 入れない（今の決まり。勝ちの ごほうび無し）。
 */
import type { ChapterTier } from '../data/campaign';
import { useCampaignStore } from '../store/useCampaignStore';
import { usePlayerStore } from '../store/usePlayerStore';

export interface BattleSettlement {
  /** 出撃ごとの id（CatWars.tsx の battleTicket.id） */
  battleId: string;
  chapterId: string;
  tier: ChapterTier;
  win: boolean;
  /** 勝ちの 💠（負けは 0） */
  gold: number;
  stars?: 1 | 2 | 3;
}

/** 結果を入れる。入れたら true（同じ battleId は 2回目から 何もしないで false） */
export function settleBattle(r: BattleSettlement): boolean {
  if (!useCampaignStore.getState().settleResult(r.battleId, r.chapterId, r.win, r.win ? r.stars : undefined, r.tier)) return false;
  const gold = r.win ? Math.max(0, Math.round(r.gold)) : 0;
  if (gold > 0) usePlayerStore.getState().addResources(gold);
  return true;
}

/** 出撃ごとの id */
export const newBattleId = (): string => `battle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
