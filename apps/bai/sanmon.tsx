/** 倍の見方（bai）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く）。ラウンド名＝アプリの skill_id */
import type { AppRoundDef } from '../types';
import * as P from './lib/problems';
import { KihonRound } from './components/modules/KihonModule';
import { TimesRound } from './components/modules/TimesModule';
import { CompareRound } from './components/modules/CompareModule';
import { BaseRound } from './components/modules/BaseModule';
import { RatioCompareRound } from './components/modules/RatioCompareModule';
import { WordRound } from './components/modules/WordProblemModule';
import { BaiErrorRound } from './components/modules/ErrorHunterModule';

const noop = () => {};
type H = { onResult: (p: boolean) => void; onMiss: () => void };
const one = (level: string, make: () => unknown, render: (h: H) => React.ReactNode): AppRoundDef => ({
  levels: [level], make, Round: ({ onResult, onMiss }) => <>{render({ onResult, onMiss })}</>,
});
const c = (h: H) => ({ onNext: noop, onResult: h.onResult, onMiss: h.onMiss });
const each = <L extends string>(levels: { id: L }[], make: (l: L) => unknown, render: (l: L, h: H) => React.ReactNode) =>
  Object.fromEntries(levels.map(({ id }) => [id, one(id, () => make(id), (h) => render(id, h))]));

export const BAI_ROUNDS: Record<string, AppRoundDef> = {
  ...each(P.KIHON_LEVELS, P.generateKihon, (l, h) => <KihonRound level={l} {...c(h)} />),
  ...each(P.TIMES_LEVELS, P.generateTimes, (l, h) => <TimesRound level={l} {...c(h)} />),
  ...each(P.COMPARE_LEVELS, P.generateCompare, (l, h) => <CompareRound level={l} {...c(h)} />),
  ...each(P.BASE_LEVELS, P.generateBase, (l, h) => <BaseRound level={l} {...c(h)} />),
  ...each(P.RATIO_COMPARE_LEVELS, P.generateRatioCompare, (l, h) => <RatioCompareRound level={l} {...c(h)} />),
  ...each(P.WORD_LEVELS, P.generateWord, (l, h) => <WordRound level={l} {...c(h)} />),
  error: one('eh-bai', () => P.generateBaiError(), (h) => <BaiErrorRound {...c(h)} />),
};
