// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/AnswerEntry.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数値の答えを入力する共通パーツ（表示＋テンキー）。
 * この単元で答えるのは 角度（度）・長さ（cm・マス）・本数 なので、
 * 小数は既定で使わず、単位を表示に添える。
 */
import React, { useState } from 'react';
import { Keypad } from './Keypad';

interface Props {
  onSubmit: (value: string) => void;
  allowDecimal?: boolean;
  submitLabel?: string;
  /** 入力欄のうしろに出す単位（'度' / 'cm' / 'マス' など） */
  unit?: string;
  accentText?: string; // 入力中の文字色（Tailwind クラス）
}

export const AnswerEntry: React.FC<Props> = ({
  onSubmit,
  allowDecimal = false,
  submitLabel = 'こたえる',
  unit,
  accentText = 'text-content',
}) => {
  const [input, setInput] = useState('');

  const handleInput = (d: string) => {
    if (d === '.' && (input.includes('.') || input === '')) return; // 小数点は1つ・先頭は不可
    if (input.length >= 7) return;
    setInput(input + d);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="h-20 rounded-2xl bg-surface-2 border-2 border-line flex items-center justify-center gap-2">
        <span className={`text-5xl font-black tabular-nums ${accentText}`}>
          {input || <span className="text-faint">？</span>}
        </span>
        {unit && <span className="text-2xl font-black text-muted">{unit}</span>}
      </div>
      <Keypad
        onInput={handleInput}
        onBackspace={() => setInput(input.slice(0, -1))}
        onSubmit={() => {
          if (input !== '') {
            onSubmit(input);
            setInput('');
          }
        }}
        submitLabel={submitLabel}
        submitEnabled={input !== ''}
        allowDecimal={allowDecimal}
      />
    </div>
  );
};
