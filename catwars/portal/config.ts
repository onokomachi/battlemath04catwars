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
 * CAT-WARS の出撃が したがう モードの鍵。
 * いまは CAT-WARS 専用の鍵が サーバに無いので、SANMON の「ぼうけん」の鍵にしたがう（先生の開け閉め・平日モード・番号ごとの停止）。
 * サーバの sanmon_spend も、reason の 'catwars' を「ぼうけん」として あつかう（'speed_duel'／'monster_duel' 以外は adventure）。
 * CW-5b で サーバに 'catwars' を足したら、ここを 'catwars' にする（docs/CW5B_SERVER_PLAN.md）。
 */
export const CATWARS_MODE_KEY: SanmonModeKey = 'adventure';

/** スタミナを使うときの reason の前の部分（後ろに「@町の key」を付ける） */
export const CATWARS_SPEND_REASON = 'catwars';
