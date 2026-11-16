/**
 * CAT-WARS の セーブを 1つの JSON に まとめる・もどす・大きさを測る（CW-5a・2026-11-16）。
 *
 * サーバの表 `catwars_save` に入れる（CW-5b。送る・取りこむのは portal/saveSync.ts。kit の saveCatwarsSave／loadCatwarsSave）。
 * - まとめるのは portal/saveKeys.ts の ストア ぜんぶ（鍵と同じ名前。ストアを足したら STORES にも足す＝型で止まる）。
 * - 中身は 各ストアの persist が localStorage に書くものと同じ（partialize のあと・関数はぬく）。収集は exportSave／importSave。
 * - もどすときは 各ストアの merge（こわれた値を すてる）を通す。収集は sanitizeSave。
 * 大きさの めやすは 6KB 以下（4週間ぶん。サーバは 64KB まで）。CW-5b で progress.mastery（使っていない）を消して 15.3KB → 約6KB。
 * 送れていない記録（SAVE_KEYS.outbox）は入れない（STORE_IDS だけ）。
 */
import type { StoreApi } from 'zustand';
import { STORE_IDS, type SaveStoreId } from './saveKeys';
import { usePlayerStore } from '../store/usePlayerStore';
import { useProgressStore } from '../store/useProgressStore';
import { useArmyStore } from '../store/useArmyStore';
import { useBaseStore } from '../store/useBaseStore';
import { useCampaignStore } from '../store/useCampaignStore';
import { useStudyStore } from '../store/useStudyStore';
import { useReviewStore } from '../store/useReviewStore';
import { useSkillStore } from '../store/useSkillStore';
import { useCollectionStore } from '../store/useCollectionStore';

export const SAVE_BUNDLE_VERSION = 1;
/** めやす（これを こえたら 何が大きいかを見る） */
export const SAVE_BUNDLE_TARGET_BYTES = 6 * 1024;

interface PersistApi {
  getOptions: () => { name?: string; partialize?: (s: unknown) => unknown; merge?: (p: unknown, c: unknown) => unknown };
}
type PersistedStore = StoreApi<unknown> & { persist: PersistApi };

/** ストアの id → ストア（SAVE_KEYS と同じ id。足りないと 型で止まる） */
export const STORES: Record<SaveStoreId, PersistedStore> = {
  player: usePlayerStore as unknown as PersistedStore,
  progress: useProgressStore as unknown as PersistedStore,
  army: useArmyStore as unknown as PersistedStore,
  base: useBaseStore as unknown as PersistedStore,
  campaign: useCampaignStore as unknown as PersistedStore,
  study: useStudyStore as unknown as PersistedStore,
  review: useReviewStore as unknown as PersistedStore,
  skillsSeen: useSkillStore as unknown as PersistedStore,
  collection: useCollectionStore as unknown as PersistedStore,
};

export interface SaveBundle {
  v: number;
  savedAt: number;
  stores: Partial<Record<SaveStoreId, unknown>>;
}

const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x ?? null));

function exportOne(id: SaveStoreId): unknown {
  if (id === 'collection') return useCollectionStore.getState().exportSave();
  const st = STORES[id];
  const opt = st.persist.getOptions();
  const s = st.getState();
  return plain(opt.partialize ? opt.partialize(s) : s);
}

/** いまの セーブを 1つに まとめる */
export function exportBundle(now = Date.now()): SaveBundle {
  const stores: SaveBundle['stores'] = {};
  for (const id of STORE_IDS) stores[id] = exportOne(id);
  return { v: SAVE_BUNDLE_VERSION, savedAt: now, stores };
}

/** まとめた セーブを もどす（知らない ストア・こわれた値は すてる）。もどせたら true */
export function importBundle(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const b = raw as Partial<SaveBundle>;
  if (b.v !== SAVE_BUNDLE_VERSION || !b.stores || typeof b.stores !== 'object') return false;
  for (const id of STORE_IDS) {
    const data = (b.stores as Record<string, unknown>)[id];
    if (data === undefined || data === null || typeof data !== 'object') continue;
    if (id === 'collection') { useCollectionStore.getState().importSave(data); continue; }
    const st = STORES[id];
    const opt = st.persist.getOptions();
    const cur = st.getState() as Record<string, unknown>;
    const next = opt.merge ? opt.merge(data, cur) : { ...cur, ...(data as Record<string, unknown>) };
    st.setState(next as never, true as never);
  }
  return true;
}

const bytes = (x: unknown): number => new TextEncoder().encode(JSON.stringify(x)).length;

/** 大きさ（ぜんぶ と ストアごと。バイト） */
export function measureBundle(b: SaveBundle): { total: number; byStore: Record<string, number> } {
  const byStore: Record<string, number> = {};
  for (const [id, v] of Object.entries(b.stores)) byStore[id] = bytes(v);
  return { total: bytes(b), byStore };
}
