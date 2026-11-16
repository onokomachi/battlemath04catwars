/**
 * 学級ポータルへ まだ送れていない 1問の記録を 端末に のこす（CW-5b・2026-11-16）。
 *
 * - 鍵は SAVE_KEYS.outbox（portal/saveKeys.ts）。学級／おためし の入れかえ（saveProfile.ts）の対象＝おためしの側には 入らない。
 *   サーバに送るセーブ（saveBundle.ts）には入れない（記録はサーバの learning_event にあるため。大きいため）。
 * - 直近 OUTBOX_MAX 件だけ（SANMON の 1問ごとのログと同じ 500件）。送れたかどうかは kit の高水位（lak_sent_ts_catwars）で見るので、
 *   送れたものも ここからは消さない（古いものから あふれて消える）。
 * - 1件ごとに 名乗っていた子の id（sid）を付ける。同じ端末で 番号を変えたあと、前の子の記録を 次の子の記録として送らないため。
 */
import type { LogLike } from 'learning-app-kit/sync';
import { SAVE_KEYS } from './saveKeys';
import type { KV } from './saveProfile';

export const OUTBOX_MAX = 500;

export type OutboxEntry = LogLike & { sid: string };

const ls = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function readOutbox(store: KV | null = ls()): OutboxEntry[] {
  try {
    const v = JSON.parse(store?.getItem(SAVE_KEYS.outbox) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((e): e is OutboxEntry => !!e && typeof e === 'object' && typeof (e as OutboxEntry).ts === 'number' && typeof (e as OutboxEntry).sid === 'string') : [];
  } catch {
    return [];
  }
}

/** 1件 足す（直近 OUTBOX_MAX 件まで）。書けなくても 遊びは止めない */
export function addToOutbox(entry: OutboxEntry, store: KV | null = ls()): void {
  if (!store) return;
  const list = readOutbox(store);
  list.push(entry);
  try { store.setItem(SAVE_KEYS.outbox, JSON.stringify(list.slice(-OUTBOX_MAX))); } catch { /* 容量いっぱい：のこせなくても 遊べる */ }
}

/** その子の記録（sid をぬいた kit の形。古い順） */
export function outboxFor(sid: string, store: KV | null = ls()): LogLike[] {
  return readOutbox(store)
    .filter((e) => e.sid === sid)
    .map(({ sid: _sid, ...log }) => log)
    .sort((a, b) => a.ts - b.ts);
}
