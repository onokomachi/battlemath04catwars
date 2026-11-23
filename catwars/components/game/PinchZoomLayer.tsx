import React, { useRef, useState, useCallback, useLayoutEffect } from 'react';

interface Props {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  /** 初期スケール（マップが画面に収まるよう調整したい時に使用） */
  initialScale?: number;
  /**
   * 中身の実寸(px)。渡すと、表示領域に収まるよう初期倍率を自動計算する。
   * iPad 横向きで盤面の下が切れていた問題への対応。画面回転にも追従する。
   */
  contentSize?: { width: number; height: number };
  /** 自動フィット時の余白（左右・上下に確保する割合） */
  fitPadding?: number;
  className?: string;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * 2本指スワイプでパン、ピンチでズームできるラッパー。
 * - 指1本のタップ/クリックはそのまま子要素へ伝わる（兵士配置などを邪魔しない）
 * - 2本指のときだけパン＆ズームを行う
 * - マウスホイールでもズーム可能（PC向け）
 */
export const PinchZoomLayer: React.FC<Props> = ({
  children,
  minScale = 0.5,
  maxScale = 3,
  initialScale = 1,
  contentSize,
  fitPadding = 0.98,
  className,
}) => {
  const [t, setT] = useState({ scale: initialScale, x: 0, y: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDist = useRef<number | null>(null);
  const lastMid = useRef<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fitScaleRef = useRef(initialScale);
  // ユーザーが自分でズーム/パンしたあとは、自動フィットで上書きしない
  const userAdjustedRef = useRef(false);

  /** 表示領域に中身がぴったり収まる倍率を求める */
  const computeFit = useCallback((): number => {
    const host = hostRef.current;
    if (!host || !contentSize) return initialScale;
    const { clientWidth: w, clientHeight: h } = host;
    if (w === 0 || h === 0) return initialScale;
    return Math.min(w / contentSize.width, h / contentSize.height) * fitPadding;
  }, [contentSize, fitPadding, initialScale]);

  // 初回マウント時と、画面サイズ／回転が変わったときに自動でフィットさせる
  useLayoutEffect(() => {
    if (!contentSize) return;
    const apply = () => {
      const s = computeFit();
      fitScaleRef.current = s;
      if (!userAdjustedRef.current) setT({ scale: s, x: 0, y: 0 });
    };
    apply();
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [computeFit, contentSize]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2) {
        e.preventDefault();
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

        if (lastDist.current != null && lastMid.current) {
          userAdjustedRef.current = true;
          const dScale = dist / lastDist.current;
          const dx = mid.x - lastMid.current.x;
          const dy = mid.y - lastMid.current.y;
          setT((prev) => ({
            scale: clamp(prev.scale * dScale, minScale, maxScale),
            x: prev.x + dx,
            y: prev.y + dy,
          }));
        }
        lastDist.current = dist;
        lastMid.current = mid;
      }
    },
    [minScale, maxScale]
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      lastDist.current = null;
      lastMid.current = null;
    }
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        // 通常ホイールでもズーム（マップ操作向け）
      }
      e.preventDefault();
      userAdjustedRef.current = true;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setT((prev) => ({ ...prev, scale: clamp(prev.scale * factor, minScale, maxScale) }));
    },
    [minScale, maxScale]
  );

  // リセットは「画面にぴったり収まる倍率」に戻す（初期値1に戻すと盤面がはみ出すため）
  const reset = () => {
    userAdjustedRef.current = false;
    setT({ scale: contentSize ? fitScaleRef.current : initialScale, x: 0, y: 0 });
  };
  const zoomBy = (f: number) => {
    userAdjustedRef.current = true;
    setT((prev) => ({ ...prev, scale: clamp(prev.scale * f, minScale, maxScale) }));
  };

  return (
    <div
      ref={hostRef}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onWheel={onWheel}
      style={{ touchAction: 'none' }}
    >
      <div
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: 'center center',
          transition: 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 z-[80] flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => zoomBy(1.25)}
          className="cw-btn cw-press cw-btn-secondary w-12 h-12 !px-0 text-cw-20"
          aria-label="ズームイン"
        >
          ＋
        </button>
        <button
          onClick={() => zoomBy(0.8)}
          className="cw-btn cw-press cw-btn-secondary w-12 h-12 !px-0 text-cw-20"
          aria-label="ズームアウト"
        >
          －
        </button>
        <button
          onClick={reset}
          className="cw-btn cw-press cw-btn-secondary w-12 h-12 !px-0 text-cw-20"
          aria-label="リセット"
        >
          ⟳
        </button>
      </div>

      {/* Hint */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[80] pointer-events-none">
        <span className="cw-chip whitespace-nowrap" style={{ background: 'var(--cw-surface-strong)', color: 'var(--cw-fg-2)' }}>
          2本指でうごかす・ひろげる
        </span>
      </div>
    </div>
  );
};
