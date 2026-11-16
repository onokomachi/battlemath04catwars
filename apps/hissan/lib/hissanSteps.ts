// このファイルは単元アプリ wari-hissann3 の src/lib/hissanSteps.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * わり算の筆算の手順を機械的に分析する純粋関数群。
 * DivisionSimulator（通常モード）と MasterDivisionBoard（マスターモード）の
 * 両方から使う「正解データ」を1か所にまとめ、二重実装を避ける。
 */

export interface HissanStep {
  type: 'CALC' | 'ZERO';
  index: number; // 商のこの桁が入る列（dividendStr のインデックス）
  digitIndex: number; // index と同じ（わかりやすさのため別名で保持）
  quotient: number;
  multiply: number;
  remainder: number;
  dividendPart: number;
}

/** わり算の筆算を先頭の位から順に機械的にたどり、各サイクルの正解値を求める。 */
export function computeRealSteps(dividend: number, divisor: number): HissanStep[] {
  const dividendStr = dividend.toString();
  const steps: HissanStep[] = [];
  let currentValStr = '';

  for (let i = 0; i < dividendStr.length; i++) {
    currentValStr += dividendStr[i];
    const currentVal = parseInt(currentValStr, 10);

    if (currentVal >= divisor || (i === dividendStr.length - 1 && steps.length === 0)) {
      const q = Math.floor(currentVal / divisor);
      const m = q * divisor;
      const r = currentVal - divisor * q;
      steps.push({ type: 'CALC', index: i, digitIndex: i, quotient: q, multiply: m, remainder: r, dividendPart: currentVal });
      currentValStr = r.toString();
    } else if (steps.length > 0) {
      steps.push({ type: 'ZERO', index: i, digitIndex: i, quotient: 0, multiply: 0, remainder: currentVal, dividendPart: currentVal });
      currentValStr = currentVal.toString();
    }
  }
  return steps;
}

export interface HissanRow {
  type: 'multiply' | 'remainder';
  value: string;
  /** この行の一番右の列（dividendStr のインデックス）。行の幅は value.length で決まる。 */
  offset: number;
}

/**
 * 完成形の筆算の行（かける・ひく の各段）を、最初から全部まとめて計算する。
 * 通常モードは1ステップずつ画面に積み上げるが、マスターモードの自由入力では
 * 最初から正解の行の「形（幅・位置）」が分かっている必要があるため、こちらを使う。
 */
export function computeExpectedRows(realSteps: HissanStep[], dividendStr: string, zeroShortcut: boolean): HissanRow[] {
  const rows: HissanRow[] = [];
  for (let s = 0; s < realSteps.length; s++) {
    const step = realSteps[s];
    if (zeroShortcut && step.type === 'ZERO') continue;

    rows.push({ type: 'multiply', value: step.multiply.toString(), offset: step.index });

    let display = step.remainder === 0 ? '' : step.remainder.toString();
    let offset = step.index;
    let t = s + 1;
    while (t < realSteps.length) {
      display = (display === '0' ? '' : display) + dividendStr[realSteps[t].digitIndex];
      offset = realSteps[t].digitIndex;
      if (!(zeroShortcut && realSteps[t].type === 'ZERO')) break;
      t++;
    }
    rows.push({ type: 'remainder', value: display === '' ? '0' : display, offset });
  }
  return rows;
}
