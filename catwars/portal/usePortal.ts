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
  fetchSanmonStatus, fetchSanmonModes, spendStamina, sanmonShards, isModeOpen, isSchoolHoursLocked, reportLockHit,
  type SanmonStatus, type SanmonModes,
} from 'learning-app-kit/sanmon';
import { PORTAL, isPortalConfigured, CATWARS_MODE_KEY } from './config';
import { createSortieGate, lockMessage, closedWhilePlayingMessage, type GateDeps, type GateResult } from './gate';
import { syncAnswersNow, syncAnswersSoon } from './answerSync';
import { saveSync } from './saveSync';
import { useStudyStore } from '../store/useStudyStore';
import { setServerShards } from '../learn/shards';

/** サーバとのやりとり（開発のときだけ 差しかえられる：__cwPortalMock） */
export interface PortalService {
  configured: () => boolean;
  student: () => StudentIdentity | null;
  fetchStatus: (studentId: string) => Promise<{ ok: true; status: SanmonStatus } | { ok: false; message?: string }>;
  fetchModes: GateDeps['fetchModes'];
  spend: GateDeps['spend'];
  /** 平日モードで閉じた出撃を押した（先生の PRISM に「押した回数」。サーバは3分に1回だけ残す） */
  reportLockHit: (studentId: string) => Promise<void>;
}

const realService: PortalService = {
  configured: () => isPortalConfigured,
  student: () => getStudent(),
  fetchStatus: (id) => fetchSanmonStatus(PORTAL, id),
  fetchModes: (id) => fetchSanmonModes(PORTAL, id),
  spend: (id, ev, amount, reason) => spendStamina(PORTAL, id, ev, amount, reason),
  reportLockHit: (id) => reportLockHit(PORTAL, id, CATWARS_MODE_KEY),
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
/** 遊んでいる とちゅうで閉じたときの文（名乗っている子だけ。開いていれば null） */
export function playingLock(modes: SanmonModes | null): string | null {
  return usePortalStore.getState().student ? closedWhilePlayingMessage(modes) : null;
}

/** 閉じた出撃ボタンを押した：平日モード（授業の時間）で閉じているときだけ サーバに残す（SANMON の reportLock と同じ） */
export function reportSortieLock(): void {
  const { student, modes } = usePortalStore.getState();
  if (student && isSchoolHoursLocked(modes, CATWARS_MODE_KEY)) void service.reportLockHit(student.studentId).catch(() => { /* noop */ });
}

/** 戦闘が おわった（勝ち・負け・とちゅうで もどった）：記録を まとめて送る・セーブを しまう */
export function afterBattle(): void {
  syncAnswersSoon();
  setTimeout(() => { void saveSync.pushSave(); }, 1000);
}

/** サーバの セーブを見て、新しければ 取りこんで 読みなおす。新しくなければ この端末の セーブを送る */
async function pullThenPush(): Promise<void> {
  if (await saveSync.pullSaveIfNewer()) { window.location.reload(); return; }
  void saveSync.pushSave();
}

let started = false;
/** アプリの いちばん上で1回だけ呼ぶ（CatWars.tsx） */
export function usePortalLifecycle(): void {
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshPortal();
    // 記録とセーブ（CW-5b。名乗っているときだけ動く。SANMON の App.tsx と同じ間のあけ方）
    void pullThenPush();
    syncAnswersSoon();
    const unsub = subscribeStudent(() => { void refreshPortal(); void pullThenPush(); syncAnswersSoon(); });
    const onVis = () => {
      if (document.hidden) { void syncAnswersNow(); void saveSync.pushSave(); return; }
      void refreshPortal();
      void saveSync.pullSaveIfNewer().then((pulled) => { if (pulled) window.location.reload(); });
    };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (!document.hidden) void refreshModes(); }, 120_000);
    const saveIv = setInterval(() => { void saveSync.pushSave(); }, 60_000);
    // 問題を解いたら 10秒あとに セーブを送る（そのあいだに解いたら まちなおす）
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubStudy = useStudyStore.subscribe(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; void saveSync.pushSave(); }, 10_000);
    });
    return () => {
      started = false; unsub(); unsubStudy(); document.removeEventListener('visibilitychange', onVis);
      clearInterval(t); clearInterval(saveIv); if (saveTimer) clearTimeout(saveTimer);
    };
  }, []);
}

export const usePortal = usePortalStore;

// 開発のときだけ：画面の確かめ（Playwright）で サーバを差しかえる。本番のビルドには入らない。
//   window.__cwPortalMock({ student, status, modes, spend: 'ok' | 'short' | 'offline' | 'closed' })
//   window.__cwPortalSetModes(modes) … 2分ごとの読みなおしで モードが変わった ことにする（とちゅうで閉じる の確かめ）
//   記録とセーブ（answerSync／saveSync）は kit の名乗り（getStudent）を見るので、差しかえても 本番のサーバには 何も送らない
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cwPortalMock?: (o: {
    student?: StudentIdentity; status?: SanmonStatus; modes?: SanmonModes; spend?: 'ok' | 'short' | 'offline' | 'closed';
  }) => Promise<void> }).__cwPortalMock = async (o) => {
    const student = o.student ?? { studentId: 'dev-student', joinCode: 'DEV', number: 1 };
    let status: SanmonStatus = o.status ?? { stamina: 0, towns: {}, earnedToday: 0, apps: {} };
    let modes: SanmonModes = o.modes ?? { catwars: true };
    (window as unknown as { __cwPortalSetModes?: (m: SanmonModes) => void }).__cwPortalSetModes = (m) => {
      modes = m;
      usePortalStore.setState({ modes: m });
    };
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
      reportLockHit: async () => { console.info('[mock] reportLockHit catwars'); },
    };
    await refreshPortal();
  };
}
