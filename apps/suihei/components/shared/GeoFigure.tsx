// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/GeoFigure.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 図形の描画（SVG）。FigureSpec だけを受け取って描く純粋な表示コンポーネント。
 *
 * 図形単元なので「問題文だけで出さない」が絶対条件。全モジュールがこれを通して図を出す。
 * 色は index.css のセマンティックトークン（currentColor 経由）を使い、全テーマで線が見えるようにする。
 */
import React from 'react';
import { FigAngleMark, FigureSpec, FigLine, FigPoly, Pt } from '../../types';
import { add, dirOf, len, mid, scale, sub } from '../../lib/geometry';

interface Props {
  spec: FigureSpec;
  /** 図の高さ（px）。横幅は親に合わせて伸びる。 */
  height?: number;
  className?: string;
}

/** 線の色トークン → SVG の stroke に使うCSS変数 */
const STROKE: Record<string, string> = {
  base: 'var(--c-content)',
  accent: 'var(--c-fig-accent)',
  accent2: 'var(--c-fig-accent2)',
  muted: 'var(--c-faint)',
};

const FILL: Record<string, string> = {
  none: 'none',
  accent: 'var(--c-fig-fill)',
  accent2: 'var(--c-fig-fill2)',
  muted: 'var(--c-surface-3)',
};

/** 線分を両方向に n だけ延長した端点を返す（「延長すると交わる」を見せるため）。 */
function extended(l: FigLine): [Pt, Pt] {
  const d = dirOf(l.a, l.b);
  const u = scale(d, 1 / (len(d) || 1));
  const e = l.extend ?? 0;
  return [sub(l.a, scale(u, e)), add(l.b, scale(u, e))];
}

/** 頂点 i に直角マーク（小さな四角）を描くためのパス。 */
function rightAngleMark(poly: Pt[], i: number, size: number): string {
  const p = poly[i];
  const a = poly[(i + 3) % poly.length];
  const b = poly[(i + 1) % poly.length];
  const ua = scale(sub(a, p), size / (len(sub(a, p)) || 1));
  const ub = scale(sub(b, p), size / (len(sub(b, p)) || 1));
  const p1 = add(p, ua);
  const p2 = add(add(p, ua), ub);
  const p3 = add(p, ub);
  return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`;
}

/** 辺 i の中点から外向きに少し離した位置（辺ラベルを置く場所）。 */
function edgeLabelPos(poly: Pt[], i: number, off: number): Pt {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const m = mid(a, b);
  const d = sub(b, a);
  // 外向き法線（重心と反対側）
  const n = { x: -d.y, y: d.x };
  const c = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  const cen = scale(c, 1 / poly.length);
  const outward = sub(m, cen);
  const sign = n.x * outward.x + n.y * outward.y >= 0 ? 1 : -1;
  return add(m, scale(n, (sign * off) / (len(n) || 1)));
}

/** 頂点 i の内側に少し寄せた位置（角ラベル・頂点名を置く場所）。 */
function vertexInnerPos(poly: Pt[], i: number, off: number): Pt {
  const p = poly[i];
  const c = poly.reduce((acc, q) => add(acc, q), { x: 0, y: 0 });
  const cen = scale(c, 1 / poly.length);
  const d = sub(cen, p);
  return add(p, scale(d, off / (len(d) || 1)));
}

function vertexOuterPos(poly: Pt[], i: number, off: number): Pt {
  const p = poly[i];
  const c = poly.reduce((acc, q) => add(acc, q), { x: 0, y: 0 });
  const cen = scale(c, 1 / poly.length);
  const d = sub(p, cen);
  return add(p, scale(d, off / (len(d) || 1)));
}

/** 辺 i に等長マーク（斜線）を n 本描く。「向かい合う辺の長さが等しい」を図で示すのに使う。 */
const Ticks: React.FC<{ poly: Pt[]; i: number; n: number; sw: number }> = ({ poly, i, n, sw }) => {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const m = mid(a, b);
  const d = sub(b, a);
  const u = scale(d, 1 / (len(d) || 1));
  const nor = { x: -u.y, y: u.x };
  const half = 1.6;
  const gap = 1.4;
  return (
    <g stroke={STROKE.base} strokeWidth={sw} strokeLinecap="round">
      {Array.from({ length: n }, (_, k) => {
        const c = add(m, scale(u, (k - (n - 1) / 2) * gap));
        const p1 = add(c, scale(nor, half));
        const p2 = sub(c, scale(nor, half));
        return <line key={k} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
      })}
    </g>
  );
};

export const GeoFigure: React.FC<Props> = ({ spec, height = 240, className = '' }) => {
  const { w, h } = spec;
  // viewBox の大きさに対する相対的な線幅。図の大小で見た目の太さが変わらないようにする。
  const sw = Math.max(w, h) / 140;
  const fs = Math.max(w, h) / 22;

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ height, maxWidth: '100%' }}
        role="img"
      >
        {/* 延長の点線が図の枠からはみ出して、ヘッダーや問題文の上に伸びてしまうのを防ぐ。
            「のばすと交わる」ことは 枠のふちまで点線が届いていれば十分に伝わる。 */}
        <defs>
          <clipPath id={`clip-${w}-${h}`}>
            <rect x={0} y={0} width={w} height={h} />
          </clipPath>
        </defs>
        {/* 方眼 */}
        {spec.grid && (
          <g stroke="var(--c-line)" strokeWidth={sw * 0.5}>
            {Array.from({ length: Math.floor(w) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i} y1={0} x2={i} y2={h} />
            ))}
            {Array.from({ length: Math.floor(h) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i} x2={w} y2={i} />
            ))}
          </g>
        )}

        {/* 多角形 */}
        {spec.polys?.map((p) => (
          <PolyView key={p.id} p={p} sw={sw} fs={fs} />
        ))}

        {/* 直線 */}
        {spec.lines?.map((l) => {
          const [ea, eb] = extended(l);
          const stroke = STROKE[l.color ?? 'base'];
          return (
            <g key={l.id}>
              {l.extend ? (
                <line
                  x1={ea.x}
                  y1={ea.y}
                  x2={eb.x}
                  y2={eb.y}
                  stroke={stroke}
                  strokeWidth={sw * 0.8}
                  strokeDasharray={`${sw * 2} ${sw * 2}`}
                  opacity={0.55}
                  clipPath={`url(#clip-${w}-${h})`}
                />
              ) : null}
              <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={stroke} strokeWidth={sw * 1.6} strokeLinecap="round" />
              {l.label && (
                <text
                  x={l.b.x + (l.b.x >= l.a.x ? fs * 0.5 : -fs * 0.5)}
                  y={l.b.y + (l.b.y >= l.a.y ? fs * 0.9 : -fs * 0.3)}
                  fontSize={fs}
                  fontWeight={800}
                  fill={stroke}
                  textAnchor="middle"
                >
                  {l.label}
                </text>
              )}
            </g>
          );
        })}

        {/* 角のマーク */}
        {spec.angleMarks?.map((m, i) => (
          <AngleMarkView key={`am${i}`} m={m} sw={sw} fs={fs} />
        ))}

        {/* 点 */}
        {spec.points?.map((pt) => (
          <g key={pt.id}>
            <circle cx={pt.at.x} cy={pt.at.y} r={sw * 2.4} fill={STROKE[pt.color ?? 'accent2']} />
            {pt.label && (
              <text x={pt.at.x} y={pt.at.y - fs * 0.6} fontSize={fs} fontWeight={800} fill={STROKE[pt.color ?? 'accent2']} textAnchor="middle">
                {pt.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {spec.note && <p className="text-xs text-faint font-bold mt-1">{spec.note}</p>}
    </div>
  );
};

/** 角の円弧とラベル。ラベルは2方向のちょうど真ん中に置く（どの角かが一目でわかる）。 */
const AngleMarkView: React.FC<{ m: FigAngleMark; sw: number; fs: number }> = ({ m, sw, fs }) => {
  const unit = (v: Pt) => scale(v, 1 / (len(v) || 1));
  const u1 = unit(m.d1);
  const u2 = unit(m.d2);
  const r = fs * 1.15;
  const p1 = add(m.at, scale(u1, r));
  const p2 = add(m.at, scale(u2, r));
  // 円弧の向き（短いほうの角を通る）を外積の符号で決める
  const sweep = u1.x * u2.y - u1.y * u2.x > 0 ? 1 : 0;
  const bisect = unit(add(u1, u2));
  const lp = add(m.at, scale(bisect, r * 1.75));
  const color = STROKE[m.color ?? 'accent2'];
  return (
    <g>
      <path d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 0 ${sweep} ${p2.x} ${p2.y}`} fill="none" stroke={color} strokeWidth={sw * 1.1} />
      <text x={lp.x} y={lp.y} fontSize={fs} fontWeight={900} fill={color} textAnchor="middle" dominantBaseline="middle">
        {m.label}
      </text>
    </g>
  );
};

const PolyView: React.FC<{ p: FigPoly; sw: number; fs: number }> = ({ p, sw, fs }) => {
  const d = p.pts.map((q) => `${q.x},${q.y}`).join(' ');
  return (
    <g>
      <polygon points={d} fill={FILL[p.fill ?? 'accent']} stroke={STROKE.base} strokeWidth={sw * 1.6} strokeLinejoin="round" />

      {/* 対角線 */}
      {p.diagonals?.map((k) => {
        const a = p.pts[k];
        const b = p.pts[(k + 2) % 4];
        return <line key={`d${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={STROKE.accent2} strokeWidth={sw * 1.2} strokeDasharray={`${sw * 2.5} ${sw * 1.5}`} />;
      })}

      {/* 直角マーク */}
      {p.rightAngleAt?.map((i) => (
        <path key={`r${i}`} d={rightAngleMark(p.pts, i, Math.max(2.4, fs * 0.45))} fill="none" stroke={STROKE.base} strokeWidth={sw} />
      ))}

      {/* 等長マーク */}
      {p.tickMarks?.map((n, i) => (n > 0 ? <Ticks key={`t${i}`} poly={p.pts} i={i} n={n} sw={sw} /> : null))}

      {/* 辺の長さラベル */}
      {p.edgeLabels?.map((lab, i) => {
        if (!lab) return null;
        const pos = edgeLabelPos(p.pts, i, fs * 0.85);
        return (
          <text key={`e${i}`} x={pos.x} y={pos.y} fontSize={fs * 0.92} fontWeight={800} fill={STROKE.accent} textAnchor="middle" dominantBaseline="middle">
            {lab}
          </text>
        );
      })}

      {/* 角ラベル */}
      {p.angleLabels?.map((lab, i) => {
        if (!lab) return null;
        const pos = vertexInnerPos(p.pts, i, fs * 1.5);
        return (
          <text key={`a${i}`} x={pos.x} y={pos.y} fontSize={fs * 0.92} fontWeight={800} fill={STROKE.accent2} textAnchor="middle" dominantBaseline="middle">
            {lab}
          </text>
        );
      })}

      {/* 頂点名 */}
      {p.vertexLabels?.map((lab, i) => {
        if (!lab) return null;
        const pos = vertexOuterPos(p.pts, i, fs * 0.95);
        return (
          <text key={`v${i}`} x={pos.x} y={pos.y} fontSize={fs} fontWeight={900} fill={STROKE.base} textAnchor="middle" dominantBaseline="middle">
            {lab}
          </text>
        );
      })}

      {/* 図形名（あ・い・う・え／正方形 など）。
          長い名前は図形の線と重なって読めなくなるので、labelBelow で図の下に置ける。 */}
      {p.label && (
        <text
          x={p.pts.reduce((s, q) => s + q.x, 0) / p.pts.length}
          y={
            p.labelBelow
              ? Math.max(...p.pts.map((q) => q.y)) + fs * 1.15
              : p.pts.reduce((s, q) => s + q.y, 0) / p.pts.length
          }
          fontSize={p.labelBelow ? fs * 0.95 : fs * 1.3}
          fontWeight={900}
          fill={STROKE.base}
          textAnchor="middle"
          dominantBaseline="middle"
          opacity={p.labelBelow ? 1 : 0.75}
        >
          {p.label}
        </text>
      )}
    </g>
  );
};
