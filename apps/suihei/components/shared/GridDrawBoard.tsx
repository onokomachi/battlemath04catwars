// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/GridDrawBoard.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 方眼をタップして図をかく作図UI。
 *
 * 三角じょうぎのドラッグ操作は再現しない。指の操作精度の問題で児童がいらだつうえ、
 * 「どこに かくか」という作図の思考は 頂点を選ぶだけで十分に扱えるため。
 * かき方の手順（三角じょうぎの当て方）は OrderCards の手順カードで別に扱う。
 */
import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { FigureSpec, Pt } from '../../types';
import { AnswerSpec } from '../../lib/problemTypes';
import { add, dirOf, len, scale, sub } from '../../lib/geometry';

type Spec = Extract<AnswerSpec, { kind: 'gridDraw' }>;

interface Props {
  spec: Spec;
  /**
   * 問題の図。**タップする方眼と同じ1枚に重ねて描く**。
   * 基準の直線が別の図にあると、垂直かどうかを見くらべながら作図できない
   * （＝作図の思考が成立しない）ので、図と方眼は必ず1枚にまとめる。
   */
  figure?: FigureSpec;
  onSubmit: (picked: Pt[]) => void;
}

export const GridDrawBoard: React.FC<Props> = ({ spec, figure, onSubmit }) => {
  const [picked, setPicked] = useState<Pt[]>([]);
  const { gw, gh, taps } = spec;
  const sw = Math.max(gw, gh) / 140;

  const tap = (p: Pt) => {
    setPicked((cur) => {
      if (cur.some((q) => q.x === p.x && q.y === p.y)) return cur.filter((q) => !(q.x === p.x && q.y === p.y));
      if (cur.length >= taps) return cur;
      return [...cur, p];
    });
  };

  const dots: Pt[] = [];
  for (let x = 0; x <= gw; x++) for (let y = 0; y <= gh; y++) dots.push({ x, y });

  // かいている途中の線を見せる。自分の手が図にどう反映されるかが見えないと作図にならない。
  const preview: [Pt, Pt][] = [];
  if (spec.connect === 'lineFrom' && spec.base && picked[0]) {
    preview.push([spec.base, picked[0]]);
  }
  if (spec.connect === 'polygon' && spec.given) {
    const chain = [...spec.given, ...picked];
    for (let i = 0; i < chain.length - 1; i++) preview.push([chain[i], chain[i + 1]]);
    if (picked.length === taps) preview.push([chain[chain.length - 1], chain[0]]);
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-[28px] shadow-xl p-3">
        <svg viewBox={`-1.2 -1.2 ${gw + 2.4} ${gh + 2.4}`} className="w-full" style={{ touchAction: 'manipulation' }}>
          {/* 方眼 */}
          <g stroke="var(--c-line)" strokeWidth={sw * 0.6}>
            {Array.from({ length: gw + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i} y1={0} x2={i} y2={gh} />
            ))}
            {Array.from({ length: gh + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i} x2={gw} y2={i} />
            ))}
          </g>

          {/* 問題として与えられた直線（基準の直線「あ」など） */}
          {figure?.lines?.map((l) => {
            const d = dirOf(l.a, l.b);
            const u = scale(d, 1 / (len(d) || 1));
            const e = l.extend ?? 0;
            const ea = sub(l.a, scale(u, e));
            const eb = add(l.b, scale(u, e));
            return (
              <g key={`fig-${l.id}`}>
                {e > 0 && (
                  <line x1={ea.x} y1={ea.y} x2={eb.x} y2={eb.y} stroke="var(--c-content)" strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 2}`} opacity={0.5} />
                )}
                <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="var(--c-content)" strokeWidth={sw * 2} strokeLinecap="round" />
                {l.label && (
                  <text
                    x={l.b.x + (l.b.x >= l.a.x ? 0.7 : -0.7)}
                    y={l.b.y + (l.b.y >= l.a.y ? 0.9 : -0.4)}
                    fontSize={0.9}
                    fontWeight={800}
                    fill="var(--c-content)"
                    textAnchor="middle"
                  >
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* 問題として与えられた点のラベル（点A・頂点ア など） */}
          {figure?.points?.map((pt) => (
            pt.label ? (
              <text key={`lab-${pt.id}`} x={pt.at.x} y={pt.at.y - 0.55} fontSize={0.9} fontWeight={800} fill="var(--c-fig-accent2)" textAnchor="middle">
                {pt.label}
              </text>
            ) : null
          ))}

          {/* すでに置かれている辺・直線 */}
          {spec.connect === 'polygon' && spec.given && spec.given.length >= 2 && (
            <g stroke="var(--c-fig-accent)" strokeWidth={sw * 2} strokeLinecap="round" fill="none">
              {spec.given.slice(0, -1).map((p, i) => (
                <line key={i} x1={p.x} y1={p.y} x2={spec.given![i + 1].x} y2={spec.given![i + 1].y} />
              ))}
            </g>
          )}

          {/* かいている途中の線 */}
          <g stroke="var(--c-fig-accent2)" strokeWidth={sw * 2} strokeLinecap="round">
            {preview.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </g>

          {/* 通過点（点A など） */}
          {spec.base && <circle cx={spec.base.x} cy={spec.base.y} r={sw * 3.4} fill="var(--c-fig-accent2)" />}
          {spec.given?.map((p, i) => (
            <circle key={`g${i}`} cx={p.x} cy={p.y} r={sw * 3.4} fill="var(--c-fig-accent)" />
          ))}

          {/* タップできる格子点 */}
          {dots.map((p) => {
            const isPicked = picked.some((q) => q.x === p.x && q.y === p.y);
            return (
              <g key={`${p.x}-${p.y}`}>
                <circle cx={p.x} cy={p.y} r={sw * 1.6} fill="var(--c-faint)" opacity={0.5} />
                {isPicked && <circle cx={p.x} cy={p.y} r={sw * 3.6} fill="var(--c-fig-accent2)" />}
                {/* 指でも押しやすいよう、見た目より大きい透明の当たり判定を重ねる */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={0.45}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => tap(p)}
                  role="button"
                  aria-label={`よこ ${p.x}、たて ${p.y} の 点`}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-muted flex-1">
          {spec.guide}（あと {Math.max(0, taps - picked.length)} こ）
        </p>
        <button
          onClick={() => setPicked([])}
          disabled={picked.length === 0}
          className="px-4 py-3 rounded-2xl bg-surface border-2 border-line text-muted font-black disabled:opacity-40 flex items-center gap-2"
        >
          <Undo2 size={18} /> けす
        </button>
      </div>

      <button
        onClick={() => onSubmit(picked)}
        disabled={picked.length !== taps}
        className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
          picked.length === taps ? 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
        }`}
      >
        これで かけた！
      </button>
    </div>
  );
};
