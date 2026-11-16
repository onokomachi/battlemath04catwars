/**
 * 計算のきまり（karakuri）の解答画面を SANMON に出すための対応表。
 * ここだけは SANMON 用に手で書く（ほかの apps/karakuri/ のファイルはアプリの写し）。
 */
import type { AppRoundDef } from '../types';
import { generateOrder, generateFirst, generateExpress, generateKufuu, generateLawCheck, generateTimes, generateDots, generateRead, generateInverse } from './lib/problems';
import { ORDER_LEVELS, EXPRESS_LEVELS, KUFUU_LEVELS, LAWCHECK_LEVELS, TIMES_LEVELS, DOTS_LEVELS, READ_LEVELS, INVERSE_LEVELS } from './lib/problems';
import type { OrderLevel, ExpressLevel, KufuuLevel, LawCheckLevel, TimesLevel, DotsLevel, ReadLevel, InverseLevel } from './lib/problems';
import { OrderRound } from './components/modules/OrderModule';
import { FirstPickRound } from './components/modules/FirstPickRound';
import { ExpressRound } from './components/modules/ExpressModule';
import { KufuuRound } from './components/modules/KufuuModule';
import { LawCheckRound } from './components/modules/LawCheckModule';
import { TimesRound } from './components/modules/TimesModule';
import { DotRound } from './components/modules/DotModule';
import { ReadRound } from './components/modules/ReadModule';
import { InverseRound } from './components/modules/InverseModule';

const ids = (ls: { id: string }[]) => ls.map((l) => l.id);
const noop = () => {};

export const KARAKURI_ROUNDS: Record<string, AppRoundDef> = {
  order: {
    levels: ids(ORDER_LEVELS),
    Round: ({ level, onResult, onMiss }) => level === 'order-first'
      ? <FirstPickRound onNext={noop} onResult={onResult} onMiss={onMiss} />
      : <OrderRound level={level as OrderLevel} onNext={noop} onResult={onResult} onMiss={onMiss} />,
    make: (l) => (l === 'order-first' ? generateFirst() : generateOrder(l as OrderLevel)),
  },
  express: { levels: ids(EXPRESS_LEVELS), make: (l) => generateExpress(l as ExpressLevel), Round: ({ level, onResult, onMiss }) => <ExpressRound level={level as ExpressLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  kufuu: { levels: ids(KUFUU_LEVELS), make: (l) => generateKufuu(l as KufuuLevel), Round: ({ level, onResult, onMiss }) => <KufuuRound level={level as KufuuLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  lawcheck: { levels: ids(LAWCHECK_LEVELS), make: (l) => generateLawCheck(l as LawCheckLevel), Round: ({ level, onResult, onMiss }) => <LawCheckRound level={level as LawCheckLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  times: { levels: ids(TIMES_LEVELS), make: (l) => generateTimes(l as TimesLevel), Round: ({ level, onResult, onMiss }) => <TimesRound level={level as TimesLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  dots: { levels: ids(DOTS_LEVELS), make: (l) => generateDots(l as DotsLevel), Round: ({ level, onResult, onMiss }) => <DotRound level={level as DotsLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  read: { levels: ids(READ_LEVELS), make: (l) => generateRead(l as ReadLevel), Round: ({ level, onResult, onMiss }) => <ReadRound level={level as ReadLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
  inverse: { levels: ids(INVERSE_LEVELS), make: (l) => generateInverse(l as InverseLevel), Round: ({ level, onResult, onMiss }) => <InverseRound level={level as InverseLevel} onNext={noop} onResult={onResult} onMiss={onMiss} /> },
};
