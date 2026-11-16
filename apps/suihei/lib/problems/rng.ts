// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/rng.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 出題用の乱数ユーティリティ。
 *
 * シャッフルは必ずここの shuffle() を使う。`sort(() => Math.random() - 0.5)` は
 * 一様でない並びになり、選択肢の位置に偏りが出る（過去に複数箇所で再発明した）。
 */

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher-Yates。元の配列は変更しない。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 重複なしで n 個選ぶ。 */
export function pickN<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

/** arr から except を除いて1つ選ぶ。 */
export function pickExcept<T>(arr: readonly T[], except: readonly T[]): T {
  const rest = arr.filter((x) => !except.includes(x));
  return pick(rest.length > 0 ? rest : arr);
}

/**
 * 選択肢を並べ替えつつ、正解が何番目になったかを返す。
 * 正解を「値」で探すと、たまたま同じ文字列の誤答があったときに壊れるので、
 * 位置（インデックス）で追跡する。
 */
export function shuffleChoices<T>(items: T[], correctIndex: number): { choices: T[]; correct: number } {
  const order = shuffle(items.map((_, i) => i));
  return {
    choices: order.map((i) => items[i]),
    correct: order.indexOf(correctIndex),
  };
}
