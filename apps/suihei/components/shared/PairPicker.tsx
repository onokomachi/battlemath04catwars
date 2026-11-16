// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/PairPicker.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「垂直な直線の組を すべて答えましょう」型の解答UI。
 * 現物の単元テスト大問3と同じ答え方（記号の組を並べる）を再現する。
 *
 * 2つの記号をタップすると1組ができ、組を並べていく。組の数を先に教えないのは、
 * 「いくつ あるか」を数えることもこの問題の技能に含まれるため。
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  symbols: string[];
  relation: '垂直' | '平行';
  onSubmit: (pairs: [number, number][]) => void;
}

export const PairPicker: React.FC<Props> = ({ symbols, relation, onSubmit }) => {
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [pending, setPending] = useState<number | null>(null);

  const tap = (i: number) => {
    if (pending === null) {
      setPending(i);
      return;
    }
    if (pending === i) {
      setPending(null);
      return;
    }
    const a = Math.min(pending, i);
    const b = Math.max(pending, i);
    setPending(null);
    setPairs((ps) => (ps.some(([x, y]) => x === a && y === b) ? ps : [...ps, [a, b]]));
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-3xl p-4">
        <p className="text-sm font-bold text-muted mb-3">
          {pending === null ? '記号を 2つ タップして 組を つくろう' : `「${symbols[pending]}」と 組に する 記号を えらぼう`}
        </p>
        <div className="flex flex-wrap gap-2">
          {symbols.map((s, i) => (
            <button
              key={i}
              onClick={() => tap(i)}
              className={`w-14 h-14 rounded-2xl border-2 font-black text-xl transition-all active:scale-95 ${
                pending === i ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-surface border-line text-content hover:border-blue-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-2 border border-line rounded-3xl p-4 min-h-[76px]">
        <p className="text-sm font-black text-muted mb-2">{relation}な 直線の組</p>
        {pairs.length === 0 ? (
          <p className="text-faint font-bold">まだ ありません</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pairs.map(([a, b], i) => (
              <span key={i} className="inline-flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-blue-100 text-blue-800 font-black">
                （{symbols[a]} と {symbols[b]}）
                <button
                  onClick={() => setPairs((ps) => ps.filter((_, k) => k !== i))}
                  className="w-6 h-6 rounded-full bg-blue-200 hover:bg-blue-300 flex items-center justify-center"
                  aria-label="この組を けす"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onSubmit(pairs)}
        disabled={pairs.length === 0}
        className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
          pairs.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95' : 'bg-surface-3 text-faint'
        }`}
      >
        これで こたえる
      </button>
    </div>
  );
};
