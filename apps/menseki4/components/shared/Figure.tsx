// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/components/shared/Figure.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 問題の図。方眼（grid）・長方形や組み合わせた形（shape）・表（table）。
 * 色はテーマのトークン（--color-line など）に追従する。
 *
 * 方眼は、マスをタップすると ○ の しるしが つく（数える道具。採点には使わない）。
 */
import React, { useState } from 'react';
import type { Figure as Fig, GridCell, Poly } from '../../lib/question';

/* ------------------------------------------------------------------ */
/* 方眼                                                                  */
/* ------------------------------------------------------------------ */

const S = 30; // 1マス（1cm）の大きさ（px）

function cellPoints(c: GridCell): string {
  const x = c.x * S, y = c.y * S;
  const TL = `${x},${y}`, TR = `${x + S},${y}`, BL = `${x},${y + S}`, BR = `${x + S},${y + S}`;
  switch (c.half) {
    case 'sw': return [BL, TL, BR].join(' ');
    case 'se': return [BR, TR, BL].join(' ');
    case 'nw': return [TL, TR, BL].join(' ');
    case 'ne': return [TR, TL, BR].join(' ');
    default: return [TL, TR, BR, BL].join(' ');
  }
}

const GridFig: React.FC<{ f: Extract<Fig, { type: 'grid' }> }> = ({ f }) => {
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const W = f.cols * S, H = f.rows * S;
  const PADL = f.showUnit ? 34 : 4, PADT = f.showUnit ? 22 : 4;
  const toggle = (x: number, y: number) => setMarks((m) => {
    const n = new Set(m);
    const k = `${x},${y}`;
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  return (
    <svg viewBox={`0 0 ${W + PADL + 4} ${H + PADT + 4}`} className="w-full max-w-lg mx-auto select-none" data-testid="fig-grid" role="img" aria-label="方眼の図">
      <g transform={`translate(${PADL},${PADT})`}>
        {f.shapes.map((sh, i) => (
          <g key={i}>
            {sh.cells.map((c, j) => <polygon key={j} points={cellPoints(c)} fill={sh.color ?? '#fdba74'} />)}
          </g>
        ))}
        {/* 方眼の線 */}
        {Array.from({ length: f.cols + 1 }, (_, i) => <line key={`v${i}`} x1={i * S} y1={0} x2={i * S} y2={H} stroke="#38bdf8" strokeWidth={0.8} opacity={0.7} />)}
        {Array.from({ length: f.rows + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * S} x2={W} y2={i * S} stroke="#38bdf8" strokeWidth={0.8} opacity={0.7} />)}
        {/* ななめ半分の線を はっきり */}
        {f.shapes.flatMap((sh, i) => sh.cells.filter((c) => c.half).map((c, j) => {
          const x = c.x * S, y = c.y * S;
          const d = c.half === 'sw' || c.half === 'ne' ? [x, y, x + S, y + S] : [x + S, y, x, y + S];
          return <line key={`d${i}-${j}`} x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke="#9a3412" strokeWidth={1.6} />;
        }))}
        {/* 記号（あ・い）は、形の中心に いちばん近い 全部のマスに書く */}
        {f.shapes.map((sh, i) => {
          if (!sh.name) return null;
          const full = sh.cells.filter((c) => !c.half);
          const cx = full.reduce((a, c) => a + c.x, 0) / full.length, cy = full.reduce((a, c) => a + c.y, 0) / full.length;
          const best = full.reduce((b, c) => ((c.x - cx) ** 2 + (c.y - cy) ** 2 < (b.x - cx) ** 2 + (b.y - cy) ** 2 ? c : b), full[0]!);
          return (
            <g key={`n${i}`}>
              <circle cx={best.x * S + S / 2} cy={best.y * S + S / 2} r={10} fill="white" stroke="#334155" strokeWidth={1} />
              <text x={best.x * S + S / 2} y={best.y * S + S / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={900} fill="#334155">{sh.name}</text>
            </g>
          );
        })}
        {/* しるし */}
        {[...marks].map((k) => {
          const [x, y] = k.split(',').map(Number) as [number, number];
          return <circle key={`m${k}`} cx={x * S + S / 2} cy={y * S + S / 2} r={6} fill="none" stroke="#dc2626" strokeWidth={2.4} />;
        })}
        {/* タップ領域 */}
        {Array.from({ length: f.cols * f.rows }, (_, i) => {
          const x = i % f.cols, y = Math.floor(i / f.cols);
          return <rect key={`t${i}`} x={x * S} y={y * S} width={S} height={S} fill="transparent" onClick={() => toggle(x, y)} style={{ cursor: 'pointer' }} data-testid={`grid-cell-${x}-${y}`} />;
        })}
        {f.showUnit && (
          <g pointerEvents="none">
            <text x={S / 2} y={-6} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--color-content)">1cm</text>
            <text x={-6} y={S / 2 + 4} textAnchor="end" fontSize={11} fontWeight={800} fill="var(--color-content)">1cm</text>
          </g>
        )}
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* 形（長方形・L字・コの字・道のある畑）                                    */
/* ------------------------------------------------------------------ */

const BOX_W = 300, BOX_H = 200, PAD = 44;

const ShapeFig: React.FC<{ f: Extract<Fig, { type: 'shape' }> }> = ({ f }) => {
  const all = f.polys.flatMap((p) => p.pts);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min(BOX_W / (maxX - minX || 1), BOX_H / (maxY - minY || 1));
  const w = (maxX - minX) * k, h = (maxY - minY) * k;
  const X = (x: number) => PAD + (x - minX) * k;
  const Y = (y: number) => PAD + (y - minY) * k;
  const pts = (p: Poly) => p.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const center = (p: Poly) => {
    const px = p.pts.map((q) => q[0]), py = p.pts.map((q) => q[1]);
    return [X((Math.min(...px) + Math.max(...px)) / 2), Y((Math.min(...py) + Math.max(...py)) / 2)] as const;
  };
  return (
    <svg viewBox={`0 0 ${w + PAD * 2} ${h + PAD * 2}`} className="w-full max-w-md mx-auto" data-testid="fig-shape" role="img" aria-label="図形">
      {f.polys.filter((p) => !p.role || p.role === 'main').map((p, i) => (
        <polygon key={`m${i}`} points={pts(p)} fill="#bef264" fillOpacity={0.75} stroke="#3f6212" strokeWidth={2} strokeLinejoin="round" />
      ))}
      {f.polys.filter((p) => p.role === 'road' || p.role === 'cut').map((p, i) => (
        <polygon key={`r${i}`} points={pts(p)} fill={p.role === 'road' ? '#f97316' : 'var(--color-surface)'} fillOpacity={p.role === 'road' ? 0.85 : 1} stroke="#7c2d12" strokeWidth={1} />
      ))}
      {f.polys.filter((p) => p.role === 'ghost').map((p, i) => (
        <polygon key={`g${i}`} points={pts(p)} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 5" />
      ))}
      {/* 記号 */}
      {f.polys.filter((p) => p.label).map((p, i) => {
        const [cx, cy] = center(p);
        if (p.role === 'main') {
          const top = Math.min(...p.pts.map((q) => Y(q[1])));
          return <text key={`l${i}`} x={cx} y={top - 24} textAnchor="middle" fontSize={16} fontWeight={900} fill="var(--color-content)">{p.label}</text>;
        }
        return (
          <g key={`l${i}`}>
            <circle cx={cx} cy={cy} r={12} fill="white" stroke="#dc2626" strokeWidth={1.5} />
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight={900} fill="#dc2626">{p.label}</text>
          </g>
        );
      })}
      {/* 長さ */}
      {f.dims.map((d, i) => {
        const mx = (X(d.a[0]) + X(d.b[0])) / 2, my = (Y(d.a[1]) + Y(d.b[1])) / 2;
        const off = 8;
        const [tx, ty, anchor] = d.side === 'top' ? [mx, my - off, 'middle'] : d.side === 'bottom' ? [mx, my + off + 12, 'middle'] : d.side === 'left' ? [mx - off, my + 5, 'end'] : [mx + off, my + 5, 'start'];
        return <text key={`d${i}`} x={tx} y={ty} textAnchor={anchor as 'middle' | 'end' | 'start'} fontSize={14} fontWeight={800} fill="var(--color-content)">{d.text}</text>;
      })}
      {f.center && (() => {
        const main = f.polys.find((p) => !p.role || p.role === 'main');
        if (!main) return null;
        const [cx, cy] = center(main);
        return <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fontWeight={900} fill="#1e293b">{f.center}</text>;
      })()}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* 表                                                                    */
/* ------------------------------------------------------------------ */

const Table: React.FC<{ f: Extract<Fig, { type: 'table' }> }> = ({ f }) => (
  <div className="flex justify-center overflow-x-auto" data-testid="fig-table">
    <table className="border-collapse text-center">
      <thead>
        <tr>{f.headers.map((h, i) => <th key={i} className="border border-line bg-surface-2 px-2 sm:px-3 py-2 text-sm font-black text-muted whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>
        {f.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={`border border-line px-2 sm:px-3 py-2 font-black tabular-nums whitespace-nowrap ${j === 0 ? 'bg-surface-2 text-muted text-sm' : 'text-content'}`}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const FigureView: React.FC<{ figure: Fig }> = ({ figure }) => {
  switch (figure.type) {
    case 'grid': return <GridFig f={figure} />;
    case 'shape': return <ShapeFig f={figure} />;
    case 'table': return <Table f={figure} />;
  }
};
