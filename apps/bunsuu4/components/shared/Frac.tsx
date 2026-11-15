// このファイルは単元アプリ syo4-bunnsu の src/components/shared/Frac.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 分数の表示。縦に「分子／線／分母」と書く（帯分数は整数を左に）。
 * RichText は {3|4}・{1;3|4} の記法（lib/frac.ts）を文章の中で分数に直して出す。
 */
import React from 'react';
import { parseRich } from '../../lib/frac';

export const Frac: React.FC<{ n: number | string; d: number | string; w?: number | string }> = ({ n, d, w }) => (
  <span className="inline-flex items-center align-middle mx-[0.15em] whitespace-nowrap">
    {w != null && <span className="mr-[0.15em] font-black">{w}</span>}
    <span className="inline-flex flex-col items-center leading-[1.05] text-[0.9em] font-black">
      <span className="px-[0.2em]">{n}</span>
      <span className="block self-stretch border-t-[0.09em] border-current my-[0.12em]" />
      <span className="px-[0.2em]">{d}</span>
    </span>
  </span>
);

export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span className={className}>
    {parseRich(text).map((seg, i) =>
      seg.t === 'text' ? <React.Fragment key={i}>{seg.s}</React.Fragment> : <Frac key={i} n={seg.n} d={seg.d} w={seg.w} />,
    )}
  </span>
);
