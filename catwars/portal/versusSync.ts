/**
 * 同時対戦 と サーバ（CW-6c・2026-11-17）。サーバの SQL は PRISM の supabase/sql/2026-11-17-catwars-versus.sql（**まだ流していない**。先に 6a・6b の SQL）。
 *
 * へやの表だけ（部屋の作成・入室・準備・でる）。**勝ち負け・点・だれが だれと たたかったか は サーバに 残らない**（表にも 関数にも 無い）。
 * - `catwars_versus_create(p_student_id, p_units)`：へやを作る。4けたの 記号・合図の部屋の名前（推測できない文字列）・たね・出題範囲を 返す。同じ学級の 子だけ 入れる。
 * - `catwars_versus_join(p_student_id, p_code)`：同じ学級の へやの記号で 入る（2人まで）。
 * - `catwars_versus_state(p_student_id, p_code)`：へやの ようす（あいてが 来たか・準備できたか）。合図が とどかない 回線の ための 読みなおし。
 * - `catwars_versus_ready(p_student_id, p_code)`：「たたかう」。**へやに 入ってから 出撃の関門（スタミナ）を 通した 子だけ**。2人とも 通ったら はじまる。
 * - `catwars_versus_leave(p_student_id, p_code)`：へやを 出る。
 * **名乗っているときだけ**（おためし・体験版・デモ・つないでいないビルドは サーバに 何も 送らない＝コンピュータが あいての れんしゅう試合）。
 * kit は使わず、kit の rpc と同じ形の fetch（kit の版を 上げずに すむように）。SQL を流す前は ことわられる → 遊びは止めない（れんしゅう試合は 遊べる）。
 */
import { getStudent } from 'learning-app-kit/sync';
import { PORTAL, isPortalConfigured } from './config';
import { isDemo } from './demoMode';
import { normalizeRoomCode } from '../versus/rules';

export interface VersusRoom {
  code: string;
  /** 合図の 部屋の名前（サーバが 作る 推測できない文字列） */
  channel: string;
  /** 対戦の たね（2人で 同じ） */
  seed: number;
  /** 出題範囲（単元の key）。へやを作った子が えらぶ */
  units: string[];
  role: 'host' | 'guest';
}
export interface VersusRoomState {
  status: 'waiting' | 'full' | 'playing' | 'closed';
  oppHere: boolean;
  meReady: boolean;
  oppReady: boolean;
}
/** 失敗の種類（子どもに出す文は 画面側で えらぶ） */
export type VersusErrorKind = 'closed' | 'notfound' | 'full' | 'expired' | 'nospend' | 'offline' | 'unavailable' | 'other';
export type VersusResult<T> = { ok: true; data: T } | { ok: false; kind: VersusErrorKind; message: string };

export type VersusRpc = (fn: string, body: Record<string, unknown>) => Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }>;

const realRpc: VersusRpc = async (fn, body) => {
  if (!PORTAL.supabaseUrl || !PORTAL.supabaseKey) return { ok: false, status: 0, text: 'つながっていません' };
  try {
    const res = await fetch(`${PORTAL.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: PORTAL.supabaseKey, Authorization: `Bearer ${PORTAL.supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, text };
    return { ok: true, data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, status: 0, text: 'ネットに つながっていない' };
  }
};
let rpc: VersusRpc = realRpc;
let configured = (): boolean => isPortalConfigured;
let studentOf = (): string | null => getStudent()?.studentId ?? null;
/** 試験・開発の差しかえ（null で もとにもどす） */
export function __setVersusRpc(r: VersusRpc | null, student?: () => string | null): void {
  rpc = r ?? realRpc;
  configured = r ? () => true : () => isPortalConfigured;
  studentOf = student ?? (() => getStudent()?.studentId ?? null);
}

/** 名乗っている子の id（おためし・体験版・デモ・つないでいないビルドは null） */
export const versusStudentId = (): string | null => (configured() && !isDemo() ? studentOf() : null);
/** 名乗っているか（同じ学級の なかまと たたかえるか。いいえ なら コンピュータが あいて） */
export const versusNamed = (): boolean => versusStudentId() !== null;

/** サーバの ことわり → 種類 */
export function errorKind(status: number, text: string): VersusErrorKind {
  if (status === 0) return 'offline';
  if (status === 404) return 'unavailable';           // SQL を 流す前（関数が ない）
  if (/MODE_CLOSED/.test(text)) return 'closed';
  if (/ROOM_NOT_FOUND/.test(text)) return 'notfound';
  if (/ROOM_FULL/.test(text)) return 'full';
  if (/ROOM_EXPIRED/.test(text)) return 'expired';
  if (/NO_SPEND/.test(text)) return 'nospend';
  return 'other';
}

const isStr = (x: unknown): x is string => typeof x === 'string';
/** サーバの形 → へやの形（信用しない：型・長さ・文字を 見なおす） */
export function parseRoom(raw: unknown, role: 'host' | 'guest'): VersusRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = isStr(r.code) ? normalizeRoomCode(r.code) : '';
  if (code.length !== 4 || !isStr(r.channel) || !/^[0-9a-f]{16,64}$/.test(r.channel)) return null;
  const seed = Number(r.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const units = Array.isArray(r.units) ? r.units.filter((u): u is string => isStr(u) && /^[a-z0-9_-]{1,24}$/.test(u)).slice(0, 16) : [];
  if (units.length === 0) return null;
  return { code, channel: r.channel, seed, units, role };
}
export function parseState(raw: unknown): VersusRoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (status !== 'waiting' && status !== 'full' && status !== 'playing' && status !== 'closed') return null;
  return { status, oppHere: r.opp_here === true, meReady: r.me_ready === true, oppReady: r.opp_ready === true };
}

async function call<T>(fn: string, body: Record<string, unknown>, parse: (raw: unknown) => T | null): Promise<VersusResult<T>> {
  const r = await rpc(fn, body);
  if (r.ok === false) return { ok: false, kind: errorKind(r.status, r.text), message: r.text };
  const v = parse(r.data);
  return v === null ? { ok: false, kind: 'other', message: 'よみこめない' } : { ok: true, data: v };
}
const NOT_NAMED: VersusResult<never> = { ok: false, kind: 'other', message: '名乗っていない' };

export async function createRoom(units: string[]): Promise<VersusResult<VersusRoom>> {
  const id = versusStudentId(); if (!id) return NOT_NAMED;
  return call('catwars_versus_create', { p_student_id: id, p_units: units }, (raw) => parseRoom(raw, 'host'));
}
export async function joinRoom(code: string): Promise<VersusResult<VersusRoom>> {
  const id = versusStudentId(); if (!id) return NOT_NAMED;
  return call('catwars_versus_join', { p_student_id: id, p_code: normalizeRoomCode(code) }, (raw) => parseRoom(raw, 'guest'));
}
export async function roomState(code: string): Promise<VersusResult<VersusRoomState>> {
  const id = versusStudentId(); if (!id) return NOT_NAMED;
  return call('catwars_versus_state', { p_student_id: id, p_code: code }, parseState);
}
/** 「たたかう」：出撃の関門（スタミナ）を 通した あとに 呼ぶ */
export async function markReady(code: string): Promise<VersusResult<VersusRoomState>> {
  const id = versusStudentId(); if (!id) return NOT_NAMED;
  return call('catwars_versus_ready', { p_student_id: id, p_code: code }, parseState);
}
export async function leaveRoom(code: string): Promise<void> {
  const id = versusStudentId(); if (!id) return;
  await rpc('catwars_versus_leave', { p_student_id: id, p_code: code });
}
