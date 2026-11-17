/**
 * 週がわりの遠征の「週」（CW-6a・2026-11-17）。
 *
 * **日本時間の月曜 0:00 で切りかわる**。週の番号は 1970-01-01（木）からの日数で数える（端末の時差には よらない）。
 * サーバ（PRISM supabase/sql/2026-11-17-catwars-expedition.sql の `_catwars_week()`）は
 * `date_trunc('week', now() at time zone 'Asia/Tokyo')::date`＝その週の月曜の日づけ（'YYYY-MM-DD'）を週の名前にする。
 * ここの `weekStartOf` も同じ日づけを返す（試験：scripts/expeditionTest.ts）。
 * 星を記録する週は **サーバの時計** で決める（端末の時計を変えても 前の週・次の週には 書けない）。
 */

export const JST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

/** その時刻の 日本時間の日の番号（1970-01-01 が 0） */
export function jstDayIndex(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

/** その時刻の週の番号（日本時間の月曜 0:00 で 1 ふえる）。1970-01-01 は木曜なので +3 で月曜を はじまりにする */
export function weekIndexOf(ms: number): number {
  return Math.floor((jstDayIndex(ms) + 3) / 7);
}

/** 週の番号 → その週の月曜の日づけ（'YYYY-MM-DD'。サーバの週の名前と同じ） */
export function weekStartOfIndex(week: number): string {
  return new Date((week * 7 - 3) * DAY_MS).toISOString().slice(0, 10);
}

/** その時刻の週の月曜の日づけ（'YYYY-MM-DD'） */
export function weekStartOf(ms: number): string {
  return weekStartOfIndex(weekIndexOf(ms));
}

/** 月曜の日づけ（'YYYY-MM-DD'）→ 週の番号（形がちがえば null） */
export function weekIndexOfStart(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Math.floor(t / DAY_MS) + 3) / 7);
}

/** 次に切りかわる時刻（日本時間の 次の月曜 0:00。ms） */
export function nextWeekStartMs(ms: number): number {
  return (weekIndexOf(ms) + 1) * 7 * DAY_MS - 3 * DAY_MS - JST_OFFSET_MS;
}

/** 「月曜まで あと n日」の n（きょうが日曜なら 1） */
export function daysLeftInWeek(ms: number): number {
  return Math.max(1, Math.ceil((nextWeekStartMs(ms) - ms) / DAY_MS));
}
