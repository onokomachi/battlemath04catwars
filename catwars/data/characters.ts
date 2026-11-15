// ── にゃんこ大戦争風 キャラクター図鑑 ───────────────────────────────────────────
// 11系統 × 3進化段階 = 33フォーム（8通常系統＋3ボス系統）。
// スプライトは /assets/sprites/chars/<spriteFamily>-<stage>.png（無料AI生成＋背景透過処理ずみ。
// 後でSupabase/Firebase StorageのURLに差し替え可能。getCharacterSprite() の baseUrl を変えるだけ）。

export type TargetPref = 'ANY' | 'DEFENSE' | 'RESOURCE';

export interface EvolutionForm {
  stage: 1 | 2 | 3;
  name: string;
  minLevel: number;   // この姿になる最低レベル
  flavor: string;
}

export interface CharacterFamily {
  id: string;            // 兵士ID（戦闘エンジンのsubType）＝アーミーストアのキー
  spriteFamily: string;  // /assets/sprites/chars/<spriteFamily>-<stage>.png
  displayName: string;   // 系統名
  role: string;          // 役割の短い説明
  isStarter?: boolean;   // 最初から使えるスターターキャラ
  forms: [EvolutionForm, EvolutionForm, EvolutionForm];
  // 戦闘の基礎ステータス（Lv1）。レベルで少しずつ強くなる（levelMult）。
  base: {
    hp: number;
    damage: number;
    moveSpeed: number;
    target: TargetPref;
    attackRange: number;
    attackSpeed: number; // ms/攻撃
  };
  cost: { gold: number; count: number }; // 補充1回ぶん（ゴールドのみ）
  /**
   * 再出撃までの待ち時間(ms)。にゃんこ大戦争と同じく**キャラごとに違う**。
   *
   * 以前は全キャラ一律 1500ms で、強いキャラも連打で出せてしまい
   * 「どれを出すか」を考える必要がなかった（⑦のフィードバック）。
   * 安い前衛ほど短く、強力・高コストなほど長くすることで、
   *   ・安いネコで壁を作りつつ
   *   ・重いネコの再出撃までをどう凌ぐか
   * という、にゃんこ大戦争的な編成・タイミングの判断が生まれる。
   */
  cooldownMs: number;
  /**
   * 建物（壁・砲台・コアなど）に当てたときのダメージ倍率。1.0 = 等倍。
   *
   * 爆発系(ぼむにゃー)は役割説明が「建物に大ダメージの爆弾魔」で、
   * 第4章のヒントでも「爆発系は建物に大ダメージ。壁をこわす係にぴったり」と
   * 子どもに教えているのに、**ダメージ計算にその処理が無かった**。
   * 攻城役が存在しないため、砲台が並ぶ終盤の要塞を崩す手段が実質なかった。
   */
  buildingDamageMult: number;
  accent: string;

  // ── 見た目と役割の個性 ────────────────────────────────────────────
  /** 戦場での表示サイズ(px)。1マス=40px なので、40 を超えるとマスからはみ出す大型。 */
  bodySize: number;
  /** 体型の指定。スプライト生成プロンプトと、図鑑の説明に使う。 */
  bodyType: string;
  /**
   * 防衛施設（大砲・テスラ）から受けるダメージの軽減率。
   * 正=打たれ強い / 負=打たれ弱い。タンク系は砲撃を受け止める役割なので大きく取る。
   * HPを上げるのではなく「大砲に強い」という形にすることで、役割の個性がはっきり出る。
   */
  defenseResist: number;
}

/** 大型ユニット（1マスをはみ出す）かどうか */
export function isLargeBody(familyId: string): boolean {
  return (CHARACTER_BY_ID[familyId]?.bodySize ?? 0) > 44;
}

// 進化段階を返す（Lv1-9 = 1, Lv10-29 = 2, Lv30+ = 3）
export function stageForLevel(level: number): 1 | 2 | 3 {
  if (level >= 30) return 3;
  if (level >= 10) return 2;
  return 1;
}

/**
 * レベルごとの強さの倍率（HP・こうげき。2026-11-15 CW-4a）。1レベルごとに少しずつ強くなる。
 * Lv10≒1.32・Lv30≒2.0・Lv60≒3.07。前は Lv10・Lv30 で急に ×1.45・×2.0 になる段差だった。
 * 進化（Lv10・Lv30）は 見た目と、あとの段階の「スキルの枠」のために残す（強さの段差は無い）。
 */
export const LEVEL_STEP = 0.035;
export function levelMult(level: number): number {
  return 1 + LEVEL_STEP * (Math.max(1, level) - 1);
}

/** レベルの上限の上限。系統ごとの上限は「かけら」で上がる（levelCapForShards） */
export const MAX_LEVEL = 60;
/** かけら0のときの上限 */
export const BASE_LEVEL_CAP = 20;
/** かけら1つで上がる上限 */
export const LEVEL_CAP_PER_SHARD = 5;
/** かけら（0〜8）→ その系統のレベルの上限（20＋5×かけら・60まで） */
export function levelCapForShards(shards: number): number {
  return Math.min(MAX_LEVEL, BASE_LEVEL_CAP + LEVEL_CAP_PER_SHARD * Math.max(0, Math.floor(shards)));
}

/**
 * 次のレベルに必要なXP（2026-11-15 CW-4a。scripts/progressionSim.ts で決めた）。
 * 1日20分の子が4週間で Lv24（第8章のめやす）に、1日90分の子でも 8週間で 全系統 Lv60 には届かない上がり方。
 */
export const XP_CURVE = { a: 2.6, b: 30 };
export function xpToNext(level: number): number {
  return Math.round(XP_CURVE.a * level * level + XP_CURVE.b);
}

const SPRITE_BASE = '/assets/sprites/chars';

export function getCharacterSprite(spriteFamily: string, stage: 1 | 2 | 3): string {
  return `${SPRITE_BASE}/${spriteFamily}-${stage}.png`;
}

// 戦闘エンジンの既存subType（barbarian/archer/giant/skeleton）→ 系統スプライトの対応
const SUBTYPE_TO_SPRITE: Record<string, string> = {
  barbarian: 'melee',
  archer: 'ranged',
  giant: 'tank',
  magic: 'magic',
  speed: 'speed',
  flying: 'flying',
  healer: 'healer',
  bomber: 'bomber',
  boss_titan: 'boss-titan',
  boss_artillery: 'boss-artillery',
  boss_overlord: 'boss-overlord',
};

export function spriteFamilyForSubType(subType: string): string | null {
  return SUBTYPE_TO_SPRITE[subType] ?? null;
}

export const CHARACTERS: CharacterFamily[] = [
  {
    id: 'barbarian', spriteFamily: 'melee', displayName: '近接系', role: '無差別の地上アタッカー',
    isStarter: true,
    accent: '#f4814e',
    forms: [
      { stage: 1, name: 'にゃばりあん',   minLevel: 1,  flavor: '剣をふりまわす元気なネコ戦士。まずはコイツから！' },
      { stage: 2, name: 'にゃーさーかー', minLevel: 10, flavor: '光る刃が少し大きくなった、たのもしいベテラン。' },
      { stage: 3, name: 'でもにゃろーど', minLevel: 30, flavor: '王冠と大剣をまとった近接系の王者。' },
    ],
    base: { hp: 60, damage: 15, moveSpeed: 2.5, target: 'ANY', attackRange: 1.2, attackSpeed: 1000 },
    cost: { gold: 30, count: 3 },
    cooldownMs: 2000,
    buildingDamageMult: 1.0,
    bodySize: 34, bodyType: 'がっしりした標準体型。肩幅が広く足が太い', defenseResist: 0.0,
  },
  {
    id: 'archer', spriteFamily: 'ranged', displayName: '遠距離系', role: '壁ごしに矢を放つ狙撃手',
    isStarter: true,
    accent: '#46c98a',
    forms: [
      { stage: 1, name: 'にゃーちゃー', minLevel: 1,  flavor: '小さなビーム銃で遠くからチクチク攻撃するネコ。' },
      { stage: 2, name: 'くろすにゃー', minLevel: 10, flavor: '二丁のビーム銃で連射。ゴーグルがクールだニャ。' },
      { stage: 3, name: 'にゃいぱー',   minLevel: 30, flavor: '超射程のビーム砲つかい。王冠つき。' },
    ],
    base: { hp: 40, damage: 12, moveSpeed: 3.0, target: 'ANY', attackRange: 3.5, attackSpeed: 900 },
    cost: { gold: 30, count: 3 },
    cooldownMs: 2600,
    buildingDamageMult: 1.0,
    bodySize: 30, bodyType: 'すらりと細身。長い手足でしなやか', defenseResist: -0.1,
  },
  {
    id: 'giant', spriteFamily: 'tank', displayName: 'タンク系', role: '防衛設備をひきつける盾役',
    isStarter: true,
    accent: '#b98a5e',
    forms: [
      { stage: 1, name: 'にゃいあんと', minLevel: 1,  flavor: '大きなHPで敵の攻撃を受けとめる。' },
      { stage: 2, name: 'にゃーれむ',   minLevel: 10, flavor: '岩のこぶしでなぐる頑丈なゴーレムネコ。' },
      { stage: 3, name: 'たいたにゃん', minLevel: 30, flavor: '巨大ハンマーをもつ伝説の巨人ネコ。' },
    ],
    base: { hp: 300, damage: 25, moveSpeed: 1.5, target: 'DEFENSE', attackRange: 1.2, attackSpeed: 1200 },
    cost: { gold: 120, count: 1 },
    cooldownMs: 8000,
    buildingDamageMult: 1.5,
    bodySize: 58, bodyType: 'ずんぐりと巨大。腕と胴がとても太く、頭が小さく見えるほど', defenseResist: 0.45,
  },
  {
    id: 'magic', spriteFamily: 'magic', displayName: '魔法系', role: '高火力の遠距離魔法使い',
    accent: '#7b6cf0',
    forms: [
      { stage: 1, name: 'みにゃじょ',     minLevel: 1,  flavor: '杖で魔法をうつ見習いネコ魔導士。' },
      { stage: 2, name: 'にゃざーど',     minLevel: 10, flavor: 'オーブから強力な魔力を放つウィザード。' },
      { stage: 3, name: 'にゃーくめいじ', minLevel: 30, flavor: '魔導書をあやつる大魔導士ネコ。' },
    ],
    base: { hp: 55, damage: 30, moveSpeed: 2.0, target: 'ANY', attackRange: 3.0, attackSpeed: 1300 },
    cost: { gold: 140, count: 2 },
    cooldownMs: 9000,
    buildingDamageMult: 1.0,
    bodySize: 32, bodyType: '小柄で猫背ぎみ。ローブでからだが隠れている', defenseResist: -0.1,
  },
  {
    id: 'speed', spriteFamily: 'speed', displayName: '高速系', role: '資源を一気に奪う俊足の暗殺者',
    accent: '#9bd83a',
    forms: [
      { stage: 1, name: 'にゃぶりん',     minLevel: 1,  flavor: 'すばやく動く小さなネコ。資源が大好き。' },
      { stage: 2, name: 'あさしにゃん',   minLevel: 10, flavor: 'エネルギー弾を操るアサシン。一瞬で間合いを詰める。' },
      { stage: 3, name: 'にゃんじゃ',     minLevel: 30, flavor: 'きらめく軌跡を残して駆けぬける忍者ネコ。神出鬼没。' },
    ],
    base: { hp: 45, damage: 14, moveSpeed: 4.2, target: 'RESOURCE', attackRange: 1.2, attackSpeed: 700 },
    cost: { gold: 60, count: 4 },
    cooldownMs: 3400,
    buildingDamageMult: 1.0,
    bodySize: 26, bodyType: 'とても小さく細い。手足が長くて軽そう', defenseResist: -0.2,
  },
  {
    id: 'flying', spriteFamily: 'flying', displayName: '飛行系', role: '壁を無視して突っ込む空の戦士',
    accent: '#e3534a',
    forms: [
      { stage: 1, name: 'こにゃうもり',   minLevel: 1,  flavor: 'ロケットのような翼でパタパタ飛ぶ小さなネコ。' },
      { stage: 2, name: 'わいにゃばーん', minLevel: 10, flavor: 'ツノとかがやく翼をもつ宇宙ネコ。' },
      { stage: 3, name: 'どらにゃん',     minLevel: 30, flavor: '小さな剣をもつ伝説の宇宙ネコ。' },
    ],
    base: { hp: 80, damage: 22, moveSpeed: 3.4, target: 'ANY', attackRange: 1.4, attackSpeed: 1000 },
    cost: { gold: 160, count: 1 },
    cooldownMs: 10000,
    buildingDamageMult: 1.0,
    bodySize: 38, bodyType: '胴は細いが翼が大きく横に広い', defenseResist: 0.0,
  },
  {
    id: 'healer', spriteFamily: 'healer', displayName: '回復系', role: '味方を支える癒やしのサポーター',
    accent: '#ff8fb3',
    forms: [
      { stage: 1, name: 'にゃーす',     minLevel: 1,  flavor: 'ナースキャップのやさしいネコ。' },
      { stage: 2, name: 'ぷりーにゃ',   minLevel: 10, flavor: '聖なる杖をもつプリーストネコ。' },
      { stage: 3, name: 'せいにゃんと', minLevel: 30, flavor: '光輪をまとった聖女ネコ。' },
    ],
    base: { hp: 70, damage: 8, moveSpeed: 2.2, target: 'ANY', attackRange: 1.4, attackSpeed: 1100 },
    cost: { gold: 120, count: 2 },
    cooldownMs: 7000,
    buildingDamageMult: 1.0,
    bodySize: 30, bodyType: '小柄で丸みのあるやさしい体型', defenseResist: 0.0,
  },
  {
    id: 'bomber', spriteFamily: 'bomber', displayName: '爆発系', role: '建物に大ダメージの爆弾魔',
    accent: '#ffb020',
    forms: [
      { stage: 1, name: 'ぼむにゃー',     minLevel: 1,  flavor: 'ゴーグルをかけた爆弾ずきのネコ。' },
      { stage: 2, name: 'きゃのにゃー',   minLevel: 10, flavor: '大砲をかついだ砲撃ネコ。' },
      { stage: 3, name: 'でもりにゃん',   minLevel: 30, flavor: 'ダイナマイトで何でも吹き飛ばす破壊王。' },
    ],
    base: { hp: 50, damage: 40, moveSpeed: 2.3, target: 'DEFENSE', attackRange: 1.2, attackSpeed: 1400 },
    cost: { gold: 100, count: 2 },
    cooldownMs: 6000,
    buildingDamageMult: 4.0,
    bodySize: 36, bodyType: 'ずんぐりして丸い。おなかが大きい', defenseResist: 0.15,
  },
  {
    id: 'boss_titan', spriteFamily: 'boss-titan', displayName: 'こずみっくはいどら', role: '宇宙怪獣（多頭触手・範囲攻撃）',
    accent: '#7c3aed',
    forms: [
      { stage: 1, name: 'はいどらにゃん',     minLevel: 1,  flavor: '3つの頭と触手で広範囲を同時に攻撃する宇宙怪獣ネコ。' },
      { stage: 2, name: 'ぎがはいどらにゃん', minLevel: 10, flavor: 'バイオルミネセンスを放つ触手が戦場を制圧する。' },
      { stage: 3, name: 'こずみっくはいどら', minLevel: 30, flavor: '全宇宙に広がる触手。複数の敵を同時に喰い尽くす伝説の宇宙怪獣。' },
    ],
    base: { hp: 1500, damage: 70, moveSpeed: 0.8, target: 'DEFENSE', attackRange: 1.4, attackSpeed: 2000 },
    cost: { gold: 600, count: 1 },
    cooldownMs: 22000,
    buildingDamageMult: 1.0,
    bodySize: 96, bodyType: '画面を圧するほど巨大。多頭と触手で横にも大きく広がる', defenseResist: 0.4,
  },
  {
    id: 'boss_artillery', spriteFamily: 'boss-artillery', displayName: 'めかかいざー', role: '機械皇帝（超遠距離砲撃・建物優先）',
    accent: '#f59e0b',
    forms: [
      { stage: 1, name: 'めかにゃー',    minLevel: 1,  flavor: '金属外骨格と肩の二連装キャノンで遠くの施設を狙い撃つ。' },
      { stage: 2, name: 'かいざーにゃ',  minLevel: 10, flavor: '全身機械化されたサイボーグネコ。単眼センサーが敵を正確に捉える。' },
      { stage: 3, name: 'めかかいざー', minLevel: 30, flavor: '銀河皇帝の名を持つ機械神。超長距離の必殺砲は建物を一撃で消し飛ばす。' },
    ],
    // 砲台(射程4.5)を唯一アウトレンジできる「攻城」役。
    // 高コスト・長い再出撃時間と引きかえに、撃たれずに砲台を潰せる立ち位置にする。
    base: { hp: 800, damage: 110, moveSpeed: 1.0, target: 'ANY', attackRange: 5.0, attackSpeed: 2400 },
    cost: { gold: 550, count: 1 },
    cooldownMs: 20000,
    buildingDamageMult: 3.0,
    bodySize: 86, bodyType: '巨大な機械の体。肩の砲塔で上半身が異様に大きい', defenseResist: 0.25,
  },
  {
    id: 'boss_overlord', spriteFamily: 'boss-overlord', displayName: 'にゃーすべいだー', role: 'ダークロード（超遅・即死級攻撃）',
    accent: '#dc2626',
    forms: [
      { stage: 1, name: 'だーすにゃん',     minLevel: 1,  flavor: '黒いマントをなびかせ闇のエネルギーブレードを操る宇宙ネコ。' },
      { stage: 2, name: 'だーすにゃんII',   minLevel: 10, flavor: '胸の赤いコアが激しく光る。その一撃は戦場を半壊させる。' },
      { stage: 3, name: 'にゃーすべいだー', minLevel: 30, flavor: '銀河皇帝。黒マントの逆三角シルエットが戦場に影を落とす最恐のボス。' },
    ],
    base: { hp: 1100, damage: 150, moveSpeed: 0.9, target: 'ANY', attackRange: 1.8, attackSpeed: 2600 },
    cost: { gold: 750, count: 1 },
    cooldownMs: 26000,
    buildingDamageMult: 1.0,
    bodySize: 92, bodyType: '長身で肩幅の広い逆三角形。マントで下半身まで大きく見える', defenseResist: 0.3,
  },
];

export const CHARACTER_BY_ID: Record<string, CharacterFamily> =
  Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

export function currentFormName(familyId: string, level: number): string {
  const fam = CHARACTER_BY_ID[familyId];
  if (!fam) return familyId;
  return fam.forms[stageForLevel(level) - 1].name;
}
