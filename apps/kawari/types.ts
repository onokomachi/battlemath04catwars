// このファイルは単元アプリ syo4-kawarikatasirabe の src/types.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小4「変わり方調べ」アプリの中核の型。
 *
 * 設計方針（master-DB: patterns/answer-ui-dispatcher-with-pool-based-test.md）:
 *   1問 = 「図（FigureSpec）＋問題文＋解答UI（AnswerSpec）＋3段ヒント＋解説」。
 *   解答UIの種類でしか分岐しないので、Round コンポーネントは1つで足りる。
 */

/* ============================================================
 * 場面（伴って変わる二つの数量）の型
 * ============================================================ */

/**
 * 対応の特徴の類型。
 *
 * 出典と、その型が実際に出題されている証拠:
 *  - 学習指導要領解説 第4学年 C(1) p.216「和が一定，差が一定，一方を定数倍すると
 *    他方になる**など**の対応の特徴」…「など」に積が一定・□×a＋b が含まれる
 *  - 東京書籍 単元11: 第1時=sum（時計盤）／第2時=diff（正三角形1列）／第3時=times（かいだん）
 *  - 埼玉県教育委員会 東京書籍版 単元11 プリント: prod（24÷□＝○、□×○＝36）と
 *    less（□－4＝○）が実際に出題されている
 *  - 宮城県教育センター 単元11 ステップ（H16 県学習状況調査より）:
 *    linear（正方形を1列にならべる まわりの長さ ＝ □×2＋2、100このときは？）
 *
 * 表記は □ と ○（東京書籍・上記2県の評価問題がすべて □○ を使うため。
 * 指導要領解説は □△ だが、教科書の表記に合わせる）。
 */
export type RelKind = 'sum' | 'diff' | 'less' | 'times' | 'prod' | 'linear';

/** 図の種類。単元の題材ごとに専用の絵を持つ（図なしの問題を作らないため） */
export type FigureKind =
  | 'clocks'      // ㋐㋑2つの時計盤（和が一定）
  | 'triangles'   // 正三角形を1列にならべる（差が一定）
  | 'strip'       // 正方形を1列にならべる（□×2＋2）
  | 'matches'     // マッチぼうで正方形／正三角形を1列に作る（□×3＋1 / □×2＋1）
  | 'stairs'      // 正方形を階段状にならべる（一方を4倍）
  | 'square'      // 1辺の長さを変える正方形
  | 'polygon'     // 正三角形／正六角形など（1辺と周りの長さ）
  | 'rect'        // 長方形（たて・よこ・面積）
  | 'counters'    // おはじきを2人で分ける
  | 'tape'        // テープ（使った分・のこり）
  | 'tank'        // 水そうに水を入れる
  | 'items'       // 品物がいくつ分（代金・重さなど）
  | 'ages'        // 2人の年れい
  | 'none';

/**
 * 場面の定義。「□ を決めると ○ がただ1つに決まる」関係を持つ。
 *  - sum:    □ ＋ ○ ＝ k        （和が一定）
 *  - diff:   □ ＋ k ＝ ○        （差が一定・○ が大きい）
 *  - less:   □ － k ＝ ○        （差が一定・□ が大きい）
 *  - times:  □ × k ＝ ○        （一方を定数倍）
 *  - prod:   □ × ○ ＝ k        （積が一定）
 *  - linear: □ × k ＋ b ＝ ○   （同じ数ずつふえるが、はじめに いくつか ある）
 */
export interface Scenario {
  id: string;
  kind: RelKind;
  /** 関係を決める定数（和・差・倍・積、linear では かける数） */
  k: number;
  /** linear のときに たす数 */
  b?: number;
  /** 場面の説明文（「〜のとき」） */
  story: string;
  /** □ にあたる量の名前（例: 「正三角形の数」）。定数を名前に入れないこと */
  xName: string;
  /** ○ にあたる量の名前（例: 「まわりの長さ」） */
  yName: string;
  /** 単位（表の見出しに出す。空文字なら単位なし） */
  xUnit: string;
  yUnit: string;
  figure: FigureKind;
  /** 表に出す □ の値のならび（既定は 1,2,3,4,5。prod では k の約数だけ） */
  xs?: number[];
}

/** その場面で □ に x を入れたときの ○ */
export function applyRel(sc: Scenario, x: number): number {
  switch (sc.kind) {
    case 'sum': return sc.k - x;
    case 'diff': return x + sc.k;
    case 'less': return x - sc.k;
    case 'times': return x * sc.k;
    case 'prod': return sc.k / x;
    case 'linear': return x * sc.k + (sc.b ?? 0);
  }
}

/** その場面で ○ に y を入れたときの □（逆にたどる） */
export function inverseRel(sc: Scenario, y: number): number {
  switch (sc.kind) {
    case 'sum': return sc.k - y;
    case 'diff': return y - sc.k;
    case 'less': return y + sc.k;
    case 'times': return y / sc.k;
    case 'prod': return sc.k / y;
    case 'linear': return (y - (sc.b ?? 0)) / sc.k;
  }
}

/** 対応の式（□と○の式）の文字列。代表の1つ。 */
export function relExpr(sc: Scenario): string {
  switch (sc.kind) {
    case 'sum': return `□ ＋ ○ ＝ ${sc.k}`;
    case 'diff': return `□ ＋ ${sc.k} ＝ ○`;
    case 'less': return `□ － ${sc.k} ＝ ○`;
    case 'times': return `□ × ${sc.k} ＝ ○`;
    case 'prod': return `□ × ○ ＝ ${sc.k}`;
    case 'linear': return `□ × ${sc.k} ＋ ${sc.b ?? 0} ＝ ○`;
  }
}

/**
 * 同じ関係を表す式（どれも正解）。
 * 実際の解答例が「□＋２＝○，○－□＝２，○－２＝□」のように複数形を認めているため
 * （埼玉県 東京書籍版 単元11 NO1(4)・NO2(3)）、1つだけを正解にしない。
 */
export function equivalentExprs(sc: Scenario): string[] {
  const k = sc.k;
  switch (sc.kind) {
    case 'sum': return [`□ ＋ ○ ＝ ${k}`, `${k} － □ ＝ ○`, `${k} － ○ ＝ □`];
    case 'diff': return [`□ ＋ ${k} ＝ ○`, `○ － □ ＝ ${k}`, `○ － ${k} ＝ □`];
    case 'less': return [`□ － ${k} ＝ ○`, `□ － ○ ＝ ${k}`, `○ ＋ ${k} ＝ □`];
    case 'times': return [`□ × ${k} ＝ ○`, `○ ÷ □ ＝ ${k}`, `○ ÷ ${k} ＝ □`];
    case 'prod': return [`□ × ○ ＝ ${k}`, `${k} ÷ □ ＝ ○`, `${k} ÷ ○ ＝ □`];
    case 'linear': return [`□ × ${k} ＋ ${sc.b ?? 0} ＝ ○`, `○ － ${sc.b ?? 0} ＝ □ × ${k}`];
  }
}

/** ことばの式（（正三角形の数）＋2＝（まわりの長さ） の形） */
export function relWordExpr(sc: Scenario): string {
  const x = `（${sc.xName}）`, y = `（${sc.yName}）`;
  switch (sc.kind) {
    case 'sum': return `${x}＋${y}＝ ${sc.k}`;
    case 'diff': return `${x}＋ ${sc.k} ＝${y}`;
    case 'less': return `${x}－ ${sc.k} ＝${y}`;
    case 'times': return `${x}× ${sc.k} ＝${y}`;
    case 'prod': return `${x}×${y}＝ ${sc.k}`;
    case 'linear': return `${x}× ${sc.k} ＋ ${sc.b ?? 0} ＝${y}`;
  }
}

/* ============================================================
 * 図（FigureSpec）
 * ============================================================ */

/** 表の1列ぶん。value が null なら「あいているところ」として ? を表示する */
export interface TableCell { value: number | null }

export interface TableFigure {
  kind: 'table';
  xHeader: string;
  yHeader: string;
  xs: number[];
  /** null は空欄（?）として表示 */
  ys: (number | null)[];
  /** 3行目（「兄と弟の差」など。和と差の複合問題で使う） */
  zHeader?: string;
  zs?: (number | null)[];
  /** 矢印で強調したい列（変化の見方を示すとき） */
  highlight?: { col: number; label: string }[];
  /** 縦の対応を強調するか（対応の見方） */
  vertical?: boolean;
}

export interface GraphFigure {
  kind: 'graph';
  title: string;
  xLabel: string;
  yLabel: string;
  xMax: number;
  yMax: number;
  /** 主目盛りの間隔 */
  xStep: number;
  yStep: number;
  /** すでに打たれている点（読み取り問題用） */
  points: { x: number; y: number }[];
  /** 点を線でつなぐか */
  line?: boolean;
  /** 読み取りを助ける補助線（bugs/graph-minor-ticks-required.md） */
  guide?: { x?: number; y?: number };
}

export interface SceneFigure {
  kind: 'scene';
  fig: FigureKind;
  /** 図に描く「□」の値（正三角形3個、段の数2 など） */
  n: number;
  /** 図に添える数値ラベル（1辺の長さなど） */
  labelA?: string;
  labelB?: string;
  /** 和が一定の場面で全体量を示す（おはじき8こ など） */
  total?: number;
}

export type FigureSpec = TableFigure | GraphFigure | SceneFigure;

/* ============================================================
 * 解答UI（AnswerSpec）
 * ============================================================ */

/** 表の空欄をうめる（□の値に対応する△を入れる） */
export interface TableFillAnswer {
  kind: 'tableFill';
  xHeader: string;
  yHeader: string;
  xs: number[];
  /** すでに埋まっている値（null なら児童が入力する空欄） */
  given: (number | null)[];
  /** 正解（全列ぶん） */
  correct: number[];
}

/** 折れ線グラフに点を打つ */
export interface GraphPlotAnswer {
  kind: 'graphPlot';
  title: string;
  xLabel: string;
  yLabel: string;
  xMax: number;
  yMax: number;
  xStep: number;
  yStep: number;
  /** 打つべき点 */
  correct: { x: number; y: number }[];
  /** 最初から打ってある点（例をしめす） */
  given?: { x: number; y: number }[];
}

/** カードを並べて式をつくる */
export interface ExprBuildAnswer {
  kind: 'exprBuild';
  /** 並べるカードの候補（シャッフルして表示） */
  cards: string[];
  /** 正しい並び（cards の文字列そのもの） */
  correct: string[];
}

/** それぞれの行に ○ / × をつける（決まる・決まらない など） */
export interface TruthAnswer {
  kind: 'truth';
  yesLabel: string;
  noLabel: string;
  rows: { label: string; correct: boolean; why: string }[];
}

/** まちがい直し（見つける→正しい式を選ぶ→理由を選ぶ の3段） */
export interface ErrorFixAnswer {
  kind: 'errorFix';
  /** まちがった式（画面に大きく出す） */
  wrongExpr: string;
  /** 「この式は正しい？」→ いつも false（まちがい）。段1で×を選ばせる */
  findPrompt: string;
  /** 段2: 正しい式を選ぶ */
  fixChoices: string[];
  fixCorrect: number;
  /** 段3: なぜまちがいか、理由を選ぶ */
  reasonChoices: string[];
  reasonCorrect: number;
}

export interface ChoiceAnswer {
  kind: 'choice';
  choices: string[];
  correct: number;
}

export interface MultiAnswer {
  kind: 'multi';
  choices: string[];
  correct: number[];
}

export interface NumberAnswer {
  kind: 'number';
  correct: number;
  unit: string;
  /** 小数の入力を許すか（グラフの読み取りで使う） */
  decimal?: boolean;
}

export type AnswerSpec =
  | TableFillAnswer
  | GraphPlotAnswer
  | ExprBuildAnswer
  | TruthAnswer
  | ErrorFixAnswer
  | ChoiceAnswer
  | MultiAnswer
  | NumberAnswer;

/* ============================================================
 * 1問
 * ============================================================ */

export interface KawariProblem {
  skillId: string;
  moduleId: string;
  /** 場面の説明（あれば図の上に出す） */
  story?: string;
  /** 問い */
  prompt: string;
  figure?: FigureSpec;
  answer: AnswerSpec;
  /** 3段ヒント。1段目で答えを言わない（型で3段を強制する） */
  hints: [string, string, string];
  /** 解いたあとの説明 */
  explain: string;
  /** 学習のきろく用の短いラベル */
  label: string;
  /** バリエーション数を数えるための署名（図の数値もふくめる） */
  signature: string;
  /** 典型誤答の値 → その子むけの声かけ（数値入力のときだけ使う） */
  diagnose?: (given: number) => string | null;
}
