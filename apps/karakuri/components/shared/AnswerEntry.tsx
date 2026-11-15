// このファイルは単元アプリ syo4-keisannokimari の src/components/shared/AnswerEntry.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数値の答えを入力する共通パーツ（表示＋テンキー）。
 * 位取りラボ・エラーハンターで再利用。小数点ボタン対応。
 */
import React, { useState } from 'react';
import { Keypad } from './Keypad';

interface Props {
  onSubmit: (value: string) => void;
  allowDecimal?: boolean;
  submitLabel?: string;
  accentText?: string; // 入力中の文字色（Tailwind クラス）
}

export const AnswerEntry: React.FC<Props> = ({ onSubmit, allowDecimal = true, submitLabel = 'こたえる', accentText = 'text-content' }) => {
  const [input, setInput] = useState('');

  const handleInput = (d: string) => {
    if (d === '.' && (input.includes('.') || input === '')) return; // 小数点は1つ・先頭は不可
    if (input.length >= 7) return;
    setInput(input + d);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="h-20 rounded-2xl bg-surface-2 border-2 border-line flex items-center justify-center">
        <span className={`text-5xl font-black tabular-nums ${accentText}`}>
          {input || <span className="text-faint">？</span>}
        </span>
      </div>
      <Keypad
        onInput={handleInput}
        onBackspace={() => setInput(input.slice(0, -1))}
        onSubmit={() => { if (input !== '') { onSubmit(input); setInput(''); } }}
        submitLabel={submitLabel}
        submitEnabled={input !== ''}
        allowDecimal={allowDecimal}
      />
    </div>
  );
};
