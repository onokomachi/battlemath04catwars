// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/components/shared/Keypad.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 共通テンキー（既存 DivisionSimulator のキーパッドを部品化）。
 * 大きなタッチターゲット・タイマー無し・やさしい配色。小数点ボタンに対応。
 */
import React from 'react';
import { Delete } from 'lucide-react';

interface Props {
  onInput: (digit: string) => void;
  onBackspace: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitEnabled?: boolean;
  allowDecimal?: boolean;
}

export const Keypad: React.FC<Props> = ({
  onInput,
  onBackspace,
  onSubmit,
  submitLabel = 'チェック',
  submitEnabled = true,
  allowDecimal = false,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => onInput(n.toString())}
            className="h-20 bg-surface-3 hover:bg-surface-3 active:bg-blue-600 active:text-white rounded-2xl text-3xl font-black text-content transition-all flex items-center justify-center shadow-sm"
          >
            {n}
          </button>
        ))}

        {allowDecimal ? (
          <button
            onClick={() => onInput('.')}
            className="h-20 bg-amber-50 hover:bg-amber-100 active:bg-amber-500 active:text-white rounded-2xl text-4xl font-black text-amber-600 transition-all flex items-center justify-center shadow-sm leading-none"
            aria-label="小数点"
          >
            ・
          </button>
        ) : (
          <div className="h-20" />
        )}

        <button
          onClick={() => onInput('0')}
          className="h-20 bg-surface-3 hover:bg-surface-3 active:bg-blue-600 active:text-white rounded-2xl text-3xl font-black text-content transition-all flex items-center justify-center shadow-sm"
        >
          0
        </button>

        <button
          onClick={onBackspace}
          className="h-20 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl flex items-center justify-center transition-all shadow-sm"
          aria-label="ひとつけす"
        >
          <Delete size={32} />
        </button>
      </div>

      {onSubmit && (
        <button
          onClick={onSubmit}
          disabled={!submitEnabled}
          className={`w-full py-6 rounded-3xl text-2xl font-black shadow-lg transition-all flex items-center justify-center gap-3 ${
            submitEnabled
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
              : 'bg-surface-3 text-faint'
          }`}
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
};
