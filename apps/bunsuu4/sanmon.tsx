/** 分数（bunsuu4）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く） */
import type { AppRoundDef } from '../types';
import { generate } from './lib/problems';
import { generateError } from './lib/errorHunter';
import { FractionRound } from './components/modules/FractionRound';
import { ErrorRound } from './components/modules/ErrorHunterModule';

const noop = () => {};
const frac = (levels: string[]): AppRoundDef => ({
  levels, make: generate,
  Round: ({ level, onResult, onMiss }) => <FractionRound skillId={level} onNext={noop} onResult={onResult} onMiss={onMiss} />,
});

export const BUNSUU4_ROUNDS: Record<string, AppRoundDef> = {
  kind: frac(['hyo-kind']), unit: frac(['hyo-unit']), line: frac(['hyo-line']),
  toMixed: frac(['hen-mixed']), toImp: frac(['hen-imp']), eqLine: frac(['eq-line']), cmpSame: frac(['cmp-same']),
  addBasic: frac(['add-basic']), addMixed: frac(['add-mixed']), addCarry: frac(['add-carry']), addOne: frac(['add-one']),
  subBasic: frac(['sub-basic']), subMixed: frac(['sub-mixed']), subBorrow: frac(['sub-borrow']), subFrom: frac(['sub-from']),
  wpAdd: frac(['wp-add']), wpSub: frac(['wp-sub', 'wp-rem']),
  figure: frac(['hyo-tape', 'hyo-draw', 'add-fig']), divMixed: frac(['hen-div']), equiv: frac(['eq-tap', 'eq-pick']),
  cmpNum: frac(['cmp-num', 'cmp-order']), whole: frac(['add-whole', 'sub-whole']), prog: frac(['wp-prog']),
  error: {
    levels: ['eh-judge', 'eh-den', 'eh-carry', 'eh-borrow', 'eh-whole', 'eh-wadd', 'eh-tomix', 'eh-toimp', 'eh-cmp', 'eh-mixcmp', 'eh-eq'],
    make: generateError,
    Round: ({ level, onResult, onMiss }) => <ErrorRound skillId={level} onNext={noop} onResult={onResult} onMiss={onMiss} />,
  },
};
