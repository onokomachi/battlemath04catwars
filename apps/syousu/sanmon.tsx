/** 小数のかけ算とわり算（syousu）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く） */
import { useState } from 'react';
import type { AppRoundDef } from '../types';
import { generateMulDiv, type MulDivLevel } from './lib/mulDivQuestions';
import { MulDivRound } from './components/modules/MulDivRounds';
import * as PV from './lib/placeValue';
import * as NL from './lib/numberLine';
import { generateAddSub, type AddSubLevel } from './lib/decimal';
import { generateError } from './lib/errorHunter';
import { ComposeActivity, CollectActivity, ScaleActivity, UnitActivity, PlaceIdActivity, DecomposeActivity } from './components/modules/PlaceValueLab';
import { CompareActivity, LineReadActivity, OrderActivity } from './components/modules/NumberLineModule';
import { AddSubSimulator } from './components/modules/DecimalAddSubModule';
import { ErrorRound } from './components/modules/ErrorHunterModule';

const noop = () => {};
const Round: AppRoundDef['Round'] = ({ level, onResult, onMiss }) => {
  const [q] = useState(() => generateMulDiv(level as MulDivLevel));
  return <MulDivRound q={q} onNext={noop} onResult={onResult} onMiss={onMiss} />;
};
const def = (levels: string[]): AppRoundDef => ({ levels, Round, make: (l) => generateMulDiv(l as MulDivLevel) });

export const SYOUSU_ROUNDS: Record<string, AppRoundDef> = {
  mul1: def(['mul-tenths']),
  mul2: def(['mul-hundredths']),
  div1: def(['div-basic', 'div-carry']),
  divInt: def(['div-int']),
  divRem: def(['div-remainder']),
  mulWord: def(['mul-word']),
  divWord: def(['div-word', 'div-word-remainder']),
  mul2digit: def(['mul-2digit', 'mul-zero-end']),
  div2digit: def(['div-2digit']),
  divRound: def(['div-round', 'div-check']),
  mental: def(['mul-mental', 'div-mental']),
  point: def(['mul-method', 'mul-point', 'div-point']),
  times: def(['div-times']),
};

/* ---- 小数のしくみ（位取り・数直線・たし算ひき算・まちがい探し）。ラウンド名は SANMON で決めた まとまりの名前 ---- */

type Act<L, Q> = React.FC<{ problem: Q; level: L; onNext: () => void; onResult?: (p: boolean) => void; onMiss?: () => void }>;
/** 問題を1回だけ作り、アプリの画面に渡す */
function rounds<L extends string, Q>(levels: L[], gen: (l: L) => Q, View: Act<L, Q>): AppRoundDef {
  const R: AppRoundDef['Round'] = ({ level, onResult, onMiss }) => {
    const [q] = useState(() => gen(level as L));
    return <View problem={q} level={level as L} onNext={noop} onResult={onResult} onMiss={onMiss} />;
  };
  return { levels, Round: R, make: (l) => gen(l as L) };
}
const CompareView: Act<NL.CompareLevel, NL.ComparePair> = ({ problem, ...p }) => <CompareActivity pair={problem} {...p} />;
const DecomposeView: Act<'decompose', PV.DecomposeProblem> = ({ problem, onNext, onResult, onMiss }) => (
  <DecomposeActivity problem={problem} onNext={onNext} onResult={onResult} onMiss={onMiss} />
);
const ErrorView: Act<'error', ReturnType<typeof generateError>> = ({ problem, onNext, onResult, onMiss }) => (
  <ErrorRound ex={problem} onNext={onNext} onResult={onResult} onMiss={onMiss} />
);

export const DECIMAL_ROUNDS: Record<string, AppRoundDef> = {
  compose: rounds<PV.ComposeLevel, PV.ComposeProblem>(['compose-2', 'compose-3'], PV.generateCompose, ComposeActivity),
  collect: rounds<PV.CollectLevel, PV.CollectProblem>(['collect-basic', 'collect-regroup'], (l) => PV.generateCollect(l), CollectActivity),
  scale: rounds<PV.ScaleLevel, PV.ScaleProblem>(['scale-10', 'scale-tenth', 'scale-100', 'scale-mix'], (l) => PV.generateScale(l), ScaleActivity),
  placeid: rounds<PV.PlaceIdLevel, PV.PlaceIdProblem>(['placeid-2', 'placeid-3'], (l) => PV.generatePlaceId(l), PlaceIdActivity),
  'unit-length': rounds<PV.UnitLevel, PV.UnitProblem>(['unit-length'], PV.generateUnit, UnitActivity),
  'unit-mass': rounds<PV.UnitLevel, PV.UnitProblem>(['unit-mass'], PV.generateUnit, UnitActivity),
  'unit-mix': rounds<PV.UnitLevel, PV.UnitProblem>(['unit-mix'], PV.generateUnit, UnitActivity),
  decompose: rounds<'decompose', PV.DecomposeProblem>(['decompose'], () => PV.generateDecompose(), DecomposeView),
  line: rounds<NL.LineLevel, NL.LineProblem>(['line-tenths', 'line-0to10', 'line-hundredths'], NL.generateLine, LineReadActivity),
  compare: rounds<NL.CompareLevel, NL.ComparePair>(['compare-tenths', 'compare-mixed', 'compare-int'], NL.generateCompare, CompareView),
  order: rounds<NL.OrderLevel, NL.OrderProblem>(['order-3', 'order-5'], NL.generateOrder, OrderActivity),
  ...Object.fromEntries((['add-basic', 'add-diff', 'sub-basic', 'sub-diff', 'sub-whole'] as AddSubLevel[]).map((l) => [l, rounds([l], generateAddSub, AddSubSimulator)])),
  error: rounds<'error', ReturnType<typeof generateError>>(['error'], () => generateError(), ErrorView),
};
