/**
 * 週がわりの遠征 と サーバ（CW-6a・2026-11-17）。サーバの SQL は PRISM の supabase/sql/2026-11-17-catwars-expedition.sql。
 *
 * - `catwars_expedition_put(p_student_id, p_stars)`：その週（**サーバの時計**の 日本時間の月曜 0:00 区切り）の 自分の星。前より良いときだけ上書き。
 *   名乗っているときだけ・遠征で 1問いじょう まちがえずに といた戦いだけ 送る（おためし・体験版・デモ・つないでいないビルドは 送らない）。
 *   サーバは「鍵 catwars が開いている」「直近90分に CAT-WARS の出撃（関門のスタミナ）がある」子だけ うけつける。
 * - `catwars_expedition_class(p_student_id)`：自分の学級の 今週と先週の「星の合計・目標・人数・自分の星」だけ。
 *   **ほかの子の星・順位は 返さない**（サーバが そうしている）。
 * kit は使わず（kit の版を上げなくて すむように）、kit の rpc と同じ形の fetch で呼ぶ（PORTAL の publishable キー）。
 * SQL を流す前は 404 などで ことわられる → 遊びは止めない・学級の合計は「まだ」と出す・星は 端末に のこして あとで送る。
 */
import { create } from 'zustand';
import { PORTAL, isPortalConfigured } from './config';
import { getStudent } from 'learning-app-kit/sync';
import { isDemo } from './demoMode';
import { useExpeditionStore } from '../store/useExpeditionStore';
import { useCollectionStore } from '../store/useCollectionStore';
import { EXPEDITION_GOAL_COINS, classGoal } from '../expedition/expedition';
import { weekStartOf } from '../expedition/week';

export interface ClassWeek {
  weekStart: string;
  /** 学級の 星の合計 */
  total: number;
  goal: number;
  achieved: boolean;
  /** 自分の いちばん良い星（ちょうせんしていなければ null） */
  me: number | null;
}
export interface ClassExpedition {
  size: number;
  thisWeek: ClassWeek;
  lastWeek: ClassWeek | null;
  /** デモの 見本の数（本物ではない） */
  sample?: boolean;
}

type Rpc = <T>(fn: string, body: unknown) => Promise<{ ok: true; data: T } | { ok: false; message: string }>;

const realRpc: Rpc = async <T,>(fn: string, body: unknown) => {
  if (!PORTAL.supabaseUrl || !PORTAL.supabaseKey) return { ok: false as const, message: 'つながっていません' };
  try {
    const res = await fetch(`${PORTAL.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: PORTAL.supabaseKey, Authorization: `Bearer ${PORTAL.supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false as const, message: `(${res.status})` };
    return { ok: true as const, data: (await res.json()) as T };
  } catch {
    return { ok: false as const, message: 'ネットに つながっていない' };
  }
};
let rpc: Rpc = realRpc;
let configured = (): boolean => isPortalConfigured;
/** 名乗っている子（kit の名乗り。answerSync・saveSync と同じ） */
let studentOf = (): string | null => getStudent()?.studentId ?? null;
/** 試験・開発の差しかえ（null で もとにもどす）。student＝名乗っている子の id（null＝おためし） */
export function __setExpeditionRpc(r: Rpc | null, student?: () => string | null): void {
  rpc = r ?? realRpc;
  configured = r ? () => true : () => isPortalConfigured;
  studentOf = student ?? (() => getStudent()?.studentId ?? null);
}

/** サーバの形 → 画面の形 */
export function parseClassWeek(raw: unknown): ClassWeek | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.week !== 'string') return null;
  const total = Number(r.total ?? 0), goal = Number(r.goal ?? 0);
  return {
    weekStart: r.week, total: Number.isFinite(total) ? total : 0, goal: Number.isFinite(goal) ? goal : 0,
    achieved: r.achieved === true, me: typeof r.me === 'number' ? r.me : null,
  };
}
export function parseClassExpedition(raw: unknown): ClassExpedition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const weeks = Array.isArray(r.weeks) ? r.weeks.map(parseClassWeek).filter((w): w is ClassWeek => !!w) : [];
  weeks.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  if (!weeks[0]) return null;
  return { size: Number(r.size ?? 0) || 0, thisWeek: weeks[0], lastWeek: weeks[1] ?? null };
}

/** デモの 見本（30人の学級。本物の子の数ではない） */
export function demoClassExpedition(nowMs = Date.now()): ClassExpedition {
  const w = weekStartOf(nowMs);
  const best = useExpeditionStore.getState().best[w];
  return { size: 30, sample: true, thisWeek: { weekStart: w, total: 38 + (best ?? 0), goal: classGoal(30), achieved: 38 + (best ?? 0) >= classGoal(30), me: best ?? null }, lastWeek: null };
}

interface ClassState { data: ClassExpedition | null; loading: boolean; error: string | null; reward: number }
/** 学級の合計（ホームの遠征のカード・遠征の説明が読む） */
export const useClassExpedition = create<ClassState>()(() => ({ data: null, loading: false, error: null, reward: 0 }));

const studentId = (): string | null => (configured() && !isDemo() ? studentOf() : null);
/** 名乗っていて 学級の星に入るか（おためし・体験版・デモ・つないでいないビルドは false） */
export const expeditionNamed = (): boolean => studentId() !== null;

/**
 * 学級の目標を こえた週の ごほうび（その週に 遠征で まちがえずに といた子＝me が null でない子だけ・1週に1回）。
 * もらった シールコインの数を返す（純粋に近い：ストアだけを さわる）。
 */
export function claimGoalRewards(d: ClassExpedition | null): number {
  if (!d || d.sample) return 0;
  let got = 0;
  for (const w of [d.thisWeek, d.lastWeek]) {
    if (!w || !w.achieved || w.me === null) continue;
    if (useExpeditionStore.getState().claim(w.weekStart)) {
      useCollectionStore.getState().addGoalCoins(EXPEDITION_GOAL_COINS);
      got += EXPEDITION_GOAL_COINS;
    }
  }
  return got;
}

/** 学級の合計を読む（名乗っているとき）。デモは 見本。おためし・体験版は 読まない（null） */
export async function refreshClassExpedition(): Promise<void> {
  if (isDemo()) { useClassExpedition.setState({ data: demoClassExpedition(), loading: false, error: null }); return; }
  const id = studentId();
  if (!id) { useClassExpedition.setState({ data: null, loading: false, error: null }); return; }
  useClassExpedition.setState({ loading: true });
  const r = await rpc<unknown>('catwars_expedition_class', { p_student_id: id });
  if (r.ok === false) { useClassExpedition.setState({ loading: false, error: r.message }); return; }
  const data = parseClassExpedition(r.data);
  const got = claimGoalRewards(data);
  useClassExpedition.setState((s) => ({ data, loading: false, error: data ? null : 'よみこめない', reward: s.reward + got }));
}

let sending = false;
/** まだ とどいていない星を送る（名乗っているときだけ）。とどいたら 学級の合計を 読みなおす */
export async function flushExpedition(nowMs = Date.now()): Promise<boolean> {
  const st = useExpeditionStore.getState();
  st.dropStale(weekStartOf(nowMs));
  const p = useExpeditionStore.getState().pending;
  const id = studentId();
  if (!p || !id || isDemo() || sending) return false;
  sending = true;
  try {
    const r = await rpc<{ week?: string; stars?: number }>('catwars_expedition_put', { p_student_id: id, p_stars: p.stars });
    if (!r.ok) return false;
    useExpeditionStore.getState().markSent(p.weekStart, Number(r.data?.stars ?? p.stars));
    void refreshClassExpedition();
    return true;
  } finally {
    sending = false;
  }
}

// 開発のときだけ：画面の確かめ（Playwright）で 学級の合計を差しかえる（本番のビルドには入らない）。
//   window.__cwExpeditionMock({ total, goal, size, me, achieved })
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cwExpeditionMock?: (o: { total: number; goal?: number; size?: number; me?: number | null; lastAchieved?: boolean; trial?: boolean }) => Promise<void> }).__cwExpeditionMock = async (o) => {
    const size = o.size ?? 28;
    const goal = o.goal ?? classGoal(size);
    const w = weekStartOf(Date.now());
    const prev = new Date(Date.parse(`${w}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    const named = (window as unknown as { __cwExpeditionStudent?: string }).__cwExpeditionStudent ?? 'dev-student';
    __setExpeditionRpc(async <T,>(fn: string) => {
      if (fn === 'catwars_expedition_put') return { ok: true as const, data: { week: w, stars: 3 } as T };
      return {
        ok: true as const, data: {
          size, weeks: [
            { week: w, total: o.total, goal, achieved: o.total >= goal, me: o.me ?? null },
            { week: prev, total: goal + 3, goal, achieved: o.lastAchieved ?? true, me: o.lastAchieved === false ? null : 2 },
          ],
        } as T,
      };
    }, () => (o.trial ? null : named));
    await refreshClassExpedition();
  };
}
