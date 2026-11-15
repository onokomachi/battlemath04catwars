/**
 * 「項目IDから問題を作る関数」と「どんな問題でも出せる1つの解答画面」でできたアプリ用の、ラウンドの作り方。
 * （面積・直方体・変わり方・垂直平行 など）
 */
import React, { useState } from 'react';
import type { AppRoundDef } from '../types';

export function genericRounds<Q>(
  groups: Record<string, string[]>,
  generate: (skillId: string) => Q,
  render: (q: Q, h: { onResult: (perfect: boolean) => void; onMiss: () => void }) => React.ReactNode,
): Record<string, AppRoundDef> {
  const Round: AppRoundDef['Round'] = ({ level, onResult, onMiss }) => {
    const [q] = useState(() => generate(level));
    return <>{render(q, { onResult, onMiss })}</>;
  };
  return Object.fromEntries(Object.entries(groups).map(([k, levels]) => [k, { levels, Round, make: generate }]));
}
