/**
 * 単元アプリの解答画面を、そのまま CAT-WARS に出す（SANMON の AppRoundHost と同じ考え方）。
 *
 * 判定：**1回目のまちがいで その問題は ×**（onComplete(false)）。まちがえたあとも アプリのヒントで
 * さいごまで解けるので、そのまま考えを直せる（記録は×のまま）。一度もまちがえずに解けたら ○。
 * 見た目：アプリは明るい配色なので「白い紙」（.app-paper。index.html）の上に出す。
 * まちがえて ヒントが出ると 紙が のびて、「こたえる」が 画面の下に かくれる（iPad 横 1024×768 で見つかった。2026-11-16）。
 * apps/ は直せないので、ここで：1回目の まちがいのあと 紙が のびたら、紙の いちばん下の ボタン（「こたえる」など）が
 * 見えるところまで 入れものを 下へ スクロールする（見えていれば 動かさない。上へは 動かさない）。
 */
import React, { useCallback, useEffect, useRef } from 'react';

/** いちばん近い スクロールできる 入れもの */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/** 紙の いちばん下の 見えている ボタン（なければ 紙）が 入れものの下に かくれていたら、見えるところまで 下へ スクロールする */
export function revealPaperBottom(paper: HTMLElement | null, margin = 12): void {
  if (!paper) return;
  const sc = scrollParent(paper);
  if (!sc) return;
  const btns = [...paper.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
  const target = btns.length ? btns[btns.length - 1] : paper;
  const over = target.getBoundingClientRect().bottom + margin - sc.getBoundingClientRect().bottom;
  if (over <= 1) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  sc.scrollTo({ top: sc.scrollTop + over, behavior: reduce ? 'auto' : 'smooth' });
}
import type { PackRound, RoundRegistry } from './gradePack';

export const AppRoundHost: React.FC<{
  registry: RoundRegistry;
  item: PackRound;
  /** perfect＝一度もまちがえなかった。solved＝さいごまで解けた（まちがえてからでも） */
  onFirstResult: (perfect: boolean) => void;
  onSolved?: () => void;
}> = ({ registry, item, onFirstResult, onSolved }) => {
  const decided = useRef(false);
  const missed = useRef(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const reveal = useCallback(() => {
    // ヒント・上の「ヒントを見て」の帯が 描かれてから はかる
    requestAnimationFrame(() => requestAnimationFrame(() => revealPaperBottom(paperRef.current)));
  }, []);
  // まちがえたあと 紙が のびたら（ヒント・答えの手順が出た）下まで見せる
  useEffect(() => {
    const el = paperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let h = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const nh = el.getBoundingClientRect().height;
      if (missed.current && nh > h + 1) reveal();
      h = nh;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [reveal]);
  const def = registry[item.regKey]?.[item.round];
  if (!def) return <div className="text-rose-300 text-sm font-bold p-4 text-center">まだ ない もんだいです（{item.regKey}/{item.round}）</div>;
  const first = (ok: boolean) => { if (decided.current) return; decided.current = true; onFirstResult(ok); };
  const { Round } = def;
  return (
    <div ref={paperRef} className="app-paper rounded-2xl text-left">
      <Round level={item.skillId} onResult={(perfect) => { first(perfect); onSolved?.(); }}
        onMiss={() => { first(false); if (!missed.current) { missed.current = true; reveal(); } }} />
    </div>
  );
};
