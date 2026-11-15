// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/OrderCards.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 作図の手順カードを正しい順に並べる解答UI。
 *
 * ドラッグ＆ドロップは指の操作精度の問題があるので使わず、
 * 「タップした順に 番号が つく」方式にする。まちがえたら 1枚ずつ もどせる。
 */
import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';

interface Props {
  steps: string[];
  onSubmit: (order: number[]) => void;
}

export const OrderCards: React.FC<Props> = ({ steps, onSubmit }) => {
  const [order, setOrder] = useState<number[]>([]);

  const tap = (i: number) => {
    if (order.includes(i)) return;
    setOrder((o) => [...o, i]);
  };

  const ready = order.length === steps.length;

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-muted">はじめに する ことから じゅんに タップしよう</p>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const pos = order.indexOf(i);
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              disabled={pos >= 0}
              className={`w-full p-4 rounded-2xl border-2 text-left font-bold leading-relaxed transition-all active:scale-[0.98] flex items-start gap-3 ${
                pos >= 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-surface border-line text-content hover:border-emerald-400'
              }`}
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-black ${
                  pos >= 0 ? 'bg-emerald-500 text-white' : 'bg-surface-3 text-faint'
                }`}
              >
                {pos >= 0 ? pos + 1 : '?'}
              </span>
              <span className="flex-1">{s}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setOrder((o) => o.slice(0, -1))}
          disabled={order.length === 0}
          className="px-5 py-4 rounded-2xl bg-surface border-2 border-line text-muted font-black disabled:opacity-40 flex items-center gap-2"
        >
          <Undo2 size={18} /> 1つ もどす
        </button>
        <button
          onClick={() => ready && onSubmit(order)}
          disabled={!ready}
          className={`flex-1 py-4 rounded-2xl text-xl font-black shadow-lg transition-all ${
            ready ? 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
          }`}
        >
          この じゅんばんで こたえる
        </button>
      </div>
    </div>
  );
};
