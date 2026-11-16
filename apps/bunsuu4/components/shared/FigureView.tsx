// このファイルは単元アプリ syo4-bunnsu の src/components/shared/FigureView.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 問題の図。SVG で描く（棒・数直線）。
 *   tape    … 1本の棒をb等分。色をぬる（interactive のときは、タップでぬれる）。
 *             refs＝上にならべる見本の棒（分母のちがう分数）。guides＝目盛りの位置を見本までのばした点線
 *   numline … 数直線。目盛りをタップできる。decimals＝目盛りの下に小数
 *   mtape   … 0〜2m などのテープ＋ものさし（1あたり den 等分）。interactive のときはタップでぬれる
 *   cups    … 1Lます count こ（1こを den 等分）。interactive のときはタップで水を入れる
 *   numlines… 0〜1 の数直線を分母ごとにならべる（大きさの等しい分数）。tapRow の段だけタップできる
 * 色は固定（どのテーマでも読める琥珀・青）。枠線と文字だけテーマの色に従う。
 */
import React from 'react';
import { dec } from '../../lib/frac';
import type { Figure } from '../../lib/problems';

const AMBER = '#f59e0b';
const BLUE = '#60a5fa';
const EMPTY = 'var(--c-surface-3)';
const LINE = 'var(--c-faint)';
const INK = 'var(--c-content)';

interface Props {
  fig: Figure;
  /** tape: 色をぬったセルの番号 */
  cells?: ReadonlySet<number>;
  onCell?: (i: number) => void;
  /** numline: 選んだ目盛り */
  tick?: number | null;
  onTick?: (i: number) => void;
}

const Svg: React.FC<{ h: number; label: string; children: React.ReactNode }> = ({ h, label, children }) => (
  <svg viewBox={`0 0 340 ${h}`} role="img" aria-label={label} className="w-full max-w-xl mx-auto block select-none">{children}</svg>
);

export const FigureView: React.FC<Props> = ({ fig, cells, onCell, tick, onTick }) => {
  switch (fig.kind) {
    case 'tape': {
      const x0 = 20;
      const w = 300;
      const refs = fig.refs ?? [];
      const rowH = 26;
      const gap = 30;
      const baseY = 10 + refs.length * (rowH + gap);
      const h = baseY + 38 + 48;
      const COLORS = [AMBER, BLUE];
      return (
        <Svg h={h} label={`${fig.whole}の棒を${fig.parts}等分した図`}>
          {refs.map((r, k) => {
            const y = 10 + k * (rowH + gap);
            return (
              <g key={k}>
                <text x={x0} y={y + 1} fontSize={11} fontWeight={800} fill={INK}>{r.label}（{r.parts}等分）</text>
                {Array.from({ length: r.parts }, (_, c) => (
                  <rect key={c} x={x0 + (c * w) / r.parts} y={y + 6} width={w / r.parts} height={rowH}
                    fill={c < r.shaded ? COLORS[k % 2] : EMPTY} stroke={LINE} strokeWidth={1.5} />
                ))}
              </g>
            );
          })}
          {Array.from({ length: fig.parts }, (_, c) => {
            const on = onCell ? !!cells?.has(c) : c < fig.shaded;
            const on2 = !onCell && c >= fig.shaded && c < fig.shaded + (fig.shaded2 ?? 0);
            return (
              <rect key={c} x={x0 + (c * w) / fig.parts} y={baseY} width={w / fig.parts} height={38}
                fill={on ? AMBER : on2 ? BLUE : EMPTY} stroke={LINE} strokeWidth={1.5}
                className={onCell ? 'cursor-pointer' : undefined}
                onClick={onCell ? () => onCell(c) : undefined}
                role={onCell ? 'button' : undefined} aria-label={onCell ? `${c + 1}こ目をぬる` : undefined} />
            );
          })}
          {fig.guides && refs.length > 0 && Array.from({ length: fig.parts + 1 }, (_, c) => (
            <line key={`g${c}`} x1={x0 + (c * w) / fig.parts} y1={16} x2={x0 + (c * w) / fig.parts} y2={baseY}
              stroke={LINE} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
          ))}
          <path d={`M ${x0} ${baseY + 48} v 6 H ${x0 + w} v -6`} fill="none" stroke={LINE} strokeWidth={1.5} />
          <text x={x0 + w / 2} y={baseY + 70} textAnchor="middle" fontSize={13} fill={INK} fontWeight={700}>{fig.whole}（{fig.parts}等分）</text>
        </Svg>
      );
    }
    case 'numline': {
      const x0 = 20;
      const w = 300;
      const total = fig.max * fig.den;
      const xs = (i: number) => x0 + (i / total) * w;
      const h = fig.decimals ? 112 : 96;
      return (
        <Svg h={h} label="数直線">
          <line x1={x0 - 6} y1={52} x2={x0 + w + 8} y2={52} stroke={INK} strokeWidth={2} />
          {Array.from({ length: total + 1 }, (_, i) => {
            const whole = i % fig.den === 0;
            const label = whole ? String(i / fig.den) : fig.decimals ? dec(i / fig.den) : '';
            return (
              <g key={i}>
                <line x1={xs(i)} y1={whole ? 40 : 45} x2={xs(i)} y2={whole ? 64 : 59} stroke={INK} strokeWidth={whole ? 2 : 1.4} />
                {label && <text x={xs(i)} y={80} textAnchor="middle" fontSize={whole ? 14 : 10} fontWeight={whole ? 800 : 600} fill={INK}>{label}</text>}
              </g>
            );
          })}
          {fig.marks?.map((m) => (
            <g key={m.label + m.at}>
              <path d={`M ${xs(m.at) - 6} 28 L ${xs(m.at) + 6} 28 L ${xs(m.at)} 40 Z`} fill={AMBER} />
              <text x={xs(m.at)} y={20} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>{m.label}</text>
            </g>
          ))}
          {onTick && Array.from({ length: total }, (_, k) => k + 1).map((i) => (
            <g key={`t${i}`} className="cursor-pointer" onClick={() => onTick(i)} role="button" aria-label={`0から${i}こ目の目盛り`}>
              <circle cx={xs(i)} cy={52} r={11} fill="transparent" />
              {tick === i && <circle cx={xs(i)} cy={52} r={7} fill={AMBER} stroke={INK} strokeWidth={2} />}
            </g>
          ))}
        </Svg>
      );
    }
    case 'mtape': {
      const x0 = 24;
      const w = 290;
      const total = fig.wholes * fig.den;
      const xs = (i: number) => x0 + (i / total) * w;
      const y = 14;
      const h = 40;
      return (
        <Svg h={112} label={`0から${fig.wholes}${fig.unit}までのテープ。1${fig.unit}を${fig.den}等分`}>
          {Array.from({ length: total }, (_, c) => {
            const on = onCell ? !!cells?.has(c) : c < fig.shaded;
            const on2 = !onCell && c >= fig.shaded && c < fig.shaded + (fig.shaded2 ?? 0);
            return (
              <rect key={c} x={xs(c)} y={y} width={w / total} height={h}
                fill={on ? AMBER : on2 ? BLUE : EMPTY} stroke={LINE} strokeWidth={1.2}
                className={onCell ? 'cursor-pointer' : undefined}
                onClick={onCell ? () => onCell(c) : undefined}
                role={onCell ? 'button' : undefined} aria-label={onCell ? `${c + 1}こ目をぬる` : undefined} />
            );
          })}
          {Array.from({ length: fig.wholes + 1 }, (_, k) => (
            <line key={`b${k}`} x1={xs(k * fig.den)} y1={y - 4} x2={xs(k * fig.den)} y2={y + h + 4} stroke={INK} strokeWidth={2.2} />
          ))}
          <line x1={x0} y1={74} x2={x0 + w} y2={74} stroke={INK} strokeWidth={2} />
          {Array.from({ length: total + 1 }, (_, i) => {
            const whole = i % fig.den === 0;
            return (
              <g key={i}>
                <line x1={xs(i)} y1={whole ? 64 : 68} x2={xs(i)} y2={74} stroke={INK} strokeWidth={whole ? 2 : 1.2} />
                {whole && <text x={xs(i)} y={94} textAnchor="middle" fontSize={15} fontWeight={800} fill={INK}>{i / fig.den}</text>}
              </g>
            );
          })}
          <text x={x0 + w + 4} y={108} textAnchor="end" fontSize={12} fontWeight={700} fill={INK}>（{fig.unit}）</text>
        </Svg>
      );
    }
    case 'cups': {
      const gap = 18;
      const cw = Math.min(92, (300 - (fig.count - 1) * gap) / fig.count);
      const totalW = fig.count * cw + (fig.count - 1) * gap;
      const left = (340 - totalW) / 2;
      const top = 26;
      const ch = 120;
      const seg = ch / fig.den;
      return (
        <Svg h={top + ch + 14} label={`1${fig.unit}ますが${fig.count}こ。1こを${fig.den}等分`}>
          {Array.from({ length: fig.count }, (_, c) => {
            const x = left + c * (cw + gap);
            return (
              <g key={c}>
                <text x={x + cw / 2} y={top - 8} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>1{fig.unit}</text>
                {Array.from({ length: fig.den }, (_, j) => {
                  const idx = c * fig.den + j;
                  const on = onCell ? !!cells?.has(idx) : idx < fig.filled;
                  const yy = top + ch - (j + 1) * seg;
                  return (
                    <rect key={j} x={x} y={yy} width={cw} height={seg}
                      fill={on ? BLUE : EMPTY} stroke={LINE} strokeWidth={onCell ? 1 : 0.6} strokeDasharray={onCell ? undefined : '3 3'}
                      className={onCell ? 'cursor-pointer' : undefined}
                      onClick={onCell ? () => onCell(idx) : undefined}
                      role={onCell ? 'button' : undefined} aria-label={onCell ? `${c + 1}こ目のますの下から${j + 1}目もり` : undefined} />
                  );
                })}
                {Array.from({ length: fig.den - 1 }, (_, j) => (
                  <line key={`t${j}`} x1={x} y1={top + ch - (j + 1) * seg} x2={x + 12} y2={top + ch - (j + 1) * seg} stroke={INK} strokeWidth={1.6} />
                ))}
                <path d={`M ${x} ${top} V ${top + ch} H ${x + cw} V ${top}`} fill="none" stroke={INK} strokeWidth={2.4} />
              </g>
            );
          })}
        </Svg>
      );
    }
    case 'numlines': {
      const x0 = 34;
      const w = 280;
      const rowH = 46;
      const h = fig.dens.length * rowH + 12;
      return (
        <Svg h={h} label="数直線をならべた図">
          {fig.dens.map((d, r) => {
            const y = 30 + r * rowH;
            const xs = (i: number) => x0 + (i / d) * w;
            const tappable = onTick && fig.tapRow === r;
            return (
              <g key={r}>
                <text x={x0 - 14} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>0</text>
                <line x1={x0} y1={y} x2={x0 + w} y2={y} stroke={INK} strokeWidth={2} />
                {Array.from({ length: d + 1 }, (_, i) => {
                  const end = i === 0 || i === d;
                  return <line key={i} x1={xs(i)} y1={end ? y - 12 : y - 8} x2={xs(i)} y2={end ? y + 4 : y} stroke={INK} strokeWidth={end ? 2.2 : 1.5} />;
                })}
                <text x={x0 + w} y={y - 15} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>1</text>
                <text x={xs(1)} y={y - 14} textAnchor="middle" fontSize={10} fontWeight={800} fill={INK}>1/{d}</text>
                {fig.marks?.filter((m) => m.row === r).map((m, k) => (
                  <g key={`m${k}`}>
                    <path d={`M ${xs(m.at) - 6} ${y + 16} L ${xs(m.at) + 6} ${y + 16} L ${xs(m.at)} ${y + 5} Z`} fill={AMBER} />
                    {m.label && <text x={xs(m.at) + 10} y={y + 18} fontSize={12} fontWeight={800} fill={INK}>{m.label}</text>}
                  </g>
                ))}
                {tappable && Array.from({ length: d - 1 }, (_, k) => k + 1).map((i) => (
                  <g key={`t${i}`} className="cursor-pointer" onClick={() => onTick!(i)} role="button" aria-label={`0から${i}こ目の目もり`}>
                    <circle cx={xs(i)} cy={y} r={11} fill="transparent" stroke={LINE} strokeDasharray="2 2" />
                    {tick === i && <circle cx={xs(i)} cy={y} r={7} fill={AMBER} stroke={INK} strokeWidth={2} />}
                  </g>
                ))}
              </g>
            );
          })}
        </Svg>
      );
    }
  }
};
