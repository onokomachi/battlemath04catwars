// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problemTypes.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 全モジュール共通の「1問」の型。
 *
 * わり算アプリでは モジュールごとに Round コンポーネントを書いていたが、この単元は
 * 「図を見て答える」形が共通しているので、解答UIの種類（AnswerSpec）で分岐する
 * 1つのディスパッチャ（GeoRound）に集約する。こうすると
 *   - 本番テストが全レベルをそのまま再利用でき、「実装したのにテストに出ないレベル」が構造的に生まれない
 *   - ヒント3段・誤答診断・図の表示を1か所で保証できる
 */
import { FigureSpec, QuadKind, Pt } from '../types';
import { ModuleId } from '../store/progressStore';

/** 解答UIと正解のペア。 */
export type AnswerSpec =
  /** 4択などの単一選択 */
  | { kind: 'choice'; choices: string[]; correct: number }
  /** あてはまるものを「すべて」選ぶ（包含関係・性質の多肢選択） */
  | { kind: 'multi'; choices: string[]; correct: number[] }
  /** 四角形の名前を答える（専用の名前ボタン） */
  | { kind: 'name'; correct: QuadKind; options: QuadKind[] }
  /** 数値（角度・長さ）を答える */
  | { kind: 'number'; correct: number; unit: string }
  /** 記号の組をすべて選ぶ（「垂直な直線の組をすべて答えましょう」） */
  | { kind: 'pairs'; symbols: string[]; correct: [number, number][]; relation: '垂直' | '平行' }
  /** 作図の手順カードを正しい順に並べる */
  | { kind: 'order'; steps: string[]; correct: number[] }
  /**
   * 方眼をタップして図をかく（作図）。
   * accept は「正解になりうる点の組」の一覧。順番は問わず、集合として一致すれば正解。
   * 「点Aを通る垂直な直線」のように正解が何通りもある作図を、判定関数を持ち回さずに表現できる。
   */
  | {
      kind: 'gridDraw';
      gw: number;
      gh: number;
      taps: number;
      accept: Pt[][];
      /** タップした点をどう結んで見せるか */
      connect: 'lineFrom' | 'polygon';
      /** connect='lineFrom' のときの通過点 */
      base?: Pt;
      /**
       * 垂直・平行な直線をひく問題のとき: 直線あの向き（方眼のますの数）と、ねらう関係。
       * まちがえたとき「いまの角は 約87°」のように、何がちがうかを角度で返すのに使う。
       */
      target?: { dir: Pt; mode: 'perp' | 'para' };
      /** connect='polygon' のときの すでに置かれている頂点（この順に結ぶ） */
      given?: Pt[];
      guide: string;
    }
  /** 敷き詰め：空いた場所に置くタイルの向きを選ぶ */
  | { kind: 'tiling'; choices: string[]; correct: number }
  /** 対角線の性質などの○×表（1つの図形について複数の性質を判定する） */
  | { kind: 'truth'; rows: { label: string; correct: boolean }[] }
  /**
   * 四角形 × 性質 の一覧表に ○× を入れる。
   * 市販の単元テストで定番の「あてはまるところに○をかきましょう」の形式。
   * 1つの図形を見て名前を答えるだけでは、「平行・辺の長さ・角をすべて調べる」という
   * 単元のねらい（思考・判断・表現）に届かないので、この形式を別に用意する。
   */
  | { kind: 'matrix'; rowLabels: string[]; colLabels: string[]; correct: boolean[][] }
  /**
   * 複数の図形を、グループに仲間分けする。
   * 解説 p.204「平行が何組あるかに着目することで，図形を分類することが可能になる」に対応し、
   * 授業の中心活動（かいた四角形を仲間分けする）をそのまま問題にしたもの。
   */
  | { kind: 'sort'; itemLabels: string[]; groups: string[]; correct: number[] }
  /**
   * エラーハンター：3段階で答える。
   *   ① 4つの考えから **まちがっているもの** を見つける
   *   ② 正しくは どうなるかを選ぶ（修正）
   *   ③ なぜ そう まちがえたのか、理由を選ぶ（言語化）
   * 正誤だけでなく「なぜ・次にどうするか」を扱うために、この3段階を崩さない。
   */
  | {
      kind: 'errorFix';
      wrongOptions: string[];
      wrongIndex: number;
      fixChoices: string[];
      fixIndex: number;
      reasons: string[];
      reasonIndex: number;
    };

export interface GeoProblem {
  /** 習熟度・ふくしゅう・ボスの重点出題に使うキー。'rel-perp' のような <prefix>-<level> 形式。 */
  skillId: string;
  moduleId: ModuleId;
  /** 問題文（小4が読める表記） */
  prompt: string;
  /** 図。図形単元なので原則すべての問題につける。 */
  figure?: FigureSpec;
  answer: AnswerSpec;
  /** 段階的ヒント3段。1段目は答えの値を言わない。 */
  hints: [string, string, string];
  /** 正解後に見せる解説（なぜそうなるか） */
  explain: string;
  /** 学習のきろく用の短いラベル */
  label: string;
  /**
   * 誤答診断。児童が選んだ／入力した値を受け取り、典型的なまちがい方に合う説明を返す。
   * 該当しなければ null。正解を渡したときは必ず null を返さなければならない（検証で確認する）。
   */
  diagnose?: (given: number) => string | null;
  /** 出題バリエーションを数えるための署名（図に出る数値も含める） */
  signature: string;
}

/** モジュールのレベル定義。ハブのレベル選択画面と本番テストの両方から使う。 */
export interface LevelDef<L extends string = string> {
  id: L;
  label: string;
  desc: string;
}
