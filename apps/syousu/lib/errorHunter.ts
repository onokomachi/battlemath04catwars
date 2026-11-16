// このファイルは単元アプリ syo4-syousu-v2 の src/lib/errorHunter.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * エラーハンター（誤り例＝Erroneous Examples）の純粋ロジック。
 * 資料: 事前知識の低い児童ほど、誤答を見つけ→直し→理由を言語化する活動が遅延テストで効く（エビレベルII）。
 * 「正しい/まちがい」を判断 →（まちがいなら）正しい答えを入れる → 理由をえらぶ、の3段階。
 */

export type FixKind = 'number' | 'sign';

/** 理由の文は 5つとも 同じ長さに そろえてある（長さで 当てられないように。2026-11）。かえるときも 長さを そろえる */
export const REASONS = {
  POINT: '答えの 小数点の 位置を、ずらして うって いた',
  ALIGN: '小数点を そろえずに、右はしを そろえて いた',
  MEGZ: 'けたが 長いほうが、大きい 数だと 思いこんだ',
  REGROUP: '10こで 1くり上げる「両替」を しなかった',
  BORROW: 'くり下がりで、上の 位から 1 を かりなかった',
};

export interface ErrorExample {
  character: string;
  expr: string; // 表示する式（誤りを含む）
  speak: string; // 読み上げ用
  isCorrect: boolean; // この式は正しいか
  fixKind: FixKind;
  correctAnswer: string; // 数 or '>'/'<'/'='
  reasonOptions: string[];
  correctReasonIndex: number;
}

const CHARS = ['りく', 'はな', 'そら', 'みお', 'けん', 'あい'];
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildReasons(correct: string): { options: string[]; index: number } {
  const all = [REASONS.POINT, REASONS.ALIGN, REASONS.MEGZ, REASONS.REGROUP, REASONS.BORROW];
  const distractors = all.filter((r) => r !== correct).sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { options, index: options.indexOf(correct) };
}

type Builder = () => ErrorExample;

// かけ算で小数点を忘れる誤り（1.2 × 4 = 48 → 正 4.8）
const mulPoint: Builder = () => {
  const a = rnd(11, 49) / 10;
  const b = rnd(2, 9);
  const intProduct = Math.round(a * 10) * b; // 小数点なしの積
  const correct = Math.round(a * b * 10) / 10;
  const r = buildReasons(REASONS.POINT);
  return {
    character: pick(CHARS),
    expr: `${a} × ${b} = ${intProduct}`,
    speak: `${a} かける ${b} は ${intProduct}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(correct),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// わり算で商の小数点をわすれる誤り（8.4 ÷ 4 = 21 → 正 2.1）
const divPoint: Builder = () => {
  // 割り切れて小数になる例を作る
  const divisor = rnd(2, 4);
  const q = rnd(11, 49) / 10; // 商（小数）
  const dividend = Math.round(q * divisor * 10) / 10;
  const intQuotient = Math.round(q * 10); // 小数点なしの商
  const r = buildReasons(REASONS.POINT);
  return {
    character: pick(CHARS),
    expr: `${dividend} ÷ ${divisor} = ${intQuotient}`,
    speak: `${dividend} わる ${divisor} は ${intQuotient}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(q),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// 大小くらべの Megz 誤り（0.5 < 0.36 → 正 >）
const compareMegz: Builder = () => {
  const t = rnd(2, 8); // 0.t（一桁小数）
  const hh = rnd(t + 1, 10 * t - 1); // 0.hh（二桁小数）, 整数として hh>t だが 値は 0.t>0.hh
  // 値: t/10 と hh/100 を比べる → 10t と hh
  const aStr = `0.${t}`;
  const bStr = `0.${hh}`;
  const trueRel = 10 * t > hh ? '>' : 10 * t < hh ? '<' : '=';
  // Megz の児童が書きがちな逆の記号を表示
  const shown = trueRel === '>' ? '<' : '>';
  const r = buildReasons(REASONS.MEGZ);
  return {
    character: pick(CHARS),
    expr: `${aStr} ${shown} ${bStr}`,
    speak: `${aStr} は ${bStr} より ${shown === '>' ? '大きい' : '小さい'}`,
    isCorrect: false,
    fixKind: 'sign',
    correctAnswer: trueRel,
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// 両替（くり上げ）忘れ（0.1 を 12こ = 0.12 → 正 1.2）
const collectRegroup: Builder = () => {
  const count = rnd(11, 39);
  const wrong = `0.${count}`;
  const correct = Math.round(count * 100) / 1000; // count×0.1
  const r = buildReasons(REASONS.REGROUP);
  return {
    character: pick(CHARS),
    expr: `0.1 を ${count}こ あつめた数 = ${wrong}`,
    speak: `0.1 を ${count} こ あつめた数は ${wrong}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(correct),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// たし算で位をそろえない誤り（2.4 + 1.8 = 3.12 → 正 4.2）
const addAlign: Builder = () => {
  // くり上がりが起きる（小数部の和が10以上）ときだけ、位をそろえない誤りが「見た目に誤り」になる
  const tA = rnd(2, 9);
  const tB = rnd(10 - tA, 9); // tA + tB >= 10 を保証
  const a = rnd(1, 4) + tA / 10;
  const b = rnd(1, 4) + tB / 10;
  const intPart = Math.floor(a) + Math.floor(b);
  const fracSum = tA + tB; // 例: 4+8=12
  const wrong = `${intPart}.${fracSum}`;
  const correct = Math.round((a + b) * 10) / 10;
  const r = buildReasons(REASONS.ALIGN);
  return {
    character: pick(CHARS),
    expr: `${a} + ${b} = ${wrong}`,
    speak: `${a} たす ${b} は ${wrong}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(correct),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// たし算で くり上げを忘れる誤り（3.6 + 2.8 = 5.4 → 正 6.4）
// 小数部の和が10以上でくり上がるのに、一の位に +1 し忘れる典型ミス（結果が −1 ずれる）
const addCarry: Builder = () => {
  const tA = rnd(2, 9);
  const tB = rnd(10 - tA, 9); // tA + tB >= 10 を保証（くり上がり発生）
  const a = rnd(1, 4) + tA / 10;
  const b = rnd(1, 4) + tB / 10;
  const correct = Math.round((a + b) * 10) / 10;
  const wrong = Math.round((correct - 1) * 10) / 10; // 一の位への くり上げ +1 を忘れる
  const r = buildReasons(REASONS.REGROUP);
  return {
    character: pick(CHARS),
    expr: `${a} + ${b} = ${wrong}`,
    speak: `${a} たす ${b} は ${wrong}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(correct),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// ひき算で くり下がりをまちがえる誤り（6.3 − 3.74 = 2.66 → 正 2.56）
// 桁ちがいの引き算で「借りたのに 上の位を 1 へらし忘れる」典型ミス（結果が +0.1 ずれる）
const subBorrow: Builder = () => {
  let ah = 0, bh = 0;
  for (let t = 0; t < 200; t++) {
    const wholeA = rnd(3, 8);
    const tenthA = rnd(0, 5);
    ah = wholeA * 100 + tenthA * 10; // a は小数第一位（hundredths=0 で必ず借りる）
    const wholeB = rnd(1, wholeA - 1);
    const tenthB = rnd(0, 9);
    const hb = rnd(1, 9); // b の小数第二位（1〜9 で2桁小数に）
    bh = wholeB * 100 + tenthB * 10 + hb;
    if (bh < ah) break;
  }
  const correctH = ah - bh;
  const a = ah / 100; // 例 6.3
  const b = bh / 100; // 例 3.74
  const correct = correctH / 100;
  const wrong = (correctH + 10) / 100; // 1 へらし忘れ → +0.1
  const r = buildReasons(REASONS.BORROW);
  return {
    character: pick(CHARS),
    expr: `${a} − ${b} = ${wrong}`,
    speak: `${a} ひく ${b} は ${wrong}`,
    isCorrect: false,
    fixKind: 'number',
    correctAnswer: String(correct),
    reasonOptions: r.options,
    correctReasonIndex: r.index,
  };
};

// 正しい例（混ぜる）
const correctAdd: Builder = () => {
  const a = rnd(11, 49) / 10, b = rnd(11, 49) / 10;
  const sum = Math.round((a + b) * 10) / 10;
  return { character: pick(CHARS), expr: `${a} + ${b} = ${sum}`, speak: `${a} たす ${b} は ${sum}`, isCorrect: true, fixKind: 'number', correctAnswer: String(sum), reasonOptions: [], correctReasonIndex: -1 };
};
const correctCompare: Builder = () => {
  const a = rnd(1, 9), b = rnd(1, 9);
  const x = a, y = b + (a === b ? 1 : 0);
  const rel = x > y ? '>' : x < y ? '<' : '=';
  return { character: pick(CHARS), expr: `0.${x} ${rel} 0.${y}`, speak: `0てん${x} は 0てん${y} より`, isCorrect: true, fixKind: 'sign', correctAnswer: rel, reasonOptions: [], correctReasonIndex: -1 };
};

const ERROR_BUILDERS = [mulPoint, divPoint, compareMegz, collectRegroup, addAlign, addCarry, subBorrow];
const CORRECT_BUILDERS = [correctAdd, correctCompare];

/** ランダムに誤り例（ときどき正しい例）を生成。 */
export function generateError(): ErrorExample {
  if (Math.random() < 0.25) return pick(CORRECT_BUILDERS)();
  return pick(ERROR_BUILDERS)();
}

/** テスト本番モード用：誤りの種類を指定して生成（大問11）。 */
export type ErrorPreset = 'addAlign' | 'addCarry' | 'subBorrow';
const ERROR_PRESETS: Record<ErrorPreset, Builder> = { addAlign, addCarry, subBorrow };
export function makeError(preset: ErrorPreset): ErrorExample {
  return ERROR_PRESETS[preset]();
}
