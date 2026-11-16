/**
 * CAT-WARS の セーブ（zustand の persist）の localStorage の鍵。**ここ1か所だけに書く**（CW-5a）。
 *
 * ストアは `persist(..., { name: SAVE_KEYS.xxx })` で ここを読む。
 * 学級／おためし の入れかえ（portal/saveProfile.ts）と、サーバに送るセーブのまとめ（portal/saveBundle.ts）も ここを読む。
 * ストアを足したら ここにも足す（`npm run test:portal` が、persist のあるストアの鍵が ぜんぶ ここに あるかを見る）。
 */
export const SAVE_KEYS = {
  player: 'neo-academia-player',
  progress: 'neo-academia-progress',
  army: 'neo-academia-army',
  base: 'catwars-base-v2',
  campaign: 'catwars-campaign',
  study: 'catwars-study',
  review: 'catwars-review',
  skillsSeen: 'catwars-skills-seen',
  collection: 'catwars-collection-v1',
} as const;

export type SaveStoreId = keyof typeof SAVE_KEYS;

export const SAVE_KEY_LIST: readonly string[] = Object.values(SAVE_KEYS);
