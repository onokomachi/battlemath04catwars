/**
 * CAT-WARS の セーブを サーバ（表 catwars_save。kit の saveCatwarsSave／loadCatwarsSave）に しまう・取りこむ（CW-5b・2026-11-16）。
 * SANMON の services/portal.ts の pushSave／pullSaveIfNewer と同じ考え方：
 *   - **名乗っているときだけ**（おためし・体験版・つないでいないビルドは 送らない・取りこまない）。
 *   - 送るのは 中身が変わったときだけ（前に送れた中身と くらべる）。
 *     いつ送るか：問題を解いてから10秒あと・1分ごと・タブを かくしたとき・名乗ったとき（サーバの方が新しくなければ）。
 *   - 取りこむのは サーバの方が新しいとき（サーバの savedAt ＞ この端末が 最後に送った／取りこんだ時刻 catwars_portal_saved_at）。
 *     取りこんだら 画面を読みなおす。いつ見るか：名乗ったとき・タブに もどったとき。
 *   - サーバを見ているあいだは 送らない（古いセーブで 新しいセーブを上書きしないため。SANMON の 2026-11-12 のバグ直しと同じ）。
 * 2台で同時に遊んだとき：**最後にサーバへ送った方が勝つ**（savedAt は送った端末の時計）。
 *   もう1台は、タブに もどったときに サーバの方が新しければ それを取りこむ（その端末で まだ送っていなかった分は なくなる）。
 *   どちらも開きっぱなしで遊びつづけると、1分ごとに 送った方が上書きしあう（SANMON と同じ。docs/PORTAL.md）。
 * 中身は saveBundle.ts の SaveBundle（{ v, savedAt, stores }）。サーバは 64KB まで。めやす 6KB。
 * サーバとのやりとりは deps で差しかえられる（scripts/portalTest.ts）。
 */
import { getStudent } from 'learning-app-kit/sync';
import { loadCatwarsSave, saveCatwarsSave } from 'learning-app-kit/sanmon';
import { PORTAL, isPortalConfigured } from './config';
import { exportBundle, importBundle, SAVE_BUNDLE_VERSION, type SaveBundle } from './saveBundle';
import { SAVED_AT_KEY, type KV } from './saveProfile';

export interface SaveSyncDeps {
  configured: () => boolean;
  studentId: () => string | null;
  load: (studentId: string) => Promise<{ ok: true; data: Record<string, unknown> | null } | { ok: false }>;
  save: (studentId: string, data: Record<string, unknown>) => Promise<boolean>;
  /** いまの セーブ（saveBundle の exportBundle） */
  exportBundle: (now: number) => SaveBundle;
  /** サーバの セーブを ストアに もどす（saveBundle の importBundle） */
  importBundle: (raw: unknown) => boolean;
  store?: () => KV | null;
  now?: () => number;
}

export function createSaveSync(deps: SaveSyncDeps) {
  const store = () => (deps.store ? deps.store() : (typeof localStorage === 'undefined' ? null : localStorage));
  const now = deps.now ?? Date.now;
  let lastSent = '';
  let checkingRemote = false;
  let pushing: Promise<boolean> | null = null;

  const sid = () => (deps.configured() ? deps.studentId() : null);
  const localAt = (): number => { try { return Number(store()?.getItem(SAVED_AT_KEY) ?? 0) || 0; } catch { return 0; } };
  const setLocalAt = (t: number) => { try { store()?.setItem(SAVED_AT_KEY, String(t)); } catch { /* noop */ } };

  /** セーブをサーバへ。中身が変わっていなければ送らない。送れたら true */
  async function pushSave(): Promise<boolean> {
    const s = sid();
    if (!s || checkingRemote) return false;
    if (pushing) return pushing;
    pushing = (async () => {
      const savedAt = now();
      const b = deps.exportBundle(savedAt);
      const body = JSON.stringify(b.stores);
      if (body === lastSent) return false;
      const ok = await deps.save(s, b as unknown as Record<string, unknown>).catch(() => false);
      if (ok) { lastSent = body; setLocalAt(savedAt); }
      return ok;
    })().finally(() => { pushing = null; });
    return pushing;
  }

  /** サーバのセーブが この端末より新しければ取りこむ（取りこんだら true。画面を読みなおす） */
  async function pullSaveIfNewer(): Promise<boolean> {
    const s = sid();
    if (!s) return false;
    checkingRemote = true;
    try {
      if (pushing) await pushing.catch(() => false);
      const r = await deps.load(s).catch(() => ({ ok: false as const }));
      if (!r.ok || !r.data) return false;
      const remote = r.data as Partial<SaveBundle>;
      if (remote.v !== SAVE_BUNDLE_VERSION || typeof remote.savedAt !== 'number' || remote.savedAt <= localAt()) return false;
      if (!deps.importBundle(remote)) return false;
      setLocalAt(remote.savedAt);
      lastSent = JSON.stringify(remote.stores);
      return true;
    } finally {
      checkingRemote = false;
    }
  }

  return { pushSave, pullSaveIfNewer, localAt };
}

export const saveSync = createSaveSync({
  configured: () => isPortalConfigured,
  studentId: () => getStudent()?.studentId ?? null,
  load: (id) => loadCatwarsSave(PORTAL, id),
  save: (id, data) => saveCatwarsSave(PORTAL, id, data),
  exportBundle,
  importBundle,
});
