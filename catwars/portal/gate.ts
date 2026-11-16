/**
 * 出撃の関門（CW-5a・2026-11-16）。**戦闘は かならず ここを通って始める**（CatWars.tsx の `battleTicket` は ここの成功でしか できない）。
 *
 * - おためし（学級コードなし・体験版・ポータルにつないでいないビルド）：スタミナを使わずに通す。
 * - 学級：サーバ（kit の spendStamina＝sanmon_spend）で 出撃1回ぶんのスタミナを使う。数は サーバが決める。
 *   reason は `catwars@<町の key>`（サーバが 町 → 共通 の順に使う）。
 *   eventId は 1出撃に1つ。通らなかった（通信が切れた・たりない）ときは 同じ eventId のまま やりなおす＝二重に引かれない。
 *   通ったら 次の出撃は 新しい eventId。
 * - ことわられた：
 *     たりない            → やさしい案内（「単元アプリで れんしゅうすると たまるよ」）
 *     モードが閉じている   → kit の modeLockMessage（先生が閉じた・じゅぎょうの じかん）／番号ごとの停止は「せんせいと おはなししてね」
 *     通信できない         → 出撃しない（SANMON と同じ：sanmon_spend に とどかないと バトルは始まらない）
 * サーバの関数は deps で差しかえられる（scripts/portalTest.ts）。
 */
import { isModeOpen, modeLockMessage, type SanmonModes, type SanmonStatus } from 'learning-app-kit/sanmon';
import { CATWARS_MODE_KEY, CATWARS_SPEND_REASON } from './config';
import { sortieStamina, shortageMessage } from './stamina';

export const STUDENT_LOCK_MESSAGE = 'せんせいと おはなししてね';
export const OFFLINE_MESSAGE = 'がっきゅうポータルに つながらないので、いまは 出撃できないよ。ネットに つながったら もういちど おしてね';

type SpendResult = { ok: true; stamina: number } | { ok: false; stamina: number | null; message?: string };
type ModesResult = { ok: true; modes: SanmonModes } | { ok: false; message?: string };

export interface GateDeps {
  /** ポータルにつないだビルドか（環境変数がある） */
  configured: () => boolean;
  /** 名乗っている子の id（おためし・体験版は null） */
  studentId: () => string | null;
  spend: (studentId: string, eventId: string, amount: number, reason: string) => Promise<SpendResult>;
  fetchModes: (studentId: string) => Promise<ModesResult>;
  newEventId: () => string;
}

export type GateResult =
  | { ok: true; spent: false }
  | { ok: true; spent: true; eventId: string; townKey: string | null; stamina: number }
  | { ok: false; kind: 'stamina' | 'mode' | 'offline'; message: string; modes?: SanmonModes };

/** 番号ごとの停止（PRISM で先生が番号を押す。サーバの sanmon_modes が _student_lock を付ける）。理由は出さない */
export const studentLocked = (modes: SanmonModes | null | undefined): boolean =>
  !!modes && !isModeOpen(modes, CATWARS_MODE_KEY) && (modes as SanmonModes & { _student_lock?: boolean })._student_lock === true;

/** 閉じているときの文（開いていれば null） */
export function lockMessage(modes: SanmonModes | null | undefined): string | null {
  if (studentLocked(modes)) return STUDENT_LOCK_MESSAGE;
  return modeLockMessage(modes, CATWARS_MODE_KEY);
}

export interface SortieInput {
  formation: readonly string[];
  /** いま読めている スタミナ（町をえらぶのに使う。読めていなければ null） */
  status: Pick<SanmonStatus, 'stamina' | 'towns' | 'apps'> | null;
  /** いま読めている モードの開け閉め（読めていなければ null） */
  modes: SanmonModes | null;
}

export function createSortieGate(deps: GateDeps) {
  /** まだ通っていない出撃の eventId（やりなおしでも同じものを使う） */
  let pending: string | null = null;
  let inflight: Promise<GateResult> | null = null;

  async function run(input: SortieInput): Promise<GateResult> {
    const sid = deps.configured() ? deps.studentId() : null;
    // おためし：スタミナは使わない
    if (!sid) return { ok: true, spent: false };
    // 先に分かっている「閉じている」は サーバに聞かずに出す
    const pre = lockMessage(input.modes);
    if (pre) return { ok: false, kind: 'mode', message: pre, modes: input.modes ?? undefined };

    const st = sortieStamina(input.formation, input.status);
    const eventId = (pending ??= deps.newEventId());
    const reason = st.townKey ? `${CATWARS_SPEND_REASON}@${st.townKey}` : CATWARS_SPEND_REASON;
    const r = await deps.spend(sid, eventId, st.cost, reason);
    if (r.ok) {
      pending = null;
      return { ok: true, spent: true, eventId, townKey: st.townKey, stamina: r.stamina };
    }
    if (r.stamina == null) {
      // サーバに ことわられた（モードが閉じた）か、とどかなかった。モードを読みなおして見分ける
      const m = await deps.fetchModes(sid);
      if (m.ok) {
        const lock = lockMessage(m.modes);
        if (lock) return { ok: false, kind: 'mode', message: lock, modes: m.modes };
      }
      return { ok: false, kind: 'offline', message: OFFLINE_MESSAGE };
    }
    // たりない（サーバの数で出しなおす）
    return { ok: false, kind: 'stamina', message: shortageMessage({ ...st, common: r.stamina }) };
  }

  return {
    /** 出撃してよいか（スタミナを使う）。同時に2回おしても 1回ぶんだけ */
    startBattle(input: SortieInput): Promise<GateResult> {
      inflight ??= run(input).finally(() => { inflight = null; });
      return inflight;
    },
    /** いまの まだ通っていない eventId（試験用） */
    pendingEventId: () => pending,
  };
}

export type SortieGate = ReturnType<typeof createSortieGate>;
