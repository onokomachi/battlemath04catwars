// このファイルは単元アプリ syo4-kawarikatasirabe の src/components/shared/FigureView.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 図の表示。「変わり方調べ」は図・表・グラフが学習対象そのものなので、
 * すべての問題に図がつく（問題文だけの画面を作らない）。
 *
 * - table: 対応表（あいているところは ? ）。横（変化）とたて（対応）の見方を矢印で示す
 * - graph: 折れ線グラフ（主目盛り＋補助目盛り。補助目盛りが無いと正確に読み取れない）
 * - scene: 場面の絵（時計盤・正三角形の列・かいだん・水そう など）
 */
import React from 'react';
import { FigureSpec, FigureKind } from '../../types';

/* ============================================================
 * 対応表
 * ============================================================ */

const TableView: React.FC<{ f: Extract<FigureSpec, { kind: 'table' }> }> = ({ f }) => (
  <div className="w-full overflow-x-auto">
    <table className="mx-auto border-collapse text-center min-w-max">
      <tbody>
        <tr>
          <th className="border-2 border-line bg-surface-3 px-3 py-2 text-sm font-black text-content whitespace-nowrap">
            {f.xHeader}
          </th>
          {f.xs.map((x, i) => (
            <td key={i} className="border-2 border-line px-4 py-2 text-xl font-black text-content tabular-nums bg-surface">
              {x}
            </td>
          ))}
        </tr>
        <tr>
          <th className="border-2 border-line bg-surface-3 px-3 py-2 text-sm font-black text-content whitespace-nowrap">
            {f.yHeader}
          </th>
          {f.ys.map((y, i) => (
            <td
              key={i}
              className={`border-2 border-line px-4 py-2 text-xl font-black tabular-nums ${
                y === null ? 'bg-amber-50 text-amber-500' : 'bg-surface text-content'
              }`}
            >
              {y === null ? '?' : y}
            </td>
          ))}
        </tr>
        {f.zs && (
          <tr>
            <th className="border-2 border-line bg-surface-3 px-3 py-2 text-sm font-black text-content whitespace-nowrap">
              {f.zHeader}
            </th>
            {f.zs.map((z, i) => (
              <td key={i} className="border-2 border-line px-4 py-2 text-xl font-black tabular-nums bg-surface-2 text-content">
                {z === null ? '?' : z}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
    <p className="text-center text-xs font-bold text-faint mt-2">
      {f.vertical ? '↕ たてに 見ると「対応」の きまりが 見えるよ' : '→ 横に 見ると「変化」の ようすが 見えるよ'}
    </p>
  </div>
);

/* ============================================================
 * 折れ線グラフ
 * ============================================================ */

// t を大きめに取るのは、たてじくの名前（左上）が いちばん上の目もりと 重ならないようにするため
const PAD = { l: 46, r: 14, t: 30, b: 34 };
const W = 380;
const H = 260;

export const GraphCanvas: React.FC<{
  xLabel: string; yLabel: string; xMax: number; yMax: number; xStep: number; yStep: number;
  points: { x: number; y: number }[];
  line?: boolean;
  guide?: { x?: number; y?: number };
  /** タップで点を打つとき用 */
  onCellTap?: (x: number, y: number) => void;
  /** 児童が打った点 */
  userPoints?: { x: number; y: number }[];
}> = ({ xLabel, yLabel, xMax, yMax, xStep, yStep, points, line, guide, onCellTap, userPoints }) => {
  const px = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b);

  const xTicks: number[] = [];
  for (let v = 0; v <= xMax; v += xStep) xTicks.push(v);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);
  // 補助目盛り（主目盛りが 1 より大きいときだけ。値の読み取りに必要）
  const yMinor: number[] = [];
  if (yStep > 1) for (let v = 0; v <= yMax; v += 1) if (v % yStep !== 0) yMinor.push(v);

  const sorted = [...points].sort((a, b) => a.x - b.x);

  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    if (!onCellTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * W;
    const ry = ((e.clientY - rect.top) / rect.height) * H;
    const gx = Math.round(((rx - PAD.l) / (W - PAD.l - PAD.r)) * xMax);
    const gy = Math.round(((H - PAD.b - ry) / (H - PAD.t - PAD.b)) * yMax);
    if (gx < 0 || gx > xMax || gy < 0 || gy > yMax) return;
    onCellTap(gx, gy);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md mx-auto" role="img" aria-label={`${xLabel}と${yLabel}の折れ線グラフ`}>
      {/* 補助目盛り */}
      {yMinor.map((v) => (
        <line key={`ym${v}`} x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)} stroke="var(--color-line)" strokeWidth={0.5} opacity={0.6} />
      ))}
      {/* 主目盛り */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} y1={py(v)} x2={W - PAD.r} y2={py(v)} stroke="var(--color-line)" strokeWidth={1} />
          <text x={PAD.l - 6} y={py(v) + 4} textAnchor="end" fontSize={10} fill="var(--color-muted)" className="font-bold">{v}</text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={px(v)} y1={PAD.t} x2={px(v)} y2={H - PAD.b} stroke="var(--color-line)" strokeWidth={v === 0 ? 1.5 : 0.7} />
          <text x={px(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--color-muted)" className="font-bold">{v}</text>
        </g>
      ))}

      {/* じく */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--color-content)" strokeWidth={2} />
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--color-content)" strokeWidth={2} />
      <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--color-content)" className="font-black">{xLabel}</text>
      <text x={2} y={13} fontSize={11} fill="var(--color-content)" className="font-black">{yLabel}</text>

      {/* 読み取りを助ける ガイド線 */}
      {guide?.x !== undefined && (
        <line x1={px(guide.x)} y1={PAD.t} x2={px(guide.x)} y2={H - PAD.b} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" />
      )}
      {guide?.y !== undefined && (
        <line x1={PAD.l} y1={py(guide.y)} x2={W - PAD.r} y2={py(guide.y)} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" />
      )}

      {/* 折れ線 */}
      {line && sorted.length > 1 && (
        <polyline
          points={sorted.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
          fill="none" stroke="var(--color-brand)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
        />
      )}
      {sorted.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r={5} fill="var(--color-brand)" />
      ))}
      {(userPoints ?? []).map((p, i) => (
        <g key={`u${i}`}>
          <circle cx={px(p.x)} cy={py(p.y)} r={7} fill="#10b981" opacity={0.9} />
          <circle cx={px(p.x)} cy={py(p.y)} r={7} fill="none" stroke="#065f46" strokeWidth={1.5} />
        </g>
      ))}

      {/* タップ領域（点をうつモードのときだけ） */}
      {onCellTap && (
        <rect
          x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b}
          fill="transparent" onClick={handleClick} style={{ cursor: 'crosshair' }}
        />
      )}
    </svg>
  );
};

const GraphView: React.FC<{ f: Extract<FigureSpec, { kind: 'graph' }> }> = ({ f }) => (
  <div className="w-full">
    <p className="text-center text-sm font-black text-content mb-1">{f.title}</p>
    <GraphCanvas {...f} />
  </div>
);

/* ============================================================
 * 場面の絵
 * ============================================================ */

const C_MAIN = 'var(--color-brand)';
const C_SUB = '#f59e0b';
const C_LINE = 'var(--color-content)';

/** 正三角形を1列にならべた図（教科書 第2時） */
const Triangles: React.FC<{ n: number }> = ({ n }) => {
  const s = 34;
  const h = s * 0.866;
  const w = s / 2;
  const tris = Array.from({ length: n }, (_, i) => {
    const up = i % 2 === 0;
    const x0 = (i * s) / 2;
    return up
      ? `${x0},${h} ${x0 + s},${h} ${x0 + w},0`
      : `${x0},${h} ${x0 + w},0 ${x0 + s},${h}`;
  });
  const total = (n * s) / 2 + w;
  return (
    <svg viewBox={`-4 -6 ${total + 8} ${h + 14}`} className="w-full max-w-md mx-auto" style={{ maxHeight: 120 }} role="img" aria-label={`正三角形を${n}こならべた図`}>
      {tris.map((p, i) => (
        <polygon key={i} points={p} fill={i % 2 === 0 ? 'rgba(37,99,235,0.16)' : 'rgba(245,158,11,0.16)'} stroke={C_LINE} strokeWidth={1.6} />
      ))}
      <text x={total / 2} y={h + 12} textAnchor="middle" fontSize={9} fill="var(--color-muted)" className="font-bold">1辺 1cm の 正三角形 {n}こ</text>
    </svg>
  );
};

/** 正方形を1列にならべた図（宮城ステップ: まわりの長さ ＝ □×2＋2） */
const Strip: React.FC<{ n: number }> = ({ n }) => {
  const u = 26;
  const m = Math.min(n, 7);
  return (
    <svg viewBox={`-4 -4 ${m * u + 8} ${u + 18}`} className="w-full max-w-md mx-auto" style={{ maxHeight: 110 }} role="img" aria-label={`正方形を${n}こ1れつにならべた図`}>
      {Array.from({ length: m }, (_, i) => (
        <rect key={i} x={i * u} y={0} width={u} height={u} fill="rgba(37,99,235,0.16)" stroke={C_LINE} strokeWidth={1.6} />
      ))}
      {n > m && <text x={m * u + 2} y={u * 0.7} fontSize={12} fill="var(--color-muted)" className="font-black">…</text>}
      <text x={(m * u) / 2} y={u + 14} textAnchor="middle" fontSize={9} fill="var(--color-muted)" className="font-bold">1辺 1cm の 正方形 {n}こ</text>
    </svg>
  );
};

/** マッチぼうで正方形／正三角形を1列につなげた図 */
const Matches: React.FC<{ n: number }> = ({ n }) => {
  const u = 26;
  const m = Math.min(n, 6);
  const sticks: [number, number, number, number][] = [];
  for (let i = 0; i < m; i++) {
    sticks.push([i * u, 0, (i + 1) * u, 0]);       // 上
    sticks.push([i * u, u, (i + 1) * u, u]);       // 下
    sticks.push([i * u, 0, i * u, u]);             // 左
  }
  sticks.push([m * u, 0, m * u, u]);               // いちばん右
  return (
    <svg viewBox={`-6 -8 ${m * u + 14} ${u + 22}`} className="w-full max-w-md mx-auto" style={{ maxHeight: 110 }} role="img" aria-label={`マッチぼうで正方形を${n}こつくった図`}>
      {sticks.map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b45309" strokeWidth={3} strokeLinecap="round" />
          <circle cx={x1 === x2 ? x1 : x2} cy={y1 === y2 ? y1 : y2} r={2.6} fill="#dc2626" />
        </g>
      ))}
      {n > m && <text x={m * u + 4} y={u * 0.7} fontSize={12} fill="var(--color-muted)" className="font-black">…</text>}
      <text x={(m * u) / 2} y={u + 18} textAnchor="middle" fontSize={9} fill="var(--color-muted)" className="font-bold">マッチぼうで {n}こ</text>
    </svg>
  );
};

/** 正方形をかいだん状にならべた図（教科書 第3時） */
const Stairs: React.FC<{ n: number }> = ({ n }) => {
  const u = 22;
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < n; row++) for (let col = 0; col <= row; col++) cells.push({ x: col, y: n - 1 - row });
  const size = n * u;
  return (
    <svg viewBox={`-4 -4 ${size + 8} ${size + 18}`} className="w-full mx-auto" style={{ maxHeight: 150 }} role="img" aria-label={`正方形を${n}だんならべた図`}>
      {cells.map((c, i) => (
        <rect key={i} x={c.x * u} y={c.y * u} width={u} height={u} fill="rgba(37,99,235,0.16)" stroke={C_LINE} strokeWidth={1.4} />
      ))}
      <text x={size / 2} y={size + 14} textAnchor="middle" fontSize={9} fill="var(--color-muted)" className="font-bold">1辺 1cm の 正方形・{n}だん</text>
    </svg>
  );
};

/** 時計ばん2つ（教科書 第1時） */
const Clocks: React.FC<{ n: number; total?: number }> = ({ n, total = 12 }) => {
  const face = (cx: number, label: string, hour: number) => {
    const ang = ((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    return (
      <g key={label}>
        <circle cx={cx} cy={46} r={38} fill="var(--color-surface)" stroke={C_LINE} strokeWidth={2.5} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={cx + Math.cos(a) * 31} cy={46 + Math.sin(a) * 31} r={1.8} fill="var(--color-muted)" />;
        })}
        <line x1={cx} y1={46} x2={cx + Math.cos(ang) * 26} y2={46 + Math.sin(ang) * 26} stroke={C_MAIN} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={cx} cy={46} r={3} fill={C_LINE} />
        <text x={cx} y={98} textAnchor="middle" fontSize={13} fill="var(--color-content)" className="font-black">{label}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 220 108" className="w-full max-w-xs mx-auto" style={{ maxHeight: 130 }} role="img" aria-label="2つの時計ばん">
      {face(52, `㋐ ${n}`, n)}
      {face(168, `㋑ ${total - n}`, total - n)}
    </svg>
  );
};

/** おはじきを2人で分ける */
const Counters: React.FC<{ n: number; total?: number }> = ({ n, total }) => {
  const t = total ?? n + 4;
  const a = Math.max(0, Math.min(n, t));
  const b = Math.max(0, t - a);
  const dot = (i: number, filled: boolean) => (
    <circle key={`${filled}-${i}`} cx={12 + (i % 8) * 22} cy={12 + Math.floor(i / 8) * 22} r={8}
      fill={filled ? 'rgba(37,99,235,0.75)' : 'rgba(245,158,11,0.75)'} stroke={C_LINE} strokeWidth={1.2} />
  );
  const rowsA = Math.ceil(a / 8) || 1;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="text-center">
        <svg viewBox={`0 0 180 ${rowsA * 22 + 4}`} className="w-40" role="img" aria-label={`1人目 ${a}こ`}>
          {Array.from({ length: a }, (_, i) => dot(i, true))}
        </svg>
        <p className="text-xs font-black text-content">{a} こ</p>
      </div>
      <div className="text-center">
        <svg viewBox={`0 0 180 ${(Math.ceil(b / 8) || 1) * 22 + 4}`} className="w-40" role="img" aria-label={`2人目 ${b}こ`}>
          {Array.from({ length: b }, (_, i) => dot(i, false))}
        </svg>
        <p className="text-xs font-black text-content">{b} こ</p>
      </div>
    </div>
  );
};

/** テープ（分けた・のこり） */
const Tape: React.FC<{ n: number; total?: number }> = ({ n, total }) => {
  const t = total ?? n * 2;
  const ratio = Math.max(0, Math.min(1, n / t));
  return (
    <svg viewBox="0 0 300 54" className="w-full max-w-sm mx-auto" role="img" aria-label="テープ図">
      <rect x={6} y={14} width={288} height={26} fill="var(--color-surface-3)" stroke={C_LINE} strokeWidth={2} />
      <rect x={6} y={14} width={288 * ratio} height={26} fill="rgba(37,99,235,0.5)" stroke={C_LINE} strokeWidth={1} />
      <text x={6 + 144 * ratio} y={31} textAnchor="middle" fontSize={11} fill="var(--color-content)" className="font-black">{n}</text>
      <text x={6 + 288 * ratio + (288 * (1 - ratio)) / 2} y={31} textAnchor="middle" fontSize={11} fill="var(--color-content)" className="font-black">?</text>
      <text x={150} y={51} textAnchor="middle" fontSize={9} fill="var(--color-muted)" className="font-bold">ぜんぶで {t}</text>
    </svg>
  );
};

/** 水そう */
const Tank: React.FC<{ n: number }> = ({ n }) => {
  const level = Math.max(0.12, Math.min(1, n / 8));
  return (
    <svg viewBox="0 0 140 110" className="w-32 mx-auto" role="img" aria-label="水そう">
      <rect x={20} y={14} width={100} height={82} fill="var(--color-surface)" stroke={C_LINE} strokeWidth={3} rx={4} />
      <rect x={23} y={93 - 76 * level} width={94} height={76 * level} fill="rgba(56,189,248,0.55)" />
      <path d="M70 0 L70 12" stroke={C_LINE} strokeWidth={3} />
      <circle cx={70} cy={6} r={4} fill={C_SUB} />
    </svg>
  );
};

/** 正方形／正多角形 */
const Poly: React.FC<{ n: number; sides: number }> = ({ n, sides }) => {
  const r = 34;
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + (sides === 4 ? Math.PI / 4 : 0);
    return `${60 + Math.cos(a) * r},${52 + Math.sin(a) * r}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 120 100" className="w-28 mx-auto" role="img" aria-label={`正${sides}角形`}>
      <polygon points={pts} fill="rgba(37,99,235,0.16)" stroke={C_LINE} strokeWidth={2.4} />
      <text x={60} y={95} textAnchor="middle" fontSize={11} fill="var(--color-content)" className="font-black">1辺 {n}cm</text>
    </svg>
  );
};

/** 長方形 */
const Rect: React.FC<{ n: number; labelA?: string; labelB?: string }> = ({ n, labelA, labelB }) => {
  const w = Math.min(120, 24 + n * 14);
  return (
    <svg viewBox="0 0 170 96" className="w-44 mx-auto" role="img" aria-label="長方形">
      <rect x={30} y={20} width={w} height={52} fill="rgba(16,185,129,0.16)" stroke={C_LINE} strokeWidth={2.4} />
      <text x={30 + w / 2} y={14} textAnchor="middle" fontSize={10} fill="var(--color-muted)" className="font-bold">{labelA ?? 'よこ'}</text>
      <text x={24} y={50} textAnchor="end" fontSize={10} fill="var(--color-muted)" className="font-bold">{labelB ?? 'たて'}</text>
      <text x={30 + w / 2} y={88} textAnchor="middle" fontSize={10} fill="var(--color-content)" className="font-black">{n}</text>
    </svg>
  );
};

/** 2人の年れい */
const Ages: React.FC<{ n: number }> = ({ n }) => (
  <svg viewBox="0 0 180 90" className="w-44 mx-auto" role="img" aria-label="2人">
    {[0, 1].map((i) => (
      <g key={i} transform={`translate(${20 + i * 90},10)`}>
        <circle cx={26} cy={18} r={14} fill={i === 0 ? 'rgba(37,99,235,0.3)' : 'rgba(245,158,11,0.3)'} stroke={C_LINE} strokeWidth={2} />
        <path d={`M8 62 Q26 34 44 62 Z`} fill={i === 0 ? 'rgba(37,99,235,0.2)' : 'rgba(245,158,11,0.2)'} stroke={C_LINE} strokeWidth={2} />
        <text x={26} y={78} textAnchor="middle" fontSize={11} fill="var(--color-content)" className="font-black">{i === 0 ? `${n}才` : '?才'}</text>
      </g>
    ))}
  </svg>
);

/** 品物がいくつ分（何を数えているのかが分かるよう、量の名前と数をそえる） */
const Items: React.FC<{ n: number; label?: string }> = ({ n, label }) => (
  <div className="text-center">
    <svg viewBox={`0 0 ${Math.max(6, Math.min(n, 8)) * 30 + 20} 44`} className="w-full max-w-xs mx-auto" style={{ maxHeight: 58 }} role="img" aria-label={`${n}こ`}>
      {Array.from({ length: Math.min(n, 8) }, (_, i) => (
        <rect key={i} x={6 + i * 30} y={8} width={22} height={28} rx={4} fill="rgba(20,184,166,0.25)" stroke={C_LINE} strokeWidth={1.8} />
      ))}
      {n > 8 && <text x={8 * 30 + 4} y={30} fontSize={14} fill="var(--color-muted)" className="font-black">…</text>}
    </svg>
    {label && <p className="text-xs font-black text-muted mt-1">{label} … {n}</p>}
  </div>
);

const SceneView: React.FC<{ f: Extract<FigureSpec, { kind: 'scene' }> }> = ({ f }) => {
  const n = Math.max(1, f.n);
  const map: Record<FigureKind, React.ReactNode> = {
    clocks: <Clocks n={Math.max(1, Math.min(11, n))} total={f.total ?? 12} />,
    triangles: <Triangles n={Math.min(n, 8)} />,
    strip: <Strip n={n} />,
    matches: <Matches n={n} />,
    stairs: <Stairs n={Math.min(n, 6)} />,
    square: <Poly n={n} sides={4} />,
    polygon: <Poly n={n} sides={3} />,
    rect: <Rect n={n} labelA={f.labelA} labelB={f.labelB} />,
    counters: <Counters n={n} total={f.total} />,
    tape: <Tape n={n} total={f.total} />,
    tank: <Tank n={n} />,
    items: <Items n={n} label={f.labelA} />,
    ages: <Ages n={n} />,
    none: null,
  };
  return <div className="flex items-center justify-center py-1">{map[f.fig]}</div>;
};

/* ============================================================ */

export const FigureView: React.FC<{ figure?: FigureSpec }> = ({ figure }) => {
  if (!figure) return null;
  return (
    <div className="bg-surface-2 border border-line rounded-3xl p-4 mb-4">
      {figure.kind === 'table' && <TableView f={figure} />}
      {figure.kind === 'graph' && <GraphView f={figure} />}
      {figure.kind === 'scene' && <SceneView f={figure} />}
    </div>
  );
};
