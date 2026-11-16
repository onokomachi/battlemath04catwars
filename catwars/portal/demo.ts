/**
 * デモモードの中身（CW-5c・2026-11-16）。紹介用なので、はじめから中身が見せられる状態にする。
 *   - 全部の章と 3つの段を えらべる（store/useCampaignStore.ts の isUnlocked・isTierUnlocked が isDemo を見る）
 *   - かけらは 全単元 8（レベルの上限 60・スキルが ぜんぶ開いて見える。learn/shards.ts の入口に サーバの数として わたす）
 *   - はじめて デモに入ったとき：💠 9999・ネコは 全系統 Lv20（**デモのセーブにだけ**。学級・おためしのセーブには さわらない）
 * デモのセーブは 'demo' の側（portal/saveProfile.ts）にあるので、ここで書きかえても 学級・おためしとは まざらない。
 */
import { SANMON_UNITS } from 'learning-app-kit/sanmon';
import { isDemo } from './demoMode';
import { activeProfile, type KV } from './saveProfile';
import { usePlayerStore } from '../store/usePlayerStore';
import { useArmyStore } from '../store/useArmyStore';
import { CHARACTERS } from '../data/characters';
import { MAX_SHARDS, setServerShards } from '../learn/shards';

/** はじめて入ったときの 💠 */
export const DEMO_CREDITS = 9999;
/** はじめて入ったときの ネコの レベル（全系統） */
export const DEMO_LEVEL = 20;
/** はじめの中身を入れた しるし（デモのセーブの側に入れる鍵ではない。デモを おわっても のこる＝つぎに入っても 入れなおさない） */
export const DEMO_SEEDED_KEY = 'catwars_demo_seeded_v1';

/** デモの かけら（全単元 8） */
export function demoShards(): Record<string, number> {
  return Object.fromEntries(SANMON_UNITS.map((u) => [u.key, MAX_SHARDS]));
}

/** デモのとき かけらを 8 に（名乗っていないので サーバの かけらは無い） */
export function applyDemoShards(): boolean {
  if (!isDemo()) return false;
  setServerShards(demoShards());
  return true;
}

/**
 * はじめて デモに入ったとき（いまの側が 'demo' で、まだ入れていない）だけ、💠 と ネコのレベルを入れる。入れたら true。
 * 'demo' の側でないとき（学級・おためし）は 何もしない。
 */
export function seedDemoOnce(store: KV | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!store || !isDemo() || activeProfile(store) !== 'demo') return false;
  try { if (store.getItem(DEMO_SEEDED_KEY) === '1') return false; } catch { return false; }
  usePlayerStore.setState((s) => ({ resources: { ...s.resources, gold: Math.max(s.resources.gold, DEMO_CREDITS) } }));
  useArmyStore.setState((s) => {
    const army = { ...s.army };
    for (const c of CHARACTERS) {
      const e = army[c.id] ?? { level: 1, xp: 0, totalBattles: 0 };
      army[c.id] = { ...e, level: Math.max(e.level, DEMO_LEVEL), xp: 0 };
    }
    return { army };
  });
  try { store.setItem(DEMO_SEEDED_KEY, '1'); } catch { /* noop */ }
  return true;
}
