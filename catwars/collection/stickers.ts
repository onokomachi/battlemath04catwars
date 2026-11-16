/**
 * シール（カプセル）のきまり（2026-11-16 CW-4c）。docs/REBUILD_SPEC.md §3d。
 *
 * SANMON の「サンスウカプセル」と同じ決まりにそろえる（SANMON の data/adventure/gacha.ts）：
 *   ・回すのは「シールコイン」だけ。コインは学習の成果でしか手に入らない（collection/coins.ts）。お金・💠・⚡では回せない。
 *   ・出る確率を めずらしさごとに画面に出す（下の RARITY_RATE がそのまま％）。
 *   ・10回で天井：9回つづけて「ふつう」だったら、10回めは かならず「レア」いじょう。
 *   ・ダブりは「シールのかけら」になり、ためると すきなシールと こうかんできる（運だけで つまらない）。
 *   ・そろえても特別なごほうびは無い（コンプガチャにしない）。うまり具合を見せるだけ。
 *   ・シールは かざり。強さには ひびかない。
 *
 * 絵はまだ無いので、絵文字・いまあるネコや施設の絵・色のわくで仮に作る。絵ができたら image を差しかえる（docs/ART_LIST.md）。
 * 引く処理（pullCapsule）は 乱数を外から渡す純粋な関数（scripts/collectionTest.ts で天井と確率を確かめる）。
 */

export type StickerRarity = 'normal' | 'rare' | 'super' | 'legend';
export const RARITY_ORDER: StickerRarity[] = ['normal', 'rare', 'super', 'legend'];

/** めずらしさごとの出る確率（％。合計100）。画面にそのまま出す */
export const RARITY_RATE: Record<StickerRarity, number> = { normal: 70, rare: 22, super: 6.5, legend: 1.5 };

export const RARITY_INFO: Record<StickerRarity, { label: string; stars: string; color: string }> = {
  normal: { label: 'ふつう', stars: '★', color: '#94a3b8' },
  rare: { label: 'レア', stars: '★★', color: '#38bdf8' },
  super: { label: 'スーパーレア', stars: '★★★', color: '#c084fc' },
  legend: { label: 'でんせつ', stars: '★★★★', color: '#facc15' },
};

export const CAPSULE_RULES = {
  /** 1回 まわすのに いる シールコイン */
  cost: 8,
  /** この回数までに かならず「レア」いじょうが1まい出る */
  pity: 10,
} as const;

/** ダブったときに もらえる シールのかけら */
export const DUP_FRAGMENTS: Record<StickerRarity, number> = { normal: 1, rare: 3, super: 8, legend: 20 };
/** シールのかけらで こうかんするときの ねだん（まだ持っていないシールだけ） */
export const EXCHANGE_COST: Record<StickerRarity, number> = { normal: 10, rare: 25, super: 60, legend: 120 };

export interface StickerDef {
  id: string;
  name: string;
  rarity: StickerRarity;
  /** 絵が無いときに出す絵文字（絵ができても のこしておく） */
  emoji: string;
  /** 絵（あれば）。あとで docs/ART_LIST.md の絵に差しかえる */
  image?: string;
  /** わくの色 */
  frame: string;
  /** ひとこと（アルバムで見られる） */
  note: string;
  /** 絵に色をかける（敵の色など。仮の絵のとき） */
  tint?: string;
}

const CH = '/assets/sprites/chars';
const SP = '/assets/sprites';

const n = (id: string, name: string, emoji: string, frame: string, note: string, image?: string): StickerDef =>
  ({ id, name, rarity: 'normal', emoji, frame, note, image });
const r = (id: string, name: string, emoji: string, frame: string, note: string, image?: string, tint?: string): StickerDef =>
  ({ id, name, rarity: 'rare', emoji, frame, note, image, tint });
const s = (id: string, name: string, emoji: string, frame: string, note: string, image?: string): StickerDef =>
  ({ id, name, rarity: 'super', emoji, frame, note, image });
const l = (id: string, name: string, emoji: string, frame: string, note: string, image?: string): StickerDef =>
  ({ id, name, rarity: 'legend', emoji, frame, note, image });

/** シールの一覧（60しゅるい：ふつう34・レア17・スーパーレア7・でんせつ2）。アルバムの並び */
export const STICKERS: StickerDef[] = [
  // ── ふつう（28）──
  n('st-fish', 'ほしざかな', '🐟', '#60a5fa', 'うちゅうを およぐ さかな。ネコたちの だいこうぶつ。'),
  n('st-yarn', 'ぎんがの けいと', '🧶', '#f472b6', 'ころがすと ほしの すじが のこる けいと。'),
  n('st-paw', 'にくきゅう スタンプ', '🐾', '#fb923c', 'ネコ軍団の あいことば。'),
  n('st-moon', 'みかづき', '🌙', '#facc15', 'つきの はずれの 前哨基地から 見える つき。'),
  n('st-star', 'きらぼし', '⭐', '#fde047', 'まちがえずに とくと ひかる ほし。'),
  n('st-planet', 'わっかの わくせい', '🪐', '#a78bfa', 'わっかで なわとびが できそうな わくせい。'),
  n('st-rocket', 'ネコロケット', '🚀', '#f87171', 'ネコ軍団の のりもの。しっぽで かじを とる。'),
  n('st-comet', 'すいせい', '☄️', '#22d3ee', 'ながい しっぽを ひいて とんでいく。'),
  n('st-ufo', 'まいごの ユーフォー', '🛸', '#4ade80', 'みちに まよって 基地に きた ユーフォー。'),
  n('st-scope', 'ぼうえんきょう', '🔭', '#38bdf8', 'とおくの 敵の 基地も よく 見える。'),
  n('st-sat', 'じんこう えいせい', '🛰️', '#94a3b8', '戦場の ようすを おしえてくれる。'),
  n('st-earth', 'あおい ほし', '🌍', '#3b82f6', 'ネコたちの ふるさと。'),
  n('st-flask', 'ふしぎな フラスコ', '🧪', '#34d399', 'あわが ぶくぶく。なにが できるかな。'),
  n('st-wrench', 'スパナ', '🔧', '#cbd5e1', '施設を なおす どうぐ。'),
  n('st-battery', 'でんち', '🔋', '#a3e635', '発電所で つくった エネルギーが はいっている。'),
  n('st-triangle', 'さんかくじょうぎ', '📐', '#fbbf24', 'すいちょくも へいこうも おまかせ。'),
  n('st-ruler', 'ものさし', '📏', '#f59e0b', 'ながさを はかる。きちんと そろえよう。'),
  n('st-abacus', 'そろばん', '🧮', '#d97706', 'たまを うごかして かぞえる。'),
  n('st-pencil', 'えんぴつ', '✏️', '#fcd34d', 'ひっさんの おとも。'),
  n('st-note', 'ネコの ノート', '📘', '#60a5fa', 'まちがえた もんだいも ちゃんと かいてある。'),
  n('st-onigiri', 'おにぎり', '🍙', '#e5e7eb', 'しゅつげきの まえの おやつ。'),
  n('st-milk', 'ミルク', '🥛', '#f1f5f9', 'がんばった あとの いっぱい。'),
  n('st-ribbon', 'リボン', '🎀', '#f9a8d4', 'しょうごうの バッジを とめる リボン。'),
  n('st-bell', 'くびわの すず', '🔔', '#fde68a', 'ちりん。なかまが ちかくに いる あいず。'),
  n('st-rainbow', 'にじ', '🌈', '#f472b6', '戦いの あとに 出る にじ。'),
  n('st-clover', 'よつば', '🍀', '#4ade80', 'みつけると ちょっと うれしい。'),
  n('st-magnet', 'じしゃく', '🧲', '#ef4444', 'ガラクタを あつめる ひみつの どうぐ。'),
  n('st-wall', 'ブロックの かべ', '🧱', '#a8a29e', '基地を まもる かべ。', `${SP}/wall.png`),
  n('st-donut', 'ドーナツぼし', '🍩', '#f9a8d4', 'まんなかに あなの あいた ふしぎな ほし。'),
  n('st-socks', 'ネコの くつした', '🧦', '#fca5a5', 'うちゅうは さむいので はく。'),
  n('st-box', 'だんボール', '📦', '#d6a35c', 'ネコが いちばん おちつく ばしょ。'),
  n('st-compass', 'コンパス', '🧭', '#2dd4bf', 'まいごに ならない ための どうぐ。'),
  n('st-sun', 'たいよう', '☀️', '#fb923c', 'ぽかぽか。ひなたぼっこの ばしょ。'),
  n('st-snow', 'ゆきの けっしょう', '❄️', '#bae6fd', 'よく 見ると きれいな かたち。'),
  // ── レア（14）──
  r('st-cat-melee', 'にゃばりあん', '🐱', '#f4814e', '近接系の はじまりの すがた。', `${CH}/melee-1.png`),
  r('st-cat-ranged', 'にゃーちゃー', '🐱', '#facc15', '遠距離系の はじまりの すがた。', `${CH}/ranged-1.png`),
  r('st-cat-tank', 'にゃいあんと', '🐱', '#94a3b8', 'タンク系の はじまりの すがた。', `${CH}/tank-1.png`),
  r('st-cat-magic', 'みにゃじょ', '🐱', '#a78bfa', '魔法系の はじまりの すがた。', `${CH}/magic-1.png`),
  r('st-cat-speed', 'にゃぶりん', '🐱', '#4ade80', '高速系の はじまりの すがた。', `${CH}/speed-1.png`),
  r('st-cat-flying', 'こにゃうもり', '🐱', '#38bdf8', '飛行系の はじまりの すがた。', `${CH}/flying-1.png`),
  r('st-cat-healer', 'にゃーす', '🐱', '#f9a8d4', '回復系の はじまりの すがた。', `${CH}/healer-1.png`),
  r('st-cat-bomber', 'ぼむにゃー', '🐱', '#fb923c', '爆発系の はじまりの すがた。', `${CH}/bomber-1.png`),
  r('st-alien', 'なぞの うちゅうせいぶつ', '👾', '#c084fc', 'ときどき 戦場に まよいこむ。', `${CH}/alien-1.png`),
  r('st-core', 'ネコ軍団の コア', '🏰', '#22d3ee', 'これが こわれると まけ。', `${SP}/town-hall.png`),
  r('st-cannon', 'ほうだい', '🎯', '#f87171', 'とおくまで とどく まもりの かなめ。', `${SP}/cannon.png`),
  r('st-tesla', 'でんげき トラップ', '⚡', '#67e8f9', 'かくれていて、ちかづくと ビリッ。', `${SP}/hidden-tesla.png`),
  r('st-plant', 'はつでんしょ', '🔌', '#a3e635', 'エネルギーを つくる 施設。', `${SP}/gold-mine.png`),
  r('st-barracks', 'へいしゃ', '🏠', '#fbbf24', 'あたらしい なかまが やってくる。', `${SP}/barracks.png`),
  r('st-camp', 'キャンプ', '⛺', '#4ade80', 'じゅもんの じゅんびを する ばしょ。', `${SP}/army-camp.png`),
  r('st-galaxy', 'ぎんがの うず', '🌌', '#818cf8', 'ネコ軍団が めざす ぎんがの まんなか。'),
  r('st-meteor', 'ながれぼし', '🌠', '#fde047', 'ねがいごとは 「まちがえずに とけますように」。'),
  // ── スーパーレア（6）──
  s('st-hydra', 'はいどらにゃん', '🐉', '#a855f7', '3つの 頭の 宇宙かいじゅう。', `${CH}/boss-titan-1.png`),
  s('st-mecha', 'めかにゃー', '🤖', '#64748b', 'かたの 大砲で とおくを ねらう。', `${CH}/boss-artillery-1.png`),
  s('st-darth', 'だーすにゃん', '🦹', '#ef4444', 'やみの 光の 剣を もつ。', `${CH}/boss-overlord-1.png`),
  s('st-titan', 'ぎんがの ヌシ', '🦖', '#7c3aed', '戦場の まんなかで ねむる 大きな いきもの。', `${CH}/titan-1.png`),
  s('st-demonyan', 'でもにゃろーど', '👑', '#f4814e', '王冠と 大きな 剣の 近接系の 王さま。', `${CH}/melee-3.png`),
  s('st-kaiser', 'めかかいざー', '⚙️', '#64748b', 'たてものを 一撃で こわす きかいの 王。', `${CH}/boss-artillery-3.png`),
  s('st-darkmage', 'にゃーくめいじ', '📖', '#a78bfa', 'まほうの 本を あやつる 大まほうつかい。', `${CH}/magic-3.png`),
  // ── でんせつ（2）──
  l('st-emperor', 'にゃーすべいだー', '🌑', '#facc15', '銀河の 皇帝。マントの かげが 戦場に のびる。', `${CH}/boss-overlord-3.png`),
  l('st-cosmic', 'こずみっくはいどら', '🌟', '#facc15', '宇宙に ひろがる でんせつの かいじゅう。', `${CH}/boss-titan-3.png`),
];

export const STICKER_BY_ID: Record<string, StickerDef> = Object.fromEntries(STICKERS.map((x) => [x.id, x]));
export const stickersOf = (rarity: StickerRarity): StickerDef[] => STICKERS.filter((x) => x.rarity === rarity);

/** カプセルの状態（保存するのは これだけ） */
export interface CapsuleState {
  /** シールの id → 持っている まいすう */
  stickers: Record<string, number>;
  /** 「レア」いじょうが 出ないまま 回した回数（天井の かぞえ） */
  sinceUp: number;
  /** シールのかけら */
  frag: number;
}

export interface PullResult {
  next: CapsuleState;
  sticker: StickerDef;
  dup: boolean;
  /** ダブりで もらった シールのかけら */
  fragGain: number;
  /** 天井で きまった */
  pity: boolean;
}

/** めずらしさを 確率どおりに1つ（minUp＝レアいじょうだけから。そのときも レア・スーパー・でんせつ の比は ふだんと同じ） */
export function pickRarity(rand: () => number, minUp = false): StickerRarity {
  const list = minUp ? RARITY_ORDER.filter((x) => x !== 'normal') : RARITY_ORDER;
  const total = list.reduce((a, x) => a + RARITY_RATE[x], 0);
  let v = rand() * total;
  for (const x of list) {
    if (v < RARITY_RATE[x]) return x;
    v -= RARITY_RATE[x];
  }
  return list[list.length - 1];
}

/** まだ持っていないシールの 出やすさ（持っているシールを 1 として。SANMON は 2） */
export const UNOWNED_WEIGHT = 1;

/** めずらしさの中から1まい（同じ めずらしさの中では どれも 同じ確率。UNOWNED_WEIGHT を 2 にすると まだのシールが 出やすくなる） */
export function pickSticker(rarity: StickerRarity, owned: Record<string, number>, rand: () => number): StickerDef {
  const pool = stickersOf(rarity);
  const w = pool.map((x) => ((owned[x.id] ?? 0) > 0 ? 1 : UNOWNED_WEIGHT));
  let v = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    if (v < w[i]) return pool[i];
    v -= w[i];
  }
  return pool[pool.length - 1];
}

/**
 * 1回 まわす（純粋な関数。rand は 0以上1未満を返す）。
 * sinceUp＋1 が天井（10）に とどいたら、かならず「レア」いじょう。
 */
export function pullCapsule(st: CapsuleState, rand: () => number): PullResult {
  const pity = st.sinceUp + 1 >= CAPSULE_RULES.pity;
  const rarity = pickRarity(rand, pity);
  const sticker = pickSticker(rarity, st.stickers, rand);
  const dup = (st.stickers[sticker.id] ?? 0) > 0;
  const fragGain = dup ? DUP_FRAGMENTS[rarity] : 0;
  return {
    next: {
      stickers: { ...st.stickers, [sticker.id]: (st.stickers[sticker.id] ?? 0) + 1 },
      sinceUp: rarity === 'normal' ? st.sinceUp + 1 : 0,
      frag: st.frag + fragGain,
    },
    sticker, dup, fragGain, pity,
  };
}

/** シールのかけらで こうかんできるか（まだ持っていない・かけらが たりる） */
export function canExchange(st: CapsuleState, id: string): boolean {
  const def = STICKER_BY_ID[id];
  if (!def || (st.stickers[id] ?? 0) > 0) return false;
  return st.frag >= EXCHANGE_COST[def.rarity];
}

/** シールのかけらで こうかん（できないときは そのまま返す） */
export function exchangeSticker(st: CapsuleState, id: string): CapsuleState {
  if (!canExchange(st, id)) return st;
  const def = STICKER_BY_ID[id];
  return { ...st, stickers: { ...st.stickers, [id]: 1 }, frag: st.frag - EXCHANGE_COST[def.rarity] };
}

/** 持っている しゅるいの数 */
export function ownedKinds(stickers: Record<string, number>): number {
  return STICKERS.filter((x) => (stickers[x.id] ?? 0) > 0).length;
}
