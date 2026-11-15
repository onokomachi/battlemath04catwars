// このファイルは単元アプリ wari-hissann3 の src/components/shared/QuotRemEntry.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「商」と「あまり」を入力する共通パーツ（表示＋テンキー）。
 * あんざん・文章題・エラーハンターで再利用。
 * あまり欄はタップ（または商の入力後「→あまり」）で切り替え。
 */
import React, { useState } from 'react';
import { Keypad } from './Keypad';

interface Props {
  /** あまり欄を表示するか（わりきれる問題では false） */
  withRemainder: boolean;
  onSubmit: (quotient: string, remainder: string) => void;
  submitLabel?: string;
}

export const QuotRemEntry: React.FC<Props> = ({ withRemainder, onSubmit, submitLabel = 'こたえる' }) => {
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [field, setField] = useState<'q' | 'r'>('q');

  const value = field === 'q' ? q : r;
  const setValue = field === 'q' ? setQ : setR;

  const handleInput = (d: string) => {
    if (value.length >= 5) return;
    setValue(value + d);
  };

  const canSubmit = q !== '' && (!withRemainder || r !== '');

  const FieldBox: React.FC<{ id: 'q' | 'r'; label: string; val: string }> = ({ id, label, val }) => (
    <button
      onClick={() => setField(id)}
      className={`flex-1 rounded-2xl border-2 p-3 transition-all ${
        field === id ? 'border-brand bg-surface-2 ring-2 ring-brand/30' : 'border-line bg-surface-2/50'
      }`}
    >
      <span className="block text-xs font-black text-faint mb-1">{label}</span>
      <span className="block text-4xl font-black tabular-nums text-content min-h-[2.5rem]">
        {val || <span className="text-faint">？</span>}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-stretch">
        <FieldBox id="q" label={withRemainder ? '商' : 'こたえ'} val={q} />
        {withRemainder && (
          <>
            <span className="self-center text-lg font-black text-muted shrink-0">あまり</span>
            <FieldBox id="r" label="あまり" val={r} />
          </>
        )}
      </div>
      <Keypad
        onInput={handleInput}
        onBackspace={() => setValue(value.slice(0, -1))}
        onSubmit={() => {
          if (!canSubmit) {
            // 商だけ入っていてあまりが空なら、あまり欄へフォーカスを移す
            if (q !== '' && withRemainder && r === '') setField('r');
            return;
          }
          onSubmit(q, r);
          setQ('');
          setR('');
          setField('q');
        }}
        submitLabel={submitLabel}
        submitEnabled={canSubmit}
      />
    </div>
  );
};
