/** がい数（gaisu）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く）。ラウンド名＝アプリの skill_id */
import type { AppRoundDef } from '../types';
import * as P from './lib/problems';
import { MeaningRound } from './components/modules/MeaningModule';
import { RoundRound } from './components/modules/RoundModule';
import { RangeRound } from './components/modules/RangeModule';
import { SumDiffRound } from './components/modules/SumDiffModule';
import { ProdQuotRound } from './components/modules/ProdQuotModule';
import { RoundJudgeRound } from './components/modules/RoundJudgeModule';
import { GaisuErrorRound } from './components/modules/ErrorHunterModule';

const noop = () => {};
type H = { onResult: (p: boolean) => void; onMiss: () => void };
const one = (level: string, make: () => unknown, render: (h: H) => React.ReactNode): AppRoundDef => ({
  levels: [level], make, Round: ({ onResult, onMiss }) => <>{render({ onResult, onMiss })}</>,
});
const c = (h: H) => ({ onNext: noop, onResult: h.onResult, onMiss: h.onMiss });

export const GAISU_ROUNDS: Record<string, AppRoundDef> = {
  'meaning-man': one('meaning-man', () => P.generateMeaningNumber('meaning-man'), (h) => <MeaningRound level="meaning-man" {...c(h)} />),
  'meaning-sen': one('meaning-sen', () => P.generateMeaningNumber('meaning-sen'), (h) => <MeaningRound level="meaning-sen" {...c(h)} />),
  'meaning-scene': one('meaning-scene', () => P.generateMeaningScene(), (h) => <MeaningRound level="meaning-scene" {...c(h)} />),
  'round-which-place': one('round-which-place', () => P.generateRoundWhichPlace(), (h) => <RoundRound level="round-which-place" {...c(h)} />),
  'round-place': one('round-place', () => P.generateRoundPlace(), (h) => <RoundRound level="round-place" {...c(h)} />),
  'round-digit1': one('round-digit1', () => P.generateRoundDigit(1), (h) => <RoundRound level="round-digit1" {...c(h)} />),
  'round-digit2': one('round-digit2', () => P.generateRoundDigit(2), (h) => <RoundRound level="round-digit2" {...c(h)} />),
  'round-choose': one('round-choose', () => P.generateRoundChoose(), (h) => <RoundRound level="round-choose" {...c(h)} />),
  ...Object.fromEntries((['range-tens', 'range-hundreds', 'range-thousands'] as P.RangeLevel[]).map((l) => [l, one(l, () => P.generateRange(l), (h) => <RangeRound level={l} {...c(h)} />)])),
  ...Object.fromEntries((['sumdiff-add', 'sumdiff-sub', 'sumdiff-triple'] as P.SumDiffLevel[]).map((l) => [l, one(l, () => P.generateSumDiff(l), (h) => <SumDiffRound level={l} {...c(h)} />)])),
  ...Object.fromEntries((['prodquot-mul', 'prodquot-div', 'prodquot-word'] as P.ProdQuotLevel[]).map((l) => [l, one(l, () => P.generateProdQuot(l), (h) => <ProdQuotRound level={l} {...c(h)} />)])),
  'roundjudge-value': one('roundjudge-value', () => P.generateRoundJudgeValue(), (h) => <RoundJudgeRound level="roundjudge-value" {...c(h)} />),
  'roundjudge-method': one('roundjudge-method', () => P.generateRoundJudgeMethod(), (h) => <RoundJudgeRound level="roundjudge-method" {...c(h)} />),
  'roundjudge-budget': one('roundjudge-budget', () => P.generateRoundJudgeBudget(), (h) => <RoundJudgeRound level="roundjudge-budget" {...c(h)} />),
  'roundjudge-floor': one('roundjudge-floor', () => P.generateRoundJudgeFloor(), (h) => <RoundJudgeRound level="roundjudge-floor" {...c(h)} />),
  error: one('eh-gaisu', () => P.generateGaisuError(), (h) => <GaisuErrorRound {...c(h)} />),
};
