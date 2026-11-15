// このファイルは単元アプリ syo4-bunnsu の src/components/shared/ExprBuilder.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * カードをタップして、文章題の式を組み立てる入力。
 *
 * 紙のテストは「式」を自分で書く。3つから式を選べても、白紙から式を書けることは保証できない
 * （再認より再生のほうが定着する）。そこで、問題文の数のカード（分数・帯分数は縦書き）と ＋ － × ÷ のカードを並べて、
 * 式を自分で作らせる。数のカードには問題文に出てこない「ダミー」がまざっている（当てずっぽうが効かない）。
 *
 * 数のカードは1回ずつしか使えない。記号のカードは何回でも使える。まちがえたときも、作った式は残して直させる。
 * 手書き文字の認識はしない（タップで置く）。
 */
import React, { useState } from 'react';
import { Delete, RotateCcw } from 'lucide-react';
import { RichText } from './Frac';

export interface BuiltToken { text: string; card: number | null }

const OPS = ['＋', '－', '×', '÷'];

export const ExprBuilder: React.FC<{
  cards: string[];
  onSubmit: (expr: string[]) => void;
}> = ({ cards, onSubmit }) => {
  const [tokens, setTokens] = useState<BuiltToken[]>([]);
  const used = new Set(tokens.map((t) => t.card).filter((c): c is number => c !== null));

  return (
    <div className="space-y-4" data-testid="expr-builder">
      {/* 組み立て中の式 */}
      <div
        className="min-h-20 rounded-2xl bg-surface-2 border-2 border-line flex flex-wrap items-center justify-center gap-2 px-3 py-3"
        aria-label="つくった しき" aria-live="polite" data-testid="expr-line"
      >
        {tokens.length === 0
          ? <span className="text-faint font-bold">カードを タップして しきを つくろう</span>
          : tokens.map((t, i) => (
            <span key={i} className={`text-3xl md:text-4xl font-black ${t.card !== null ? 'text-content' : 'text-amber-600'}`}>
              <RichText text={t.text} />
            </span>
          ))}
      </div>

      {/* 数のカード（ダミーまじり） */}
      <div className="flex flex-wrap justify-center gap-2">
        {cards.map((c, i) => (
          <button
            key={i}
            data-testid={`expr-card-${i}`}
            disabled={used.has(i)}
            onClick={() => setTokens((t) => [...t, { text: c, card: i }])}
            className="min-w-16 px-4 py-3 rounded-2xl border-2 text-2xl font-black transition-all active:scale-95 bg-surface border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-25 disabled:active:scale-100"
          >
            <RichText text={c} />
          </button>
        ))}
      </div>

      {/* 記号のカード */}
      <div className="grid grid-cols-4 gap-2">
        {OPS.map((o) => (
          <button
            key={o}
            data-testid={`expr-op-${o}`}
            onClick={() => setTokens((t) => [...t, { text: o, card: null }])}
            className="py-3 rounded-2xl border-2 text-2xl font-black transition-all active:scale-95 bg-surface border-amber-300 text-amber-600 hover:bg-amber-50"
          >
            {o}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setTokens((t) => t.slice(0, -1))} disabled={tokens.length === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <Delete size={18} /> 1つ けす
        </button>
        <button
          onClick={() => setTokens([])} disabled={tokens.length === 0}
          className="py-3 rounded-2xl border-2 border-line bg-surface text-content font-bold flex items-center justify-center gap-1 disabled:opacity-40"
        >
          <RotateCcw size={18} /> ぜんぶ けす
        </button>
        <button
          data-testid="expr-submit"
          onClick={() => onSubmit(tokens.map((t) => t.text))} disabled={tokens.length === 0}
          className="py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black disabled:opacity-40"
        >
          この しきで けってい
        </button>
      </div>
    </div>
  );
};
