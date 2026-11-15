// このファイルは単元アプリ wari-hissann3 の src/types.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。

export type Difficulty = '2-1' | '3-1' | '2-2' | '3-2' | '3-3';

export interface Problem {
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
}

export type StepType = 'PLACE' | 'DIVIDE' | 'MULTIPLY' | 'SUBTRACT' | 'BRING_DOWN' | 'COMPLETE';

export interface StartOptions {
  allowRemainder: boolean;
  masterMode: boolean;
  /** 商の途中・末尾に0が立つ問題を優先的に出題する */
  zeroFocus: boolean;
  /** 商に0が立つとき、かけ算・ひき算の行を省略する書き方（省略形）を使う */
  zeroShortcut: boolean;
  /** 3けた÷2けたのとき、商が1けたになる問題だけに絞る（3-2でのみ意味を持つ） */
  singleDigitQuotient: boolean;
}

export interface CalculationState {
  currentStep: StepType;
  focusIndex: number; // For quotient or subtraction index
  userQuotient: (number | null)[];
  userSteps: {
    multiplyResult: (number | null)[][];
    subtractResult: (number | null)[][];
  };
}
