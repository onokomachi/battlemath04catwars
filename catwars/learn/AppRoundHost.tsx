/**
 * 単元アプリの解答画面を、そのまま CAT-WARS に出す（SANMON の AppRoundHost と同じ考え方）。
 *
 * 判定：**1回目のまちがいで その問題は ×**（onComplete(false)）。まちがえたあとも アプリのヒントで
 * さいごまで解けるので、そのまま考えを直せる（記録は×のまま）。一度もまちがえずに解けたら ○。
 * 見た目：アプリは明るい配色なので「白い紙」（.app-paper。index.html）の上に出す。
 */
import React, { useRef } from 'react';
import type { PackRound, RoundRegistry } from './gradePack';

export const AppRoundHost: React.FC<{
  registry: RoundRegistry;
  item: PackRound;
  /** perfect＝一度もまちがえなかった。solved＝さいごまで解けた（まちがえてからでも） */
  onFirstResult: (perfect: boolean) => void;
  onSolved?: () => void;
}> = ({ registry, item, onFirstResult, onSolved }) => {
  const decided = useRef(false);
  const def = registry[item.regKey]?.[item.round];
  if (!def) return <div className="text-rose-300 text-sm font-bold p-4 text-center">まだ ない もんだいです（{item.regKey}/{item.round}）</div>;
  const first = (ok: boolean) => { if (decided.current) return; decided.current = true; onFirstResult(ok); };
  const { Round } = def;
  return (
    <div className="app-paper rounded-2xl text-left">
      <Round level={item.skillId} onResult={(perfect) => { first(perfect); onSolved?.(); }} onMiss={() => first(false)} />
    </div>
  );
};
