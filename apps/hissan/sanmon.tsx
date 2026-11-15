/** わり算の筆算（hissan）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く）。ラウンド名＝アプリの skill_id */
import React from 'react';
import type { AppRoundDef } from '../types';
import * as P from './lib/problems';
import { MentalRound } from './components/modules/MentalModule';
import { RulesRound } from './components/modules/RulesModule';
import { CheckRound } from './components/modules/CheckModule';
import { EstimateRound } from './components/modules/EstimateModule';
import { WordRound } from './components/modules/WordProblemModule';
import { DivErrorRound } from './components/modules/ErrorHunterModule';
import { DivisionSimulator } from './components/DivisionSimulator';
import { generateProblem } from './components/ProblemGenerator';
import type { Difficulty, Problem as HissanProblem } from './types';

const noop = () => {};
type H = { onResult: (p: boolean) => void; onMiss: () => void };
const one = (level: string, make: () => unknown, render: (h: H) => React.ReactNode): AppRoundDef => ({
  levels: [level], make, Round: ({ onResult, onMiss }) => <>{render({ onResult, onMiss })}</>,
});
const c = (h: H) => ({ onNext: noop, onResult: h.onResult, onMiss: h.onMiss });
const each = <L extends string>(levels: { id: L }[], make: (l: L) => unknown, render: (l: L, h: H) => React.ReactNode) =>
  Object.fromEntries(levels.map(({ id }) => [id, one(id, () => make(id), (h) => render(id, h))]));

/** 筆算シミュレーター（アプリの「筆算」モジュール）。最後まで解いて、まちがいが0なら ○ */
function hissanRound(level: string, make: () => HissanProblem): AppRoundDef {
  return {
    levels: [level],
    make,
    Round: ({ onResult }) => {
      const [p] = React.useState(make);
      return (
        <div style={{ minHeight: 660 }} className="flex flex-col">
          <DivisionSimulator problem={p} onBack={noop} onFinish={(r) => onResult(r.isPerfect)} />
        </div>
      );
    },
  };
}
const longDiv = (d: Difficulty) => () => generateProblem(d, true);
/** 商のとちゅうか おわりに 0 が たつ 3けた÷1けた */
const zeroInQuotient = () => {
  for (let i = 0; i < 300; i++) {
    const p = generateProblem('3-1', true);
    if (String(p.quotient).slice(1).includes('0')) return p;
  }
  return generateProblem('3-1', true);
};

export const HISSAN_ROUNDS: Record<string, AppRoundDef> = {
  ...each(P.MENTAL_LEVELS, P.generateMental, (l, h) => <MentalRound level={l} {...c(h)} />),
  ...each(P.RULES_LEVELS, P.generateRules, (l, h) => <RulesRound level={l} {...c(h)} />),
  ...each(P.CHECK_LEVELS, P.generateCheck, (l, h) => <CheckRound level={l} {...c(h)} />),
  ...each(P.ESTIMATE_LEVELS, P.generateEstimate, (l, h) => <EstimateRound level={l} {...c(h)} />),
  ...each(P.WORD_LEVELS, P.generateWord, (l, h) => <WordRound level={l} {...c(h)} />),
  error: one('eh-div', () => P.generateDivError(), (h) => <DivErrorRound {...c(h)} />),
  'hissan-2-1': hissanRound('hissan-2-1', longDiv('2-1')),
  'hissan-3-1': hissanRound('hissan-3-1', longDiv('3-1')),
  'hissan-zero': hissanRound('hissan-3-1', zeroInQuotient),
  'hissan-2-2': hissanRound('hissan-2-2', longDiv('2-2')),
  'hissan-3-2': hissanRound('hissan-3-2', longDiv('3-2')),
  'hissan-3-3': hissanRound('hissan-3-3', longDiv('3-3')),
};
