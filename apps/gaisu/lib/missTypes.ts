// このファイルは単元アプリ syo4-gaisu の src/lib/missTypes.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * まちがいの「型」を決める（PRISM が項目ごとに「多いまちがい」として数える。2026-11-15）。
 *
 * 問題は毎回ランダムに作られるので、答えの値（3400 など）を数えても意味がない。
 * ここで「どうまちがえたか」の短い名前にする。名前は PRISM にそのまま出るので、
 * 子どもの答えの値や問題の数字を入れない（10文字ほど・ひらがなと漢字）。
 * 変えるときは PRISM の表示と、すでに集まった記録の名前がずれないよう、足すだけにする。
 *
 * 記録されるのは「その問題の最初のまちがい」だけ（kit の RoundRecorder.mistake）。
 */

/** 指定の位（unit）までの がい数をもとめる問題の、数の答えの型 */
export function missRoundValue(n: number, unit: number, v: number): string {
  if (!Number.isFinite(v)) return 'その他';
  if (v === n) return 'そのまま';
  if (v === Math.floor(n / unit) * unit) return '切り捨て';
  if (v === Math.ceil(n / unit) * unit) return '切り上げ';
  for (const u of [unit * 10, unit / 10, unit * 100]) {
    if (u >= 1 && v === Math.round(n / u) * u) return '位ちがい';
  }
  return 'その他';
}

/** 「上から k けた」の がい数。k けた残す位（unit）にして missRoundValue と同じに分ける */
export function missRoundDigits(n: number, k: number, v: number): string {
  const unit = Math.pow(10, Math.max(0, String(n).length - k));
  return missRoundValue(n, unit, v);
}

/** 「どの位を四捨五入する？」：えらんだ選択肢の位の名前から */
export function missWhichPlace(targetLabel: string, pickedLabel: string): string {
  return pickedLabel === targetLabel ? '目標の位を見た' : '二つ下の位を見た';
}

/** 「2つの条件に合う数は？」：えらんだ数が、上から1けた・2けたのどちらの条件に合わないか */
export function missRoundChoose(v1: number, pickedNumber: number): string {
  const digits = String(pickedNumber).length;
  const top1 = Math.round(pickedNumber / Math.pow(10, digits - 1)) * Math.pow(10, digits - 1);
  return top1 !== v1 ? '上1けたが合わない' : '上2けたが合わない';
}

/** はんい（いちばん小さい・大きい整数）の数の答え */
export function missRangeMin(target: number, min: number, v: number): string {
  if (v === target) return 'もとの数そのまま';
  if (v === min - 1) return '1少ない';
  if (v === min + 1) return '1多い';
  return 'その他';
}
export function missRangeMax(target: number, max: number, v: number): string {
  if (v === target) return 'もとの数そのまま';
  if (v === max + 1) return '1多い';
  if (v === max - 1) return '1少ない';
  return 'その他';
}

/** はんいの表し方（以上・以下・未満）の選択肢：えらんだ文のまちがい方 */
export function missRangeExpress(min: number, max: number, pickedText: string): string {
  if (pickedText === `${min}以下${max + 1}未満`) return '以上と以下が逆';
  if (pickedText === `${min}以上${max + 1}以下`) return '上限を1つ多く';
  if (pickedText === `${min + 1}以上${max + 1}未満`) return '下限を1つずらす';
  if (pickedText === `${min}以上${max}未満`) return '上限を1つ少なく';
  return 'その他';
}

/** エラーハンター：どの場面でつまずいたか＋その問題のまちがいの種類（理由の文の先頭） */
export function missErrorHunter(stage: '判定' | '直す' | '理由', reason: string): string {
  return `${stage}：${reason}`.slice(0, 40);
}
