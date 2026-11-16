/**
 * 学級コードを入れているとき（学級）と、入れていないとき（おためし）で セーブを分ける（CW-5a・2026-11-16）。
 * SANMON の services/saveProfile.ts と同じ やり方（2026-10-24 先生と決めた きまり）：
 *   ・おためしでも 全部あそべる。スタミナは使わない。記録・セーブは サーバに送らない。
 *   ・おためしの進み具合（ネコのレベル・💠・施設・収集）は、学級コードを入れても引きつがない
 *     （おためしは スタミナも サーバのかけら も ないので、引きつぐと すりぬけになる）。
 *
 * しくみ：CAT-WARS の セーブ（portal/saveKeys.ts の鍵 ぜんぶ）を、いま使っていない側の分だけ
 * ひとつにまとめて しまっておく（catwars_profile_class／catwars_profile_trial）。学級コードを入れた・消したら入れかえて、画面を読みなおす。
 *
 * ストア（zustand の persist）は 読みこんだ時点で localStorage を読むので、index.tsx で いちばん先に読みこむこと。
 *
 * デモモード（CW-5c・2026-11-16。SANMON と同じ：学級コード 0000・番号 0 ＋先生のパスワード＝サーバの verify_demo）は 3つ目のセーブ 'demo'。
 * アプリの紹介用で、名乗らない・記録もセーブも送らない・スタミナを使わない・モードの鍵を見ない。学級・おためしのセーブとは まざらない
 * （しまう先は catwars_profile_demo）。はじめて入ったときの中身（💠・ネコのレベル）は portal/demo.ts。
 */
import { clearStudent, getStudent, subscribeStudent, isTrial as isTrialTab } from 'learning-app-kit/sync';
import { SAVE_KEY_LIST } from './saveKeys';
import { DEMO_KEY, demoFlag, isDemo } from './demoMode';

export { DEMO_KEY, demoFlag, isDemo };

export type SaveProfile = 'class' | 'trial' | 'demo';

/** localStorage と同じ形（試験で差しかえる） */
export interface KV {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const ACTIVE_KEY = 'catwars_active_profile';
export const stashKey = (p: SaveProfile) => `catwars_profile_${p}`;
/** 入れかえる中身：CAT-WARS の セーブの鍵 ぜんぶ（portal/saveKeys.ts）＋ サーバに送った時刻（CW-5b で使う） */
export const SAVED_AT_KEY = 'catwars_portal_saved_at';
export const isProfileKey = (k: string) => SAVE_KEY_LIST.includes(k) || k === SAVED_AT_KEY;

const ls = (): KV | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };


/** いまの名乗り・デモから、使う側を決める（名乗っていれば 学級。デモは 名乗っていないときだけ） */
export const profileFor = (hasStudent: boolean, demo: boolean = isDemo()): SaveProfile =>
  (hasStudent ? 'class' : demo ? 'demo' : 'trial');

export function activeProfile(store: KV | null = ls()): SaveProfile {
  try {
    const v = store?.getItem(ACTIVE_KEY);
    return v === 'trial' || v === 'demo' ? v : 'class';
  } catch { return 'class'; }
}

/**
 * want の セーブを使う形にする。入れかえたら true。
 * はじめて動くとき（ACTIVE_KEY が無い）は、いま端末にある中身を want のものとみなして、何も動かさない。
 * しまう途中で書けなかったら（容量いっぱい など）、何も消さずに やめる（記録を なくさないため）。
 */
export function ensureProfile(want: SaveProfile, store: KV | null = ls()): boolean {
  if (!store) return false;
  try {
    const cur = store.getItem(ACTIVE_KEY);
    if (cur === null) { store.setItem(ACTIVE_KEY, want); return false; }
    if (cur === want) return false;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && isProfileKey(k)) keys.push(k);
    }
    const mine: Record<string, string> = {};
    for (const k of keys) mine[k] = store.getItem(k) ?? '';
    store.setItem(stashKey(cur as SaveProfile), JSON.stringify(mine));
    for (const k of keys) store.removeItem(k);
    const raw = store.getItem(stashKey(want));
    if (raw) {
      const other = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(other)) if (isProfileKey(k)) store.setItem(k, v);
      store.removeItem(stashKey(want));
    }
    store.setItem(ACTIVE_KEY, want);
    return true;
  } catch {
    return false;
  }
}

/** おためし中か（学級コードが入っていない・体験版のタブ） */
export const isOtameshi = (): boolean => !getStudent();

/** kit が名乗りを覚えるキー（体験中は getStudent() が null を返すので、直接見る） */
const KIT_STUDENT_KEY = 'lak_student_v1';

/**
 * 学級コードが入っている端末で、体験のリンク（SOL の #trial）から開いたか。SANMON と同じ あつかい：このタブでは遊ばせない。
 * 体験のタブで おためしのセーブに入れかえると、同じ端末で開いている ふつうのタブと localStorage を取りあって、
 * 学級のセーブ（ネコのレベル・施設・収集）を こわすおそれがあるため。
 */
export function trialOnClassDeviceFor(trialTab: boolean, store: KV | null = ls()): boolean {
  if (!trialTab || !store) return false;
  try { return !!store.getItem(KIT_STUDENT_KEY) && activeProfile(store) === 'class'; } catch { return false; }
}
export const trialOnClassDevice = (): boolean => trialOnClassDeviceFor(isTrialTab());

/**
 * デモモードの端末で、体験のリンクから開いたか（CW-5c）。学級の端末と同じ理由で このタブでは遊ばせない
 * （体験のタブで おためしのセーブに入れかえると、ひらいている デモのタブと localStorage を取りあう）。
 */
export function trialOnDemoDeviceFor(trialTab: boolean, store: KV | null = ls()): boolean {
  if (!trialTab || !store) return false;
  return demoFlag(store) && activeProfile(store) === 'demo';
}
export const trialOnDemoDevice = (): boolean => trialOnDemoDeviceFor(isTrialTab());
/** 体験のタブで遊ばせない端末か（学級コードが入っている・デモモード） */
export const trialBlocked = (): boolean => trialOnClassDevice() || trialOnDemoDevice();

/**
 * デモモードに入る（名乗りを消して、デモのセーブで読みなおす）。先生のパスワードは kit の JoinForm が確かめたあと（verify_demo）。
 * SANMON の enterDemo と同じ。reload は試験で差しかえる。
 */
export function enterDemoWith(store: KV | null, reload: () => void, hasStudent: () => boolean = () => !!getStudent(), clear: () => void = clearStudent): void {
  if (!store) return;
  try { store.setItem(DEMO_KEY, '1'); } catch { return; }
  if (hasStudent()) clear();             // 記録が送られないように（clearStudent の通知でも入れかわる）
  ensureProfile('demo', store);
  reload();
}
/** デモモードを おわる（おためしのセーブにもどる） */
export function exitDemoWith(store: KV | null, reload: () => void, hasStudent: () => boolean = () => !!getStudent()): void {
  if (!store) return;
  try { store.removeItem(DEMO_KEY); } catch { /* noop */ }
  ensureProfile(profileFor(hasStudent(), false), store);
  reload();
}
export const enterDemo = (): void => enterDemoWith(ls(), () => window.location.reload());
export const exitDemo = (): void => exitDemoWith(ls(), () => window.location.reload());

// 読みこんだ時点で、いまの名乗り・デモに合わせる（ストアが localStorage を読む前）。学級・デモの端末の体験タブでは 何も動かさない
if (typeof window !== 'undefined' && !trialBlocked()) ensureProfile(profileFor(!!getStudent()));

// 学級コードを入れた・消したら、セーブを入れかえて 読みなおす
if (typeof window !== 'undefined') {
  subscribeStudent((s) => {
    if (trialBlocked()) return;
    // デモ中に学級コードを入れたら、デモは おわり（学級のセーブにする。SANMON と同じ）
    if (s && demoFlag()) { try { localStorage.removeItem(DEMO_KEY); } catch { /* noop */ } }
    if (ensureProfile(profileFor(!!s))) window.location.reload();
  });
}
