// ── 状態チェックサム（デシンク検出）─────────────────────────────────────
//
// ロックステップは「守ったつもりで壊れる」ので、検出機構を必ず入れる。
// 一定tickごとに両者がこの値を送り合い、食い違ったら試合を止める。
//
// 設計上の要点:
//   ・**必ずID順にソートしてから**畳む。配列順は挿入順に依存するので、
//     順序が違うだけで別の値になってしまう。
//   ・**丸めてから**入れる。生の double をそのまま入れると、表示に影響しない
//     ほどの誤差でも検出が暴発する。逆に粗すぎると本物のズレを見逃すので、
//     座標は 1/1000 マス、HPは 1/100 を採用している。
//   ・FNV-1a を Math.imul で実装（32bit整数演算のみ＝完全に決定論的）。

import { SimState } from './types';

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function foldInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (x & 0xff), FNV_PRIME) >>> 0;
    x >>= 8;
  }
  return h >>> 0;
}

function foldString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ (s.charCodeAt(i) & 0xff), FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/**
 * 状態の要約ハッシュ。両クライアントで一致していなければデシンク。
 */
export function stateChecksum(state: SimState): number {
  let h = FNV_OFFSET >>> 0;

  h = foldInt(h, state.tick);
  h = foldInt(h, state.entities.length);

  // ID順に並べてから畳む（配列順への依存を断つ）
  const sorted = state.entities.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of sorted) {
    h = foldString(h, e.id);
    h = foldInt(h, Math.round(e.x * 1000));
    h = foldInt(h, Math.round(e.y * 1000));
    h = foldInt(h, Math.round(e.hp * 100));
    h = foldInt(h, e.lastAttack);
    // ボスのシールド（ふくしゅうで われる）。0 のときは足さない（前のチェックサムと同じになるように）
    if (e.shield) h = foldInt(h, e.shield);
  }

  for (const pid of ['P1', 'P2'] as const) {
    const p = state.players[pid];
    h = foldInt(h, Math.round(p.energy * 100));
    h = foldInt(h, p.spells.HEAL);
    h = foldInt(h, p.spells.RAGE);
  }

  h = foldInt(h, state.rngState);
  h = foldInt(h, state.entityCounter);
  h = foldInt(h, state.ai.spawnCount);

  return h >>> 0;
}

/**
 * デシンク時に原因を追うためのダンプ。
 * チェックサムが割れたとき、両者のこれを突き合わせると
 * 「どのエンティティから食い違ったか」が分かる。
 */
export function dumpState(state: SimState): string {
  const sorted = state.entities.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lines = sorted.map(e =>
    `${e.id} ${e.subType} ${e.team} x=${e.x.toFixed(4)} y=${e.y.toFixed(4)} hp=${e.hp.toFixed(2)} la=${e.lastAttack}`);
  return [
    `tick=${state.tick} rng=${state.rngState} counter=${state.entityCounter}`,
    `P1 energy=${state.players.P1.energy.toFixed(2)} P2 energy=${state.players.P2.energy.toFixed(2)}`,
    ...lines,
  ].join('\n');
}
