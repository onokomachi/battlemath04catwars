// このファイルは単元アプリ syo4-bunnsu の src/components/shared/ProbScratch.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 問題ごとの「けいさんらん」。設定（Prob.scratch）に合わせて、kit のけいさんらんを出す。
 *   - kind: 'frac' … 分数のけいさんらん（仮分数・帯分数／くり下げ）
 *   - ops/decimal … 筆算のけいさんらん（わり算・かけ算など）
 * どちらも採点しない書き込み専用。はじめは閉じている。
 */
import React from 'react';
import { FractionPadToggle, ScratchPadToggle } from 'learning-app-kit/react';
import type { FracScratch, Scratch } from '../../lib/problems';

export const ProbScratch: React.FC<{ scratch: Scratch | FracScratch; label?: string }> = ({ scratch, label }) => {
  if ('tools' in scratch) {
    return <FractionPadToggle tools={scratch.tools} initial={scratch.initial} label={label} />;
  }
  return <ScratchPadToggle ops={scratch.ops} decimal={scratch.decimal} initial={scratch.initial} label={label} />;
};
