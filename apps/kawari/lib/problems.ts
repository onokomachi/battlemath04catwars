// このファイルは単元アプリ syo4-kawarikatasirabe の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「変わり方調べ」の問題ジェネレーター（純粋関数のみ）。
 *
 * すべての問題は KawariProblem に統一されており、解答UIの種類（AnswerSpec.kind）でしか
 * 分岐しない。Round コンポーネントは1つで足りる
 * （master-DB: patterns/answer-ui-dispatcher-with-pool-based-test.md）。
 *
 * 生成制約を入れるときは「その制約が排除する問題の形」を必ずコメントに書くこと
 * （master-DB: learning-game Phase 2-B）。
 *
 * 表記は □ と ○（東京書籍・埼玉県 東書版プリント・宮城県教育センターの評価問題が
 * すべて □○ を使うため）。
 */
import {
  AnswerSpec, KawariProblem, RelKind, Scenario,
  applyRel, equivalentExprs, relExpr, relWordExpr,
} from '../types';
import {
  SUM_SCENARIOS, DIFF_SCENARIOS, LESS_SCENARIOS, TIMES_SCENARIOS,
  PROD_SCENARIOS, LINEAR_SCENARIOS, ALL_SCENARIOS,
  GRAPHABLE, PAIR_CANDIDATES, PairCandidate, DIRECTION_CANDIDATES,
} from './scenarios';

/* ============================================================
 * 乱数ユーティリティ
 * ============================================================ */

export function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
/**
 * Fisher–Yates。sort(() => Math.random() - 0.5) は分布がかたよるので使わない
 * （master-DB: bugs/sort-math-random-shuffle-bias.md）。
 */
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
/** n 件を重複なしで取り出す */
export function sample<T>(a: readonly T[], n: number): T[] {
  return shuffle(a).slice(0, n);
}

/** 選択肢の並びをまぜて、正解の位置を返す（重複は自動で1つにまとめる） */
function shuffledChoice(correctText: string, distractors: string[]): { choices: string[]; correct: number } {
  const uniq = Array.from(new Set([correctText, ...distractors]));
  const choices = shuffle(uniq);
  return { choices, correct: choices.indexOf(correctText) };
}

/* ============================================================
 * 場面まわりの言い回し
 * ============================================================ */

/** 「□が1ふえると○は…」の変化のようす（1あたり） */
export function changeWord(sc: Scenario): string {
  switch (sc.kind) {
    case 'sum': return '1ずつ へる';
    case 'diff': return '1ずつ ふえる';
    case 'less': return '1ずつ ふえる';
    case 'times': return `${sc.k}ずつ ふえる`;
    case 'linear': return `${sc.k}ずつ ふえる`;
    // 積が一定は 減り方が 一定では ないので、この言い方を 使う問題では 出題しない
    case 'prod': return 'へっていく（同じ数ずつでは ない）';
  }
}

/** 対応の特徴（たてに見た きまり）の言い方 */
export function corrWord(sc: Scenario): string {
  switch (sc.kind) {
    case 'sum': return `2つを たすと いつも ${sc.k}`;
    case 'diff': return `${sc.xName}に ${sc.k} を たすと ${sc.yName}`;
    case 'less': return `${sc.xName}から ${sc.k} を ひくと ${sc.yName}`;
    case 'times': return `${sc.xName}に ${sc.k} を かけると ${sc.yName}`;
    case 'prod': return `2つを かけると いつも ${sc.k}`;
    case 'linear': return `${sc.xName}に ${sc.k} を かけて ${sc.b ?? 0} を たすと ${sc.yName}`;
  }
}

/** きまりの種類のラベル。差が一定は □が大きい場合（less）も 同じ種類。 */
const KIND_LABEL: Record<RelKind, string> = {
  sum: 'たすと いつも 同じ数（和が 一定）',
  diff: 'ちがいが いつも 同じ数（差が 一定）',
  less: 'ちがいが いつも 同じ数（差が 一定）',
  times: 'かた方を 何倍か すると もう一方（倍が 一定）',
  prod: 'かけると いつも 同じ数（積が 一定）',
  linear: '同じ数ずつ ふえるが、はじめに いくつか ある',
};
const ALL_KIND_LABELS = Array.from(new Set(Object.values(KIND_LABEL)));

const xs5 = (sc: Scenario) => sc.xs ?? [1, 2, 3, 4, 5];

/** 表の □ の きざみ（1きざみでない場面もある） */
function xStepOf(sc: Scenario): number {
  const b = xs5(sc);
  return b.length > 1 ? b[1] - b[0] : 1;
}

/**
 * 「□が1ふえると○は◯ずつ変わる」を問える場面だけ。
 * 積が一定（変化が一定でない）と、表のきざみが1でない場面をのぞく。
 * のぞいた場面は tbl-yoko / find-change 以外の全レベルで使われるので、
 * これで出題されなくなる問題の形はない。
 */
const UNIT_STEP_SCENARIOS = ALL_SCENARIOS.filter((s) => s.kind !== 'prod' && xStepOf(s) === 1);

/** 表の見出し文字（単位つき） */
function head(name: string, unit: string): string {
  return unit ? `${name}（${unit}）` : name;
}

/**
 * 表に出す □ の値のならびを ずらして バリエーションを増やす。
 * 同じ場面でも 表の数値が 毎回ちがえば、児童は「答えの位置」ではなく
 * かんけいを 見て 考えるようになる（master-DB / learning-game Phase 2-A）。
 */
function variedXs(sc: Scenario): number[] {
  const base = xs5(sc);
  if (sc.kind === 'prod') {
    // 積が一定は □ が k の約数でないと ○ が小数になる。約数のならびから窓を切り出す。
    const len = Math.min(base.length, rnd(4, 5));
    const start = rnd(0, Math.max(0, base.length - len));
    return base.slice(start, start + len);
  }
  const step = xStepOf(sc);
  const shift = rnd(0, 3) * step;
  const len = rnd(4, 5);
  let xs = Array.from({ length: len }, (_, i) => base[0] + shift + i * step);
  // 場面としてありえない列（○ が 0 以下）は出さない
  if (sc.kind === 'sum') xs = xs.filter((x) => sc.k - x > 0);
  if (sc.kind === 'less') xs = xs.filter((x) => x - sc.k > 0);
  return xs.length >= 4 ? xs : base;
}

/** 図（場面の絵）を作る */
function sceneFig(sc: Scenario, n: number) {
  return {
    kind: 'scene' as const,
    fig: sc.figure,
    n,
    labelA: sc.xName,
    labelB: sc.yName,
    total: sc.kind === 'sum' ? sc.k : undefined,
  };
}

/** 表の図（読むだけ） */
function tableFig(sc: Scenario, xs: number[], vertical = false) {
  return {
    kind: 'table' as const,
    xHeader: head(sc.xName, sc.xUnit),
    yHeader: head(sc.yName, sc.yUnit),
    xs,
    ys: xs.map((x) => applyRel(sc, x)),
    vertical,
  };
}

/* ============================================================
 * 誤答診断（典型誤答の値 → その子むけの声かけ）
 * ============================================================ */

/**
 * この単元の代表的な誤概念を、入力された値から見わける。
 *  - times で x+k …「1ふえると k ふえる」（横の見方）を 対応の式に してしまう最頻の誤り
 *  - linear で x*k …「はじめに ある分（b）」を たしわすれる
 *  - prod で k-x  … わり算の場面を ひき算で 考えてしまう
 */
function diagnoseFor(sc: Scenario, x: number): (g: number) => string | null {
  const right = applyRel(sc, x);
  const b = sc.b ?? 0;
  return (g: number) => {
    if (g === right) return null;
    if (sc.kind === 'times' && g === x + sc.k) {
      return `おしい！「1ふえると ${sc.k}ふえる」は 横に見た かわり方だね。たてに見ると「${sc.xName}に ${sc.k}を かける」だよ。`;
    }
    if (sc.kind === 'diff' && g === x * sc.k) {
      return `おしい！ここは かけ算ではなく「${sc.k}を たす」かんけいだよ。表を たてに見て たしかめよう。`;
    }
    if (sc.kind === 'less' && g === x + sc.k) {
      return `おしい！ひくところを たしてしまったみたい。${sc.yName}は ${sc.xName}より 小さいね。`;
    }
    if (sc.kind === 'sum' && g === x + sc.k) {
      return `おしい！2つを たすと ${sc.k} になるから、${sc.k} から ${x} を ひくんだよ。`;
    }
    if (sc.kind === 'sum' && g === sc.k) {
      return 'それは 2つを たした 数だね。もう一方だけの 数を もとめよう。';
    }
    if (sc.kind === 'prod' && g === sc.k - x) {
      return `おしい！ここは ひき算では なく わり算だよ。2つを かけると いつも ${sc.k} だね。`;
    }
    if (sc.kind === 'linear' && g === x * sc.k) {
      return `おしい！はじめから ある ${b} を たしわすれているよ。`;
    }
    if (sc.kind === 'linear' && g === x + sc.k + b) {
      return `おしい！${sc.k} は「かける数」だよ。たすのでは ないね。`;
    }
    return null;
  };
}

/* ============================================================
 * 1. 見つける（伴って変わる二つの数量を見いだす）
 * ============================================================ */

/** 一方を決めれば もう一方が ただ1つに決まるか（○×） */
export function genFindDecide(): KawariProblem {
  const yes = sample(PAIR_CANDIDATES.filter((p) => p.decided), 2);
  const no = sample(PAIR_CANDIDATES.filter((p) => !p.decided), 2);
  const rows = shuffle([...yes, ...no]).map((p: PairCandidate) => ({
    label: `${p.a} と ${p.b}`,
    correct: p.decided,
    why: p.why,
  }));
  return {
    skillId: 'find-decide', moduleId: 'find',
    prompt: 'かた方を 決めると もう一方が ただ1つに 決まりますか。「決まる」「決まらない」を えらびましょう。',
    answer: { kind: 'truth', yesLabel: '決まる', noLabel: '決まらない', rows },
    hints: [
      'かた方の数を 1つ 決めてみよう。もう一方は いつも 同じ数に なるかな？',
      '同じ数を 決めても もう一方が いろいろに なるなら「決まらない」だよ。',
      '「1辺の長さ」→「まわりの長さ」は 決まる。「年れい」→「身長」は 人によって ちがうから 決まらないね。',
    ],
    explain: '伴って変わる2つの数量は、「かた方を決めると もう一方が ただ1つに決まる」かんけいです。',
    label: '決まる／決まらない',
    signature: `find-decide|${rows.map((r) => r.label).join(',')}`,
  };
}

/** 場面から「伴って変わる2つの量」の組をえらぶ */
export function genFindPair(): KawariProblem {
  const yes = pick(PAIR_CANDIDATES.filter((p) => p.decided));
  const no = sample(PAIR_CANDIDATES.filter((p) => !p.decided), 3);
  const { choices, correct } = shuffledChoice(
    `${yes.a} と ${yes.b}`,
    no.map((p) => `${p.a} と ${p.b}`),
  );
  return {
    skillId: 'find-pair', moduleId: 'find',
    prompt: 'つぎのうち「かた方が 決まれば もう一方も 決まる」組は どれですか。',
    answer: { kind: 'choice', choices, correct },
    hints: [
      'それぞれの組で、かた方の数を 決めてみよう。',
      'もう一方が いくつにも なってしまう組は ちがうね。',
      `「${yes.a}」を 決めると「${yes.b}」は いつも 同じ数に なるよ。`,
    ],
    explain: yes.why,
    label: '伴って変わる組さがし',
    signature: `find-pair|${yes.a}|${choices.join('/')}`,
  };
}

/**
 * かた方がふえると もう一方は ふえるか へるかを、一覧で 判定する。
 * 宮城県教育センター 単元11 ホップ 大問2 の形（5項目に ○／△ を つける）。
 */
export function genFindDirection(): KawariProblem {
  const up = sample(DIRECTION_CANDIDATES.filter((c) => c.up), rnd(2, 3));
  const down = sample(DIRECTION_CANDIDATES.filter((c) => !c.up), 5 - up.length);
  const rows = shuffle([...up, ...down]).map((c) => ({
    label: c.label,
    correct: c.up,
    why: c.up
      ? 'かた方が ふえると、もう一方も ふえる かんけいだね。'
      : 'かた方が ふえると、もう一方は へる かんけいだね。',
  }));
  return {
    skillId: 'find-direction', moduleId: 'find',
    prompt: 'かた方が ふえると、もう一方は どうなりますか。「ふえる」「へる」を えらびましょう。',
    answer: { kind: 'truth', yesLabel: 'ふえる', noLabel: 'へる', rows },
    hints: [
      '「もとが 決まっていて 分け合う」ものは、かた方が ふえると もう一方は へるよ。',
      '「1つあたりが 決まっていて つみ重なる」ものは、両方 ふえるね。',
      'のこりの量・あまりの量は、使うほど へっていくよ。',
    ],
    explain: '2つの数量の 変わり方には「同じ向きに 変わる」ものと「逆の向きに 変わる」ものがあります。',
    label: 'ふえる／へる の判定',
    signature: `find-direction|${rows.map((r) => r.label).join(',')}`,
  };
}

/** かた方がふえると もう一方は どうなるか（1場面ずつ） */
export function genFindChange(): KawariProblem {
  const sc = pick(UNIT_STEP_SCENARIOS);
  const xs = variedXs(sc);
  const correctText = sc.kind === 'sum' ? 'へる' : 'ふえる';
  // 「かわらない」は この単元の場面では起こらないが、
  // 反射で「ふえる」を えらぶくせを ふせぐために 必ず 3択にする。
  const choices = ['ふえる', 'へる', 'かわらない'];
  return {
    skillId: 'find-change', moduleId: 'find',
    story: sc.story,
    prompt: `${sc.xName}が ふえると、${sc.yName}は どうなりますか。`,
    figure: tableFig(sc, xs),
    answer: { kind: 'choice', choices, correct: choices.indexOf(correctText) },
    hints: [
      '表を 横に 見てみよう。左から 右へ 数は どう 動いている？',
      `${sc.xName}が 1ふえたとき、${sc.yName}は 大きくなる？ 小さくなる？`,
      `${sc.yName}は ${changeWord(sc)} よ。`,
    ],
    explain: `${sc.xName}が 1ふえると ${sc.yName}は ${changeWord(sc)}。だから 答えは「${correctText}」です。`,
    label: `${sc.xName}→${sc.yName} の変化`,
    signature: `find-change|${sc.id}|${xs.join('-')}`,
  };
}

/* ============================================================
 * 2. 表をつくる・よむ
 * ============================================================ */

function genTableFill(sc: Scenario, skillId: string): KawariProblem {
  const xs = variedXs(sc);
  // 先頭の1〜2列は例として見せ、のこりを児童がうめる（白紙にしない＝足場をかける）
  const shown = rnd(1, 2);
  const given = xs.map((x, i) => (i < shown ? applyRel(sc, x) : null));
  const correct = xs.map((x) => applyRel(sc, x));
  const answer: AnswerSpec = {
    kind: 'tableFill',
    xHeader: head(sc.xName, sc.xUnit),
    yHeader: head(sc.yName, sc.yUnit),
    xs, given, correct,
  };
  return {
    skillId, moduleId: 'table',
    story: sc.story,
    prompt: `${sc.xName}を ${xs.join('、')} と かえたとき、${sc.yName}が どう 変わるか 表に かきましょう。`,
    figure: sceneFig(sc, xs[Math.min(2, xs.length - 1)]),
    answer,
    hints: [
      '図を 見ながら、1つずつ しらべて 表に かこう。',
      sc.kind === 'prod'
        ? `${sc.xName}が ふえると ${sc.yName}は へるよ。2つを かけた 数に 目を つけよう。`
        : `${sc.xName}が 1ふえると、${sc.yName}は ${changeWord(sc)} よ。`,
      `${corrWord(sc)} という かんけいだよ。`,
    ],
    explain: `${corrWord(sc)}。だから ${relWordExpr(sc)} と 表せます。`,
    label: `表をうめる（${sc.xName}と${sc.yName}）`,
    signature: `${skillId}|${sc.id}|${shown}|${xs.join('-')}`,
  };
}

export const genTblSum = () => genTableFill(pick(SUM_SCENARIOS), 'tbl-sum');
export const genTblDiff = () => genTableFill(pick([...DIFF_SCENARIOS, ...LESS_SCENARIOS]), 'tbl-diff');
export const genTblTimes = () => genTableFill(pick(TIMES_SCENARIOS), 'tbl-times');
export const genTblProd = () => genTableFill(pick(PROD_SCENARIOS), 'tbl-prod');
export const genTblLinear = () => genTableFill(pick(LINEAR_SCENARIOS), 'tbl-linear');

/** 表を横に見る（変化の見方）: □が1ふえると○はいくつ変わるか */
export function genTblYoko(): KawariProblem {
  const sc = pick(UNIT_STEP_SCENARIOS);
  const xs = variedXs(sc);
  const step = Math.abs(applyRel(sc, xs[1]) - applyRel(sc, xs[0])) / (xs[1] - xs[0]);
  const dir = sc.kind === 'sum' ? 'へる' : 'ふえる';
  const correctText = `${step}ずつ ${dir}`;
  const other = step === 1 ? 2 : 1;
  const { choices, correct } = shuffledChoice(correctText, [
    `${step}ずつ ${dir === 'ふえる' ? 'へる' : 'ふえる'}`,
    `${other}ずつ ${dir}`,
    'かわらない',
  ]);
  return {
    skillId: 'tbl-yoko', moduleId: 'table',
    story: sc.story,
    prompt: `表を 横に 見ます。${sc.xName}が 1 ふえると、${sc.yName}は どう なりますか。`,
    figure: tableFig(sc, xs),
    answer: { kind: 'choice', choices, correct },
    hints: [
      '表の となりどうしを くらべよう。',
      `${applyRel(sc, xs[0])} から ${applyRel(sc, xs[1])} へ、いくつ 動いたかな？`,
      `${sc.yName}は ${changeWord(sc)} ね。`,
    ],
    explain: `表を横に見ると、${sc.xName}が1ふえるごとに ${sc.yName}は ${changeWord(sc)}。これが「変化の とくちょう」です。`,
    label: `横に見る（${sc.id}）`,
    signature: `tbl-yoko|${sc.id}|${xs.join('-')}`,
  };
}

/** 表を縦に見る（対応の見方）: いつも 同じに なるのは どれか */
export function genTblTate(): KawariProblem {
  // linear は「たすと同じ」「かけると同じ」のどれにも当てはまらないので この問いでは使わない。
  // linear の対応の見方は rule-kind / exp-* で 別に あつかう。
  const sc = pick(ALL_SCENARIOS.filter((s) => s.kind !== 'linear'));
  const xs = variedXs(sc);
  const correctText =
    sc.kind === 'sum' ? '2つを たした 数' :
    sc.kind === 'prod' ? '2つを かけた 数' :
    sc.kind === 'times' ? '大きい方 ÷ 小さい方（何ばいか）' :
    '2つの ちがい（大きい方 － 小さい方）';
  const all = ['2つを たした 数', '2つの ちがい（大きい方 － 小さい方）', '大きい方 ÷ 小さい方（何ばいか）', '2つを かけた 数'];
  const choices = shuffle(all);
  return {
    skillId: 'tbl-tate', moduleId: 'table',
    prompt: `下の表を たてに 見ます。どの 列でも いつも 同じに なるのは どれですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'choice', choices, correct: choices.indexOf(correctText) },
    hints: [
      '同じ列の 上と下の 数を くらべよう。',
      'たしてみる・ひいてみる・かけてみる・わってみる、を ぜんぶ ためすと 見つかるよ。',
      `どの列でも ${corrWord(sc)} に なっているね。`,
    ],
    explain: `どの列でも ${corrWord(sc)}。これが「対応の とくちょう」です。`,
    label: `たてに見る（${sc.id}）`,
    signature: `tbl-tate|${sc.id}|${xs.join('-')}`,
  };
}

/* ============================================================
 * 3. きまりを見つける
 * ============================================================ */

/** 表を見て きまりの種類を 見わける */
export function genRuleKind(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  const choices = shuffle(ALL_KIND_LABELS);
  return {
    skillId: 'rule-kind', moduleId: 'rule',
    // 場面文から きまりの種類が わかってしまう場面があるため、表だけを示す。
    prompt: `下の表は、${sc.xName}と ${sc.yName}の かんけいを しらべた ものです。2つの数の かんけいは、どの きまりですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'choice', choices, correct: choices.indexOf(KIND_LABEL[sc.kind]) },
    hints: [
      'まず 同じ列の 2つの数を たしてみよう。いつも 同じに なる？',
      'つぎに ひいてみる・かけてみる・わってみる、を ためそう。',
      `この表は ${corrWord(sc)} だから、${KIND_LABEL[sc.kind]} だよ。`,
    ],
    explain: `${corrWord(sc)} なので「${KIND_LABEL[sc.kind]}」です。`,
    label: `きまりの見わけ（${sc.id}）`,
    signature: `rule-kind|${sc.id}|${xs.join('-')}`,
  };
}

/** きまりの「変わらない数」を答える */
export function genRuleConst(): KawariProblem {
  // linear は 変わらない数が2つ（かける数と たす数）あり、1つの数を 答えさせる問いに
  // ならないので ここでは 出題しない（linear の きまりは exp-* / rule-word で あつかう）。
  const sc = pick(ALL_SCENARIOS.filter((s) => s.kind !== 'linear'));
  const xs = variedXs(sc);
  const q =
    sc.kind === 'sum' ? '2つの数を たすと いつも いくつに なりますか。' :
    sc.kind === 'prod' ? '2つの数を かけると いつも いくつに なりますか。' :
    sc.kind === 'diff' ? `${sc.yName}は ${sc.xName}より いつも いくつ 大きいですか。` :
    sc.kind === 'less' ? `${sc.yName}は ${sc.xName}より いつも いくつ 小さいですか。` :
    `${sc.yName}は ${sc.xName}の いつも 何ばいですか。`;
  const unit = sc.kind === 'times' ? 'ばい' : sc.kind === 'sum' || sc.kind === 'prod' ? '' : sc.yUnit;
  return {
    skillId: 'rule-const', moduleId: 'rule',
    // 場面文を出すと「変わらない数」が文章にそのまま書いてある場面があり、
    // 表から読み取る学習にならない。ここでは表だけを示す。
    prompt: `下の表は、${sc.xName}と ${sc.yName}の かんけいを しらべた ものです。${q}`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'number', correct: sc.k, unit },
    hints: [
      '1つの列だけで いいから、たし算・ひき算・かけ算・わり算を ためしてみよう。',
      'つぎに ほかの列でも 同じに なるか たしかめよう。',
      `どの列でも ${corrWord(sc)} だね。`,
    ],
    explain: `${corrWord(sc)}。変わらない数は ${sc.k} です。`,
    label: `変わらない数（${sc.id}）`,
    signature: `rule-const|${sc.id}|${xs.join('-')}`,
  };
}

/** ことばの式をつくる（カードならべ） */
export function genRuleWord(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  const x = `（${sc.xName}）`;
  const y = `（${sc.yName}）`;
  const k = String(sc.k);
  const b = String(sc.b ?? 0);
  const correct =
    sc.kind === 'sum' ? [x, '＋', y, '＝', k] :
    sc.kind === 'diff' ? [x, '＋', k, '＝', y] :
    sc.kind === 'less' ? [x, '－', k, '＝', y] :
    sc.kind === 'times' ? [x, '×', k, '＝', y] :
    sc.kind === 'prod' ? [x, '×', y, '＝', k] :
    [x, '×', k, '＋', b, '＝', y];
  const opCards = ['＋', '－', '×', '÷'].filter((o) => !correct.includes(o));
  const cards = shuffle([...correct, ...opCards.slice(0, 2)]);
  return {
    skillId: 'rule-word', moduleId: 'rule',
    story: sc.story,
    prompt: '2つの数の かんけいを「ことばの式」に あらわしましょう。カードを 左から じゅんに えらびます。',
    figure: tableFig(sc, xs, true),
    answer: { kind: 'exprBuild', cards, correct },
    hints: [
      '表を たてに 見て、どんな 計算で もう一方に なるか さがそう。',
      `${corrWord(sc)} だね。`,
      `${relWordExpr(sc)} と なるよ。`,
    ],
    explain: `ことばの式は ${relWordExpr(sc)} です。`,
    label: `ことばの式（${sc.id}）`,
    signature: `rule-word|${sc.id}|${cards.join('')}`,
  };
}

/** 表からきまりを見つけて、表にない値の○を答える */
export function genRuleHidden(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  let target: number;
  if (sc.kind === 'prod') {
    // 積が一定は □ が k の約数のときしか ○ が整数に ならない。表に出ていない約数を使う。
    const divs = xs5(sc).filter((d) => !xs.includes(d));
    if (divs.length === 0) return genRuleHidden();
    target = pick(divs);
  } else {
    const step = xStepOf(sc);
    target = xs[xs.length - 1] + step * rnd(1, 3);
    // 和が一定の場面で ○ が 0 以下になる問い（8こを2人で分けて 兄が 9こ）は
    // 場面として ありえないので 除外する。
    if (sc.kind === 'sum' && applyRel(sc, target) <= 0) return genRuleHidden();
  }
  const ans = applyRel(sc, target);
  return {
    skillId: 'rule-hidden', moduleId: 'rule',
    story: sc.story,
    prompt: `${sc.xName}が ${target}${sc.xUnit} の とき、${sc.yName}は いくつですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'number', correct: ans, unit: sc.yUnit },
    hints: [
      '表を たてに 見て、きまりを 見つけよう。',
      `${corrWord(sc)} だね。`,
      `${relWordExpr(sc)} の □ に ${target} を 入れてみよう。`,
    ],
    explain: `${relWordExpr(sc)} だから、${target} のとき ${sc.yName}は ${ans}${sc.yUnit} です。`,
    label: `きまりをつかう（${sc.xName}=${target}）`,
    signature: `rule-hidden|${sc.id}|${target}`,
    diagnose: diagnoseFor(sc, target),
  };
}

/* ============================================================
 * 4. 式に表す（□と○を使った式）
 * ============================================================ */

/** その場面と まぎらわしい「まちがいの式」を、役わりで作る */
function wrongExprs(sc: Scenario): string[] {
  const k = sc.k, b = sc.b ?? 0;
  switch (sc.kind) {
    case 'sum': return [`□ － ○ ＝ ${k}`, `□ × ○ ＝ ${k}`, `□ ＋ ${k} ＝ ○`, `${k} ＋ □ ＝ ○`];
    case 'diff': return [`□ × ${k} ＝ ○`, `□ ＋ ○ ＝ ${k}`, `□ － ${k} ＝ ○`, `○ ＋ ${k} ＝ □`];
    case 'less': return [`□ ＋ ${k} ＝ ○`, `□ ＋ ○ ＝ ${k}`, `□ × ${k} ＝ ○`, `${k} － □ ＝ ○`];
    case 'times': return [`□ ＋ ${k} ＝ ○`, `○ × ${k} ＝ □`, `□ ＋ ○ ＝ ${k}`, `□ ÷ ${k} ＝ ○`];
    case 'prod': return [`□ ＋ ○ ＝ ${k}`, `□ ÷ ○ ＝ ${k}`, `□ × ${k} ＝ ○`, `${k} × □ ＝ ○`];
    // 「□ × b ＋ k」は k と b が 同じ場面（□×2＋2）で 正解と 同じ文字列に なるので 使わない
    case 'linear': return [`□ × ${k} ＝ ○`, `□ ＋ ${b} ＝ ○`, `□ × ${k + b} ＝ ○`, `□ ＋ ${k} ＋ ${b} ＝ ○`];
  }
}

/** 表 → □○の式（えらぶ） */
function genExprChoice(sc: Scenario, skillId: string): KawariProblem {
  const xs = variedXs(sc);
  const correctText = relExpr(sc);
  // まちがいの選択肢は「役わり」でつくる（値をそのまま埋めこむと 値が偶然一致して重複する。
  // master-DB: patterns/distractor-labels-not-raw-values.md）
  const { choices, correct } = shuffledChoice(correctText, sample(wrongExprs(sc), 3));
  return {
    skillId, moduleId: 'expr',
    story: sc.story,
    prompt: `${sc.xName}を □、${sc.yName}を ○ として、□ と ○ の かんけいを 式に 表しましょう。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'choice', choices, correct },
    hints: [
      '表を たてに 見て、□ から ○ を つくる 計算を さがそう。',
      `${corrWord(sc)} だよ。`,
      `${relWordExpr(sc)} を、□ と ○ で 書きかえよう。`,
    ],
    explain: `${relWordExpr(sc)} なので、${relExpr(sc)} と 表せます。`,
    label: `式に表す（${sc.id}）`,
    signature: `${skillId}|${sc.id}|${choices.join('/')}`,
  };
}

export const genExpSum = () => genExprChoice(pick(SUM_SCENARIOS), 'exp-sum');
export const genExpDiff = () => genExprChoice(pick([...DIFF_SCENARIOS, ...LESS_SCENARIOS]), 'exp-diff');
export const genExpTimes = () => genExprChoice(pick(TIMES_SCENARIOS), 'exp-times');
export const genExpProd = () => genExprChoice(pick(PROD_SCENARIOS), 'exp-prod');
export const genExpLinear = () => genExprChoice(pick(LINEAR_SCENARIOS), 'exp-linear');

/**
 * 場面の文だけを読んで、□と○の式を えらぶ（表なし）。
 * 埼玉県 東京書籍版 単元11 NO1 大問1／NO2 大問1 の形（6つの式から 記号で えらぶ）。
 * このプリントでは この形だけで 100点分 あり、単元で いちばん 配点が 大きい。
 */
export function genExpScene(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const others = sample(ALL_SCENARIOS.filter((s) => s.kind !== sc.kind), 4);
  const distractors = [...others.map((s) => relExpr(s)), ...wrongExprs(sc).slice(0, 2)]
    .filter((e) => e !== relExpr(sc));
  const { choices, correct } = shuffledChoice(relExpr(sc), sample(distractors, 5));
  return {
    skillId: 'exp-scene', moduleId: 'expr',
    story: sc.story,
    prompt: `${sc.xName}を □、${sc.yName}を ○ として、□ と ○ の かんけいを 表している式を えらびましょう。`,
    figure: sceneFig(sc, xs5(sc)[2] ?? 3),
    answer: { kind: 'choice', choices, correct },
    hints: [
      '表を かかなくても いいよ。□ に 小さい数を 1つ 入れて、○ が いくつに なるか 考えよう。',
      `${corrWord(sc)} かどうか、2つの数で ためしてみよう。`,
      `この場面は ${relWordExpr(sc)} だよ。`,
    ],
    explain: `${sc.story} だから ${relWordExpr(sc)}、つまり ${relExpr(sc)} です。`,
    label: `場面→式（${sc.id}）`,
    signature: `exp-scene|${sc.id}|${choices.join('/')}`,
  };
}

/**
 * 同じ かんけいを 表す式を すべて えらぶ。
 * 実際の解答例が「□＋２＝○，○－□＝２，○－２＝□」のように 複数形を 正解に しているため
 * （埼玉県 東京書籍版 NO1(4)・NO2(3)）、1つの形だけを 正解に しない。
 */
export function genExpEquiv(): KawariProblem {
  const sc = pick(ALL_SCENARIOS.filter((s) => s.kind !== 'linear'));
  const xs = variedXs(sc);
  const right = equivalentExprs(sc);
  const wrong = sample(wrongExprs(sc), 3).filter((w) => !right.includes(w));
  const choices = shuffle([...right, ...wrong]);
  return {
    skillId: 'exp-equiv', moduleId: 'expr',
    story: sc.story,
    prompt: `${sc.xName}を □、${sc.yName}を ○ とします。この かんけいを 正しく 表している式を、ぜんぶ えらびましょう。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'multi', choices, correct: right.map((r) => choices.indexOf(r)) },
    hints: [
      '1つの式が 見つかっても、そこで 終わりに しないで ほかの式も ためそう。',
      '□ と ○ に 表の数を 入れて、式が 成り立つか たしかめよう。',
      `${right.join(' ／ ')} は どれも 同じ かんけいを 表しているよ。`,
    ],
    explain: `同じ かんけいでも、書き方は 1つでは ありません。${right.join('、')} は どれも 正しい式です。`,
    label: `同じ式さがし（${sc.id}）`,
    signature: `exp-equiv|${sc.id}|${choices.join('/')}`,
  };
}

/** カードをならべて □○の式を つくる */
export function genExpBuild(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  const k = String(sc.k);
  const b = String(sc.b ?? 0);
  const correct =
    sc.kind === 'sum' ? ['□', '＋', '○', '＝', k] :
    sc.kind === 'diff' ? ['□', '＋', k, '＝', '○'] :
    sc.kind === 'less' ? ['□', '－', k, '＝', '○'] :
    sc.kind === 'times' ? ['□', '×', k, '＝', '○'] :
    sc.kind === 'prod' ? ['□', '×', '○', '＝', k] :
    ['□', '×', k, '＋', b, '＝', '○'];
  const opCards = ['＋', '－', '×', '÷'].filter((o) => !correct.includes(o));
  const cards = shuffle([...correct, ...opCards.slice(0, 2)]);
  return {
    skillId: 'exp-build', moduleId: 'expr',
    story: sc.story,
    prompt: `${sc.xName}を □、${sc.yName}を ○ として、カードを 左から じゅんに ならべて 式を つくりましょう。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'exprBuild', cards, correct },
    hints: [
      '式は かならず「□」から はじめよう。',
      `${corrWord(sc)} だから、つぎに 来るのは たし算？ かけ算？`,
      `${relExpr(sc)} に なるよ。`,
    ],
    explain: `${relExpr(sc)} が この場面の 式です。`,
    label: `式づくり（${sc.id}）`,
    signature: `exp-build|${sc.id}|${cards.join('')}`,
  };
}

/** 式 → 表（□に数を入れて ○ を もとめる。式を読み取る力） */
export function genExpToTable(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  const correct = xs.map((x) => applyRel(sc, x));
  return {
    skillId: 'exp-totable', moduleId: 'expr',
    prompt: `式 ${relExpr(sc)} の □ に ${xs.join('、')} を 入れて、○ の 数を 表に かきましょう。`,
    figure: { kind: 'table', xHeader: '□', yHeader: '○', xs, ys: xs.map(() => null), vertical: true },
    answer: { kind: 'tableFill', xHeader: '□', yHeader: '○', xs, given: xs.map(() => null), correct },
    hints: [
      '式の □ に 1つずつ 数を 入れて 計算しよう。',
      `${relExpr(sc)} だから、□に ${xs[0]} を 入れると…`,
      `□＝${xs[0]} のとき ○＝${correct[0]} だよ。`,
    ],
    explain: `式に あてはめて 表に すると、2つの数の かんけいが よく 見えます（${relExpr(sc)}）。`,
    label: `式→表（${relExpr(sc)}）`,
    signature: `exp-totable|${sc.kind}|${sc.k}|${sc.b ?? 0}|${xs.join('-')}`,
  };
}

/** 式 → 場面（この式に あう 場面は どれか） */
export function genExpToScene(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  // 同じ式に なってしまう場面は まちがい選択肢に できないので、
  // 「類型が ちがう」場面だけを まちがい選択肢に する。
  const others = sample(ALL_SCENARIOS.filter((s) => s.kind !== sc.kind), 3);
  const { choices, correct } = shuffledChoice(sc.story, others.map((s) => s.story));
  return {
    skillId: 'exp-toscene', moduleId: 'expr',
    prompt: `${sc.xName}を □、${sc.yName}を ○ とすると 式が ${relExpr(sc)} に なる 場面は どれですか。`,
    answer: { kind: 'choice', choices, correct },
    hints: [
      'それぞれの 場面で 表を 少し かいてみよう。',
      `式が ${relExpr(sc)} なら、2つの数の かんけいは「${KIND_LABEL[sc.kind]}」だね。`,
      `${sc.story.slice(0, 14)}… の 場面が あてはまるよ。`,
    ],
    explain: `${relExpr(sc)} は「${KIND_LABEL[sc.kind]}」を 表す式です。`,
    label: `式→場面（${relExpr(sc)}）`,
    signature: `exp-toscene|${sc.id}|${choices.length}`,
  };
}

/* ============================================================
 * 5. グラフで調べる（折れ線グラフ）
 * ============================================================ */

/**
 * グラフに 出す □ の ならび。
 * variedXs は 表示の窓を ずらすので、ずらした結果 10 をこえたり ○ が負に なる列が
 * 出ることがある。それを のぞいた うえで、3列 未満に なったら もとの ならびに もどす
 * （0列に なって グラフが 描けなくなる事故を ふせぐ）。
 */
function graphXs(sc: Scenario): number[] {
  const ok = (x: number) => x >= 0 && x <= 10 && applyRel(sc, x) >= 0;
  const v = variedXs(sc).filter(ok);
  if (v.length >= 3) return v;
  const base = xs5(sc).filter(ok);
  return base.length >= 3 ? base : [1, 2, 3, 4, 5];
}

function graphAxes(sc: Scenario, xs: number[]) {
  const ys = xs.map((x) => applyRel(sc, x));
  const maxY = Math.max(...ys, 1);
  const yStep = maxY <= 10 ? 1 : maxY <= 20 ? 2 : 5;
  const yMax = Math.ceil(maxY / yStep) * yStep + yStep;
  const xMax = Math.max(...xs) + 1;
  return { xMax, yMax, xStep: 1, yStep };
}

/** 表 → 折れ線グラフに 点を うつ（作図・操作の技能） */
export function genGraPlot(): KawariProblem {
  const sc = pick(GRAPHABLE);
  const xs = graphXs(sc);
  const ax = graphAxes(sc, xs);
  const pts = xs.map((x) => ({ x, y: applyRel(sc, x) }));
  return {
    skillId: 'gra-plot', moduleId: 'graph',
    story: sc.story,
    prompt: '表の とおりに、折れ線グラフに 点を うちましょう。（さいしょの 1つは うってあります）',
    figure: tableFig(sc, xs),
    answer: {
      kind: 'graphPlot',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      correct: pts,
      given: [pts[0]],
    },
    hints: [
      '横の じくで □ の 数を さがし、たての じくで ○ の 数を さがそう。',
      '2つが 交わる ところを タップすると 点が うてるよ。',
      `${xs[1]} のときは ${applyRel(sc, xs[1])} だから、そこに 点を うつよ。`,
    ],
    explain: '表と 同じ 組を 点に して つなぐと、変わり方が ひと目で わかります。',
    label: `グラフに点をうつ（${sc.id}）`,
    signature: `gra-plot|${sc.id}|${xs.join('-')}`,
  };
}

/** グラフから 値を 読み取る */
export function genGraRead(): KawariProblem {
  const sc = pick(GRAPHABLE);
  const xs = graphXs(sc);
  const ax = graphAxes(sc, xs);
  const target = pick(xs.slice(1));
  const ans = applyRel(sc, target);
  return {
    skillId: 'gra-read', moduleId: 'graph',
    story: sc.story,
    prompt: `グラフを 見て、${sc.xName}が ${target}${sc.xUnit} の ときの ${sc.yName}を 答えましょう。`,
    figure: {
      kind: 'graph',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      points: xs.map((x) => ({ x, y: applyRel(sc, x) })),
      line: true,
      guide: { x: target },
    },
    answer: { kind: 'number', correct: ans, unit: sc.yUnit },
    hints: [
      `横の じくの ${target} から、まっすぐ 上に 見ていこう。`,
      '折れ線と ぶつかった ところから、左に まっすぐ 見ていこう。',
      `たての じくの ${ans} の ところに なるよ。`,
    ],
    explain: `グラフの 点は （${target}, ${ans}）。だから ${ans}${sc.yUnit} です。`,
    label: `グラフを読む（${sc.id}）`,
    signature: `gra-read|${sc.id}|${target}`,
    diagnose: diagnoseFor(sc, target),
  };
}

/**
 * グラフの「目もりと目もりの あいだ」を 読み取る。
 * 啓林館テスト 大問3② の「水を 2.5分 入れたとき」の形。
 * 1あたりの ふえ方が 1 の 差が一定の場面だけを つかい、答えが かならず .5 で 終わるようにする。
 */
export function genGraHalf(): KawariProblem {
  const sc = pick(GRAPHABLE.filter((s) => s.kind === 'diff' && xStepOf(s) === 1));
  const xs = graphXs(sc);
  const ax = graphAxes(sc, xs);
  const lo = pick(xs.slice(0, -1));
  const target = lo + 0.5;
  const ans = applyRel(sc, target);
  return {
    skillId: 'gra-half', moduleId: 'graph',
    story: sc.story,
    prompt: `グラフを 見て、${sc.xName}が ${target}${sc.xUnit} の ときの ${sc.yName}を 答えましょう。`,
    figure: {
      kind: 'graph',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      points: xs.map((x) => ({ x, y: applyRel(sc, x) })),
      line: true,
      guide: { x: target },
    },
    answer: { kind: 'number', correct: ans, unit: sc.yUnit, decimal: true },
    hints: [
      `横の じくの ${lo} と ${lo + 1} の まん中を さがそう。`,
      '折れ線と ぶつかった ところから、左に まっすぐ 見ていこう。',
      `${lo}${sc.xUnit}のときと ${lo + 1}${sc.xUnit}のときの ちょうど まん中の 大きさに なるよ。`,
    ],
    explain: `${lo}${sc.xUnit}のとき ${applyRel(sc, lo)}${sc.yUnit}、${lo + 1}${sc.xUnit}のとき ${applyRel(sc, lo + 1)}${sc.yUnit}。そのまん中で ${ans}${sc.yUnit} です。`,
    label: `目もりの あいだを 読む（${sc.id}）`,
    signature: `gra-half|${sc.id}|${target}|${xs.join('-')}`,
    diagnose: (g) => {
      if (g === ans) return null;
      if (g === applyRel(sc, lo)) return `それは ${lo}${sc.xUnit}のときの 大きさだね。もう すこし 右の まん中を 見よう。`;
      if (g === applyRel(sc, lo + 1)) return `それは ${lo + 1}${sc.xUnit}のときの 大きさだね。1つ 手前との まん中だよ。`;
      return null;
    },
  };
}

/** 0のときの 値（はじめに あった 分）を 読み取る */
export function genGraZero(): KawariProblem {
  // 0 のときに 意味のある 値が のこるのは「差が一定」と「□×a＋b」の場面。
  // 「倍が一定」は 0 のとき 0 に なり 問いとして やさしすぎるので ここでは 使わない。
  const sc = pick(GRAPHABLE.filter((s) => s.kind === 'diff' || s.kind === 'linear'));
  const xs = graphXs(sc);
  const ax = graphAxes(sc, xs);
  const ans = applyRel(sc, 0);
  return {
    skillId: 'gra-zero', moduleId: 'graph',
    // 場面文には「はじめに 4L 入っている」のように 答えが 書いてあるので、
    // ここではグラフだけを見て 読み取らせる。
    prompt: `下の グラフは、${sc.xName}と ${sc.yName}の かんけいを 表しています。${sc.xName}が 0 の とき、${sc.yName}は いくつですか。`,
    figure: {
      kind: 'graph',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      points: xs.map((x) => ({ x, y: applyRel(sc, x) })),
      line: true,
      guide: { x: 0 },
    },
    answer: { kind: 'number', correct: ans, unit: sc.yUnit },
    hints: [
      '折れ線を 左へ のばすと どこに つく かな。',
      `${sc.xName}が 1 のときの ${sc.yName}から、1つ分 もどしてみよう。`,
      'はじめから あった 分が 答えに なるよ。',
    ],
    explain: `${sc.xName}が0のとき ${sc.yName}は ${ans}${sc.yUnit}。これが「はじめに あった 分」です。`,
    label: `0のときの値（${sc.id}）`,
    signature: `gra-zero|${sc.id}|${xs.join('-')}`,
  };
}

/** グラフ／表の 先を 予想する */
export function genGraNext(): KawariProblem {
  const sc = pick(GRAPHABLE);
  const xs = graphXs(sc);
  const step = xStepOf(sc);
  const target = xs[xs.length - 1] + step * rnd(1, 2);
  // 和が一定の場面は、しらべる範囲を こえると 意味が なくなる（マイナスに なる）ので のぞく
  if (applyRel(sc, target) <= 0) return genGraNext();
  const ax = graphAxes(sc, [...xs, target]);
  const ans = applyRel(sc, target);
  return {
    skillId: 'gra-next', moduleId: 'graph',
    story: sc.story,
    prompt: `この ままの きまりで つづくと、${sc.xName}が ${target}${sc.xUnit} の とき ${sc.yName}は いくつに なりますか。`,
    figure: {
      kind: 'graph',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      points: xs.map((x) => ({ x, y: applyRel(sc, x) })),
      line: true,
      guide: { x: target },
    },
    answer: { kind: 'number', correct: ans, unit: sc.yUnit },
    hints: [
      'グラフの かたむきは ずっと 同じだよ。',
      `${sc.xName}が 1ふえるごとに ${sc.yName}は ${changeWord(sc)} ね。`,
      `${relWordExpr(sc)} の 式を つかうと はやいよ。`,
    ],
    explain: `${relWordExpr(sc)} だから、${target} のとき ${ans}${sc.yUnit} です。グラフを のばしても 同じに なります。`,
    label: `先を予想（${sc.id}, ${target}）`,
    signature: `gra-next|${sc.id}|${target}`,
    diagnose: diagnoseFor(sc, target),
  };
}

/** グラフの 形（かたむき）から 変化の とくちょうを 読む */
export function genGraKind(): KawariProblem {
  const sc = pick(GRAPHABLE);
  const xs = graphXs(sc);
  const ax = graphAxes(sc, xs);
  const correctText = sc.kind === 'sum' ? '右下がりの 直線（へっていく）' : '右上がりの 直線（ふえていく）';
  const choices = ['右上がりの 直線（ふえていく）', '右下がりの 直線（へっていく）', '上がったり 下がったり する'];
  return {
    skillId: 'gra-kind', moduleId: 'graph',
    story: sc.story,
    prompt: 'この グラフの 形の せつめいとして 正しいのは どれですか。',
    figure: {
      kind: 'graph',
      title: `${sc.xName}と ${sc.yName}`,
      xLabel: head(sc.xName, sc.xUnit),
      yLabel: head(sc.yName, sc.yUnit),
      ...ax,
      points: xs.map((x) => ({ x, y: applyRel(sc, x) })),
      line: true,
    },
    answer: { kind: 'choice', choices, correct: choices.indexOf(correctText) },
    hints: [
      '左から 右へ 見ていこう。線は 上がっている？ 下がっている？',
      'かたむきが とちゅうで 変わっていないかも 見てみよう。',
      `${sc.yName}は ${changeWord(sc)} から、${correctText} だね。`,
    ],
    explain: `${sc.xName}が1ふえるごとに ${sc.yName}は ${changeWord(sc)} ので、${correctText} になります。`,
    label: `グラフの形（${sc.id}）`,
    signature: `gra-kind|${sc.id}|${xs.join('-')}`,
  };
}

/* ============================================================
 * 6. つかって とく（活用）
 * ============================================================ */

/**
 * 表にない 大きい数の とき（教科書：正三角形20このとき／
 * 宮城ステップ：正方形を100こならべたとき）。
 */
export function genAppNth(): KawariProblem {
  // 積が一定は □ が k の約数のときしか ○ が整数に ならないので、この問いでは 使わない
  // （積が一定の「大きい数のとき」は app-inv / app-limit で あつかう）。
  const sc = pick(ALL_SCENARIOS.filter((s) => s.kind !== 'prod'));
  const xs = variedXs(sc);
  const maxShown = Math.max(...xs);
  let cand: number[];
  if (sc.kind === 'sum') {
    cand = [Math.floor(sc.k / 2), sc.k - 2, sc.k - 3].filter((v) => v > maxShown && v > 0);
  } else if (sc.kind === 'less') {
    cand = [maxShown + 10, maxShown + 20, maxShown + 30];
  } else {
    cand = [10, 12, 15, 20, 25, 30, 50, 100].filter((v) => v > maxShown);
  }
  if (cand.length === 0) return genAppNth();
  const target = pick(cand);
  const ans = applyRel(sc, target);
  return {
    skillId: 'app-nth', moduleId: 'apply',
    story: sc.story,
    prompt: `${sc.xName}が ${target}${sc.xUnit} の とき、${sc.yName}は いくつですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'number', correct: ans, unit: sc.yUnit },
    hints: [
      '表を ぜんぶ かかなくても、きまりを つかえば もとめられるよ。',
      `${relWordExpr(sc)} だね。`,
      `□に ${target} を 入れて 計算しよう。`,
    ],
    explain: `${relWordExpr(sc)} だから、${target} のとき ${ans}${sc.yUnit} です。`,
    label: `${sc.xName}が${target}のとき`,
    signature: `app-nth|${sc.id}|${target}`,
    diagnose: diagnoseFor(sc, target),
  };
}

/** ○ が わかっているとき □ を もとめる（逆にたどる） */
export function genAppInverse(): KawariProblem {
  const sc = pick(ALL_SCENARIOS);
  const xs = variedXs(sc);
  let x: number;
  if (sc.kind === 'prod') x = pick(xs5(sc));
  else if (sc.kind === 'sum') x = pick(xs);
  else if (sc.kind === 'less') x = pick(xs) + rnd(1, 10);
  else x = pick([6, 7, 8, 9, 10, 12]);
  const y = applyRel(sc, x);
  if (y <= 0 || !Number.isInteger(y)) return genAppInverse();
  return {
    skillId: 'app-inv', moduleId: 'apply',
    story: sc.story,
    prompt: `${sc.yName}が ${y}${sc.yUnit} の とき、${sc.xName}は いくつですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'number', correct: x, unit: sc.xUnit },
    hints: [
      'こんどは 逆に たどるよ。式を 思い出そう。',
      `${relWordExpr(sc)} だね。`,
      sc.kind === 'sum' ? `${sc.k} から ${y} を ひこう。`
        : sc.kind === 'diff' ? `${y} から ${sc.k} を ひこう。`
        : sc.kind === 'less' ? `${y} に ${sc.k} を たそう。`
        : sc.kind === 'prod' ? `${sc.k} を ${y} で わろう。`
        : sc.kind === 'linear' ? `${y} から ${sc.b ?? 0} を ひいて、${sc.k} で わろう。`
        : `${y} を ${sc.k} で わろう。`,
    ],
    explain: `${relWordExpr(sc)} だから、${sc.yName}が ${y} のとき ${sc.xName}は ${x}${sc.xUnit} です。`,
    label: `${sc.yName}が${y}のとき`,
    signature: `app-inv|${sc.id}|${y}`,
  };
}

/** 「まわりの長さが 100cm のときの だんの数」型（教科書 第3時／宮城ジャンプ） */
export function genAppLimit(): KawariProblem {
  // わりきれる 大きい 目標値を 作りたいので、倍が一定 と □×a＋b の場面から えらぶ。
  // （和・差・積の 逆算は genAppInverse で あつかう）
  const sc = pick([...TIMES_SCENARIOS, ...LINEAR_SCENARIOS]);
  const xs = variedXs(sc);
  const x = pick([12, 15, 20, 25, 30, 50, 100]);
  const y = applyRel(sc, x);
  return {
    skillId: 'app-limit', moduleId: 'apply',
    story: sc.story,
    prompt: `${sc.yName}が ${y}${sc.yUnit} に なるのは、${sc.xName}が いくつの ときですか。`,
    figure: tableFig(sc, xs, true),
    answer: { kind: 'number', correct: x, unit: sc.xUnit },
    hints: [
      '式を つかって 逆に たどろう。',
      `${relWordExpr(sc)} だから、□ に 何を 入れると ${y} に なるかな。`,
      sc.kind === 'linear' ? `${y} から ${sc.b ?? 0} を ひいて、${sc.k} で わろう。` : `${y} ÷ ${sc.k} を 計算しよう。`,
    ],
    explain: `${relExpr(sc)} の ○ が ${y} なので、□ ＝ ${x}${sc.xUnit} です。`,
    label: `${sc.yName}が${y}になるとき`,
    signature: `app-limit|${sc.id}|${y}`,
  };
}

/** くらしの中で つかう（いくつまで に できるか） */
export function genAppLife(): KawariProblem {
  const sc = pick(TIMES_SCENARIOS.filter((s) => s.k >= 3));
  const budget = sc.k * rnd(6, 12);
  const n = budget / sc.k;
  return {
    skillId: 'app-life', moduleId: 'apply',
    story: sc.story,
    prompt: `${sc.yName}を ${budget}${sc.yUnit} まで つかえます。${sc.xName}は いくつまで に できますか。`,
    figure: sceneFig(sc, 3),
    answer: { kind: 'number', correct: n, unit: sc.xUnit },
    hints: [
      'まず 2つの数の かんけいを 式に しよう。',
      `${relExpr(sc)} だね。`,
      `${budget} ÷ ${sc.k} を 計算しよう。`,
    ],
    explain: `${relExpr(sc)} なので、${budget} ÷ ${sc.k} ＝ ${n}${sc.xUnit} までです。`,
    label: `くらしでつかう（${sc.id}）`,
    signature: `app-life|${sc.id}|${budget}`,
  };
}

/**
 * 和が一定の中で、差を 指定して 2つの数を もとめる（和差算の 素地）。
 * 埼玉県 東京書籍版 NO3 大問3「あめ30こ。兄が弟より8こ多くするには？」の形。
 * 表に「2人の ちがい」の行を 足して 考えるのが 教科書どおりの 解き方。
 */
export function genAppSumDiff(): KawariProblem {
  const sc = pick(SUM_SCENARIOS.filter((s) => s.k % 2 === 0 && s.k >= 8));
  const d = pick([2, 4, 6, 8, 10].filter((v) => v < sc.k - 2 && (sc.k + v) % 2 === 0));
  const big = (sc.k + d) / 2;
  const small = sc.k - big;
  const xs = Array.from({ length: 5 }, (_, i) => big + 2 - i).filter((v) => v > 0 && v < sc.k).sort((a, b) => a - b);
  if (xs.length < 4) return genAppSumDiff();
  return {
    skillId: 'app-sumdiff', moduleId: 'apply',
    story: sc.story,
    prompt: `${sc.xName}を ${sc.yName}より ${d} 多く します。${sc.xName}は いくつに なりますか。`,
    figure: {
      kind: 'table',
      xHeader: head(sc.xName, sc.xUnit),
      yHeader: head(sc.yName, sc.yUnit),
      xs,
      ys: xs.map((x) => sc.k - x),
      zHeader: '2つの ちがい',
      zs: xs.map((x) => Math.abs(x - (sc.k - x))),
      vertical: true,
    },
    answer: { kind: 'number', correct: big, unit: sc.xUnit },
    hints: [
      '表に「2つの ちがい」の 行を つくって しらべよう。',
      `${sc.xName}が 1ふえると ちがいは 2ずつ ふえるね。ちがいが ${d} に なるのは どこかな。`,
      `（${sc.k} ＋ ${d}）÷ 2 でも もとめられるよ。`,
    ],
    explain: `2つを たすと ${sc.k}、ちがいが ${d} なので、多い方は （${sc.k}＋${d}）÷2 ＝ ${big}、少ない方は ${small} です。`,
    label: `和と差（合計${sc.k}・ちがい${d}）`,
    signature: `app-sumdiff|${sc.id}|${d}`,
    diagnose: (g) => {
      if (g === big) return null;
      if (g === small) return 'それは 少ない方の 数だね。多い方を 答えよう。';
      if (g === sc.k - d) return 'ちがいを そのまま ひいてしまったみたい。表の「ちがい」の行を 見てみよう。';
      return null;
    },
  };
}

/**
 * まわりの長さが 決まっている長方形で、面積が いちばん 広くなるとき。
 * 宮城県教育センター ジャンプ 大問2 の形（1cmのひご20本で長方形をつくる）。
 */
export function genAppMaxArea(): KawariProblem {
  const half = pick([8, 10, 12, 14, 16, 18, 20]);
  const perim = half * 2;
  const best = half / 2;
  // 表に出す たての長さの 窓を ずらして バリエーションを ふやす（正解の 位置を 覚えさせない）
  const shift = rnd(-1, 1);
  const xs = Array.from({ length: 5 }, (_, i) => best - 2 + shift + i).filter((v) => v > 0 && v < half);
  if (xs.length < 4 || !xs.includes(best)) return genAppMaxArea();
  // 「たては何cm？」と「そのときの面積は？」の2通りを 出し分ける
  const askArea = Math.random() < 0.5;
  return {
    skillId: 'app-maxarea', moduleId: 'apply',
    story: `1cm の ひごを ${perim}本 つかって、長方形や 正方形を つくります。`,
    prompt: askArea
      ? '面積が いちばん 広くなるとき、その 面積は 何cm² ですか。'
      : '面積が いちばん 広くなるのは、たての長さが 何cm の ときですか。',
    figure: {
      kind: 'table',
      xHeader: 'たての長さ（cm）',
      yHeader: 'よこの長さ（cm）',
      xs,
      ys: xs.map((x) => half - x),
      zHeader: '面積（cm²）',
      zs: xs.map((x) => x * (half - x)),
      vertical: true,
    },
    answer: { kind: 'number', correct: askArea ? best * best : best, unit: askArea ? 'cm²' : 'cm' },
    hints: [
      'たてと よこを たすと いつも 同じ 長さに なるね。まず それを 見つけよう。',
      `たて ＋ よこ ＝ ${half} だよ。表の 面積の 行を くらべよう。`,
      'たてと よこが 同じ長さ（正方形）の ときが いちばん 広くなるよ。',
    ],
    explain: `まわりが ${perim}cm なので たて＋よこ＝${half}cm。面積が いちばん 広いのは たて＝よこ＝${best}cm の 正方形の ときで、${best * best}cm² です。`,
    label: `面積が最大（まわり${perim}cm）`,
    signature: `app-maxarea|${perim}|${askArea ? 'area' : 'side'}|${xs.join('-')}`,
  };
}

/* ============================================================
 * 7. エラーハンター（誤概念の発見・修正・理由の言語化）
 * ============================================================ */

interface ErrBuilt {
  sc: Scenario;
  wrong: string;
  right: string;
  wrongs: string[];
  reasons: string[];
  reasonCorrect: number;
  note: string;
}
interface ErrSpec { skillId: string; build: () => ErrBuilt }

/**
 * この単元の代表的な誤概念（指導資料・県の学習状況調査ベース）
 *  1. 変化（横の見方）を そのまま 対応の式に する: ×4 の場面で □＋4＝○
 *  2. 式の 向きの 逆転: □×4＝○ を ○×4＝□
 *  3. 和が一定なのに「両方 ふえる」と 考える
 *  4. 表の 行（□と○）の 取りちがえ
 *  5. はじめに あった 分（0のときの値）の 見落とし
 *  6. □×a＋b の 場面で「＋b」を 落とす（宮城ステップの 正方形1列の型）
 */
const ERR_SPECS: ErrSpec[] = [
  {
    skillId: 'eh-changecorr',
    build: () => {
      const sc = pick(TIMES_SCENARIOS);
      return {
        sc,
        wrong: `□ ＋ ${sc.k} ＝ ○`,
        right: `□ × ${sc.k} ＝ ○`,
        wrongs: [`□ ＋ ${sc.k} ＝ ○`, `□ － ${sc.k} ＝ ○`, `○ ＋ ${sc.k} ＝ □`],
        reasons: [
          `「1ふえると ${sc.k}ふえる」は 横に見た かわり方。たてに見ると ${sc.k}ばいだから。`,
          `□ と ○ を 入れかえて「○ ＋ ${sc.k} ＝ □」と 書かないと いけないから。`,
          `1ふえると ${sc.k}へるので、${sc.k} を たすのでは なく ひくから。`,
        ],
        reasonCorrect: 0,
        note: `${sc.xName}が1ふえると ${sc.yName}は ${sc.k}ふえます。でも 対応の式は「${sc.k}を たす」ではなく「${sc.k}を かける」です。`,
      };
    },
  },
  {
    skillId: 'eh-reverse',
    build: () => {
      const sc = pick(TIMES_SCENARIOS);
      return {
        sc,
        wrong: `○ × ${sc.k} ＝ □`,
        right: `□ × ${sc.k} ＝ ○`,
        wrongs: [`○ × ${sc.k} ＝ □`, `□ ＋ ${sc.k} ＝ ○`, `○ ＋ □ ＝ ${sc.k}`],
        reasons: [
          `${sc.k}ばいに するのは ${sc.xName}の方だから、□ に ${sc.k} を かけるのが 正しい。`,
          `${sc.k}ばいでは なく、□ に ${sc.k} を たす かんけいだから。`,
          `${sc.yName}と ${sc.xName}は 同じ数ずつ ふえるので、2つを たす 式に するから。`,
        ],
        reasonCorrect: 0,
        note: `${sc.yName}が ${sc.xName}の ${sc.k}ばいです。かける のは □ の方だと 気をつけましょう。`,
      };
    },
  },
  {
    skillId: 'eh-sumdir',
    build: () => {
      const sc = pick(SUM_SCENARIOS);
      return {
        sc,
        wrong: '□ が 1ふえると ○ も 1ふえる',
        right: '□ が 1ふえると ○ は 1へる',
        wrongs: ['□ が 1ふえると ○ も 1ふえる', '□ が 1ふえても ○ は かわらない', '□ が 1ふえると ○ は 2へる'],
        reasons: [
          `2つを たすと いつも ${sc.k} なので、かた方が ふえると もう一方は へるから。`,
          `2つの ちがいが いつも ${sc.k} なので、かた方が ふえると もう一方も ふえるから。`,
          `2つは ${sc.k}ばいの かんけいなので、かた方が 1ふえると もう一方は ${sc.k}ふえるから。`,
        ],
        reasonCorrect: 0,
        note: `${sc.story} 2つを たすと いつも ${sc.k} です。だから かた方が ふえると もう一方は へります。`,
      };
    },
  },
  {
    skillId: 'eh-rowmix',
    build: () => {
      const sc = pick(DIFF_SCENARIOS);
      const x = rnd(3, 8);
      const y = applyRel(sc, x);
      return {
        sc,
        wrong: `${sc.yName}が ${y} のとき ${sc.xName}は ${y + sc.k}`,
        right: `${sc.yName}が ${y} のとき ${sc.xName}は ${x}`,
        wrongs: [
          `${sc.yName}が ${y} のとき ${sc.xName}は ${y + sc.k}`,  // ひくべきところを たした
          `${sc.yName}が ${y} のとき ${sc.xName}は ${y}`,        // そのまま 写した
          `${sc.yName}が ${y} のとき ${sc.xName}は ${x + 1}`,    // 1つ ずれた
        ],
        reasons: [
          `${sc.xName}から ${sc.yName}を もとめるときは たすが、逆は ひくから。`,
          `${sc.yName}から ${sc.xName}を もとめるときも、同じように ${sc.k} を たせば よいから。`,
          `2つは いつも 同じ数なので、表の 数を そのまま 書き写せば よいから。`,
        ],
        reasonCorrect: 0,
        note: `${relWordExpr(sc)} なので、${sc.yName}から ${sc.xName}を もとめるときは ${sc.k} を ひきます。`,
      };
    },
  },
  {
    skillId: 'eh-zero',
    build: () => {
      // 「はじめから いくつか ある」ことが 場面として 自然な もの だけを つかう
      // （年れいの場面で「0才のとき」を きくのは 不自然なので のぞく）
      const sc = pick(DIFF_SCENARIOS.filter((s) => ['tank', 'items', 'counters', 'tape'].includes(s.figure)));
      return {
        sc,
        wrong: `${sc.xName}が 0 の とき ${sc.yName}は 0`,
        right: `${sc.xName}が 0 の とき ${sc.yName}は ${sc.k}`,
        // wrongs は「まちがいの選択肢」だけを入れる（正しい式は right として別に足される）。
        // 画面に出ている まちがいの式（0）も 選択肢からは のぞかれるので、
        // ここには それ以外の まちがいを 2つ以上 用意しておく。
        wrongs: [
          `${sc.xName}が 0 の とき ${sc.yName}は 0`,
          `${sc.xName}が 0 の とき ${sc.yName}は 1`,
          `${sc.xName}が 0 の とき ${sc.yName}は ${sc.k * 2}`,
        ],
        reasons: [
          `はじめから ${sc.k}${sc.yUnit} あったから、0 では ないから。`,
          `${sc.xName}が 0 の ときは、${sc.yName}も 0 から はじまるから。`,
          `はじめに ある ${sc.k}${sc.yUnit} は、表の 数に 入れないから。`,
        ],
        reasonCorrect: 0,
        note: `${sc.story} はじめから ${sc.k}${sc.yUnit} あるので、0 の ときも ${sc.k}${sc.yUnit} です。`,
      };
    },
  },
  {
    skillId: 'eh-plusb',
    build: () => {
      const sc = pick(LINEAR_SCENARIOS);
      const b = sc.b ?? 0;
      return {
        sc,
        wrong: `□ × ${sc.k} ＝ ○`,
        right: `□ × ${sc.k} ＋ ${b} ＝ ○`,
        // かける数と たす数が 同じ場面（□×2＋2）で 正解と かぶらない まちがいだけを 置く
        wrongs: [
          `□ × ${sc.k} ＝ ○`,
          `□ ＋ ${sc.k} ＋ ${b} ＝ ○`,
          `□ × ${sc.k + b} ＝ ○`,
        ],
        reasons: [
          `${sc.k}ずつ ふえるけれど、はじめに ${b} ある分を たしわすれているから。`,
          `${sc.k}ずつ ではなく、${b}ずつ ふえる かんけいだから。`,
          `${sc.k} と ${b} を 先に たしてから、□ に かけないと 正しい 式に ならないから。`,
        ],
        reasonCorrect: 0,
        note: `${sc.story} ${sc.k}ずつ ふえますが、はじめから ${b} あるので「× ${sc.k} ＋ ${b}」です。表の 1つ目の 列で たしかめられます。`,
      };
    },
  },
];

export type EhSkillId = 'eh-changecorr' | 'eh-reverse' | 'eh-sumdir' | 'eh-rowmix' | 'eh-zero' | 'eh-plusb';

export function genError(skillId: EhSkillId): KawariProblem {
  const spec = ERR_SPECS.find((s) => s.skillId === skillId)!;
  const b = spec.build();
  const xs = variedXs(b.sc);
  // 「正しいものを えらぶ」選択肢に、画面に出ている まちがいの式 そのものを 混ぜない
  // （すぐに 消せる 実質ダミーになり、選択肢が 1つ 減るのと同じになるため）
  const fixChoices = shuffle(
    Array.from(new Set([b.right, ...b.wrongs.filter((w) => w !== b.right && w !== b.wrong)])),
  );
  const reasonChoices = shuffle(b.reasons);
  return {
    skillId, moduleId: 'eh',
    story: b.sc.story,
    // 「まちがっています」と先に言ってしまうと、第1段（正しいか どうか の 見きわめ）が
    // 考えずに 答えられてしまう。ここでは 判断そのものを 児童に させる。
    prompt: 'つぎの 考えを 見て、正しいか どうか たしかめましょう。まちがっていたら、正しい ものと そのりゆうも 答えます。',
    figure: tableFig(b.sc, xs, true),
    answer: {
      kind: 'errorFix',
      wrongExpr: b.wrong,
      findPrompt: 'この 考えは 正しいですか？',
      fixChoices,
      fixCorrect: fixChoices.indexOf(b.right),
      reasonChoices,
      reasonCorrect: reasonChoices.indexOf(b.reasons[b.reasonCorrect]),
    },
    hints: [
      '表を たてに 見て、ほんとうに その かんけいに なっているか たしかめよう。',
      `${corrWord(b.sc)} だね。`,
      `正しくは 「${b.right}」 だよ。`,
    ],
    explain: b.note,
    label: `まちがい直し（${skillId}）`,
    signature: `${skillId}|${b.sc.id}|${b.wrong}|${xs.join('-')}`,
  };
}

/* ============================================================
 * スキル一覧とディスパッチ
 * ============================================================ */

export type SkillId =
  | 'find-decide' | 'find-pair' | 'find-change' | 'find-direction'
  | 'tbl-sum' | 'tbl-diff' | 'tbl-times' | 'tbl-prod' | 'tbl-linear' | 'tbl-yoko' | 'tbl-tate'
  | 'rule-kind' | 'rule-const' | 'rule-word' | 'rule-hidden'
  | 'exp-sum' | 'exp-diff' | 'exp-times' | 'exp-prod' | 'exp-linear'
  | 'exp-scene' | 'exp-equiv' | 'exp-build' | 'exp-totable' | 'exp-toscene'
  | 'gra-plot' | 'gra-read' | 'gra-half' | 'gra-zero' | 'gra-next' | 'gra-kind'
  | 'app-nth' | 'app-inv' | 'app-limit' | 'app-life' | 'app-sumdiff' | 'app-maxarea'
  | EhSkillId;

/**
 * 数値で答える問題は「答えの数が 問題文・1段目のヒントから そのまま 拾える」
 * ことが 偶然おきる（例: 12このあめを 兄が 6このとき 弟は 6こ）。
 * 設計は正しくても 数の選び方だけで 考えずに 正解できてしまうので、
 * その組み合わせを 引き直して 取りのぞく。
 * 引き直しても だめなときは そのまま返す（無限ループを作らない）。
 */
function withoutNumberLeak(gen: () => KawariProblem, tries = 60): KawariProblem {
  let last = gen();
  for (let i = 0; i < tries; i++) {
    if (last.answer.kind !== 'number') return last;
    const n = last.answer.correct;
    const text = `${last.story ?? ''} ${last.prompt} ${last.hints[0]}`;
    const esc = String(n).replace(/\./g, '\\.');
    if (!new RegExp(`(?<!\\d)${esc}(?!\\d)`).test(text)) return last;
    last = gen();
  }
  return last;
}

const RAW_GENERATORS: Record<SkillId, () => KawariProblem> = {
  'find-decide': genFindDecide,
  'find-pair': genFindPair,
  'find-change': genFindChange,
  'find-direction': genFindDirection,

  'tbl-sum': genTblSum,
  'tbl-diff': genTblDiff,
  'tbl-times': genTblTimes,
  'tbl-prod': genTblProd,
  'tbl-linear': genTblLinear,
  'tbl-yoko': genTblYoko,
  'tbl-tate': genTblTate,

  'rule-kind': genRuleKind,
  'rule-const': genRuleConst,
  'rule-word': genRuleWord,
  'rule-hidden': genRuleHidden,

  'exp-sum': genExpSum,
  'exp-diff': genExpDiff,
  'exp-times': genExpTimes,
  'exp-prod': genExpProd,
  'exp-linear': genExpLinear,
  'exp-scene': genExpScene,
  'exp-equiv': genExpEquiv,
  'exp-build': genExpBuild,
  'exp-totable': genExpToTable,
  'exp-toscene': genExpToScene,

  'gra-plot': genGraPlot,
  'gra-read': genGraRead,
  'gra-half': genGraHalf,
  'gra-zero': genGraZero,
  'gra-next': genGraNext,
  'gra-kind': genGraKind,

  'app-nth': genAppNth,
  'app-inv': genAppInverse,
  'app-limit': genAppLimit,
  'app-life': genAppLife,
  'app-sumdiff': genAppSumDiff,
  'app-maxarea': genAppMaxArea,

  'eh-changecorr': () => genError('eh-changecorr'),
  'eh-reverse': () => genError('eh-reverse'),
  'eh-sumdir': () => genError('eh-sumdir'),
  'eh-rowmix': () => genError('eh-rowmix'),
  'eh-zero': () => genError('eh-zero'),
  'eh-plusb': () => genError('eh-plusb'),
};

/** 実際に使うジェネレーター（数の偶然一致を取りのぞく ガードつき） */
export const GENERATORS: Record<SkillId, () => KawariProblem> = Object.fromEntries(
  Object.entries(RAW_GENERATORS).map(([id, gen]) => [id, () => withoutNumberLeak(gen)]),
) as Record<SkillId, () => KawariProblem>;

export const ALL_SKILL_IDS = Object.keys(GENERATORS) as SkillId[];

export function generate(skillId: SkillId): KawariProblem {
  return GENERATORS[skillId]();
}

/** レベル選択画面に出す ラベル・せつめい（レベル名は実装と一致させる） */
export interface LevelMeta { id: SkillId; label: string; desc: string }

export const MODULE_LEVELS: Record<string, LevelMeta[]> = {
  find: [
    { id: 'find-change', label: 'ふえる？ へる？', desc: 'かた方が ふえると もう一方は どうなる？' },
    { id: 'find-direction', label: 'まとめて 判定', desc: '5つの 場面を ○（ふえる）／△（へる）で 分ける' },
    { id: 'find-decide', label: '決まる？ 決まらない？', desc: 'かた方を 決めると もう一方は ただ1つに 決まる？' },
    { id: 'find-pair', label: '組を さがす', desc: '伴って 変わる 2つの量の 組を えらぶ' },
  ],
  table: [
    { id: 'tbl-times', label: '表をうめる（何ばい）', desc: '1辺の長さと まわりの長さ など' },
    { id: 'tbl-diff', label: '表をうめる（ちがい）', desc: '正三角形の数と まわりの長さ など' },
    { id: 'tbl-sum', label: '表をうめる（たすと同じ）', desc: 'おはじきを 2人で 分ける など' },
    { id: 'tbl-prod', label: '表をうめる（かけると同じ）', desc: '24このビー玉を 何人かで 分ける など' },
    { id: 'tbl-linear', label: '表をうめる（かけて たす）', desc: '正方形を 1れつに ならべる など' },
    { id: 'tbl-yoko', label: '横に 見る', desc: '□が1ふえると ○は いくつ 変わる？' },
    { id: 'tbl-tate', label: 'たてに 見る', desc: 'どの列でも いつも 同じに なるのは？' },
  ],
  rule: [
    { id: 'rule-const', label: '変わらない数', desc: 'いつも 同じに なる 数を もとめる' },
    { id: 'rule-kind', label: 'きまりの 見わけ', desc: '和・差・倍・積・かけてたす の どれかな' },
    { id: 'rule-word', label: 'ことばの式', desc: '（〜）＋2＝（〜）の 形に する' },
    { id: 'rule-hidden', label: 'きまりを つかう', desc: '表に ない ところも もとめる' },
  ],
  expr: [
    { id: 'exp-scene', label: '場面から 式へ', desc: '文を 読んで 式を えらぶ（表なし）' },
    { id: 'exp-times', label: '□×〇＝○ の式', desc: '倍が 一定の 場面' },
    { id: 'exp-diff', label: '□＋〇＝○ の式', desc: '差が 一定の 場面（ひき算の 形も）' },
    { id: 'exp-sum', label: '□＋○＝〇 の式', desc: '和が 一定の 場面' },
    { id: 'exp-prod', label: '□×○＝〇 の式', desc: '積が 一定の 場面' },
    { id: 'exp-linear', label: '□×〇＋△＝○ の式', desc: 'かけて たす 場面' },
    { id: 'exp-equiv', label: '同じ式 さがし', desc: '正しい 書き方を ぜんぶ えらぶ' },
    { id: 'exp-build', label: '式づくり', desc: 'カードを ならべて 式に する' },
    { id: 'exp-totable', label: '式から 表へ', desc: '式の □ に 数を 入れて しらべる' },
    { id: 'exp-toscene', label: '式から 場面へ', desc: 'この式に あう 場面は どれ？' },
  ],
  graph: [
    { id: 'gra-plot', label: 'グラフに 点をうつ', desc: '表の とおりに 折れ線グラフを かく' },
    { id: 'gra-read', label: 'グラフを 読む', desc: 'グラフから 数を 読み取る' },
    { id: 'gra-half', label: '目もりの あいだ', desc: '2.5分の ような とちゅうの 大きさを 読む' },
    { id: 'gra-zero', label: '0の ときは？', desc: 'はじめに あった 分を 読む' },
    { id: 'gra-next', label: 'この先を 予想', desc: 'グラフを のばして 考える' },
    { id: 'gra-kind', label: 'グラフの 形', desc: '右上がり？ 右下がり？' },
  ],
  apply: [
    { id: 'app-nth', label: '20番目・100番目は？', desc: '表に ない 大きい 数の とき' },
    { id: 'app-inv', label: '逆に たどる', desc: '○から □を もとめる' },
    { id: 'app-limit', label: '100cmに なるのは？', desc: '目あての 数に なる ときを もとめる' },
    { id: 'app-sumdiff', label: 'ちがいを 決めて 分ける', desc: '合計と ちがいから 2つの数を もとめる' },
    { id: 'app-maxarea', label: '面積を いちばん 広く', desc: 'まわりが 同じ 長方形で いちばん 広いのは' },
    { id: 'app-life', label: 'くらしで つかう', desc: 'いくつまで に できる？' },
  ],
  eh: [
    { id: 'eh-changecorr', label: '横と たての とりちがえ', desc: '「4ふえる」を「＋4」と 書く まちがい' },
    { id: 'eh-reverse', label: '式の 向き', desc: '□と○を 逆に した まちがい' },
    { id: 'eh-plusb', label: 'たす分の 落とし', desc: '「×2＋2」の ＋2 を わすれる まちがい' },
    { id: 'eh-sumdir', label: 'たすと 同じ なのに', desc: '「両方 ふえる」と 思う まちがい' },
    { id: 'eh-rowmix', label: '行の とりちがえ', desc: '□と○を 読みまちがえる' },
    { id: 'eh-zero', label: 'はじめの 分', desc: '0の ときを 見落とす まちがい' },
  ],
};
