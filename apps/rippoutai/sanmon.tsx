/** 直方体と立方体（rippoutai）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く） */
import { generate } from './lib/problems';
import { QuestionRound } from './components/shared/QuestionRound';
import { genericRounds } from '../_shims/questionRound';

const noop = () => {};
export const RIPPOUTAI_ROUNDS = genericRounds(
  {
    kousei: ['kousei-sort', 'kousei-cube', 'kousei-cuboid', 'kousei-higo', 'kousei-paper'],
    heiko: ['heiko-face', 'heiko-edge', 'heiko-edgeperp', 'heiko-faceedge'],
    tenkai: ['tenkai-cubeok', 'tenkai-cube', 'tenkai-cuboid', 'tenkai-face', 'tenkai-point', 'tenkai-edge'],
    mitori: ['mitori-count', 'mitori-hidden', 'mitori-draw'],
    ichi: ['ichi-read', 'ichi-plot', 'ichi-space'],
    katsuyo: ['katsuyo-ribbon', 'katsuyo-ribbonnet'],
    error: ['eh-edges', 'eh-face', 'eh-hidden', 'eh-net', 'eh-overlap', 'eh-parallel', 'eh-perp', 'eh-ichi'],
  },
  generate,
  (q, h) => <QuestionRound question={q} onNext={noop} onResult={h.onResult} onMiss={h.onMiss} />,
);
