// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/components/shared/StepViews.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数を1つ入れる・選ぶ 以外の 答え方。
 *  - FillView  … 式や表の □ に 数を入れる（□を タップして えらび、テンキーで 入れる）
 *  - CellsView … 方眼の マスを タップして 形を つくる（作図）
 *  - PlotView  … 折れ線グラフに 点を うつ（作図）
 * どれも「できた」で判定し、正しければ onCorrect、ちがえば onWrong（ひとこと）を呼ぶ。
 */
import React, { useState } from 'react';
import { Keypad } from './Keypad';
import type { FillStep, FillToken, CellsStep, PlotStep, BuildStep } from '../../lib/question';
import { toNum, buildOk } from '../../lib/question';
import { Delete, RotateCcw } from 'lucide-react';

const MAX_CHARS = 7;

/* ------------------------------------------------------------------ */
/* □に 数を入れる                                                        */
/* ------------------------------------------------------------------ */

export function fillText(step: FillStep, vals: (number | string)[]): string {
  const tok = (t: FillToken) => (typeof t === 'object' ? String(vals[t.slot] ?? '□') : String(t));
  if (step.layout.type === 'expr') return step.layout.parts.map(tok).join(' ');
  return '表を うめた';
}

export const FillView: React.FC<{ step: FillStep; onCorrect: (text: string) => void; onWrong: (note: string | null) => void }> = ({ step, onCorrect, onWrong }) => {
  const slots = step.accept[0]!.length;
  const [vals, setVals] = useState<string[]>(() => Array(slots).fill(''));
  const [active, setActive] = useState(0);
  const [bad, setBad] = useState<number[]>([]);

  const setVal = (s: string) => {
    setVals((v) => v.map((x, i) => (i === active ? s : x)));
    setBad((b) => b.filter((i) => i !== active));
  };
  const all = vals.every((v) => toNum(v) !== null);

  const submit = () => {
    // □が のこっていたら、つぎの あいている □へ
    if (!all) { const e = vals.findIndex((v, i) => i > active && toNum(v) === null); setActive(e >= 0 ? e : vals.findIndex((v) => toNum(v) === null)); return; }
    const nums = vals.map((v) => toNum(v) as number);
    const ok = step.accept.some((acc) => acc.every((a, i) => a === nums[i]));
    if (ok) { onCorrect(fillText(step, nums)); return; }
    // 表は、代表の答えと ちがう □を 赤くする
    if (step.layout.type === 'table') setBad(nums.map((n, i) => (n !== step.accept[0]![i] ? i : -1)).filter((i) => i >= 0));
    onWrong(step.diagnose?.(nums) ?? null);
  };

  const Slot: React.FC<{ i: number; wide?: boolean }> = ({ i, wide }) => (
    <button
      onClick={() => setActive(i)}
      data-testid={`fill-slot-${i}`}
      className={`inline-flex items-center justify-center rounded-xl border-[3px] font-black tabular-nums transition ${wide ? 'min-w-[3.6rem] h-14 text-2xl px-2' : 'min-w-[2.6rem] h-11 text-lg px-1'} ${
        bad.includes(i) ? 'border-rose-500 bg-rose-50 text-rose-700' : i === active ? 'border-brand bg-surface ring-4 ring-brand/20 text-content' : 'border-line bg-surface-2 text-content'
      }`}
    >
      {vals[i] || <span className="text-faint">□</span>}
    </button>
  );

  const tok = (t: FillToken, key: React.Key, wide: boolean) => (typeof t === 'object' ? <Slot key={key} i={t.slot} wide={wide} /> : <span key={key} className={wide ? 'text-2xl font-black text-content px-1' : 'text-base font-black text-content'}>{t}</span>);

  return (
    <div data-testid="fill">
      {step.layout.type === 'expr' ? (
        <div className="flex flex-wrap items-center justify-center gap-2 my-3">{step.layout.parts.map((t, i) => tok(t, i, true))}</div>
      ) : (
        <div className="overflow-x-auto my-3">
          <table className="border-collapse mx-auto text-center">
            <tbody>
              {step.layout.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((t, j) => (
                    <td key={j} className={`border border-line px-1 py-1 ${j === 0 ? 'bg-surface-2 text-xs font-black text-muted whitespace-nowrap px-2' : ''} ${i === 0 && j > 0 ? 'bg-surface-2' : ''}`}>
                      {tok(t, j, false)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Keypad
        onInput={(d) => { const cur = vals[active] ?? ''; if (d === '.' || cur.length >= MAX_CHARS) return; setVal(cur + d); }}
        onBackspace={() => setVal((vals[active] ?? '').slice(0, -1))}
        onSubmit={submit}
        submitLabel={all ? 'こたえる' : 'つぎの □ へ'}
        submitEnabled={all || vals[active] !== ''}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 方眼に 形を つくる                                                     */
/* ------------------------------------------------------------------ */

const CS = 36;

export const CellsView: React.FC<{ step: CellsStep; onCorrect: (text: string) => void; onWrong: (note: string | null) => void }> = ({ step, onCorrect, onWrong }) => {
  const [on, setOn] = useState<Set<string>>(new Set());
  const toggle = (x: number, y: number) => setOn((s) => { const n = new Set(s); const k = `${x},${y}`; if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cells = [...on].map((k) => { const [x, y] = k.split(',').map(Number); return { x: x!, y: y! }; });
  const W = step.cols * CS, H = step.rows * CS;
  return (
    <div data-testid="cells">
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="w-full max-w-md mx-auto select-none touch-manipulation">
        {cells.map((c) => <rect key={`${c.x},${c.y}`} x={c.x * CS} y={c.y * CS} width={CS} height={CS} fill="#fdba74" />)}
        {Array.from({ length: step.cols + 1 }, (_, i) => <line key={`v${i}`} x1={i * CS} y1={0} x2={i * CS} y2={H} stroke="#38bdf8" strokeWidth={1} />)}
        {Array.from({ length: step.rows + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * CS} x2={W} y2={i * CS} stroke="#38bdf8" strokeWidth={1} />)}
        {Array.from({ length: step.cols * step.rows }, (_, i) => {
          const x = i % step.cols, y = Math.floor(i / step.cols);
          return <rect key={`t${i}`} x={x * CS} y={y * CS} width={CS} height={CS} fill="transparent" onClick={() => toggle(x, y)} style={{ cursor: 'pointer' }} data-testid={`cell-${x}-${y}`} />;
        })}
      </svg>
      <div className="text-center text-sm font-black text-muted mt-1">ぬった マス：<span className="tabular-nums text-content text-lg">{cells.length}</span> こ（{cells.length}cm²）</div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button onClick={() => setOn(new Set())} className="py-3 rounded-2xl bg-surface-2 border-2 border-line font-black text-muted active:scale-95 transition">ぜんぶ けす</button>
        <button
          onClick={() => { const r = step.check(cells); if (r === null) onCorrect(`${cells.length}マス`); else onWrong(r); }}
          disabled={cells.length === 0}
          className="py-3 rounded-2xl bg-brand text-on-brand font-black shadow active:scale-95 transition disabled:opacity-40"
          data-testid="cells-done"
        >
          できた！
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 折れ線グラフに 点を うつ                                               */
/* ------------------------------------------------------------------ */

const GW = 320, GH = 300;
const GP = { l: 40, r: 16, t: 30, b: 34 };

export const PlotView: React.FC<{ step: PlotStep; onCorrect: (text: string) => void; onWrong: (note: string | null) => void }> = ({ step, onCorrect, onWrong }) => {
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const { xMax, yMax, yStep } = step;
  const px = (x: number) => GP.l + (x / xMax) * (GW - GP.l - GP.r);
  const py = (y: number) => GH - GP.b - (y / yMax) * (GH - GP.t - GP.b);
  const tap = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const rx = ((e.clientX - svg.left) / svg.width) * GW;
    const ry = ((e.clientY - svg.top) / svg.height) * GH;
    const gx = Math.round(((rx - GP.l) / (GW - GP.l - GP.r)) * xMax);
    const gy = Math.round(((GH - GP.b - ry) / (GH - GP.t - GP.b)) * yMax);
    if (gx < 1 || gx > xMax || gy < 0 || gy > yMax) return;
    setPts((p) => {
      const same = p.find((q) => q.x === gx && q.y === gy);
      if (same) return p.filter((q) => q !== same);           // 同じ点を もう一度で けす
      return [...p.filter((q) => q.x !== gx), { x: gx, y: gy }]; // 同じ横の位置は うつしかえ
    });
  };
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const check = () => {
    const c = step.points;
    const ok = pts.length === c.length && c.every((q) => pts.some((p) => p.x === q.x && p.y === q.y));
    if (ok) { onCorrect('グラフを かいた'); return; }
    if (pts.length < c.length) { onWrong(`点が たりないよ。横が ${c.map((q) => q.x).filter((x) => !pts.some((p) => p.x === x)).join('、')} の ところにも うとう。`); return; }
    const wrongX = c.filter((q) => !pts.some((p) => p.x === q.x && p.y === q.y)).map((q) => q.x);
    onWrong(wrongX.length ? `横が ${wrongX.join('、')} の 点の 高さを、表で たしかめよう。` : 'よけいな 点が あるよ。');
  };
  return (
    <div data-testid="plot">
      <svg viewBox={`0 0 ${GW} ${GH}`} className="w-full max-w-md mx-auto select-none touch-manipulation" role="img" aria-label="折れ線グラフ">
        {Array.from({ length: yMax + 1 }, (_, v) => (
          <line key={`y${v}`} x1={GP.l} y1={py(v)} x2={GW - GP.r} y2={py(v)} stroke="var(--color-line)" strokeWidth={v % yStep === 0 ? 1.1 : 0.5} opacity={v % yStep === 0 ? 1 : 0.7} />
        ))}
        {Array.from({ length: yMax / yStep + 1 }, (_, i) => i * yStep).map((v) => (
          <text key={`yt${v}`} x={GP.l - 6} y={py(v) + 4} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--color-muted)">{v}</text>
        ))}
        {Array.from({ length: xMax + 1 }, (_, x) => (
          <g key={`x${x}`}>
            <line x1={px(x)} y1={GP.t} x2={px(x)} y2={GH - GP.b} stroke="var(--color-line)" strokeWidth={0.7} />
            <text x={px(x)} y={GH - GP.b + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-muted)">{x}</text>
          </g>
        ))}
        <line x1={GP.l} y1={GP.t} x2={GP.l} y2={GH - GP.b} stroke="var(--color-content)" strokeWidth={2} />
        <line x1={GP.l} y1={GH - GP.b} x2={GW - GP.r} y2={GH - GP.b} stroke="var(--color-content)" strokeWidth={2} />
        <text x={GW - GP.r} y={GH - 4} textAnchor="end" fontSize={11} fontWeight={900} fill="var(--color-content)">{step.xLabel}</text>
        <text x={4} y={14} fontSize={11} fontWeight={900} fill="var(--color-content)">{step.yLabel}</text>
        {sorted.length > 1 && <polyline points={sorted.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke="#dc2626" strokeWidth={2.5} />}
        {sorted.map((p) => <circle key={`${p.x},${p.y}`} cx={px(p.x)} cy={py(p.y)} r={6} fill="#dc2626" />)}
        <rect x={GP.l - 10} y={GP.t - 10} width={GW - GP.l - GP.r + 20} height={GH - GP.t - GP.b + 20} fill="transparent" onClick={tap} style={{ cursor: 'crosshair' }} data-testid="plot-area" />
      </svg>
      <button onClick={check} disabled={pts.length === 0} className="w-full mt-3 py-3 rounded-2xl bg-brand text-on-brand font-black shadow active:scale-95 transition disabled:opacity-40" data-testid="plot-done">
        できた！
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* カードを置いて 組み立てる                                              */
/* ------------------------------------------------------------------ */

export const BuildView: React.FC<{ step: BuildStep; onCorrect: (text: string) => void; onWrong: (note: string | null) => void }> = ({ step, onCorrect, onWrong }) => {
  const slots = step.accept[0]!.length;
  // placed[i] = i番めの置き場所に置いた カードの番号（なければ null）
  const [placed, setPlaced] = useState<(number | null)[]>(() => Array(slots).fill(null));
  const used = new Set(placed.filter((c): c is number => c !== null));
  const full = placed.every((c) => c !== null);
  const put = (card: number) => {
    const at = placed.findIndex((c) => c === null);
    if (at < 0) return;
    setPlaced((p) => p.map((c, i) => (i === at ? card : c)));
  };
  const remove = (slot: number) => setPlaced((p) => p.map((c, i) => (i === slot ? null : c)));
  const lastFilled = () => { for (let i = slots - 1; i >= 0; i--) if (placed[i] !== null) return i; return -1; };
  const submit = () => {
    if (!full) return;
    const vals = placed.map((c) => step.cards[c as number]!);
    if (buildOk(step, vals)) onCorrect(step.layout.map((t) => (typeof t === 'object' ? vals[t.slot] : t)).join(' '));
    else onWrong(step.diagnose?.(vals) ?? 'カードを もう一度 見なおそう。');
  };
  return (
    <div data-testid="build" className="space-y-4">
      <div className="min-h-20 rounded-2xl bg-surface-2 border-2 border-line flex flex-wrap items-center justify-center gap-2 px-3 py-3" aria-live="polite">
        {step.layout.map((t, i) => typeof t === 'object' ? (
          <button
            key={i}
            onClick={() => remove(t.slot)}
            data-testid={`build-slot-${t.slot}`}
            aria-label={placed[t.slot] === null ? 'からの おきば' : `${step.cards[placed[t.slot] as number]} （タップで もどす）`}
            className={`min-w-[4.2rem] h-14 px-3 rounded-xl border-[3px] text-xl font-black transition ${placed[t.slot] === null ? 'border-dashed border-line bg-surface text-faint' : 'border-brand bg-surface text-content'}`}
          >
            {placed[t.slot] === null ? '□' : step.cards[placed[t.slot] as number]}
          </button>
        ) : (
          <span key={i} className="text-2xl font-black text-content">{t}</span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2" data-testid="build-cards">
        {step.cards.map((c, i) => (
          <button
            key={i}
            disabled={used.has(i)}
            onClick={() => put(i)}
            data-testid={`build-card-${i}`}
            className="min-w-[4rem] px-4 py-3 rounded-2xl border-2 text-xl font-black transition-all active:scale-95 bg-surface border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-25 disabled:active:scale-100"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => { const i = lastFilled(); if (i >= 0) remove(i); }} disabled={used.size === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40">
          <Delete size={18} /> 1つ もどす
        </button>
        <button onClick={() => setPlaced(Array(slots).fill(null))} disabled={used.size === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40">
          <RotateCcw size={18} /> ぜんぶ もどす
        </button>
        <button onClick={submit} disabled={!full} data-testid="build-submit"
          className="py-3 rounded-2xl bg-brand text-on-brand font-black disabled:opacity-40">
          これで けってい
        </button>
      </div>
    </div>
  );
};
