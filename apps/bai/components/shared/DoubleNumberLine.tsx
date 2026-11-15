// このファイルは単元アプリ syo4-bainomikata の src/components/shared/DoubleNumberLine.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 二重数直線（テープ図＋倍の目盛り）。
 *
 * 単元テストの図とおなじ構造で、上下2つの数の体系をそろえて見せる。
 *   上：量（kg・m・円 など）  ／  下：割合（倍。0・1・□倍の目盛り）
 * この「もとにする量を1とみる」対応づけが単元の中核であり、5年「割合」への橋渡しになる。
 *
 * 各スロットは □（未記入）／記入ずみ／はじめから与えられている の3状態を表示できる。
 * 記入中のスロットは active でハイライトする。表示だけの用途にも使える。
 */
import React from 'react';

export type DnlSlotKey = 'compareValue' | 'baseValue' | 'baseTick' | 'timesTick';

interface Props {
  baseLabel: string;
  compareLabel: string;
  /** 比較量が基準量の何倍か（帯の長さ・目盛りの数に使う） */
  times: number;
  /** 上の帯ぜんたいの量（例 "140kg"／"□"） */
  compareValue: React.ReactNode;
  /** 下の短い帯の量（例 "20kg"／"□"） */
  baseValue: React.ReactNode;
  /** 倍の目盛り：もとにする量の位置（ふつう "1"／"□"） */
  baseTick: React.ReactNode;
  /** 倍の目盛り：くらべられる量の位置（例 "7"／"□"） */
  timesTick: React.ReactNode;
  /** 記入中のスロット（点滅ハイライト） */
  activeKey?: DnlSlotKey | null;
}

/** 目盛りが増えすぎて つぶれないよう、表示上の上限を設ける */
const MAX_UNITS = 10;

const Slot: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  tone: 'amount' | 'tick';
}> = ({ children, active, tone }) => (
  <span
    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-black tabular-nums whitespace-nowrap transition-all ${
      tone === 'amount' ? 'text-sm' : 'text-xs'
    } ${
      active
        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400 animate-pulse'
        : 'bg-surface-3 text-content'
    }`}
  >
    {children}
  </span>
);

export const DoubleNumberLine: React.FC<Props> = ({
  baseLabel, compareLabel, times, compareValue, baseValue, baseTick, timesTick, activeKey,
}) => {
  const units = Math.max(2, Math.min(Math.round(times), MAX_UNITS));
  const basePct = 100 / units;

  return (
    <div className="w-full select-none">
      {/* 上：くらべられる量ぜんたい（かっこ書きの量） */}
      <div className="flex items-end mb-1" style={{ paddingLeft: '5.5rem' }}>
        <div className="flex-1 flex justify-center">
          <Slot tone="amount" active={activeKey === 'compareValue'}>{compareValue}</Slot>
        </div>
      </div>
      <div className="flex items-center mb-2" style={{ paddingLeft: '5.5rem' }}>
        <div className="flex-1 h-2 border-l-2 border-r-2 border-t-2 border-faint/50 rounded-t-md" />
      </div>

      {/* 帯：くらべられる量 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-20 shrink-0 text-xs font-black text-muted truncate text-right">{compareLabel}</span>
        <div className="flex-1 h-8 rounded-lg bg-surface-3 overflow-hidden flex">
          <div className="h-full w-full bg-rose-400/90 rounded-lg" />
        </div>
      </div>

      {/* 帯：もとにする量 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-20 shrink-0 text-xs font-black text-muted truncate text-right">{baseLabel}</span>
        <div className="flex-1 h-8 rounded-lg bg-surface-3 overflow-hidden flex">
          <div
            className="h-full bg-sky-400/90 rounded-lg flex items-center justify-center"
            style={{ width: `${basePct}%` }}
          >
            <span className="text-[10px] font-black text-white/95 px-1 truncate">
              {activeKey === 'baseValue' ? '' : null}
            </span>
          </div>
        </div>
      </div>
      {/* もとにする量の値（帯が細いときも読めるよう帯の下に出す） */}
      <div className="flex items-center gap-2 mb-2">
        <span className="w-20 shrink-0" />
        <div className="flex-1 relative h-6">
          <div className="absolute top-0" style={{ left: 0, width: `${basePct}%` }}>
            <div className="flex justify-center">
              <Slot tone="amount" active={activeKey === 'baseValue'}>{baseValue}</Slot>
            </div>
          </div>
        </div>
      </div>

      {/* 下：倍の数直線 */}
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0" />
        <div className="flex-1 relative">
          <div className="h-0.5 bg-content/70 w-full" />
          <div className="absolute inset-x-0 top-0 flex">
            {Array.from({ length: units + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 bg-content/70"
                style={{ left: `${(100 / units) * i}%`, height: i === 0 || i === units ? 10 : 6, top: -3 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 倍の目盛りラベル（0 / 1 / □倍） */}
      <div className="flex items-start gap-2 mt-2">
        <span className="w-20 shrink-0" />
        <div className="flex-1 relative h-7">
          <span className="absolute -translate-x-1/2 text-xs font-black text-muted tabular-nums" style={{ left: 0 }}>0</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${basePct}%` }}>
            <Slot tone="tick" active={activeKey === 'baseTick'}>{baseTick}</Slot>
          </span>
          <span className="absolute -translate-x-1/2 flex items-center gap-0.5" style={{ left: '100%' }}>
            <Slot tone="tick" active={activeKey === 'timesTick'}>{timesTick}</Slot>
            <span className="text-[10px] font-black text-muted">倍</span>
          </span>
        </div>
      </div>
    </div>
  );
};
