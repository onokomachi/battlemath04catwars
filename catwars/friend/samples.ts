/**
 * 「みほんの 基地」（CW-6b・2026-11-17）。名乗っていない（おためし・体験版・デモ）ときの あいて・なかまの基地が 3つに たりない学級の うめあわせ。
 * サーバには 何も送らない・読まない。コンピュータが つくった 基地（本物の なかまの 基地ではない）。
 * 形は サーバの 形（baseShape.ts の FriendBaseWire）と同じ。座標は 左が自陣（x 0〜9）。
 * 日ごとに 3つ（決まった順）に ならぶ。試験（scripts/friendTest.ts）が「ぜんぶ 見なおしを とおる・重ならない」を見る。
 */
import { sanitizeFriendBase, type FriendBase, type FriendBaseWire } from './baseShape';

export interface SampleBase { id: string; name: string; wire: FriendBaseWire }

const wire = (b: [string, number, number][], lv: number[] = [1, 1, 1, 1]): FriendBaseWire => ({ v: 1, b, lv });

export const SAMPLE_BASES: SampleBase[] = [
  {
    id: 'wall', name: 'かべの ひろば',
    wire: wire([['T', 6, 7], ['W', 8, 5], ['W', 8, 6], ['W', 8, 7], ['W', 8, 8], ['W', 8, 9], ['W', 8, 10], ['C', 7, 4], ['C', 7, 11], ['H', 4, 8], ['A', 3, 2]], [2, 2, 1, 2]),
  },
  {
    id: 'tower', name: 'ほうだいの やぐら',
    wire: wire([['T', 7, 7], ['C', 5, 5], ['C', 5, 10], ['C', 8, 3], ['C', 8, 12], ['W', 9, 6], ['W', 9, 9], ['A', 1, 7]], [1, 2, 1, 1]),
  },
  {
    id: 'bolt', name: 'でんげきの ろうか',
    wire: wire([['T', 8, 7], ['H', 5, 6], ['H', 5, 9], ['C', 3, 7], ['W', 6, 4], ['W', 6, 5], ['W', 6, 6], ['W', 6, 7], ['W', 6, 8], ['W', 6, 9], ['W', 6, 10], ['W', 6, 11], ['A', 1, 2]], [1, 1, 2, 1]),
  },
  {
    id: 'thin', name: 'すかすかの とりで',
    wire: wire([['T', 5, 7], ['C', 7, 7], ['W', 8, 6], ['W', 8, 8], ['A', 1, 6]]),
  },
  {
    id: 'dense', name: 'ぎっしりの とりで',
    wire: wire([['T', 7, 7], ['C', 4, 4], ['C', 4, 11], ['H', 5, 7], ['H', 7, 5], ['W', 9, 5], ['W', 9, 6], ['W', 9, 7], ['W', 9, 8], ['W', 9, 9], ['W', 9, 10], ['A', 2, 7], ['A', 2, 1]], [3, 3, 2, 3]),
  },
  {
    id: 'ring', name: 'まるい とりで',
    wire: wire([['T', 4, 7], ['C', 6, 7], ['W', 6, 5], ['W', 6, 6], ['W', 6, 9], ['W', 6, 10], ['W', 3, 5], ['W', 3, 6], ['W', 3, 9], ['W', 3, 10], ['H', 4, 4], ['A', 1, 1]], [1, 1, 1, 1]),
  },
];

/** 見なおしずみの みほん（ぜんぶ とおる。とおらなければ 試験で止まる） */
export function sampleBase(s: SampleBase): FriendBase {
  const b = sanitizeFriendBase(s.wire);
  if (!b) throw new Error(`みほんの基地 ${s.id} が こわれている`);
  return b;
}
