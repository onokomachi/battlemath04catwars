// このファイルは単元アプリ syo4-bainomikata の src/components/shared/DiagramFillStage.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「下の図の□にあてはまる数を書きましょう」の段階。
 *
 * 二重数直線の□を1つずつ順にうめさせる（手順分解方式）。
 * ドラッグ等の高度な操作は使わず、□をハイライト → テンキーで入力 → 確定、をくり返す。
 * 単元テストでは各大問の①がこの形式で、配点全体の約3割を占める中核技能。
 */
import React, { useState } from 'react';
import { DoubleNumberLine, DnlSlotKey } from './DoubleNumberLine';
import { AnswerEntry } from './AnswerEntry';
import { HintBox } from '../ui/primitives';

export interface DiagramBlank {
  key: DnlSlotKey;
  /** 正解の数 */
  value: number;
  /** 正解したあとに図へ表示する文字列（単位つきなど） */
  display: string;
  /** その□をうめるときの問いかけ */
  prompt: string;
  /** まちがえたときのヒント */
  hint: string;
}

interface Props {
  baseLabel: string;
  compareLabel: string;
  times: number;
  /** □でない（はじめから与えられている）スロットの表示 */
  given: Partial<Record<DnlSlotKey, React.ReactNode>>;
  /** 順にうめさせる□ */
  blanks: DiagramBlank[];
  onComplete: () => void;
  onMistake: () => void;
  accentText?: string;
}

export const DiagramFillStage: React.FC<Props> = ({
  baseLabel, compareLabel, times, given, blanks, onComplete, onMistake, accentText = 'text-content',
}) => {
  const [index, setIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const current = blanks[index];

  const slotContent = (key: DnlSlotKey): React.ReactNode => {
    const bIdx = blanks.findIndex((b) => b.key === key);
    if (bIdx === -1) return given[key] ?? '□';
    if (bIdx < index) return blanks[bIdx].display; // 記入ずみ
    return '□';
  };

  const submit = (v: string) => {
    if (!current) return;
    if (Number(v) === current.value) {
      setHint(null);
      if (index + 1 >= blanks.length) {
        setIndex(index + 1);
        onComplete();
      } else {
        setIndex(index + 1);
      }
    } else {
      setHint(current.hint);
      onMistake();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-[28px] shadow-lg p-5 md:p-6">
        <p className="text-sm font-black text-muted mb-4">下の図の □ に あてはまる数を 書きましょう</p>
        <DoubleNumberLine
          baseLabel={baseLabel}
          compareLabel={compareLabel}
          times={times}
          compareValue={slotContent('compareValue')}
          baseValue={slotContent('baseValue')}
          baseTick={slotContent('baseTick')}
          timesTick={slotContent('timesTick')}
          activeKey={current?.key ?? null}
        />
      </div>

      {hint && <HintBox tone="wrong">{hint}</HintBox>}

      {current && (
        <div>
          <p className="text-center text-content font-black text-lg mb-3">{current.prompt}</p>
          <AnswerEntry onSubmit={submit} allowDecimal={false} accentText={accentText} />
        </div>
      )}
    </div>
  );
};
