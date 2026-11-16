// このファイルは単元アプリ wari-hissann3 の src/components/ProblemGenerator.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
import { Difficulty, Problem } from '../types';

function generateOnce(difficulty: Difficulty, allowRemainder: boolean): Problem {
  let dividend = 0;
  let divisor = 1;

  switch (difficulty) {
    case '2-1':
      divisor = Math.floor(Math.random() * 8) + 2; // 2-9
      dividend = Math.floor(Math.random() * 90) + 10; // 10-99
      break;
    case '3-1':
      divisor = Math.floor(Math.random() * 8) + 2; // 2-9
      dividend = Math.floor(Math.random() * 900) + 100; // 100-999
      break;
    case '2-2':
      divisor = Math.floor(Math.random() * 80) + 11; // 11-90
      dividend = Math.floor(Math.random() * 80) + 11; // 11-90
      if (dividend < divisor) [dividend, divisor] = [divisor, dividend];
      break;
    case '3-2':
      divisor = Math.floor(Math.random() * 80) + 11; // 11-90
      dividend = Math.floor(Math.random() * 800) + 101; // 101-900
      break;
    case '3-3':
      // 3けた÷3けた（商は必ず1けた）
      divisor = Math.floor(Math.random() * 220) + 110; // 110-329
      dividend = Math.floor(Math.random() * (999 - divisor - 1)) + divisor + 1; // divisor+1〜999
      break;
  }

  if (!allowRemainder) {
    dividend = dividend - (dividend % divisor);
    // Ensure dividend is still in range if it became too small
    if (dividend < divisor) {
       dividend = divisor * (Math.floor(Math.random() * 5) + 2);
    }
  }

  return {
    dividend,
    divisor,
    quotient: Math.floor(dividend / divisor),
    remainder: dividend % divisor
  };
}

/** 商の2桁目以降（途中または末尾）に0を含むか */
function hasZeroInQuotient(p: Problem): boolean {
  const q = p.quotient.toString();
  return q.length >= 2 && q.slice(1).includes('0');
}

export function generateProblem(
  difficulty: Difficulty,
  allowRemainder: boolean,
  zeroFocus: boolean = true,
  singleDigitQuotient: boolean = false
): Problem {
  // 3けた÷2けたで「商が1けた」が指定されたときだけ、商1桁の問題に絞る
  const needsSingleDigit = singleDigitQuotient && difficulty === '3-2';
  if (zeroFocus && !needsSingleDigit) return generateOnce(difficulty, allowRemainder);

  // zeroFocus=false（0がたつ問題を除外）や needsSingleDigit（商1けたのみ）のときは、
  // 条件に合う問題が出るまでリトライして生成する（上限つき）。
  for (let attempt = 0; attempt < 300; attempt++) {
    const p = generateOnce(difficulty, allowRemainder);
    if (needsSingleDigit && p.quotient >= 10) continue;
    if (!zeroFocus && hasZeroInQuotient(p)) continue;
    return p;
  }
  return generateOnce(difficulty, allowRemainder);
}
