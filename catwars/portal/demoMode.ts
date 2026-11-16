/**
 * デモモードの しるし（CW-5c・2026-11-16）。ストアや画面からも読むので、副作用の無い小さなファイルに分けた
 * （portal/saveProfile.ts は 読みこんだ時点で セーブを入れかえるため）。
 *
 * デモモード：学級コード 0000・番号 0 ＋先生のパスワード（サーバの verify_demo。SANMON と同じ入り方）。アプリの紹介用。
 * 名乗らない・記録もセーブも送らない・スタミナを使わない・モードの鍵を見ない・セーブは3つ目の 'demo'。
 * 中身が見せられるよう：全部の章と3つの段をえらべる・かけらは全単元 8・はじめて入ったとき 💠9999・ネコは全系統 Lv20（portal/demo.ts）。
 */
import { isTrial as isTrialTab } from 'learning-app-kit/sync';

/** デモモードの しるし（端末に のこる。「デモを おわる」で消す） */
export const DEMO_KEY = 'catwars_demo_v1';

interface KVGet { getItem(k: string): string | null }
const ls = (): KVGet | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** デモの しるしが ついているか（体験のタブかどうかは見ない） */
export function demoFlag(store: KVGet | null = ls()): boolean {
  try { return store?.getItem(DEMO_KEY) === '1'; } catch { return false; }
}

/** デモモード中か（体験のタブでは デモにしない＝体験は体験のまま） */
export const isDemo = (): boolean => demoFlag() && !isTrialTab();
