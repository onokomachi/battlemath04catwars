/**
 * 面積（menseki4）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く）。
 * キー＝SANMON のラウンド名、値＝そのラウンドで出すアプリの項目（skill_id）。
 */
import { generate } from './lib/problems';
import { QuestionRound } from './components/shared/QuestionRound';
import { genericRounds } from '../_shims/questionRound';

const noop = () => {};
export const MENSEKI4_ROUNDS = genericRounds(
  {
    rect: ['formula-rect'],
    square: ['formula-square'],
    side: ['side-find', 'side-square'],
    unit: ['unit-m2', 'unit-aha', 'unit-choose', 'unit-convert', 'unit-relation'],
    comp: ['comp-split', 'comp-sub', 'comp-which', 'comp-cshape', 'comp-road'],
    grid: ['grid-count', 'grid-half', 'grid-compare', 'grid-make'],
    formula: ['formula-word', 'formula-unit'],
    calc: ['calc-km', 'calc-mixunit', 'calc-a', 'calc-ha'],
    change: ['change-table', 'change-graph', 'change-max'],
    error: ['eh-perim', 'eh-unit', 'eh-conv', 'eh-half', 'eh-comp', 'eh-aha'],
  },
  generate,
  (q, h) => <QuestionRound question={q} onNext={noop} onResult={h.onResult} onMiss={h.onMiss} />,
);
