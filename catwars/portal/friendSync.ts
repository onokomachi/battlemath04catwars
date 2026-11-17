/**
 * なかまの 基地 と サーバ（CW-6b・2026-11-17）。サーバの SQL は PRISM の supabase/sql/2026-11-17-catwars-base.sql。
 *
 * - `catwars_base_put(p_student_id, p_data)`：自分の 基地の配置（baseShape.ts の FriendBaseWire。めやす 0.4KB・上限 2KB）を しまう。
 *   **名乗っているときだけ**（おためし・体験版・デモ・つないでいないビルドは 送らない）。**陣地づくりで 配置を かえたときだけ**
 *   （おいてから 20秒あと・前に送ってから 30秒いじょう あけて・中身が 前と同じなら 送らない・陣地づくりを出るとき・タブを かくしたとき）。
 *   コアのほかに 1つも 置いていない基地は 見せない。
 *   ほかの子の端末で 起きた 変更を 取りこむ前の 古い配置を 送らないよう、**送るのは この端末で 配置を かえたとき**だけ（名乗ったときなどには 送らない）。
 * - `catwars_base_offers(p_student_id)`：**同じ学級の なかま**の 基地を 3つまで（自分は 入らない・その日ごとに 決まった組みあわせと順。
 *   サーバの時計の日づけと 自分の番号から 決める）。返すのは 日づけと 配置だけ。**student_id・番号・名前は 返さない**。
 *   どの枠が だれかは 分からない（枠 A・B・C は その日の ならび順）。
 * - 攻めたことは サーバに 残さない（攻められた なかまには 何も 伝わらない）。読むだけ。
 * kit は使わず（版を上げずに すむように）、遠征と同じ rpc の fetch で呼ぶ。SQL を流す前は ことわられる → 遊びは止めない（みほんの 基地で あそべる）。
 */
import { create } from 'zustand';
import { getStudent } from 'learning-app-kit/sync';
import { isPortalConfigured } from './config';
import { isDemo } from './demoMode';
import { realRpc, type Rpc } from './expeditionSync';
import { useBaseStore } from '../store/useBaseStore';
import { encodeFriendBase, sanitizeFriendBase, shareable, type FriendBase } from '../friend/baseShape';
import { jstDateOf } from '../friend/friendAttack';

/** 配置を かえてから 送るまで（かえつづけているあいだは のばす） */
export const SHARE_DEBOUNCE_MS = 20_000;
/** 送ってから 次に 送るまで 最低 これだけ あける */
export const SHARE_MIN_INTERVAL_MS = 30_000;

let rpc: Rpc = realRpc;
let configured = (): boolean => isPortalConfigured;
let studentOf = (): string | null => getStudent()?.studentId ?? null;
/** 試験・開発の差しかえ（null で もとにもどす） */
export function __setFriendRpc(r: Rpc | null, student?: () => string | null): void {
  rpc = r ?? realRpc;
  configured = r ? () => true : () => isPortalConfigured;
  studentOf = student ?? (() => getStudent()?.studentId ?? null);
  resetShareState();
}

/** 名乗っているか（おためし・体験版・デモ・つないでいないビルドは null） */
const studentId = (): string | null => (configured() && !isDemo() ? studentOf() : null);
export const friendNamed = (): boolean => studentId() !== null;

// ── 自分の基地を しまう ───────────────────────────────
let dirtyChapter: string | null = null;
/** 配置を かえたときに 名乗っていた子（同じ端末で 番号を かえても 前の子の配置を あたらしい子の行に 書かない） */
let dirtyFor: string | null = null;
let lastSentHash: string | null = null;
let lastSentAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let now = (): number => Date.now();
export function __setFriendClock(f: (() => number) | null): void { now = f ?? (() => Date.now()); }
export function resetShareState(): void {
  dirtyChapter = null; dirtyFor = null; lastSentHash = null; lastSentAt = 0; sending = false;
  if (timer) { clearTimeout(timer); timer = null; }
}

/** いま 見せる 基地（最後に 配置を かえた 章の 配置）。見せられない（コアのほかに 何も無い）ときは null */
export function currentShareData(chapterId: string | null = dirtyChapter) {
  if (!chapterId) return null;
  const st = useBaseStore.getState();
  const w = encodeFriendBase(st.getLayout(chapterId), (t) => st.levelOf(t));
  return shareable(w) ? w : null;
}

/** 陣地づくりで 配置を かえた（BaseBuilder の save から呼ぶ）。名乗っていなければ 何もしない */
export function noteLayoutEdited(chapterId: string): void {
  const id = studentId();
  if (!id) return;
  dirtyChapter = chapterId; dirtyFor = id;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void flushShare(); }, SHARE_DEBOUNCE_MS);
}

/**
 * しまう（かえたときだけ）。force＝陣地づくりを出る・タブを かくす（間の下限は まもる＝30秒いないに 送ったばかりなら あとで）。
 * 送れたら true。送らなかった（かわっていない・見せられない・間が近い・つながらない）ときは false
 */
export async function flushShare(): Promise<boolean> {
  const id = studentId();
  if (!id || dirtyChapter === null || sending) return false;
  if (dirtyFor !== id) { dirtyChapter = null; dirtyFor = null; return false; }
  const data = currentShareData();
  if (!data) { dirtyChapter = null; return false; }
  const hash = JSON.stringify(data);
  if (hash === lastSentHash) { dirtyChapter = null; return false; }
  const wait = lastSentAt + SHARE_MIN_INTERVAL_MS - now();
  if (wait > 0) {
    if (!timer) timer = setTimeout(() => { timer = null; void flushShare(); }, wait + 50);
    return false;
  }
  sending = true;
  try {
    const r = await rpc<unknown>('catwars_base_put', { p_student_id: id, p_data: data });
    if (!r.ok) return false;
    lastSentHash = hash; lastSentAt = now(); dirtyChapter = null;
    return true;
  } finally {
    sending = false;
  }
}

// ── なかまの 基地を 読む ───────────────────────────────
export interface FriendOffers {
  /** サーバの日づけ（日本時間 'YYYY-MM-DD'）。名乗っていない・読めないときは 端末の日づけ */
  day: string;
  /** 見なおしずみの なかまの 基地（枠 A から 順。0〜3つ） */
  real: FriendBase[];
}
interface OffersState { status: 'idle' | 'loading' | 'ready' | 'error'; data: FriendOffers | null; error: string | null }
export const useFriendOffers = create<OffersState>()(() => ({ status: 'idle', data: null, error: null }));

/** サーバの形 → 画面の形（なかまの 基地いがいの ものは すてる。信用しない） */
export function parseOffers(raw: unknown): FriendOffers | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const list = Array.isArray(r.bases) ? r.bases : [];
  const real: FriendBase[] = [];
  // 見なおしを とおったものを 3つまで（こわれたものは とばして 次を見る）
  for (const e of list.slice(0, 8)) {
    const b = sanitizeFriendBase(e);
    if (b) real.push(b);
    if (real.length >= 3) break;
  }
  return { day: r.day, real };
}

/** その日の なかまの 基地を 読む。名乗っていなければ 読まない（みほんだけ。端末の日づけ） */
export async function loadFriendOffers(): Promise<FriendOffers> {
  const local: FriendOffers = { day: jstDateOf(now()), real: [] };
  const id = studentId();
  if (!id) { useFriendOffers.setState({ status: 'ready', data: local, error: null }); return local; }
  useFriendOffers.setState({ status: 'loading', error: null });
  const r = await rpc<unknown>('catwars_base_offers', { p_student_id: id });
  if (r.ok === false) {
    // つながらない・SQL を流す前：みほんで あそべる（日づけは 端末）
    useFriendOffers.setState({ status: 'error', data: local, error: r.message });
    return local;
  }
  const parsed = parseOffers(r.data);
  if (!parsed) { useFriendOffers.setState({ status: 'error', data: local, error: 'よみこめない' }); return local; }
  useFriendOffers.setState({ status: 'ready', data: parsed, error: null });
  return parsed;
}

// タブを かくすとき：かえた基地が あれば しまう（間の下限は まもる）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushShare(); });
}

// 開発のときだけ：画面の確かめ（Playwright）で サーバを差しかえる（本番のビルドには入らない）。
//   window.__cwFriendMock({ count: 2 })  … 同じ学級の なかまの 基地が 2つ（残りは みほん）。送ったものは window.__cwFriendCalls に のこる
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as { __cwFriendMock?: (o: { count?: number; fail?: boolean; student?: string | null }) => void }).__cwFriendMock = (o) => {
    const calls: { fn: string; body: unknown }[] = [];
    (window as unknown as { __cwFriendCalls?: unknown }).__cwFriendCalls = calls;
    import('../friend/samples').then(({ SAMPLE_BASES }) => {
      __setFriendRpc(async <T,>(fn: string, body: unknown) => {
        calls.push({ fn, body });
        if (o.fail) return { ok: false as const, message: '(404)' };
        if (fn === 'catwars_base_offers') {
          // サーバが 返すのは 配置だけ（id・番号は 無い）
          const bases = SAMPLE_BASES.slice(3, 3 + Math.min(3, o.count ?? 2)).map((s) => s.wire);
          return { ok: true as const, data: { day: jstDateOf(now()), bases } as T };
        }
        return { ok: true as const, data: true as T };
      }, () => (o.student === null ? null : (o.student ?? 'dev-student')));
    });
  };
}
