import React from 'react';
import { sfx } from '../../utils/audioEngine';
import type { Tone } from './Card';

export interface SegOption<V extends string> {
  value: V;
  label: React.ReactNode;
  /** ラベルの下に出す 小さな 行（星・わけ など） */
  sub?: React.ReactNode;
  tone?: Tone;
  /** 押せない見た目（まだ ひらいていない） */
  locked?: boolean;
  /** その ボタンに 付ける data 属性（data-tier など） */
  attrs?: Record<string, string>;
}

/** 横ならびの えらぶボタン（ラジオ）。高さ 56px いじょう。ひらいていないものも 押せる（わけを 出すため） */
export function Segmented<V extends string>({ value, onChange, options, label, className = '' }: {
  value: V; onChange: (v: V) => void; options: SegOption<V>[]; label: string; className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-disabled={o.locked || undefined}
          className={`cw-seg cw-press cw-tone-${o.tone ?? 'action'} min-h-[56px] px-2 py-2 flex flex-col items-center justify-center gap-0.5`}
          onClick={() => { sfx.select(); onChange(o.value); }} {...(o.attrs ?? {})}>
          <span className="text-cw-14 font-extrabold" style={{ color: o.locked ? 'var(--cw-fg-3)' : o.value === value ? 'var(--cw-fg)' : 'var(--tone)' }}>{o.label}</span>
          {o.sub && <span className="text-cw-12 leading-tight text-center" style={{ color: 'var(--cw-fg-3)' }}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}
