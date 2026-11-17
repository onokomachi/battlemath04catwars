/**
 * CAT-WARS の セーブ（zustand の persist）の localStorage の鍵。**ここ1か所だけに書く**（CW-5a）。
 *
 * ストアは `persist(..., { name: SAVE_KEYS.xxx })` で ここを読む。
 * 学級／おためし の入れかえ（portal/saveProfile.ts）と、サーバに送るセーブのまとめ（portal/saveBundle.ts）も ここを読む。
 * ストアを足したら ここにも足す（`npm run test:portal` が、persist のあるストアの鍵が ぜんぶ ここに あるかを見る）。
 * ストアではない鍵（送れていない記録）は NON_STORE_KEYS にも書く。
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
  /** 週がわりの遠征の 自分の星・ごほうびを もらった週（CW-6a。store/useExpeditionStore.ts） */
  expedition: 'catwars-expedition-v1',
  /** なかまの 基地を 攻めた 自分の記録（きょうの星・💠を もらった日。CW-6b。store/useFriendStore.ts）。サーバのセーブに入る */
  friend: 'catwars-friend-v1',
  /** 学級ポータルへ まだ送れていない 1問の記録（直近500件。portal/outbox.ts）。ストアではない・サーバのセーブには入れない */
  outbox: 'catwars-portal-outbox',
  /**
   * 最後に サーバへ送った（または サーバから取りこんだ）セーブの中身の目印（短いハッシュ。portal/saveSync.ts）。
   * 同じ中身なら 送らない（アプリを開くたび・取りこんだ直後に 送りなおさない）。ストアではない・サーバのセーブには入れない
   */
  sentHash: 'catwars_portal_sent_hash',
} as const;

/** ストアではない鍵（学級／おためし の入れかえには入るが、サーバに送るセーブ＝saveBundle には入れない） */
export const NON_STORE_KEYS = ['outbox', 'sentHash'] as const;

/** zustand の persist で しまっている ストアの id（saveBundle が まとめる） */
export type SaveStoreId = Exclude<keyof typeof SAVE_KEYS, (typeof NON_STORE_KEYS)[number]>;
export const STORE_IDS = (Object.keys(SAVE_KEYS) as (keyof typeof SAVE_KEYS)[])
  .filter((k): k is SaveStoreId => !(NON_STORE_KEYS as readonly string[]).includes(k));

export const SAVE_KEY_LIST: readonly string[] = Object.values(SAVE_KEYS);
