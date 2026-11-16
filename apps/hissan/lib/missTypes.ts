// このファイルは単元アプリ wari-hissann3 の src/lib/missTypes.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * まちがいの「型」を決める（PRISM が項目ごとに「多いまちがい」として数える。2026-11-15）。
 *
 * 問題は毎回ランダムに作られるので、答えの値を数えても意味がない。ここで「どうまちがえたか」の短い名前にする。
 * 名前は PRISM にそのまま出るので、子どもの答えの値や問題の数字を入れない。
 * 変えるときは、すでに集まった記録の名前とずれないよう、足すだけにする。
 *
 * 記録されるのは「その問題の最初のまちがい」だけ（kit の RoundRecorder.mistake）。
 */

/** 「あてはまるものを全部（または2つ）えらぶ」のまちがい方。want は正解の集合 */
export function missPickSet(want: readonly number[], got: readonly number[]): string {
  if (got.length === 0) return 'えらばなかった';
  const missing = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));
  if (extra.length > 0 && missing.length === 0) return '多くえらんだ';
  if (missing.length > 0 && extra.length === 0) return '足りない';
  return 'ずれた';
}

/** 「□に入る数字（商が10より小さい）」：正解は 0〜(o-1)。境目の数字を含める／のがす、を分ける */
export function missEstimateDigits(want: readonly number[], got: readonly number[]): string {
  if (got.length === 0) return 'えらばなかった';
  const max = Math.max(...want);
  const sorted = [...got].sort((a, b) => a - b);
  if (sorted.length === want.length + 1 && want.every((x) => sorted.includes(x)) && sorted.includes(max + 1)) return '境目を含めた';
  if (sorted.length === want.length - 1 && want.slice(0, -1).every((x) => sorted.includes(x))) return '境目をのがした';
  return missPickSet(want, got);
}

/** 商がたちはじめる位（百・十・一）：選んだ位が正解より高いか低いか */
export function missQuotientPlace(pickedIndex: number, answerIndex: number): string {
  return pickedIndex < answerIndex ? '位を高く見た' : '位を低く見た';
}

/** 商は何けたか：選んだけた数が少ないか多いか */
export function missQuotientDigits(pickedIndex: number, answerIndex: number): string {
  return pickedIndex < answerIndex ? 'けた数が少ない' : 'けた数が多い';
}

/** 仮の商の見当：正確な商を出した／1ずれ／その他 */
export function missEstimateValue(dividend: number, divisor: number, est: number, v: number): string {
  if (!Number.isFinite(v)) return 'その他';
  // 正確な商を出した（見当でなく計算してしまった）ほうが分かることが多いので先に見る
  if (v === Math.floor(dividend / divisor)) return '正確な商を出した';
  if (Math.abs(v - est) === 1) return '見当が1ずれ';
  return 'その他';
}

/** わり算の計算：商とあまりのまちがい方 */
export function missCalc(quotient: number, remainder: number, divisor: number, q: number, r: number): string {
  if (!Number.isFinite(q) || !Number.isFinite(r)) return 'その他';
  const qOk = q === quotient;
  const rOk = r === remainder;
  if (!qOk) {
    if (q === quotient * 10 || (quotient % 10 === 0 && q === quotient / 10)) return '商の位ちがい';
    // 0を書きわすれた（正解の 0 をぬいた数）
    if (String(quotient).includes('0') && String(quotient).replace(/0/g, '') === String(q)) return '商の0の書きわすれ';
    return rOk ? '商がちがう' : '商もあまりもちがう';
  }
  if (!rOk) return r >= divisor ? 'あまりが大きい' : 'あまりがちがう';
  return 'その他';
}

/** □に入る数（きまり・くふうの穴うめ）：10倍・10分の1の位ちがいを分ける */
export function missBlank(answer: number, v: number): string {
  if (!Number.isFinite(v)) return 'その他';
  if (v === answer * 10 || (answer % 10 === 0 && v === answer / 10)) return '位ちがい';
  return 'その他';
}

/** エラーハンター：どの場面でつまずいたか＋その問題のまちがいの種類（理由の文） */
export function missErrorHunter(stage: '判定' | '直す' | '理由', reason: string): string {
  return `${stage}：${reason}`.slice(0, 40);
}
