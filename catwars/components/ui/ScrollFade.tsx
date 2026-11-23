import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 横に ながす 列。はみだした ぶんが あるあいだ、右はし（と 左はし）に 地の色の フェードを 出して「まだ つづく」を 見せる。
 * 全部 入るときは フェードも 出ない。
 */
export const ScrollFade: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current; if (!el) return;
    const left = el.scrollLeft > 4, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    update();
    const el = ref.current; if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el); Array.from(el.children).forEach((c) => ro?.observe(c));
    window.addEventListener('resize', update);
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
  }, [update]);
  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={`overflow-x-auto cw-scroll ${className}`} data-testid="scroll-fade">{children}</div>
      {edge.right && <div aria-hidden className="absolute top-0 bottom-2 right-0 w-10 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, var(--cw-surface-strong))' }} data-testid="scroll-fade-right" />}
      {edge.left && <div aria-hidden className="absolute top-0 bottom-2 left-0 w-10 pointer-events-none" style={{ background: 'linear-gradient(270deg, transparent, var(--cw-surface-strong))' }} />}
    </div>
  );
};
