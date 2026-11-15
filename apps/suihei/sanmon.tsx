/** 垂直・平行と四角形（suihei）の解答画面を SANMON に出すための対応表（SANMON 用に手で書く） */
import { generate, type SkillId } from './lib/problems';
import { RELATION_LEVELS } from './lib/problems/relation';
import { DRAW_LEVELS } from './lib/problems/draw';
import { NAME_LEVELS } from './lib/problems/name';
import { PROPERTY_LEVELS } from './lib/problems/property';
import { DIAGONAL_LEVELS } from './lib/problems/diagonal';
import { TILING_LEVELS } from './lib/problems/tiling';
import { LIFE_LEVELS } from './lib/problems/life';
import { ERROR_LEVELS } from './lib/problems/errorHunter';
import { GeoRound } from './components/shared/GeoRound';
import { genericRounds } from '../_shims/questionRound';

const ids = (ls: { id: string }[]) => ls.map((l) => l.id);
const noop = () => {};
export const SUIHEI_ROUNDS = genericRounds(
  {
    relation: ids(RELATION_LEVELS), draw: ids(DRAW_LEVELS), name: ids(NAME_LEVELS), property: ids(PROPERTY_LEVELS),
    diagonal: ids(DIAGONAL_LEVELS), tiling: ids(TILING_LEVELS), life: ids(LIFE_LEVELS), error: ids(ERROR_LEVELS),
  },
  (id) => generate(id as SkillId),
  (q, h) => <GeoRound problem={q} onNext={noop} onResult={h.onResult} onMiss={h.onMiss} />,
);
