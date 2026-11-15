// このファイルは単元アプリ wari-hissann3 の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * わり算単元（4年）の問題ジェネレーター集。
 * 教科書・問題集・単元テストで頻出の問題タイプを、スキル別・段階別に網羅する。
 *
 * - mental   : あんざいわり算（九九の範囲 → あまり → 何十・何百）
 * - rules    : わり算のきまり（同じ数でわる・□うめ・あまりの10倍に注意）
 * - estimate : 商の見当づけ（商がたつ位・商のけた数・四捨五入による仮商）
 * - check    : たしかめ算（わる数×商＋あまり＝わられる数）
 * - word     : 文章題（等分除・包含除・あまりの切り上げ/切り捨て）
 * - error    : エラーハンター（0とばし・あまり過大・ひき算ミス・きまりのあまり）
 */

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

/* =====================================================================
 * あんざん わり算
 * =================================================================== */

export type MentalLevel = 'mental-basic' | 'mental-rem' | 'mental-tens' | 'mental-hundreds';

export const MENTAL_LEVELS: { id: MentalLevel; label: string; desc: string }[] = [
  { id: 'mental-basic', label: '九九の はんい', desc: '48÷6 のような わりきれる わり算' },
  { id: 'mental-rem', label: 'あまりの ある わり算', desc: '50÷7 は 7あまり1' },
  { id: 'mental-tens', label: '何十の わり算', desc: '60÷3 や 240÷3 を 10のまとまりで' },
  { id: 'mental-hundreds', label: '何百の わり算', desc: '600÷3 を 100のまとまりで' },
];

export interface SimpleDivProblem {
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  hint: string;
}

export function generateMental(level: MentalLevel): SimpleDivProblem {
  switch (level) {
    case 'mental-basic': {
      const divisor = rnd(2, 9);
      const quotient = rnd(2, 9);
      const dividend = divisor * quotient;
      return { dividend, divisor, quotient, remainder: 0, hint: `${divisor}のだんの 九九で 考えよう。${divisor} × いくつ で ${dividend} かな？` };
    }
    case 'mental-rem': {
      const divisor = rnd(3, 9);
      const quotient = rnd(2, 9);
      const remainder = rnd(1, divisor - 1);
      const dividend = divisor * quotient + remainder;
      return { dividend, divisor, quotient, remainder, hint: `${divisor}のだんで ${dividend} を こえない いちばん大きい 九九を さがそう。あまりは わる数より 小さくなるよ。` };
    }
    case 'mental-tens': {
      // 60÷3（6÷3 の10倍）も 240÷3（24÷3 の10倍）も「10のまとまり」で同じ考え方
      const divisor = rnd(2, 9);
      const q1 = rnd(2, 9);
      const base = divisor * q1;
      const dividend = base * 10;
      return { dividend, divisor, quotient: q1 * 10, remainder: 0, hint: `10のまとまりで 考えよう。${base} ÷ ${divisor} = ${q1} だから、10が ${q1}こ分 → ${q1 * 10} だね。` };
    }
    case 'mental-hundreds': {
      const divisor = rnd(2, 9);
      const q1 = rnd(2, 9);
      const dividend = divisor * q1 * 100;
      return { dividend, divisor, quotient: q1 * 100, remainder: 0, hint: `100のまとまりで 考えよう。${dividend / 100} ÷ ${divisor} = ${q1} だから、100が ${q1}こ分だね。` };
    }
  }
}

/* =====================================================================
 * わり算のきまり
 * =================================================================== */

export type RulesLevel =
  | 'rules-tens' | 'rules-hundreds' | 'rules-rem' | 'rules-blank'
  | 'rules-kufu' | 'rules-trap' | 'rules-equal';

export const RULES_LEVELS: { id: RulesLevel; label: string; desc: string }[] = [
  { id: 'rules-tens', label: '何十 ÷ 何十', desc: '90÷30 は 9÷3 と 同じ商' },
  { id: 'rules-hundreds', label: '何百 ÷ 何百', desc: '2400÷600 は 24÷6 と 同じ商' },
  { id: 'rules-rem', label: 'あまりに ちゅうい！', desc: '740÷90 の あまりは 2 じゃなくて 20' },
  { id: 'rules-kufu', label: 'くふうして 筆算', desc: '6400÷800 は 0を消して 64÷8' },
  { id: 'rules-trap', label: 'あまりの わなを 見ぬけ', desc: '6500÷700 の あまりは どれ？' },
  { id: 'rules-equal', label: '商が 等しい式を さがせ', desc: '120÷60 と 同じ商の式を 2つ えらぶ' },
  { id: 'rules-blank', label: '□に あてはまる数', desc: '72÷9 ＝ 720÷□' },
];

export interface RulesProblem {
  kind: 'calc' | 'blank' | 'choice' | 'multi';
  /** calc: わり算そのもの */
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  /** blank: 「a ÷ b = c ÷ □」のような式（□は1か所） */
  exprLeft?: string;
  exprRight?: string;
  blankAnswer?: number;
  /** choice: 選択肢から1つ選ぶ / multi: 2つ選ぶ */
  choices?: string[];
  answerIndex?: number;
  answerIndices?: number[];
  /** 問題文（choice / multi 用） */
  text?: string;
  hint: string;
  explain?: string;
}

export function generateRules(level: RulesLevel): RulesProblem {
  switch (level) {
    case 'rules-tens': {
      const d0 = rnd(2, 9);
      const q = rnd(2, 9);
      const divisor = d0 * 10;
      const dividend = divisor * q;
      return { kind: 'calc', dividend, divisor, quotient: q, remainder: 0, hint: `わられる数と わる数を 両方 10でわっても 商は 同じ。${dividend / 10} ÷ ${d0} で 考えよう。` };
    }
    case 'rules-hundreds': {
      const d0 = rnd(2, 9);
      const q = rnd(2, 9);
      const divisor = d0 * 100;
      const dividend = divisor * q;
      return { kind: 'calc', dividend, divisor, quotient: q, remainder: 0, hint: `両方を 100でわっても 商は 同じ。${dividend / 100} ÷ ${d0} で 考えよう。` };
    }
    case 'rules-rem': {
      const d0 = rnd(3, 9);
      const q = rnd(2, 9);
      const r0 = rnd(1, d0 - 1);
      const divisor = d0 * 10;
      const dividend = divisor * q + r0 * 10;
      return {
        kind: 'calc', dividend, divisor, quotient: q, remainder: r0 * 10,
        hint: `${dividend / 10} ÷ ${d0} = ${q} あまり ${r0}。でも この「${r0}」は 10のまとまりが ${r0}こ という意味だから、本当の あまりは ${r0 * 10} だよ。`,
      };
    }
    case 'rules-kufu': {
      // 末尾に0のある数のわり算（0を消して筆算するくふう）。
      // 半々で「わりきれる（6400÷800）」「あまりが出る（8200÷300=27あまり100）」を出す
      const d0 = rnd(2, 9);
      const divisor = d0 * 100;
      if (Math.random() < 0.5) {
        const q = rnd(2, 9);
        const dividend = divisor * q;
        return {
          kind: 'calc', dividend, divisor, quotient: q, remainder: 0,
          hint: `0を 2つずつ 消して ${dividend / 100} ÷ ${d0} で 計算しよう。商は 変わらないよ。`,
          explain: `${dividend} ÷ ${divisor} は 0を消して ${dividend / 100} ÷ ${d0} ＝ ${q}。`,
        };
      }
      const q = rnd(12, 32);
      const r0 = rnd(1, d0 - 1);
      const dividend = divisor * q + r0 * 100;
      return {
        kind: 'calc', dividend, divisor, quotient: q, remainder: r0 * 100,
        hint: `0を消して ${dividend / 100} ÷ ${d0} を 筆算しよう。ただし あまりには 消した0を つけるよ（あまり ${r0} → ${r0 * 100}）。`,
        explain: `${dividend / 100} ÷ ${d0} ＝ ${q} あまり ${r0}。あまりの ${r0} は 100が ${r0}こ分だから、答えは ${q} あまり ${r0 * 100}。`,
      };
    }
    case 'rules-trap': {
      // 6500÷700 のあまりを 3択から選ぶ（9あまり2 / 900あまり200 / 9あまり200）
      const d0 = rnd(3, 9);
      const q = rnd(2, 9);
      const r0 = rnd(1, d0 - 1);
      const divisor = d0 * 100;
      const dividend = divisor * q + r0 * 100;
      const correct = `${q} あまり ${r0 * 100}`;
      const options = [
        `${q} あまり ${r0}`,
        `${q * 100} あまり ${r0 * 100}`,
        correct,
      ].sort(() => Math.random() - 0.5);
      return {
        kind: 'choice', dividend, divisor, quotient: q, remainder: r0 * 100,
        text: `${dividend} ÷ ${divisor} の筆算を 0を消して しました。正しい答えは どれですか？`,
        choices: options, answerIndex: options.indexOf(correct),
        hint: `商は 0を消した ${dividend / 100} ÷ ${d0} と 同じ。でも あまりには 消した0を つけるよ。たしかめ算 ${divisor} × ${q} ＋ あまり ＝ ${dividend} で かくにんしよう。`,
        explain: `${dividend / 100} ÷ ${d0} ＝ ${q} あまり ${r0}。あまりに 消した0を つけて、正しくは ${correct}。`,
      };
    }
    case 'rules-equal': {
      // 商が等しい式を2つ選ぶ（大問7型）
      const d0 = rnd(2, 6);
      const q = rnd(2, 9);
      const divisor = d0 * 10;
      const dividend = divisor * q;
      const correct1 = `${dividend / 10} ÷ ${d0}`; // 両方を10でわった式
      let m = rnd(1, 9) * 10;
      if (m === divisor) m = m === 90 ? 80 : m + 10; // 問題と同じ式になるのを避ける
      const correct2 = `${q * m} ÷ ${m}`; // 商が同じになる別の式
      const wrong1 = `${dividend} ÷ ${d0}`; // わられる数だけ そのまま
      const w = rnd(2, 9);
      const wrongQ = w === q ? w + 1 : w;
      const wrong2 = `${wrongQ * d0 * 10} ÷ ${d0 * 10}`; // 商がちがう式
      const options = [correct1, correct2, wrong1, wrong2].sort(() => Math.random() - 0.5);
      return {
        kind: 'multi', dividend, divisor, quotient: q, remainder: 0,
        text: `${dividend} ÷ ${divisor} と 商が等しい式を 2つ えらびましょう。`,
        choices: options,
        answerIndices: [options.indexOf(correct1), options.indexOf(correct2)].sort((a, b) => a - b),
        hint: `${dividend} ÷ ${divisor} の商は ${q}。それぞれの式の商を たしかめて、${q} になる式を さがそう。わられる数と わる数の 両方に 同じ数を かけたり わったり しても 商は 同じだよ。`,
        explain: `${dividend} ÷ ${divisor} ＝ ${q}。「${correct1}」と「${correct2}」も 商が ${q} で 等しいね。`,
      };
    }
    case 'rules-blank': {
      const b = rnd(2, 9);
      const q = rnd(2, 9);
      const a = b * q;
      const scale = pick([10, 100]);
      // どちらの数を□にするか
      if (Math.random() < 0.5) {
        // a ÷ b ＝ (a×scale) ÷ □   → □ = b×scale
        return {
          kind: 'blank', dividend: a, divisor: b, quotient: q, remainder: 0,
          exprLeft: `${a} ÷ ${b}`, exprRight: `${a * scale} ÷ □`, blankAnswer: b * scale,
          hint: `わられる数が ${scale}倍に なっているね。商を 同じにするには、わる数も ${scale}倍に しよう。`,
        };
      }
      // (a×scale) ÷ (b×scale) ＝ a ÷ □ → □ = b
      return {
        kind: 'blank', dividend: a * scale, divisor: b * scale, quotient: q, remainder: 0,
        exprLeft: `${a * scale} ÷ ${b * scale}`, exprRight: `${a} ÷ □`, blankAnswer: b,
        hint: `わられる数が ${scale}分の1 に なっているね。わる数も ${scale}でわると 商は 同じだよ。`,
      };
    }
  }
}

/* =====================================================================
 * 商の見当づけ
 * =================================================================== */

export type EstimateLevel = 'est-place' | 'est-digits' | 'est-round' | 'est-cond';

export const ESTIMATE_LEVELS: { id: EstimateLevel; label: string; desc: string }[] = [
  { id: 'est-place', label: 'どの位に たつ？', desc: '商を 立てはじめる 位を あてよう' },
  { id: 'est-digits', label: '商は 何けた？', desc: '計算する前に けた数を 見ぬこう' },
  { id: 'est-round', label: '仮の商の 見当', desc: '171÷21 → 21を20とみて 見当8' },
  { id: 'est-cond', label: '□に入る数字は？', desc: '62)6□9 の商が 10より小さくなる □は？' },
];

export interface EstimateProblem {
  kind: 'choice' | 'value' | 'multi-digit';
  dividend: number;
  divisor: number;
  text: string;
  choices?: string[];
  answerIndex?: number;
  answerValue?: number;
  /** multi-digit: □入り被除数（例 '6□9'）と、条件を満たす数字ぜんぶ */
  dividendTemplate?: string;
  answerDigits?: number[];
  /** 筆算の形（わく）で表示するか */
  bracket?: boolean;
  hint: string;
  explain: string; // 正解後に示す理由
}

const PLACE_NAMES = ['百の位', '十の位', '一の位'];

/** 商が立ちはじめる位（3桁筆算基準: 0=百,1=十,2=一） */
function firstQuotientPlace(dividend: number, divisor: number): number {
  const s = dividend.toString();
  let cur = 0;
  for (let i = 0; i < s.length; i++) {
    cur = cur * 10 + Number(s[i]);
    if (cur >= divisor) return 3 - s.length + i;
  }
  return 2;
}

export function generateEstimate(level: EstimateLevel): EstimateProblem {
  switch (level) {
    case 'est-place': {
      const variant = pick(['2-2', '3-2', '3-2', '3-1', '3-3'] as const);
      let dividend = 0, divisor = 0;
      if (variant === '2-2') { divisor = rnd(12, 89); dividend = rnd(divisor + 1, 99); }
      else if (variant === '3-1') { divisor = rnd(2, 9); dividend = rnd(102, 999); }
      else if (variant === '3-3') { divisor = rnd(110, 320); dividend = rnd(divisor + 1, 999); }
      else { divisor = rnd(12, 89); dividend = rnd(120, 999); }
      const place = firstQuotientPlace(dividend, divisor);
      const choices = dividend >= 100 && divisor < 10 ? PLACE_NAMES : PLACE_NAMES.slice(1);
      const answerIndex = dividend >= 100 && divisor < 10 ? place : place - 1;
      const head = dividend.toString().slice(0, place - (3 - dividend.toString().length) + 1);
      return {
        kind: 'choice', dividend, divisor, bracket: true,
        text: `このわり算の商は、何の位から たちますか？`,
        choices, answerIndex,
        hint: `いちばん大きい位から じゅんに「${divisor} が入るかな？」と くらべてみよう。`,
        explain: `${head} の中に ${divisor} が入るから、${choices[answerIndex]}から 商が たつよ。`,
      };
    }
    case 'est-digits': {
      const variant = pick(['3-1', '3-1', '2-1', '3-2'] as const);
      let dividend = 0, divisor = 0;
      if (variant === '2-1') { divisor = rnd(2, 9); dividend = rnd(12, 99); }
      else if (variant === '3-1') { divisor = rnd(2, 9); dividend = rnd(102, 999); }
      else { divisor = rnd(12, 89); dividend = rnd(120, 999); }
      const q = Math.floor(dividend / divisor);
      const digits = q.toString().length;
      const choices = ['1けた', '2けた', '3けた'];
      return {
        kind: 'choice', dividend, divisor,
        text: `${dividend} ÷ ${divisor} の商は、何けたに なりますか？`,
        choices, answerIndex: digits - 1,
        hint: `商が たちはじめる 位が わかれば、けた数も わかるよ。`,
        explain: `商は ${q}（${digits}けた）。たちはじめる位から 一の位まで 商が ならぶよ。`,
      };
    }
    case 'est-round': {
      // 商が1けたになる ÷2けた。四捨五入して「何十」とみて見当をつける
      const divisor = rnd(12, 89);
      const rounded = Math.max(10, Math.round(divisor / 10) * 10);
      const q = rnd(2, 9);
      const r = rnd(0, divisor - 1);
      const dividend = divisor * q + r;
      if (dividend > 999) return generateEstimate(level);
      const est = Math.floor(Math.floor(dividend / 10) / (rounded / 10));
      if (est < 1 || est > 9) return generateEstimate(level);
      return {
        kind: 'value', dividend, divisor,
        text: `「${dividend} ÷ ${divisor}」${divisor} を ${rounded} とみると、商の見当は いくつですか？`,
        answerValue: est,
        hint: `${rounded} は 10が ${rounded / 10}こ。${dividend} は 10が だいたい ${Math.floor(dividend / 10)}こ。${Math.floor(dividend / 10)} ÷ ${rounded / 10} で 考えよう。`,
        explain: `${Math.floor(dividend / 10)} ÷ ${rounded / 10} で 見当は ${est}。見当が ずれていたら「大きすぎ→1へらす」「あまりが大きい→1ふやす」で直せば OK！`,
      };
    }
    case 'est-cond': {
      // 62)6□9 で「商が10より小さくなる □ ぜんぶ」（大問9型）
      const t = rnd(1, 9);       // わる数の十の位 ＝ わられる数の百の位
      const o = rnd(1, 4);       // わる数の一の位（答えの個数 = o 個になる）
      const u = rnd(0, 9);       // わられる数の一の位
      const divisor = t * 10 + o;
      const template = `${t}□${u}`;
      // 商が10より小さい ⇔ わられる数 < わる数×10 ⇔ t□u < t{o}0 ⇔ □ ≦ o-1
      const answerDigits = Array.from({ length: o }, (_, i) => i);
      return {
        kind: 'multi-digit', dividend: t * 100 + u, divisor, bracket: true,
        dividendTemplate: template,
        text: `このわり算で、商が 10より小さくなるのは、□が どんな数字の ときですか？あてはまる数字を ぜんぶ えらびましょう。`,
        answerDigits,
        hint: `商が 10より小さい ⇔ わられる数が「わる数 × 10 ＝ ${divisor * 10}」より 小さい ということ。${template} が ${divisor * 10} より小さくなる □ を さがそう。`,
        explain: `${divisor} × 10 ＝ ${divisor * 10}。${template} ＜ ${divisor * 10} になるのは □ が ${answerDigits.join('・')} のとき。このとき 商は 十の位に たたないよ。`,
      };
    }
  }
}

/* =====================================================================
 * たしかめ算（検算）
 * =================================================================== */

export type CheckLevel = 'check-nodiv' | 'check-rem' | 'check-big' | 'check-shiki' | 'check-findnum';

export const CHECK_LEVELS: { id: CheckLevel; label: string; desc: string }[] = [
  { id: 'check-nodiv', label: 'わりきれる とき', desc: 'わる数 × 商 ＝ わられる数' },
  { id: 'check-rem', label: 'あまりの ある とき', desc: 'わる数 × 商 ＋ あまり ＝ わられる数' },
  { id: 'check-big', label: '大きな数で ちょうせん', desc: '3けたの わり算を たしかめよう' },
  { id: 'check-shiki', label: 'けん算の式を 書く', desc: '997÷49＝20あまり17 → □×20＋□＝□' },
  { id: 'check-findnum', label: 'ある数を もとめる', desc: 'けん算の式で「ある数」を さがせ！' },
];

export interface CheckProblem {
  kind: 'fill' | 'findnum';
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  /** fill: 空らんにする場所。'qr'=商とあまり / 'shiki'=わる数・あまり・わられる数（商は見えている） */
  variant?: 'qr' | 'shiki';
  /** 順番にうめる空らんの正解 */
  blanks: number[];
  blankLabels: string[];
  /** findnum: ある数（dividend）を べつの数でわる 2段階問題 */
  secondDivisor?: number;
  secondQuotient?: number;
  secondRemainder?: number;
  hint: string;
}

export function generateCheck(level: CheckLevel): CheckProblem {
  if (level === 'check-findnum') {
    // ある数を a でわったら 商 q あまり r。この数を b でわった答えは？（大問13型）
    for (let i = 0; i < 500; i++) {
      const a = rnd(21, 45);
      const q = rnd(12, 29);
      const r = rnd(1, a - 1);
      const n = a * q + r;
      if (n > 999) continue;
      let b = rnd(21, 45);
      if (b === a) b = b === 45 ? 44 : b + 1;
      return {
        kind: 'findnum',
        dividend: n, divisor: a, quotient: q, remainder: r,
        variant: 'qr',
        blanks: [n],
        blankLabels: ['ある数'],
        secondDivisor: b,
        secondQuotient: Math.floor(n / b),
        secondRemainder: n % b,
        hint: `けん算の式「わる数 × 商 ＋ あまり ＝ わられる数」を使うと、ある数 ＝ ${a} × ${q} ＋ ${r} で もとめられるよ。`,
      };
    }
  }
  if (level === 'check-shiki') {
    // けん算の式を書く: わる数・あまり・わられる数をうめる（商は見えている。大問5型）
    const divisor = rnd(21, 49);
    const quotient = rnd(12, 29);
    const remainder = rnd(1, divisor - 1);
    const dividend = divisor * quotient + remainder;
    if (dividend > 999) return generateCheck(level);
    return {
      kind: 'fill', variant: 'shiki',
      dividend, divisor, quotient, remainder,
      blanks: [divisor, remainder, dividend],
      blankLabels: ['わる数', 'あまり', 'わられる数'],
      hint: `けん算の式は「わる数 × 商 ＋ あまり ＝ わられる数」。もとの式 ${dividend} ÷ ${divisor} ＝ ${quotient} あまり ${remainder} から、どの数が どこに入るか 考えよう。`,
    };
  }
  let divisor = 0, quotient = 0, remainder = 0;
  if (level === 'check-nodiv') {
    divisor = rnd(2, 9);
    quotient = rnd(12, 24);
    remainder = 0;
  } else if (level === 'check-rem') {
    divisor = rnd(3, 9);
    quotient = rnd(12, 24);
    remainder = rnd(1, divisor - 1);
  } else {
    if (Math.random() < 0.5) {
      divisor = rnd(3, 9);
      quotient = rnd(102, 320);
    } else {
      divisor = rnd(12, 39);
      quotient = rnd(12, 40);
    }
    remainder = rnd(1, divisor - 1);
  }
  const dividend = divisor * quotient + remainder;
  const blanks = remainder > 0 ? [quotient, remainder, dividend] : [quotient, dividend];
  const blankLabels = remainder > 0 ? ['商', 'あまり', 'わられる数'] : ['商', 'わられる数'];
  return {
    kind: 'fill', variant: 'qr',
    dividend, divisor, quotient, remainder, blanks, blankLabels,
    hint: remainder > 0
      ? `たしかめ算は「わる数 × 商 ＋ あまり ＝ わられる数」。${divisor} × ${quotient} を 計算してから ${remainder} を たそう。`
      : `たしかめ算は「わる数 × 商 ＝ わられる数」。${divisor} × ${quotient} を 計算しよう。`,
  };
}

/* =====================================================================
 * 文章題
 * =================================================================== */

export type WordLevel = 'wp-share' | 'wp-group' | 'wp-rem' | 'wp-up' | 'wp-down' | 'wp-times' | 'wp-big';

export const WORD_LEVELS: { id: WordLevel; label: string; desc: string }[] = [
  { id: 'wp-share', label: '同じ数ずつ 分ける', desc: '1人分は 何こ？（等分除）' },
  { id: 'wp-group', label: 'いくつ分 とれる？', desc: '何ふくろ できる？（包含除）' },
  { id: 'wp-rem', label: 'あまりの ある もんだい', desc: '商と あまりを 答えよう' },
  { id: 'wp-up', label: 'あまりを 切り上げる', desc: 'ぜんいん のれるには あと1つ！' },
  { id: 'wp-down', label: 'あまりを 切り捨てる', desc: 'あまりでは 1つ 作れない…' },
  { id: 'wp-times', label: '何倍かを もとめる', desc: '320kgは 64kgの 何倍？' },
  { id: 'wp-big', label: '大きな数の もんだい', desc: '2けたで わる 文章題' },
];

export interface DivWordProblem {
  text: string;
  emoji: string;
  dividend: number;
  divisor: number;
  choices: string[];
  correctIndex: number;
  quotient: number;
  remainder: number;
  /** 商・あまりを出したあとの最終回答の種類 */
  finalKind: 'quotient' | 'quot-rem' | 'up' | 'down';
  finalAnswer: number;
  finalUnit: string;
  finalPrompt: string;
  why: string;
  finalWhy: string;
}

function buildDivChoices(a: number, b: number): { choices: string[]; correctIndex: number } {
  const options = [`${a} ÷ ${b}`, `${b} ÷ ${a}`, `${a} × ${b}`].sort(() => Math.random() - 0.5);
  return { choices: options, correctIndex: options.indexOf(`${a} ÷ ${b}`) };
}

export function generateWord(level: WordLevel): DivWordProblem {
  switch (level) {
    case 'wp-share': {
      const per = rnd(12, 25);
      const people = rnd(3, 6);
      const total = per * people;
      const item = pick([
        { name: '色紙', unit: 'まい', emoji: '🎨' },
        { name: 'あめ', unit: 'こ', emoji: '🍬' },
        { name: 'カード', unit: 'まい', emoji: '🃏' },
        { name: 'ビー玉', unit: 'こ', emoji: '🔮' },
      ]);
      const c = buildDivChoices(total, people);
      return {
        text: `${item.name}が ${total}${item.unit} あります。${people}人で 同じ数ずつ 分けると、1人分は 何${item.unit}に なりますか？`,
        emoji: item.emoji, dividend: total, divisor: people, ...c,
        quotient: per, remainder: 0, finalKind: 'quotient', finalAnswer: per, finalUnit: item.unit,
        finalPrompt: `1人分は 何${item.unit}？`,
        why: `「同じ数ずつ 分ける・1人分」は わり算（等分除）だよ。ぜんぶの数 ÷ 人数 だね。`,
        finalWhy: `${total} ÷ ${people} = ${per}。1人分は ${per}${item.unit} だね。`,
      };
    }
    case 'wp-group': {
      const size = rnd(3, 9);
      const count = rnd(12, 25);
      const total = size * count;
      const item = pick([
        { name: 'クッキー', pack: 'ふくろ', unit: 'こ', emoji: '🍪' },
        { name: 'たまご', pack: 'パック', unit: 'こ', emoji: '🥚' },
        { name: '花', pack: 'たば', unit: '本', emoji: '💐' },
      ]);
      const c = buildDivChoices(total, size);
      return {
        text: `${item.name}が ${total}${item.unit} あります。1${item.pack}に ${size}${item.unit}ずつ 入れると、何${item.pack} できますか？`,
        emoji: item.emoji, dividend: total, divisor: size, ...c,
        quotient: count, remainder: 0, finalKind: 'quotient', finalAnswer: count, finalUnit: item.pack,
        finalPrompt: `何${item.pack} できる？`,
        why: `「${size}${item.unit}ずつ とっていくと いくつ分？」も わり算（包含除）だよ。`,
        finalWhy: `${total} ÷ ${size} = ${count}。${count}${item.pack} できるね。`,
      };
    }
    case 'wp-rem': {
      const people = rnd(4, 8);
      const per = rnd(8, 24);
      const r = rnd(1, people - 1);
      const total = people * per + r;
      const item = pick([
        { name: 'いちご', unit: 'こ', emoji: '🍓' },
        { name: 'おり紙', unit: 'まい', emoji: '📄' },
        { name: 'クリップ', unit: 'こ', emoji: '📎' },
      ]);
      const c = buildDivChoices(total, people);
      return {
        text: `${item.name}が ${total}${item.unit} あります。${people}人で 同じ数ずつ 分けると、1人分は 何${item.unit}で、何${item.unit} あまりますか？`,
        emoji: item.emoji, dividend: total, divisor: people, ...c,
        quotient: per, remainder: r, finalKind: 'quot-rem', finalAnswer: per, finalUnit: item.unit,
        finalPrompt: `1人分と あまりは？`,
        why: `「同じ数ずつ 分ける」は わり算。わりきれない分が「あまり」に なるよ。`,
        finalWhy: `${total} ÷ ${people} = ${per} あまり ${r}。1人分は ${per}${item.unit}で、${r}${item.unit} あまるね。たしかめ算：${people} × ${per} ＋ ${r} ＝ ${total}。`,
      };
    }
    case 'wp-up': {
      const cap = rnd(3, 6);
      const q = rnd(6, 12);
      const r = rnd(1, cap - 1);
      const total = cap * q + r;
      const scene = pick([
        { text: (t: number, c2: number) => `${t}人の 子どもが、${c2}人ずつ 長いすに すわります。ぜんいんが すわるには、長いすは 何きゃく いりますか？`, unit: 'きゃく', emoji: '🪑', prompt: '長いすは 何きゃく いる？', why2: 'あまりの 人も すわれるように、長いすを もう1きゃく ふやそう。' },
        { text: (t: number, c2: number) => `${t}人が ${c2}人乗りの ボートに 乗ります。ぜんいんが 乗るには、ボートは 何そう いりますか？`, unit: 'そう', emoji: '🚣', prompt: 'ボートは 何そう いる？', why2: 'あまりの 人も 乗れるように、ボートを もう1そう ふやそう。' },
        { text: (t: number, c2: number) => `ケーキが ${t}こ あります。1つの 箱に ${c2}こずつ 入れます。ぜんぶの ケーキを 入れるには、箱は 何箱 いりますか？`, unit: '箱', emoji: '🎂', prompt: '箱は 何箱 いる？', why2: 'あまりの ケーキも 入れるために、箱を もう1箱 ふやそう。' },
      ]);
      const c = buildDivChoices(total, cap);
      return {
        text: scene.text(total, cap),
        emoji: scene.emoji, dividend: total, divisor: cap, ...c,
        quotient: q, remainder: r, finalKind: 'up', finalAnswer: q + 1, finalUnit: scene.unit,
        finalPrompt: scene.prompt,
        why: `「${cap}ずつに 分けると いくつ分？」だから わり算だよ。`,
        finalWhy: `${total} ÷ ${cap} = ${q} あまり ${r}。${scene.why2} だから 答えは ${q + 1}${scene.unit}！`,
      };
    }
    case 'wp-down': {
      const size = rnd(3, 8);
      const q = rnd(6, 12);
      const r = rnd(1, size - 1);
      const total = size * q + r;
      const scene = pick([
        { text: (t: number, s: number) => `${t}cmの リボンから、${s}cmの リボンを 何本 切り取れますか？`, unit: '本', emoji: '🎀', prompt: '何本 切り取れる？', why2: `あまりの ${r}cmでは ${size}cmの リボンは 作れないね。` },
        { text: (t: number, s: number) => `${t}この おかしを、1ふくろに ${s}こずつ 入れて 売ります。売れる ふくろは 何ふくろ できますか？`, unit: 'ふくろ', emoji: '🍭', prompt: '何ふくろ できる？', why2: `あまりの ${r}こでは 1ふくろに ならないね。` },
        { text: (t: number, s: number) => `${t}ページの 本を、1日 ${s}ページずつ 読みます。${s}ページ きっちり 読める日は 何日 ありますか？`, unit: '日', emoji: '📖', prompt: '何日 ある？', why2: `あまりの ${r}ページの 日は ${size}ページに たりないね。` },
      ]);
      const c = buildDivChoices(total, size);
      return {
        text: scene.text(total, size),
        emoji: scene.emoji, dividend: total, divisor: size, ...c,
        quotient: q, remainder: r, finalKind: 'down', finalAnswer: q, finalUnit: scene.unit,
        finalPrompt: scene.prompt,
        why: `「${size}ずつに 分けると いくつ分？」だから わり算だよ。`,
        finalWhy: `${total} ÷ ${size} = ${q} あまり ${r}。${scene.why2} だから 答えは ${q}${scene.unit}（あまりは 切り捨て）！`,
      };
    }
    case 'wp-times': {
      // 何倍かを もとめる（大問12型）: くらべられる量 ÷ もとにする量
      const base = rnd(14, 96);
      const k = rnd(3, 9);
      const big = base * k;
      const scene = pick([
        { text: `生まれたときの 馬の体重は ${base}kgでしたが、1年後には ${big}kgに なりました。1年後の体重は、生まれたときの体重の 何倍ですか？`, emoji: '🐴' },
        { text: `芽が出たときの ヒマワリの高さは ${base}cmでしたが、夏には ${big}cmに なりました。夏の高さは、芽が出たときの 何倍ですか？`, emoji: '🌻' },
        { text: `先月の 図書室の かし出しは ${base}さつでしたが、今月は ${big}さつでした。今月の かし出しは、先月の 何倍ですか？`, emoji: '📚' },
      ]);
      const options = [`${big} ÷ ${base}`, `${base} ÷ ${big}`, `${big} − ${base}`].sort(() => Math.random() - 0.5);
      return {
        text: scene.text,
        emoji: scene.emoji, dividend: big, divisor: base,
        choices: options, correctIndex: options.indexOf(`${big} ÷ ${base}`),
        quotient: k, remainder: 0, finalKind: 'quotient', finalAnswer: k, finalUnit: '倍',
        finalPrompt: '何倍？',
        why: `「何倍か」を もとめるときは、くらべられる量 ÷ もとにする量 の わり算だよ。`,
        finalWhy: `${big} ÷ ${base} ＝ ${k}。${k}倍だね。もとにする量（${base}）で わるのが ポイント！`,
      };
    }
    case 'wp-big': {
      const divisor = rnd(12, 45);
      const q = rnd(4, 9);
      const r = rnd(0, divisor - 1);
      const total = divisor * q + r;
      const item = pick([
        { name: '色紙', unit: 'まい', who: '人', emoji: '🎨' },
        { name: 'えんぴつ', unit: '本', who: '人', emoji: '✏️' },
        { name: 'シール', unit: 'まい', who: '人', emoji: '⭐' },
      ]);
      const c = buildDivChoices(total, divisor);
      const hasRem = r > 0;
      return {
        text: `${item.name}が ${total}${item.unit} あります。${divisor}${item.who}で 同じ数ずつ 分けると、1人分は 何${item.unit}に なりますか？${hasRem ? 'あまりも 答えましょう。' : ''}`,
        emoji: item.emoji, dividend: total, divisor, ...c,
        quotient: q, remainder: r, finalKind: hasRem ? 'quot-rem' : 'quotient', finalAnswer: q, finalUnit: item.unit,
        finalPrompt: hasRem ? '1人分と あまりは？' : `1人分は 何${item.unit}？`,
        why: `大きな数でも 考え方は 同じ。ぜんぶの数 ÷ 人数 の わり算だよ。`,
        finalWhy: `${total} ÷ ${divisor} = ${q}${hasRem ? ` あまり ${r}` : ''}。たしかめ算：${divisor} × ${q}${hasRem ? ` ＋ ${r}` : ''} ＝ ${total}。`,
      };
    }
  }
}

/* =====================================================================
 * エラーハンター（誤り例）
 * =================================================================== */

export const EH_REASONS = {
  ZERO: '商に 0 を 書くのを わすれた',
  REMBIG: 'あまりが わる数より 大きいのに 気づかなかった',
  SUB: 'ひき算を まちがえた',
  RULE10: '10のまとまりで 計算したのに、あまりを 10倍に もどさなかった',
  PLACE: '商を 立てる 位を まちがえた',
};

export type EhPreset = 'eh-zero' | 'eh-zerotail' | 'eh-rembig' | 'eh-sub' | 'eh-rule10' | 'eh-place';

export interface DivErrorExample {
  character: string;
  expr: string; // 「618 ÷ 6 = 13」のような誤りを含む式
  isCorrect: boolean;
  /** 筆算のわく表示用（誤った商の位置も再現できる） */
  dividendN: number;
  divisorN: number;
  wrongQ: number;
  wrongR: number;
  /** 誤った商を書きはじめる列（省略時は右づめ） */
  wrongOffset?: number;
  correctQ: number;
  correctR: number;
  hasRem: boolean;
  reasonOptions: string[];
  correctReasonIndex: number;
  fixHint: string;
  explain: string;
}

const EH_CHARS = ['りく', 'はな', 'そら', 'みお', 'けん', 'あい'];

function buildEhReasons(correct: string): { options: string[]; index: number } {
  const all = Object.values(EH_REASONS);
  const distractors = all.filter((r) => r !== correct).sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { options, index: options.indexOf(correct) };
}

const fmtDiv = (dd: number, dv: number, q: number, r: number) =>
  `${dd} ÷ ${dv} = ${q}${r > 0 ? ` あまり ${r}` : ''}`;

type EhBuilder = () => DivErrorExample;

// 商の0の書きわすれ（618÷6=13 → 正 103）: 長除法で最頻出の系統的バグ
const ehZero: EhBuilder = () => {
  const divisor = rnd(2, 9);
  const candidates = [102, 103, 104, 105, 106, 107, 108, 109, 120, 130, 140, 150, 160, 201, 203, 205, 210, 230, 302, 305, 310, 320, 405, 410]
    .filter((x) => x * divisor <= 999);
  if (candidates.length === 0) return ehZero();
  const q = pick(candidates);
  const dividend = divisor * q;
  const wrongQ = Number(q.toString().replace('0', '')); // 0を1つ落とす
  const r = buildEhReasons(EH_REASONS.ZERO);
  return {
    character: pick(EH_CHARS),
    expr: fmtDiv(dividend, divisor, wrongQ, 0),
    isCorrect: false,
    dividendN: dividend, divisorN: divisor, wrongQ, wrongR: 0,
    correctQ: q, correctR: 0, hasRem: false,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `たしかめ算を してみよう。${divisor} × ${wrongQ} は ${dividend} に なるかな？ わられる数が ${dividend.toString().length}けた なら、商の けた数も よく たしかめて。`,
    explain: `わけられない 位には 商に「0」を 立てるよ。正しくは ${fmtDiv(dividend, divisor, q, 0)}。`,
  };
};

// あまり ≧ わる数（74÷9=7あまり11 → 正 8あまり2）。ときどき2けたの わる数でも出す
const ehRemBig: EhBuilder = () => {
  const divisor = Math.random() < 0.5 ? rnd(4, 9) : rnd(12, 28);
  const q = divisor >= 10 ? rnd(12, 33) : rnd(3, 9);
  const rTrue = rnd(0, divisor - 2);
  const dividend = divisor * q + rTrue;
  const wrongQ = q - 1;
  const wrongR = rTrue + divisor;
  const r = buildEhReasons(EH_REASONS.REMBIG);
  return {
    character: pick(EH_CHARS),
    expr: fmtDiv(dividend, divisor, wrongQ, wrongR),
    isCorrect: false,
    dividendN: dividend, divisorN: divisor, wrongQ, wrongR,
    correctQ: q, correctR: rTrue, hasRem: rTrue > 0,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `あまりの ${wrongR} と わる数の ${divisor} を くらべてみよう。まだ ${divisor} を ひけるよね。商を 1 ふやして みよう。`,
    explain: `あまりは いつも わる数より 小さくなるよ。正しくは ${fmtDiv(dividend, divisor, q, rTrue)}。`,
  };
};

// ひき算ミス（あまりが±1ずれる）
const ehSub: EhBuilder = () => {
  const divisor = rnd(4, 9);
  const q = rnd(12, 24);
  const rTrue = rnd(1, divisor - 2);
  const dividend = divisor * q + rTrue;
  const wrongR = rTrue + pick([1, -1].filter((d) => rTrue + d >= 0 && rTrue + d < divisor)) ;
  const r = buildEhReasons(EH_REASONS.SUB);
  return {
    character: pick(EH_CHARS),
    expr: fmtDiv(dividend, divisor, q, wrongR),
    isCorrect: false,
    dividendN: dividend, divisorN: divisor, wrongQ: q, wrongR,
    correctQ: q, correctR: rTrue, hasRem: rTrue > 0,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `たしかめ算を してみよう。${divisor} × ${q} ＋ ${wrongR} は ${dividend} に なるかな？`,
    explain: `たしかめ算で ${divisor} × ${q} ＋ あまり ＝ ${dividend} に なるように、ひき算を 見直そう。正しくは ${fmtDiv(dividend, divisor, q, rTrue)}。`,
  };
};

// わり算のきまりの あまり（140÷30=4あまり2 → 正 4あまり20）
const ehRule10: EhBuilder = () => {
  const d0 = rnd(3, 9);
  const q = rnd(2, 9);
  const r0 = rnd(1, d0 - 1);
  const divisor = d0 * 10;
  const dividend = divisor * q + r0 * 10;
  const r = buildEhReasons(EH_REASONS.RULE10);
  return {
    character: pick(EH_CHARS),
    expr: fmtDiv(dividend, divisor, q, r0),
    isCorrect: false,
    dividendN: dividend, divisorN: divisor, wrongQ: q, wrongR: r0,
    correctQ: q, correctR: r0 * 10, hasRem: true,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `たしかめ算を してみよう。${divisor} × ${q} ＋ ${r0} は ${dividend} に なるかな？ あまりは「10のまとまり ${r0}こ分」だよ。`,
    explain: `${dividend / 10} ÷ ${d0} で 計算したときの あまり ${r0} は 10が ${r0}こ という意味。正しくは ${fmtDiv(dividend, divisor, q, r0 * 10)}。`,
  };
};

// 正しい例（まぜる）
const ehCorrect: EhBuilder = () => {
  const divisor = rnd(3, 9);
  const q = rnd(8, 30);
  const rTrue = rnd(0, divisor - 1);
  const dividend = divisor * q + rTrue;
  return {
    character: pick(EH_CHARS),
    expr: fmtDiv(dividend, divisor, q, rTrue),
    isCorrect: true,
    dividendN: dividend, divisorN: divisor, wrongQ: q, wrongR: rTrue,
    correctQ: q, correctR: rTrue, hasRem: rTrue > 0,
    reasonOptions: [], correctReasonIndex: -1,
    fixHint: '',
    explain: `たしかめ算：${divisor} × ${q}${rTrue > 0 ? ` ＋ ${rTrue}` : ''} ＝ ${dividend}。この計算は 正しかったね！`,
  };
};

// 商の末尾の0の書きわすれ（652÷16=4あまり12 → 正 40あまり12）: テスト大問6の頻出型
const ehZeroTail: EhBuilder = () => {
  for (let i = 0; i < 300; i++) {
    const divisor = rnd(12, 24);
    const k = rnd(2, 9);
    const r = rnd(1, divisor - 1);
    const dividend = divisor * k * 10 + r;
    if (dividend > 999) continue;
    const rs = buildEhReasons(EH_REASONS.ZERO);
    return {
      character: pick(EH_CHARS),
      expr: fmtDiv(dividend, divisor, k, r),
      isCorrect: false,
      dividendN: dividend, divisorN: divisor, wrongQ: k, wrongR: r,
      correctQ: k * 10, correctR: r, hasRem: true,
      reasonOptions: rs.options, correctReasonIndex: rs.index,
      fixHint: `たしかめ算を してみよう。${divisor} × ${k} ＋ ${r} は ${dividend} に なるかな？ 一の位にも 商（0）を 立てるのを わすれていないかな。`,
      explain: `一の位は ${r} ＜ ${divisor} で わけられないから、商に「0」を 立てるよ。正しくは ${fmtDiv(dividend, divisor, k * 10, r)}。`,
    };
  }
  return ehZero();
};

// 商を立てる位置のまちがい（758÷21 の商36を 百の位から 書いてしまう）: いかそう算数型
const ehPlace: EhBuilder = () => {
  for (let i = 0; i < 300; i++) {
    const divisor = rnd(21, 45);
    const q = rnd(12, 39);
    const r = rnd(0, divisor - 1);
    const dividend = divisor * q + r;
    if (dividend > 999 || dividend < 100) continue;
    // 頭の1けたが わる数より小さい（＝百の位に商はたたない）形にする
    if (Math.floor(dividend / 100) >= divisor) continue;
    const rs = buildEhReasons(EH_REASONS.PLACE);
    return {
      character: pick(EH_CHARS),
      expr: `${dividend} ÷ ${divisor} の商 ${q} を 百の位から 書いた`,
      isCorrect: false,
      dividendN: dividend, divisorN: divisor, wrongQ: q, wrongR: r,
      wrongOffset: 0, // 百の位から書いてしまっている
      correctQ: q, correctR: r, hasRem: r > 0,
      reasonOptions: rs.options, correctReasonIndex: rs.index,
      fixHint: `${dividend} の 百の位「${Math.floor(dividend / 100)}」の中に ${divisor} は 入るかな？ 入らないときは、商は 十の位から たつよ。`,
      explain: `${Math.floor(dividend / 100)} ＜ ${divisor} だから 商は 百の位には たたないよ。十の位から ${fmtDiv(dividend, divisor, q, r).split('= ')[1]} と 書くのが 正しいね。`,
    };
  }
  return ehRemBig();
};

const EH_BUILDERS: EhBuilder[] = [ehZero, ehZeroTail, ehRemBig, ehSub, ehRule10, ehPlace];
const EH_PRESETS: Record<EhPreset, EhBuilder> = {
  'eh-zero': ehZero,
  'eh-zerotail': ehZeroTail,
  'eh-rembig': ehRemBig,
  'eh-sub': ehSub,
  'eh-rule10': ehRule10,
  'eh-place': ehPlace,
};

/** ランダムに誤り例（ときどき正しい例）を生成。 */
export function generateDivError(): DivErrorExample {
  if (Math.random() < 0.25) return ehCorrect();
  return pick(EH_BUILDERS)();
}

/** 本番テスト用：誤りの種類を指定して生成。 */
export function makeDivError(preset: EhPreset): DivErrorExample {
  return EH_PRESETS[preset]();
}
