/**
 * CAT-WARS の セーブを サーバ（表 catwars_save。kit の saveCatwarsSave／loadCatwarsSave）に しまう・取りこむ（CW-5b・2026-11-16）。
 * SANMON の services/portal.ts の pushSave／pullSaveIfNewer と同じ考え方：
 *   - **名乗っているときだけ**（おためし・体験版・つないでいないビルドは 送らない・取りこまない）。
 *   - 送るのは 中身が変わったときだけ。最後に送れた（または取りこんだ）中身の目印（短いハッシュ）を 端末に のこして くらべる
 *     （SAVE_KEYS.sentHash。学級／おためし の入れかえの対象）。読みなおしても・取りこんだ直後も 同じ中身は 送らない。
 *     目印は stores だけから作る（送るたびに変わる savedAt は 入れない）。
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
import { SAVE_KEYS } from './saveKeys';

/** セーブの中身（stores）の目印。FNV-1a 32bit を2本（短い。かぶりにくい）＋長さ */
export function saveHash(stores: unknown): string {
  const s = JSON.stringify(stores ?? null);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}-${s.length.toString(36)}`;
}

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
  let checkingRemote = false;
  let pushing: Promise<boolean> | null = null;

  const sid = () => (deps.configured() ? deps.studentId() : null);
  const localAt = (): number => { try { return Number(store()?.getItem(SAVED_AT_KEY) ?? 0) || 0; } catch { return 0; } };
  const setLocalAt = (t: number) => { try { store()?.setItem(SAVED_AT_KEY, String(t)); } catch { /* noop */ } };
  const sentHash = (): string => { try { return store()?.getItem(SAVE_KEYS.sentHash) ?? ''; } catch { return ''; } };
  const setSentHash = (h: string) => { try { store()?.setItem(SAVE_KEYS.sentHash, h); } catch { /* noop */ } };

  /** セーブをサーバへ。中身が変わっていなければ送らない。送れたら true */
  async function pushSave(): Promise<boolean> {
    const s = sid();
    if (!s || checkingRemote) return false;
    if (pushing) return pushing;
    pushing = (async () => {
      const savedAt = now();
      const b = deps.exportBundle(savedAt);
      const hash = saveHash(b.stores);
      if (hash === sentHash()) return false;
      const ok = await deps.save(s, b as unknown as Record<string, unknown>).catch(() => false);
      if (ok) { setSentHash(hash); setLocalAt(savedAt); }
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
      // 目印は 取りこんだあとの いまの中身から作る（ストアの merge で 鍵の順が変わっても 送りかえさない）
      setSentHash(saveHash(deps.exportBundle(remote.savedAt).stores));
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
