/**
 * 学級ポータル（Supabase gakkyu-portal）の つなぎ先と、CAT-WARS の きまりの名前（CW-5a・2026-11-16）。
 *
 * - 環境変数は SANMON と同じ名前（`VITE_SUPABASE_URL`／`VITE_SUPABASE_PUBLISHABLE_KEY`。publishable キーだけ）。
 *   値が無いビルドは「つないでいない」：名乗り・スタミナ・サーバのかけら は動かず、今までどおり おためしで全部あそべる。
 * - キーの値は どのファイルにも書かない（Vercel の環境変数だけ）。
 */
import type { SanmonModeKey } from 'learning-app-kit/sanmon';

const env = ((import.meta as { env?: Record<string, string | undefined> }).env) ?? {};

export const PORTAL = {
  supabaseUrl: env.VITE_SUPABASE_URL,
  supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
export const isPortalConfigured = !!(PORTAL.supabaseUrl && PORTAL.supabaseKey);

/**
 * CAT-WARS の出撃が したがう モードの鍵（CW-5b・2026-11-16〜 CAT-WARS 専用の 'catwars'）。
 * 先生が PRISM の SANMON タブで学級ごとに開ける。**はじめは閉じている**（kit の SANMON_MODES_DEFAULT_CLOSED。サーバも書いていなければ false）。
 * 平日モード（SCHOOL_HOURS_MODES に入っている）・番号ごとの停止も効く。サーバの sanmon_spend も reason の 'catwars' を この鍵で確かめる。
 * サーバの SQL（PRISM supabase/sql/2026-11-16-catwars-*.sql）を流す前は、サーバが catwars を返さないので kit の isModeOpen で閉じて見える。
 */
export const CATWARS_MODE_KEY: SanmonModeKey = 'catwars';

/** スタミナを使うときの reason の前の部分（後ろに「@町の key」を付ける） */
export const CATWARS_SPEND_REASON = 'catwars';
