/**
 * 週がわりの遠征の 結果を入れる（CW-6a・2026-11-17）。utils/settleBattle.ts の 遠征版。
 *
 * 勝ち負けが決まった瞬間に1回だけ（battleId で二重を止める）：
 *   - 勝ちの 💠（その章の ふつう と同じ数。遠征は くりかえし遊べる ふだんの章と 同じ あつかい）
 *   - 今週の 自分の星（前より良いときだけ。**その戦いで 1問いじょう まちがえずに といたときだけ** 記録＝ちょうせんの しるし）
 *   - 名乗っているときだけ サーバに送る（portal/expeditionSync.ts。おためし・体験版・デモは 送らない）
 * 章の記録（クリア・★・連敗＝サポートモード）は さわらない。
 */
import { usePlayerStore } from '../store/usePlayerStore';
import { useExpeditionStore } from '../store/useExpeditionStore';
import { flushExpedition, expeditionNamed } from '../portal/expeditionSync';

export interface ExpeditionSettlement {
  battleId: string;
  weekStart: string;
  win: boolean;
  gold: number;
  stars?: 1 | 2 | 3;
  /** その戦いで まちがえずに といた数 */
  perfect: number;
}

/** 入れたら true（同じ battleId の2回目は false） */
export function settleExpedition(r: ExpeditionSettlement): boolean {
  const named = expeditionNamed();
  const res = useExpeditionStore.getState().settle({
    battleId: r.battleId, weekStart: r.weekStart, stars: r.win ? (r.stars ?? 1) : 0, perfect: r.perfect, send: named,
  });
  if (res === null) return false;
  const gold = r.win ? Math.max(0, Math.round(r.gold)) : 0;
  if (gold > 0) usePlayerStore.getState().addResources(gold);
  if (named) void flushExpedition();
  return true;
}
