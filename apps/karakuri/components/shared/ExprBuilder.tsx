// このファイルは単元アプリ syo4-keisannokimari の src/components/shared/ExprBuilder.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * カードをタップして式を組み立てる入力。
 *
 * 紙のテストは「式と答え」を白紙に書く。4択で式を選べることは、白紙から式を書けることを保証しない
 * （再認より再生のほうが定着する：テスト効果のメタ分析 Rowland 2014）。
 * そこで、場面の数のカードと ＋－×÷( ) のカードを並べて、式を自分で作らせる。
 *
 * 数のカードは1回ずつしか使えない（場面の数をすべて使い切ることも判断のうち）。
 * 記号のカードは何回でも使える。まちがえたときも、作った式は残して直させる。
 */
import React from 'react';
import { Delete, RotateCcw } from 'lucide-react';

export interface BuiltToken { text: string; card: number | null }

const OPS = ['＋', '－', '×', '÷', '(', ')'];

export const ExprBuilder: React.FC<{
  cards: string[];
  tokens: BuiltToken[];
  onChange: (next: BuiltToken[]) => void;
  onSubmit: () => void;
  submitLabel?: string;
}> = ({ cards, tokens, onChange, onSubmit, submitLabel = 'この しきで けってい' }) => {
  const used = new Set(tokens.map((t) => t.card).filter((c): c is number => c !== null));

  return (
    <div className="space-y-4">
      {/* 組み立て中の式 */}
      <div className="min-h-20 rounded-2xl bg-surface-2 border-2 border-line flex flex-wrap items-center justify-center gap-1 px-3 py-3"
        aria-label="つくった しき" aria-live="polite">
        {tokens.length === 0
          ? <span className="text-faint font-bold">カードを タップして しきを つくろう</span>
          : tokens.map((t, i) => (
            <span key={i} className={`text-3xl md:text-4xl font-black tabular-nums ${t.card !== null ? 'text-content' : 'text-amber-600'}`}>
              {t.text}
            </span>
          ))}
      </div>

      {/* 数のカード */}
      <div className="flex flex-wrap justify-center gap-2">
        {cards.map((c, i) => (
          <button key={i} disabled={used.has(i)}
            onClick={() => onChange([...tokens, { text: c, card: i }])}
            className="min-w-16 px-4 py-3 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-95 bg-surface border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-25 disabled:active:scale-100">
            {c}
          </button>
        ))}
      </div>

      {/* 記号のカード */}
      <div className="grid grid-cols-6 gap-2">
        {OPS.map((o) => (
          <button key={o} onClick={() => onChange([...tokens, { text: o, card: null }])}
            className="py-3 rounded-2xl border-2 text-2xl font-black transition-all active:scale-95 bg-surface border-amber-300 text-amber-600 hover:bg-amber-50">
            {o}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onChange(tokens.slice(0, -1))} disabled={tokens.length === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40">
          <Delete size={18} /> 1つ けす
        </button>
        <button onClick={() => onChange([])} disabled={tokens.length === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40">
          <RotateCcw size={18} /> ぜんぶ けす
        </button>
        <button onClick={onSubmit} disabled={tokens.length === 0}
          className="py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black disabled:opacity-40">
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
