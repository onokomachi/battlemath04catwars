// このファイルは単元アプリ syo4-tyokuhoutaitorippoutai の src/components/shared/Figure.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 問題の図。見取図（直方体・立方体）・展開図・平面の点・厚紙・表。
 * 色はテーマのトークン（var(--c-content) など）に追従する。
 */
import React from 'react';
import type { Figure as Fig, LabeledPt } from '../../lib/question';
import {
  EDGES, FACES, VERTS, edgeName, hiddenVertex, vertexAt, netLines,
  type Dims, type FaceId, type Rect, type VName,
} from '../../lib/solid';

/* ================================================================== */
/* 見取図の計算（斜めから見た図）                                          */
/* ================================================================== */

const K = 0.55;          // 奥行きを ちぢめる割合
const ANG = (35 * Math.PI) / 180;

export interface CuboidGeo {
  P: Record<VName, { x: number; y: number }>;
  viewBox: string;
  unit: number;
  hidden: VName;
}

/** 直方体の頂点を画面の座標にする。大きさに合わせて 1cm の長さを決める */
export function cuboidGeometry(dims: Dims, view: 'right' | 'left', pad = 2.4): CuboidGeo {
  const span = Math.max(dims[0] + dims[1] * K * Math.cos(ANG), dims[2] + dims[1] * K * Math.sin(ANG));
  const unit = 10 / span;  // 図全体が だいたい 10 の大きさに入るように
  const sgn = view === 'right' ? 1 : -1;
  const P = {} as Record<VName, { x: number; y: number }>;
  for (const v of VERTS) {
    const [x, y, z] = vertexAt(v, dims);
    P[v] = { x: (x + sgn * y * K * Math.cos(ANG)) * unit, y: (-z - y * K * Math.sin(ANG)) * unit };
  }
  const xs = Object.values(P).map((p) => p.x), ys = Object.values(P).map((p) => p.y);
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  return { P, viewBox: `${minX} ${minY} ${w} ${h}`, unit, hidden: hiddenVertex(view) };
}

const faceCenter = (geo: CuboidGeo, id: FaceId) => {
  const name = (FACES.find((f) => f.id === id) as (typeof FACES)[number]).name.split('') as VName[];
  return { x: name.reduce((a, v) => a + geo.P[v].x, 0) / 4, y: name.reduce((a, v) => a + geo.P[v].y, 0) / 4 };
};

const STROKE = 0.12;

export const CuboidView: React.FC<{ f: Extract<Fig, { type: 'cuboid' }> }> = ({ f }) => {
  const geo = cuboidGeometry(f.dims, f.view);
  const { P } = geo;
  const hl = new Set(f.highlight ?? []);
  const pts = (vs: VName[]) => vs.map((v) => `${P[v].x},${P[v].y}`).join(' ');
  const center = { x: (P.A.x + P.G.x) / 2, y: (P.A.y + P.G.y) / 2 };
  const out = (v: VName, d = 0.75) => {
    const dx = P[v].x - center.x, dy = P[v].y - center.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: P[v].x + (dx / L) * d, y: P[v].y + (dy / L) * d + 0.3 };
  };
  const visibleFaces: FaceId[] = f.view === 'right' ? ['front', 'top', 'right'] : ['front', 'top', 'left'];
  const [L, W, H] = f.dims;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return (
    <svg viewBox={geo.viewBox} className="w-full max-w-[300px] max-h-60 mx-auto block" data-testid="fig-cuboid">
      {/* 見える面に うすい色 */}
      {visibleFaces.map((id) => {
        const name = (FACES.find((x) => x.id === id) as (typeof FACES)[number]).name.split('') as VName[];
        return <polygon key={id} points={pts(name)} fill={f.shadeFace === id ? 'var(--c-brand)' : 'var(--c-brand)'} fillOpacity={f.shadeFace === id ? 0.3 : 0.07} stroke="none" />;
      })}
      {f.shadeFace && !visibleFaces.includes(f.shadeFace) && (
        <polygon points={pts((FACES.find((x) => x.id === f.shadeFace) as (typeof FACES)[number]).name.split('') as VName[])} fill="var(--c-brand)" fillOpacity={0.22} stroke="none" />
      )}
      {/* 辺 */}
      {EDGES.map((e) => {
        const name = edgeName(e);
        const hidden = !f.allSolid && e.includes(geo.hidden);
        const on = hl.has(name) || hl.has(`${e[1]}${e[0]}`);
        return (
          <line key={name} x1={P[e[0]].x} y1={P[e[0]].y} x2={P[e[1]].x} y2={P[e[1]].y}
            stroke={on ? '#f43f5e' : 'var(--c-content)'} strokeWidth={on ? STROKE * 2.6 : STROKE}
            strokeDasharray={hidden ? `${STROKE * 3} ${STROKE * 3}` : undefined} strokeLinecap="round" />
        );
      })}
      {/* リボン */}
      {f.ribbon && (
        <g stroke="#e11d48" strokeWidth={STROKE * 3} fill="none" strokeLinecap="round">
          <line {...xy2(lerp(P.A, P.B, 0.5), lerp(P.D, P.C, 0.5))} />
          <line {...xy2(lerp(P.A, P.D, 0.5), lerp(P.B, P.C, 0.5))} />
          <line {...xy2(lerp(P.A, P.B, 0.5), lerp(P.E, P.F, 0.5))} />
          <line {...xy2(lerp(P.B, P.C, 0.5), lerp(P.F, P.G, 0.5))} />
          <circle cx={(P.A.x + P.C.x) / 2} cy={(P.A.y + P.C.y) / 2 - 0.5} r={0.5} />
        </g>
      )}
      {/* 面の記号 */}
      {f.faceLabels && (Object.entries(f.faceLabels) as [FaceId, string][]).map(([id, lab]) => {
        const c = faceCenter(geo, id);
        return (
          <g key={id}>
            <circle cx={c.x} cy={c.y} r={0.55} fill="var(--c-surface)" stroke="var(--c-content)" strokeWidth={STROKE * 0.8} />
            <text x={c.x} y={c.y + 0.32} fontSize={0.8} fontWeight={900} textAnchor="middle" fill="var(--c-content)">{lab}</text>
          </g>
        );
      })}
      {/* 頂点の記号 */}
      {f.letters && VERTS.map((v) => {
        const p = out(v);
        return <text key={v} x={p.x} y={p.y} fontSize={0.85} fontWeight={900} textAnchor="middle" fill={f.markVertex === v ? '#f43f5e' : 'var(--c-content)'}>{v}</text>;
      })}
      {f.markVertex && <circle cx={P[f.markVertex as VName].x} cy={P[f.markVertex as VName].y} r={0.22} fill="#f43f5e" />}
      {/* 長さ */}
      {f.dimLabels && (
        <g fontSize={0.8} fontWeight={800} fill="var(--c-muted)" textAnchor="middle">
          <text x={(P.E.x + P.F.x) / 2} y={P.E.y + 1.1}>{fmtCm(L)}</text>
          <text x={P.E.x + (f.view === 'right' ? -1.1 : -1.1)} y={(P.A.y + P.E.y) / 2 + 0.3}>{fmtCm(H)}</text>
          {f.view === 'right'
            ? <text x={(P.A.x + P.D.x) / 2 - 1.0} y={(P.A.y + P.D.y) / 2}>{fmtCm(W)}</text>
            : <text x={(P.B.x + P.C.x) / 2 + 1.0} y={(P.B.y + P.C.y) / 2}>{fmtCm(W)}</text>}
        </g>
      )}
    </svg>
  );
};

const xy2 = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
const fmtCm = (n: number) => `${n}cm`;

/* ================================================================== */
/* 展開図                                                                */
/* ================================================================== */

/** 方眼の上に 展開図を かく SVG の中身（PaintStep でも使う） */
export const NetSvgBody: React.FC<{ rects: Rect[]; sw: number; color?: string; faceLabels?: string[]; shade?: number[] }> = ({ rects, sw, color = 'var(--c-content)', faceLabels, shade }) => {
  const { solid, dashed } = netLines(rects);
  return (
    <g>
      {rects.map((r, i) => (
        <rect key={`f${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--c-brand)" fillOpacity={shade?.includes(i) ? 0.32 : 0.1} />
      ))}
      <g stroke={color} strokeWidth={sw} strokeLinecap="round">
        {solid.map((s, i) => <line key={`s${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} />)}
      </g>
      <g stroke={color} strokeWidth={sw * 0.7} strokeDasharray={`${sw * 1.6} ${sw * 1.6}`} opacity={0.8}>
        {dashed.map((s, i) => <line key={`d${i}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} />)}
      </g>
      {faceLabels?.map((lab, i) => {
        const r = rects[i];
        if (!r || !lab) return null;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(0.36, Math.min(r.w, r.h) * 0.36);
        return (
          <g key={`l${i}`}>
            <circle cx={cx} cy={cy} r={rad} fill="var(--c-surface)" stroke={color} strokeWidth={sw * 0.6} />
            <text x={cx} y={cy + rad * 0.42} fontSize={rad * 1.25} fontWeight={900} textAnchor="middle" fill="var(--c-content)">{lab}</text>
          </g>
        );
      })}
    </g>
  );
};

export const GridLines: React.FC<{ x0?: number; y0?: number; w: number; h: number; sw: number }> = ({ x0 = 0, y0 = 0, w, h, sw }) => (
  <g stroke="var(--c-line)" strokeWidth={sw * 0.5}>
    {Array.from({ length: w + 1 }, (_, i) => <line key={`v${i}`} x1={x0 + i} y1={y0} x2={x0 + i} y2={y0 + h} />)}
    {Array.from({ length: h + 1 }, (_, i) => <line key={`h${i}`} x1={x0} y1={y0 + i} x2={x0 + w} y2={y0 + i} />)}
  </g>
);

const NetView: React.FC<{ f: Extract<Fig, { type: 'net' }> }> = ({ f }) => {
  const minX = Math.min(...f.rects.map((r) => r.x)), minY = Math.min(...f.rects.map((r) => r.y));
  const maxX = Math.max(...f.rects.map((r) => r.x + r.w)), maxY = Math.max(...f.rects.map((r) => r.y + r.h));
  const w = maxX - minX, h = maxY - minY;
  const pad = f.points ? 0.9 : 0.5;
  const sw = Math.max(w, h) / 110;
  // 点の記号は、まわりのマスと反対の向きに出す
  const owner = new Set<string>();
  f.rects.forEach((r) => { for (let a = 0; a < r.w; a++) for (let b = 0; b < r.h; b++) owner.add(`${r.x + a},${r.y + b}`); });
  const labelPos = (p: LabeledPt) => {
    let vx = 0, vy = 0;
    for (const [cx, cy] of [[p.x - 1, p.y - 1], [p.x, p.y - 1], [p.x - 1, p.y], [p.x, p.y]] as [number, number][]) {
      if (owner.has(`${cx},${cy}`)) { vx += cx + 0.5 - p.x; vy += cy + 0.5 - p.y; }
    }
    const L = Math.hypot(vx, vy) || 1;
    return { x: p.x - (vx / L) * 0.42, y: p.y - (vy / L) * 0.42 + 0.14 };
  };
  const hp = f.highlightPoint !== undefined ? f.points?.[f.highlightPoint] : undefined;
  const he = f.highlightEdge && f.points ? [f.points[f.highlightEdge[0]], f.points[f.highlightEdge[1]]] : null;
  return (
    <div data-testid="fig-net">
      <svg viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} className="w-full max-w-md mx-auto block">
        {f.grid && <GridLines x0={minX - Math.floor(pad)} y0={minY - Math.floor(pad)} w={w + Math.floor(pad) * 2} h={h + Math.floor(pad) * 2} sw={sw} />}
        <NetSvgBody rects={f.rects} sw={sw * 2.2} faceLabels={f.faceLabels} shade={f.shade} />
        {f.lines && (
          <g stroke="#e11d48" strokeWidth={sw * 3} strokeLinecap="round">
            {f.lines.map((s, i) => <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} />)}
          </g>
        )}
        {he && he[0] && he[1] && <line x1={he[0].x} y1={he[0].y} x2={he[1].x} y2={he[1].y} stroke="#f43f5e" strokeWidth={sw * 5} strokeLinecap="round" />}
        {f.points?.map((p, i) => {
          const q = labelPos(p);
          const on = hp === p || (he && (he[0] === p || he[1] === p));
          return (
            <g key={i}>
              {on && <circle cx={p.x} cy={p.y} r={0.09} fill="#f43f5e" />}
              <text x={q.x} y={q.y} fontSize={0.38} fontWeight={900} textAnchor="middle" fill={on ? '#f43f5e' : 'var(--c-content)'}>{p.label}</text>
            </g>
          );
        })}
      </svg>
      {f.unitLabel && <div className="text-xs font-bold text-muted text-right">方眼の 1マスは {f.unitLabel}</div>}
    </div>
  );
};

/* ================================================================== */
/* 平面の点の位置                                                         */
/* ================================================================== */

/** 方眼と目もり（A がもとの点。右へ 横、上へ たて） */
export const PlaneSvg: React.FC<{
  w: number; h: number; points: LabeledPt[];
  onTap?: (x: number, y: number) => void;
  picked?: { x: number; y: number } | null;
  pickedLabel?: string;
}> = ({ w, h, points, onTap, picked, pickedLabel }) => {
  const sw = 0.04;
  const X = (x: number) => x, Y = (y: number) => h - y;
  const dots: { x: number; y: number }[] = [];
  if (onTap) for (let x = 0; x <= w; x++) for (let y = 0; y <= h; y++) dots.push({ x, y });
  return (
    <svg viewBox={`-1.6 -1.2 ${w + 4.6} ${h + 2.8}`} className="w-full max-w-sm mx-auto block" style={{ touchAction: 'manipulation' }} data-testid="fig-plane">
      <GridLines w={w} h={h} sw={sw * 2} />
      {/* 軸と目もり */}
      <line x1={0} y1={h} x2={w + 0.6} y2={h} stroke="var(--c-content)" strokeWidth={sw} />
      <line x1={0} y1={h} x2={0} y2={-0.6} stroke="var(--c-content)" strokeWidth={sw} />
      {Array.from({ length: w }, (_, i) => <text key={`x${i}`} x={X(i + 1)} y={h + 0.75} fontSize={0.5} fontWeight={800} textAnchor="middle" fill="var(--c-content)">{i + 1}</text>)}
      {Array.from({ length: h }, (_, i) => <text key={`y${i}`} x={-0.45} y={Y(i + 1) + 0.18} fontSize={0.5} fontWeight={800} textAnchor="middle" fill="var(--c-content)">{i + 1}</text>)}
      <text x={w + 0.9} y={h + 0.2} fontSize={0.45} fontWeight={800} fill="var(--c-muted)">横(cm)</text>
      <text x={-0.2} y={-0.75} fontSize={0.45} fontWeight={800} fill="var(--c-muted)">たて(cm)</text>
      {points.map((p) => (
        <g key={p.label}>
          <circle cx={X(p.x)} cy={Y(p.y)} r={0.13} fill="var(--c-content)" />
          <text x={X(p.x) + (p.x === 0 ? -0.5 : 0.32)} y={Y(p.y) + (p.y === 0 ? 0.62 : -0.22)} fontSize={0.55} fontWeight={900} fill="var(--c-content)">{p.label}</text>
        </g>
      ))}
      {picked && (
        <g>
          <circle cx={X(picked.x)} cy={Y(picked.y)} r={0.18} fill="#f43f5e" />
          {pickedLabel && <text x={X(picked.x) + 0.3} y={Y(picked.y) - 0.25} fontSize={0.55} fontWeight={900} fill="#f43f5e">{pickedLabel}</text>}
        </g>
      )}
      {dots.map((d) => (
        <circle key={`${d.x},${d.y}`} cx={X(d.x)} cy={Y(d.y)} r={0.42} fill="transparent" style={{ cursor: 'pointer' }}
          onClick={() => onTap?.(d.x, d.y)} role="button" aria-label={`横 ${d.x}、たて ${d.y} の 点`} data-testid={`pt-${d.x}-${d.y}`} />
      ))}
    </svg>
  );
};

/* ================================================================== */
/* 厚紙・表                                                               */
/* ================================================================== */

const Cards: React.FC<{ f: Extract<Fig, { type: 'cards' }> }> = ({ f }) => {
  const max = Math.max(...f.cards.flatMap((c) => [c.w, c.h]));
  return (
    <div className="flex flex-wrap justify-center gap-3" data-testid="fig-cards">
      {f.cards.map((c) => (
        <div key={c.label} className="flex flex-col items-center">
          <div className="text-xs font-black text-muted mb-0.5">{c.w}cm</div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-black text-muted">{c.h}cm</span>
            <div className="grid place-items-center rounded-md bg-emerald-100 border-2 border-emerald-500 text-emerald-800 font-black"
              style={{ width: (c.w / max) * 64, height: (c.h / max) * 64 }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

const Table: React.FC<{ f: Extract<Fig, { type: 'table' }> }> = ({ f }) => (
  <div className="flex justify-center" data-testid="fig-table">
    <table className="border-collapse text-center">
      <thead>
        <tr>{f.headers.map((h, i) => <th key={i} className="border border-line bg-surface-2 px-4 py-2 text-sm font-black text-muted">{h}</th>)}</tr>
      </thead>
      <tbody>
        {f.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={`border border-line px-4 py-2 font-black tabular-nums ${j === 0 ? 'bg-surface-2 text-muted' : 'text-content'}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const FigureView: React.FC<{ figure: Fig }> = ({ figure }) => {
  switch (figure.type) {
    case 'cuboid': return <CuboidView f={figure} />;
    case 'net': return <NetView f={figure} />;
    case 'plane': return <PlaneSvg w={figure.w} h={figure.h} points={figure.points} />;
    case 'cards': return <Cards f={figure} />;
    case 'table': return <Table f={figure} />;
  }
};
