/** 変わり方調べ（kawari）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く） */
import { generate, type SkillId } from './lib/problems';
import { KawariRound } from './components/shared/KawariRound';
import { genericRounds } from '../_shims/questionRound';

const noop = () => {};
export const KAWARI_ROUNDS = genericRounds(
  {
    table: ['tbl-times', 'tbl-diff', 'tbl-sum', 'tbl-prod', 'tbl-linear', 'tbl-yoko', 'tbl-tate'],
    find: ['find-change', 'find-direction', 'find-decide', 'find-pair'],
    rule: ['rule-const', 'rule-kind', 'rule-word', 'rule-hidden'],
    expr: ['exp-scene', 'exp-times', 'exp-diff', 'exp-sum', 'exp-prod', 'exp-linear', 'exp-equiv', 'exp-build', 'exp-totable', 'exp-toscene'],
    graph: ['gra-plot', 'gra-read', 'gra-half', 'gra-zero', 'gra-next', 'gra-kind'],
    apply: ['app-nth', 'app-inv', 'app-limit', 'app-sumdiff', 'app-maxarea', 'app-life'],
    error: ['eh-changecorr', 'eh-reverse', 'eh-plusb', 'eh-sumdir', 'eh-rowmix', 'eh-zero'],
  },
  (id) => generate(id as SkillId),
  (q, h) => <KawariRound problem={q} onNext={noop} onAnswered={(perfect) => h.onResult(perfect)} onMissed={h.onMiss} />,
);
