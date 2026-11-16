// このファイルは単元アプリ syo4-bainomikata の src/components/shared/ChoiceStage.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 式（または関係式）を選択肢からえらぶ段階。
 *
 * 単元テストでは式と答えが別々に採点され、「計算の答えが誤っていても式が正しければ配点してよい」
 * と明記されている。答えの数値だけを判定していると、式から誤った子と計算ミスをした子を
 * 区別できないため、式を独立した段階として置く。
 */
import React, { useState } from 'react';
import { HintBox } from '../ui/primitives';

interface Props {
  prompt: string;
  choices: string[];
  correctIndex: number;
  onCorrect: () => void;
  onMistake: () => void;
  /** まちがえたときに出すヒント */
  hint: string;
  accentBorder?: string;
  accentBg?: string;
}

export const ChoiceStage: React.FC<Props> = ({
  prompt, choices, correctIndex, onCorrect, onMistake, hint,
  accentBorder = 'hover:border-brand',
}) => {
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [shownHint, setShownHint] = useState<string | null>(null);

  const choose = (i: number) => {
    if (i === correctIndex) {
      onCorrect();
    } else {
      setPickedWrong(i);
      setShownHint(hint);
      onMistake();
    }
  };

  return (
    <div className="space-y-4">
      {shownHint && <HintBox tone="wrong">{shownHint}</HintBox>}
      <p className="text-center text-content font-black text-lg">{prompt}</p>
      <div className="grid grid-cols-1 gap-3">
        {choices.map((c, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
              pickedWrong === i
                ? 'bg-amber-50 border-amber-300 text-amber-500'
                : `bg-surface border-line text-content ${accentBorder}`
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
};
