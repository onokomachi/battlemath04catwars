/**
 * なかまの 基地を 攻めた 結果を入れる（CW-6b・2026-11-17）。utils/settleExpedition.ts の なかま版。
 *
 * 勝ち負けが決まった瞬間に1回だけ（battleId で二重を止める）：
 *   - きょうの その枠の 自分の星（前より良いときだけ。**その戦いで 1問いじょう まちがえずに といたときだけ** 記録）
 *   - その日 1回目の 勝ちの 💠（FRIEND_ATTACK_CREDITS。まちがえずに 1問いじょう といていて・まだ もらっていない日だけ）
 * **サーバには 何も 送らない**（攻められた なかまに 伝わらない・攻めた記録も 残さない）。章の記録（クリア・★・連敗）・遠征の星・
 * シールコイン（学習の成果だけで ふえる きまり。なかまの 基地の 勝ちは 相手の配置しだいなので 入れない）には 数えない。
 */
import { usePlayerStore } from '../store/usePlayerStore';
import { useFriendStore, bonusAvailable } from '../store/useFriendStore';
import { FRIEND_ATTACK_CREDITS } from '../friend/friendAttack';

export interface FriendSettlement {
  battleId: string;
  /** その日の日づけ（日本時間。名乗っている子は サーバの日づけ） */
  day: string;
  slot: string;
  win: boolean;
  stars?: 1 | 2 | 3;
  /** その戦いで まちがえずに といた数 */
  perfect: number;
}

/** 画面に出す 💠（もらえるか）。BattleScene の 結果画面が 先に 使う */
export function friendBonusFor(day: string, win: boolean, perfect: number): number {
  return win && perfect > 0 && bonusAvailable(useFriendStore.getState(), day) ? FRIEND_ATTACK_CREDITS : 0;
}

/** 入れたら true（同じ battleId の2回目は false） */
export function settleFriend(r: FriendSettlement): boolean {
  const res = useFriendStore.getState().settle({
    battleId: r.battleId, day: r.day, slot: r.slot, win: r.win, stars: r.win ? (r.stars ?? 1) : 0, perfect: r.perfect,
  });
  if (res === null) return false;
  if (res.bonus) usePlayerStore.getState().addResources(FRIEND_ATTACK_CREDITS);
  return true;
}
