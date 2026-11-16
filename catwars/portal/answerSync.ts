/**
 * 戦闘の中で解いた 1問の記録を 学級ポータルへ送る（CW-5b・2026-11-16）。
 *
 * - 送るのは kit の flushEvents（SANMON の syncLearningToPortal と同じ呼び方：`flushEvents({ appId, ...PORTAL }, logs)`）。
 *   kit が「送れたところまで」（lak_sent_ts_catwars）を覚えて、その先だけを送る。サーバも event_id で二重を はじく。
 * - **名乗っているときだけ**（おためし・体験版・つないでいないビルドは 端末にも のこさない・送らない）。
 * - 送れなかった分は 端末に のこす（portal/outbox.ts。直近500件）。サーバに ことわられても（apps に catwars が まだ無い など）
 *   遊びは止めず、次の機会（次の問題・戦闘の おわり・タブを とじる／もどる・名乗ったとき）に 送りなおす。
 * - 間のあけ方：1問ごとには 通信しない。問題を解いたら ANSWER_WAIT_MS あとに まとめて送る（そのあいだの問題は いっしょに。
 *   待っているあいだに 次の問題を解いても 待ちは のばさない＝戦闘が長くても ANSWER_WAIT_MS ごとに 1回まで）。
 *   戦闘の おわり は 0.5秒、タブを かくしたら すぐ（SANMON と同じ）。
 *   SANMON は 2秒。CAT-WARS は 戦闘の中で 数秒ごとに 問題を解くので 15秒にした。
 * - 1度に 送るのは 1つだけ（送っている途中に 頼まれたら、おわってから もう1回）。
 * サーバとのやりとりは deps で差しかえられる（scripts/portalTest.ts）。
 */
import { flushEvents, getStudent, type LogLike } from 'learning-app-kit/sync';
import { PORTAL, isPortalConfigured } from './config';
import { addToOutbox, outboxFor } from './outbox';
import type { KV } from './saveProfile';

export const CATWARS_APP_ID = 'catwars';
export const ANSWER_WAIT_MS = 15_000;
export const BATTLE_END_WAIT_MS = 500;

export interface AnswerSyncDeps {
  configured: () => boolean;
  /** 名乗っている子の id（おためし・体験版は null） */
  studentId: () => string | null;
  /** kit の flushEvents（まだ送っていない分だけ送る） */
  flush: (logs: LogLike[]) => Promise<{ ok: boolean }>;
  store?: () => KV | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  now?: () => number;
}

export function createAnswerSync(deps: AnswerSyncDeps) {
  const store = () => (deps.store ? deps.store() : (typeof localStorage === 'undefined' ? null : localStorage));
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  let timer: unknown = null;
  let due = 0;
  let inflight: Promise<boolean> | null = null;
  let again = false;

  const sid = () => (deps.configured() ? deps.studentId() : null);

  async function sendOnce(): Promise<boolean> {
    const s = sid();
    if (!s) return true;
    const logs = outboxFor(s, store());
    if (logs.length === 0) return true;
    try { return (await deps.flush(logs)).ok; } catch { return false; }
  }

  /** いま送る（送っている途中なら、おわってから もう1回）。送れたら true */
  function flushNow(): Promise<boolean> {
    if (timer) { clearT(timer); timer = null; }
    if (inflight) { again = true; return inflight; }
    inflight = (async () => {
      let ok = await sendOnce();
      while (again && ok) { again = false; ok = await sendOnce(); }
      again = false;
      return ok;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  /** wait ミリ秒あとに送る。もっと早く送る予定が もうあれば そのまま */
  function schedule(wait: number): void {
    if (!sid()) return;
    const at = now() + wait;
    if (timer && due <= at) return;
    if (timer) clearT(timer);
    due = at;
    timer = setT(() => { timer = null; void flushNow(); }, wait);
  }

  /** 1問の記録を のこして、あとで まとめて送る。のこしたら true（おためしは false） */
  function queue(log: LogLike): boolean {
    const s = sid();
    if (!s) return false;
    addToOutbox({ ...log, sid: s }, store());
    schedule(ANSWER_WAIT_MS);
    return true;
  }

  return { queue, schedule, flushNow, pending: () => !!timer || !!inflight };
}

export const answerSync = createAnswerSync({
  configured: () => isPortalConfigured,
  studentId: () => getStudent()?.studentId ?? null,
  flush: (logs) => flushEvents({ appId: CATWARS_APP_ID, ...PORTAL }, logs),
});

/** 戦闘が おわった・名乗った とき：少し まって 送る */
export const syncAnswersSoon = (wait = BATTLE_END_WAIT_MS) => answerSync.schedule(wait);
/** タブを かくした とき：すぐ送る */
export const syncAnswersNow = () => answerSync.flushNow();
