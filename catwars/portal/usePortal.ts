/**
 * 学級ポータルの いまのようす（名乗り・スタミナ・モードの開け閉め・サーバのかけら）。CW-5a・2026-11-16。
 * SANMON の hooks/useSanmonPortal.ts と同じ読み方：
 *   - 名乗ったら・アプリにもどってきたら（visibilitychange）スタミナとモードを読む。
 *   - 平日モード（授業の時間）は時刻で変わるので、開いているあいだは 2分ごとに モードだけ読みなおす。
 *   - 通信が切れたら kit の fetchSanmonModes が 前に読めた設定で 平日モードだけ効かせる。
 * かけらは サーバの記録（kit の sanmonShards）を learn/shards.ts の入口に わたす。
 *
 * 画面は usePortal() で読む。出撃は かならず `startSortie`（portal/gate.ts の関門）を通す。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getStudent, subscribeStudent, type StudentIdentity } from 'learning-app-kit/sync';
import {
  fetchSanmonStatus, fetchSanmonModes, spendStamina, sanmonShards, isModeOpen,
  type SanmonStatus, type SanmonModes,
} from 'learning-app-kit/sanmon';
import { PORTAL, isPortalConfigured, CATWARS_MODE_KEY } from './config';
import { createSortieGate, lockMessage, type GateDeps, type GateResult } from './gate';
import { setServerShards } from '../learn/shards';

/** サーバとのやりとり（開発のときだけ 差しかえられる：__cwPortalMock） */
export interface PortalService {
  configured: () => boolean;
  student: () => StudentIdentity | null;
  fetchStatus: (studentId: string) => Promise<{ ok: true; status: SanmonStatus } | { ok: false; message?: string }>;
  fetchModes: GateDeps['fetchModes'];
  spend: GateDeps['spend'];
}

const realService: PortalService = {
  configured: () => isPortalConfigured,
  student: () => getStudent(),
  fetchStatus: (id) => fetchSanmonStatus(PORTAL, id),
  fetchModes: (id) => fetchSanmonModes(PORTAL, id),
  spend: (id, ev, amount, reason) => spendStamina(PORTAL, id, ev, amount, reason),
};
let service: PortalService = realService;

interface PortalState {
  student: StudentIdentity | null;
  status: SanmonStatus | null;
  modes: SanmonModes | null;
  /** スタミナを読めたか */
  loaded: boolean;
}

export const usePortalStore = create<PortalState>()(() => ({
  student: typeof window === 'undefined' ? null : getStudent(),
  status: null,
  modes: null,
  loaded: false,
}));

/** スタミナ・モード・かけら を読みなおす */
export async function refreshPortal(): Promise<void> {
  const s = service.configured() ? service.student() : null;
  usePortalStore.setState({ student: s });
  if (!s) { usePortalStore.setState({ status: null, modes: null, loaded: false }); setServerShards(null); return; }
  const [r, m] = await Promise.all([service.fetchStatus(s.studentId), service.fetchModes(s.studentId)]);
  if (r.ok) {
    usePortalStore.setState({ status: r.status, loaded: true });
    setServerShards(Object.fromEntries(sanmonShards(r.status).map((x) => [x.key, x.shards])));
  }
  if (m.ok) usePortalStore.setState({ modes: m.modes });
}

async function refreshModes(): Promise<void> {
  const s = service.configured() ? service.student() : null;
  if (!s) return;
  const m = await service.fetchModes(s.studentId);
  if (m.ok) usePortalStore.setState({ modes: m.modes });
}

const newEventId = () => `catwars-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const gate = createSortieGate({
  configured: () => service.configured(),
  studentId: () => service.student()?.studentId ?? null,
  spend: (...a) => service.spend(...a),
  fetchModes: (id) => service.fetchModes(id),
  newEventId,
});

/** 出撃の関門を通す。通ったら スタミナを読みなおす。ことわられて モードが分かったら 覚えておく */
export async function startSortie(formation: readonly string[]): Promise<GateResult> {
  const { status, modes } = usePortalStore.getState();
  const r = await gate.startBattle({ formation, status, modes });
  if (r.ok && r.spent) {
    usePortalStore.setState((st) => ({ status: st.status ? { ...st.status, stamina: r.stamina } : st.status }));
    void refreshPortal();
  }
  if (r.ok === false && r.modes) usePortalStore.setState({ modes: r.modes });
  if (r.ok === false && r.kind === 'stamina') void refreshPortal();
  return r;
}

/** 名乗っている子の 出撃が いま閉じているか（閉じていれば その文） */
export function sortieLock(modes: SanmonModes | null): string | null {
  return lockMessage(modes);
}
export const sortieOpen = (modes: SanmonModes | null): boolean => isModeOpen(modes, CATWARS_MODE_KEY);

let started = false;
/** アプリの いちばん上で1回だけ呼ぶ（CatWars.tsx） */
export function usePortalLifecycle(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshPortal();
    const unsub = subscribeStudent(() => { void refreshPortal(); });
    const onVis = () => { if (!document.hidden) void refreshPortal(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (!document.hidden) void refreshModes(); }, 120_000);
    return () => { started = false; unsub(); document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, []);
}

export const usePortal = usePortalStore;

// 開発のときだけ：画面の確かめ（Playwright）で サーバを差しかえる。本番のビルドには入らない。
//   window.__cwPortalMock({ student, status, modes, spend: 'ok' | 'short' | 'offline' | 'closed' })
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cwPortalMock?: (o: {
    student?: StudentIdentity; status?: SanmonStatus; modes?: SanmonModes; spend?: 'ok' | 'short' | 'offline' | 'closed';
  }) => Promise<void> }).__cwPortalMock = async (o) => {
    const student = o.student ?? { studentId: 'dev-student', joinCode: 'DEV', number: 1 };
    let status: SanmonStatus = o.status ?? { stamina: 0, towns: {}, earnedToday: 0, apps: {} };
    const modes: SanmonModes = o.modes ?? {};
    service = {
      configured: () => true,
      student: () => student,
      fetchStatus: async () => ({ ok: true, status }),
      fetchModes: async () => ({ ok: true, modes }),
      spend: async (_id, _ev, amount) => {
        if (o.spend === 'offline' || o.spend === 'closed') return { ok: false, stamina: null, message: 'x' };
        if (o.spend === 'short') return { ok: false, stamina: status.stamina };
        status = { ...status, stamina: Math.max(0, status.stamina - amount) };
        return { ok: true, stamina: status.stamina };
      },
    };
    await refreshPortal();
  };
}
