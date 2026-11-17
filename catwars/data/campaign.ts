// ── CAT-WARS ストーリーキャンペーン（全8章）────────────────────────────────
//
// 目的:
//   ・PC戦に「難易度」と「盛り上がり（物語）」を与える（②）
//   ・一般の小4が やる気を失わずに続けられる 段階的な難易度設計にする（⑤）
//
// ── 難易度設計のエビデンスと、そこから導いた具体値 ──────────────────────
//
// [エビデンスレベル1: 複数のRCT・メタ分析に支えられた理論]
//   ・フロー理論 (Csikszentmihalyi 1990) / ゲームへの適用 (Chen 2007, CACM)。
//     挑戦が能力をわずかに上回る帯に留まるとき没入が最大化し、上回りすぎると不安、
//     下回ると退屈になる。→ 章ごとに「わずかに上回る」量だけ強くする方針の根拠。
//   ・自己決定理論 (Ryan & Deci 2000; ゲームへの適用は Ryan, Rigby & Przybylski 2006)。
//     有能感(competence)の充足が継続意欲を最も強く予測する。有能感は「勝てるが
//     楽勝ではない」経験から生じる。→ 章クリア率の目標値を設定する根拠。
//   ・望ましい困難 (Bjork & Bjork 2011)。易しすぎる練習は学習も定着も生まない。
//
// [エビデンスレベル2: 大規模実証研究（教育ゲーム分野）]
//   ・Lomas, Patel, Forlizzi & Koedinger (2013), CHI "Optimizing Challenge in an
//     Educational Game Using Large-Scale Design Experiments"（n≈3万の被験者実験）。
//     教育ゲームでは開発者の直感より "易しめ" が継続率を最大化した。難しすぎる設定は
//     プレイ時間を大きく落とす。→ 序盤2章を明確に易しく置く根拠（勝率85%前後を目標）。
//   ・Sampayo-Vargas et al. (2013, Computers & Education) ほか、適応的難易度は固定難易度に
//     比べ学習成果・動機づけで優位。ただし効果量は中程度。→ 適応は「補助」に留める根拠。
//
// [エビデンスレベル3: 実務上の定石（査読論文ではないが業界で広く検証された知見）]
//   ・Hunicke (2005) "The Case for Dynamic Difficulty Adjustment in Games"。
//     DDA は下方向（救済）に使うと満足度を落とさないが、上方向（成功者への罰）に
//     使うとプレイヤーは「ズルされた」と感じる。→ 本作の自動調整を**下方向のみ**に限定。
//   ・Baldwin, Johnson & Wyeth (2014) ほか、隠れた調整は気づかれると不信を生む。
//     → 補助が働いたときは「サポートモード」として**明示表示**する。
//
// ── 目標値（この数値表が満たすべき仕様）──────────────────────────────
//   ・章1〜2 の初回クリア率: 約85%（Lomas et al. の「易しめが最適」に合わせる）
//   ・章3〜6 の初回クリア率: 約70%（フロー帯の中心）
//   ・章7〜8 の初回クリア率: 約55%（達成感のピークを最終章に置く）
//   ・基本ネコ（近接・進化前 HP60）が敵大砲の集中砲火で倒れるまで **どの章でも4秒以上**。
//     根拠: 8〜10歳の選択反応時間は成人より有意に遅い (Kail 1991 の発達的処理速度研究;
//     Der & Deary 2006)。観察→判断→タップの1サイクルに現実的な余裕を残すには
//     2秒台では足りない。※実測値は `docs/CATWARS_DESIGN.md` の表を参照。

import { BuildingType } from '../types';
import { levelMult } from './characters';

export type EnemyUnitKind = 'grunt' | 'shooter' | 'runner' | 'brute' | 'flyer' | 'guard' | 'medic' | 'kamikaze' | 'boss';

/**
 * 特別なきまりを持つ敵（2026-11-15。編成を変えないと勝てない敵）。きまりは sim/simulate.ts。
 * - flyer（空中）：近接のネコ（射程2未満・飛行でない）の こうげきが とどかない。遠距離・魔法・飛行・砲台でたおす
 * - guard（盾持ち）：魔法いがいの こうげきは半分。魔法は1.5倍
 * - medic（回復役）：2秒ごとに、まわり（2.5マス）の味方を 最大HPの8% 回復する。先にたおす
 * - kamikaze（自爆）：ネコは ねらわず、施設に つっこんで ばくはつする（1回きり）。とどく前に たおす
 */
export const ENEMY_TRAIT_NOTE: Partial<Record<EnemyUnitKind, { icon: string; counter: string }>> = {
  flyer: { icon: '🪽', counter: '空をとぶ。近接は とどかない → 遠距離・魔法・飛行・砲台で' },
  guard: { icon: '🛡️', counter: 'たてで こうげきを半分にする → 魔法が よくきく' },
  medic: { icon: '💚', counter: 'まわりの敵を回復する → さきに たおそう' },
  kamikaze: { icon: '💥', counter: '施設に つっこんで ばくはつ → とどく前に 遠距離で' },
};
export const MEDIC_HEAL_PCT = 0.08;
export const MEDIC_HEAL_RADIUS = 2.5;
export const MEDIC_HEAL_INTERVAL_MS = 2000;
export const GUARD_PHYSICAL_MULT = 0.5;
export const GUARD_MAGIC_MULT = 1.5;
/** シールドがあるあいだ、ボスに通るダメージの割合 */
export const SHIELD_DAMAGE_MULT = 0.1;

/** 敵ウェーブ兵の基礎ステータス（章の倍率をかける前の素の値） */
export const ENEMY_UNIT_STATS: Record<EnemyUnitKind, {
  subType: string;      // 描画に使うスプライト系統
  label: string;
  hp: number;
  damage: number;
  attackRange: number;
  attackSpeed: number;  // ms/攻撃
  moveSpeed: number;
}> = {
  // ②「敵が少なすぎる」への対応で出現数を大きく増やしたため、雑兵は
  // にゃんこ大戦争の雑魚と同じく「数は多いが打たれ弱い」方向へ振り直した。
  // HPを据え置いたまま数だけ増やすと、盤上に敵がたまり続けて詰む
  // （実測: 第8章で敵29体が同時に居座り、自軍コアが84秒で陥落した）。
  grunt:   { subType: 'barbarian',     label: 'ノラ兵',     hp: 46,  damage: 9,  attackRange: 1.2, attackSpeed: 1200, moveSpeed: 2.0 },
  shooter: { subType: 'archer',        label: 'スナイパー', hp: 36,  damage: 7,  attackRange: 3.0, attackSpeed: 1300, moveSpeed: 2.3 },
  runner:  { subType: 'speed',         label: 'かけぬけ兵', hp: 32,  damage: 8,  attackRange: 1.2, attackSpeed: 900,  moveSpeed: 3.4 },
  brute:   { subType: 'giant',         label: '重装ロボ',   hp: 220, damage: 18, attackRange: 1.3, attackSpeed: 1500, moveSpeed: 1.4 },
  flyer:   { subType: 'flying',        label: '飛行ドローン', hp: 90, damage: 14, attackRange: 1.4, attackSpeed: 1100, moveSpeed: 3.0 },
  guard:   { subType: 'barbarian',     label: 'たてロボ',   hp: 170, damage: 12, attackRange: 1.2, attackSpeed: 1300, moveSpeed: 1.7 },
  medic:   { subType: 'healer',        label: 'しゅうりドローン', hp: 60, damage: 5, attackRange: 1.4, attackSpeed: 1400, moveSpeed: 2.0 },
  // 自爆の1回＝300（章の倍率の前）。コア（最大HP1500）の約2割。前は ネコの ぼむにゃー の ×4 が誤って掛かり 800 へっていた
  kamikaze:{ subType: 'bomber',        label: 'ばくだんロボ', hp: 42, damage: 300, attackRange: 1.2, attackSpeed: 1000, moveSpeed: 3.0 },
  boss:    { subType: 'boss_overlord', label: '皇帝の親衛隊', hp: 700, damage: 45, attackRange: 1.8, attackSpeed: 2400, moveSpeed: 0.9 },
};

// ── 敵の増援ポイント経済 ─────────────────────────────────────────────
//
// ①のフィードバック対応: 旧実装は「ウェーブ間隔16〜36秒・1回1〜4体」の
// バッチ湧きで、間隔が長すぎて手ごたえがなかった。プレイヤーが「問題を解いて
// ⚡をため、ネコを1体出す」のと同じテンポで、敵も「ポイントがたまったら
// 1体出す」経済に統一する（敵に実際に問題を解かせる必要はない）。
// ここでの「コスト」は各キャラの強さに応じた重み。ChapterDifficulty の
// enemySpawnRatePerSec（毎秒たまるポイント）で割った値が、そのキャラの
// 実質的な出現間隔になる。値が大きいキャラほど出にくく、狙って通り道に
// 送りこまれる感じを減らして「時々つよいのが混ざる」自然な出現にしている。
//
// ── 「まだ敵が少ない」という指摘（②⑦）への2回めの対応 ────────────────
// 1回めで増援レートを上げたが、実測すると密度が上がりきらず、難易度も
// ほとんど動かなかった。原因は2つあって、どちらもここでは直せなかった:
//   (a) simulate.ts の出現間隔に 1500ms の下限があり、レートを上げても
//       「1.5秒に1体」で頭打ちになっていた（→ 下限を600msへ）。
//   (b) 撃破報酬が一律8⚡で、ネコ1体が30⚡。つまり雑兵4体で次の1体が出せる。
//       敵を増やすほどプレイヤーの⚡収入が増える正のループになっていて、
//       レートを89まで上げても勝率が100%のままだった（実測）。
//       → 報酬を相手の最大HPに比例させ、雑魚では稼げないようにした。
// そのうえで、下の各章の値は「1体あたり何秒で湧くか」から逆算している。
export const ENEMY_UNIT_COST: Record<EnemyUnitKind, number> = {
  grunt: 28,
  shooter: 34,
  runner: 25,
  brute: 95,
  flyer: 60,
  guard: 80,
  medic: 70,
  kamikaze: 48,
  boss: 500, // ボスは経済に乗せず bossAtSpawnCount で単発トリガーする
};

/** unitPool から、コストの軽いキャラほど出やすい重みでランダムに1体選ぶ */
export function pickWeightedEnemyUnit(
  pool: EnemyUnitKind[],
  rng: { next: () => number },
): EnemyUnitKind {
  const weights = pool.map(k => 1 / ENEMY_UNIT_COST[k]);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// ── 敵の生産施設 ─────────────────────────────────────────────────────
//
// 「敵は金山のぶんだけで戦力を出しているように見える」という指摘への対応。
// 敵も味方と同じように**キャンプと兵舎を建てて**、そこから増援を出す。
//
//   ・アーミーキャンプ / 兵舎 は「増援の出口（湧き口）」になる
//   ・生きている生産施設の数だけ、増援ポイントのたまる速さが上がる
//   ・兵舎をこわすと、重量級（重装ロボ・飛行ドローン）を出せなくなる
//
// ねらいは②「戦略の工夫で勝てる構成」。コアまで一直線に殴るだけでなく、
// 「先にキャンプをつぶすと増援が目に見えて減る」という因果を子どもが
// 自分で発見できるようにする。破壊時にはメッセージでも明示する。
//
// 【加算→倍率に変更】もとは「毎秒+3.0」のような加算だった。ところが章が
// 進むほど基本値そのものが大きくなるので、加算だと施設の比重が薄まり、
// 第3〜5章では施設を全部こわしても増援が2割しか遅くならなかった（実測:
// 0.91秒/体 → 1.13秒/体）。これでは「キャンプをつぶすと楽になる」という
// いちばん教えたい因果が体感できない。倍率にすると、どの章でも同じ割合
// （全壊で 4〜6割減）だけ効くので、学びが章によってブレなくなる。
export const ENEMY_PRODUCTION_RATE: Partial<Record<BuildingType, number>> = {
  [BuildingType.ARMY_CAMP]: 0.35,
  [BuildingType.BARRACKS]: 0.30,
  [BuildingType.GOLD_MINE]: 0.12,
};

/** 増援の湧き口になる施設（＝ここから敵が出てくる） */
export const ENEMY_SPAWN_BUILDINGS: BuildingType[] = [
  BuildingType.ARMY_CAMP,
  BuildingType.BARRACKS,
];

/** 兵舎が生きているあいだだけ出撃できる重量級 */
export const BARRACKS_ONLY_UNITS: EnemyUnitKind[] = ['brute', 'flyer', 'guard'];

/**
 * 敵の増援ポイントがたまる速さ(毎秒)を、生き残っている敵施設から計算する。
 * コア側の基本値 `enemySpawnRatePerSec` に、生きている生産施設ぶんの**倍率**を掛ける。
 * 施設をこわせば戻り値が下がる = プレイヤーの攻め方が敵の増援速度に直結する。
 */
export function enemySpawnRate(
  d: ChapterDifficulty,
  aliveProductionSubTypes: string[],
): number {
  let bonus = 0;
  for (const sub of aliveProductionSubTypes) {
    bonus += ENEMY_PRODUCTION_RATE[sub as BuildingType] ?? 0;
  }
  return d.enemySpawnRatePerSec * (1 + bonus);
}

export interface ChapterDifficulty {
  /** 敵ウェーブ兵のHP倍率 */
  enemyHpMult: number;
  /** 敵ウェーブ兵の攻撃力倍率 */
  enemyDamageMult: number;
  /** 敵の防衛施設（大砲・テスラ）の威力倍率。⑥の体感難易度を直接決める値 */
  defenseDamageMult: number;
  /** 敵の防衛施設のHP倍率 */
  defenseHpMult: number;
  /** 最初の増援が出るまでの猶予(ms)。序盤ほど長く取り、まず攻める体験を保証する */
  firstSpawnDelayMs: number;
  /**
   * 敵の増援ポイントがたまる速さ（毎秒）の**基本値**（生産施設が全滅した状態の値）。
   * 実際の速さは、生きている生産施設ぶんの倍率を掛けた `enemySpawnRate()` の戻り値。
   * ENEMY_UNIT_COST をその速さで割った値が、実質の出現間隔になる。
   */
  enemySpawnRatePerSec: number;
  /** この章に出てくる敵の種類（コストが軽いほど出やすい） */
  unitPool: EnemyUnitKind[];
  /** 通常湧きが何体め(0起算)でボスが1体だけ割りこんでくるか（未設定ならボスなし） */
  bossAtSpawnCount?: number;
  /** ボスのシールドの枚数（0・未設定ならシールドなし）。復習の問題を解くと1枚われる */
  bossShield?: number;
  /** 戦闘開始時に持っている⚡ */
  startEnergy: number;
  /** ⚡の自然回復（毎秒）。キャンペーンでは 0（問題を解いて手に入れる） */
  energyPerSec: number;
}

export interface CampaignChapter {
  id: string;
  no: number;
  /** 戦いのタイトル */
  title: string;
  /** 敵の名前 */
  enemyName: string;
  /** 敵の肩書き */
  enemyTitle: string;
  /** 敵の背景（2文程度・小4が読める語彙） */
  background: string;
  /** 戦闘内容に関する非常に簡単な文 */
  briefing: string;
  /** 戦術のヒント1行 */
  hint: string;
  victoryLine: string;
  defeatLine: string;
  mapId: string;
  difficulty: ChapterDifficulty;
  /** 勝利時の💠クレジット */
  rewardCredits: number;
}

/**
 * 戦闘のエナジー（2026-11-15 持ち主と決めた）：**自動ではたまらない。問題を解いて手に入れる。**
 * 前は 毎秒7.5〜9.0 の自動収入があり、エナジーの7〜8割が「待つだけ」で入っていた（解かずに勝てる章もあった）。
 * はじめに持っているのは、基本のネコ2回ぶん（何もできずに止まらないように）。あとは問題（QUIZ_BASE_REWARD）と、敵をたおした分だけ。
 */
export const PLAYER_START_ENERGY = 60;
/** むずかしさ3の問題を、まちがえずに解いたときのエナジー（むずかしさ・連続正解で 0.75〜2.9倍） */
export const QUIZ_BASE_REWARD = 150;

export const CAMPAIGN: CampaignChapter[] = [
  {
    id: 'ch1', no: 1,
    title: '月のはずれの 小さな基地',
    enemyName: 'ガラクタ隊長',
    enemyTitle: 'ノラボットたいの たいちょう',
    background: '宇宙に すてられた ガラクタが 集まって 生まれた ロボネコ。ひろった ぶひんを かってに 組み立てて、月のはずれに 小さな 基地を つくってしまった。',
    briefing: 'まもりの そうちは まだ ない。ネコを 出して、まっすぐ コアを こわそう。',
    hint: '⚡は じぶんでは たまらないよ。左下の 問題カードを といて ⚡ を 手に入れよう。むずかしい カードほど ⚡ が 多い！',
    victoryLine: 'ガラクタ隊長は バラバラに なって にげていった。宇宙への はじめの 一歩だ！',
    defeatLine: 'つぎは もっと たくさん ネコを 出してみよう。',
    mapId: 'map-outpost',
    difficulty: {
      enemyHpMult: 0.7, enemyDamageMult: 0.6,
      defenseDamageMult: 0.6, defenseHpMult: 0.7,
      firstSpawnDelayMs: 8000, enemySpawnRatePerSec: 9.7,
      unitPool: ['grunt'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 300,
  },
  {
    id: 'ch2', no: 2,
    title: 'クレーターの たにの ふたご',
    enemyName: 'ウエニャン＆シタニャン',
    enemyTitle: 'ふたごの 見はりばん',
    background: 'いつも ケンカばかり している ふたごの 見はりネコ。ふたりで たにの 上の道と 下の道を 1本ずつ まもっている。',
    briefing: '道が 2本 ある。砲台が まちかまえている 道と、あいている 道を 見きわめよう。',
    hint: '砲台は 岩の むこうがわは うてない。岩の かげを 通れば あんぜんだよ。',
    victoryLine: 'ふたごは「おまえの せいだ！」と ケンカしながら にげていった。',
    defeatLine: '2本の 道を、べつべつに せめてみるのは どうかな？',
    mapId: 'map-canyon',
    difficulty: {
      enemyHpMult: 0.8, enemyDamageMult: 0.7,
      defenseDamageMult: 0.7, defenseHpMult: 0.8,
      firstSpawnDelayMs: 7500, enemySpawnRatePerSec: 6.6,
      unitPool: ['grunt', 'shooter'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 380,
  },
  {
    id: 'ch3', no: 3,
    title: 'いん石王の なわばり',
    enemyName: 'ロックニャン',
    enemyTitle: 'いん石王',
    background: 'いん石を あやつって 自分の なわばりを つくる、いばりんぼうの ネコ。まん中に 大きな いん石の かべを つみ上げて 通せんぼ している。',
    briefing: 'まん中の いん石は こわせない。上か 下から 回りこんで、敵の コアを ねらおう。',
    hint: '砲台は 遠距離系より しゃていが 長い。タンク系（にゃいあんと）を 先に 出して、こうげきを うけてもらおう。',
    victoryLine: 'いん石王の なわばりは、こなごなに くずれ落ちた。',
    defeatLine: 'タンク系を 先に 出して、砲台の ねらいを 引きつけてみよう。',
    mapId: 'map-grassland',
    difficulty: {
      enemyHpMult: 0.9, enemyDamageMult: 0.85,
      defenseDamageMult: 0.8, defenseHpMult: 0.9,
      firstSpawnDelayMs: 7000, enemySpawnRatePerSec: 7.82,
      unitPool: ['grunt', 'shooter'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 460,
  },
  {
    id: 'ch4', no: 4,
    title: 'かたい かべの ヨロイニャン',
    enemyName: 'ヨロイニャン',
    enemyTitle: 'とりでの まもりの たいちょう',
    background: '「まもりこそ さいきょう」が 口ぐせの、かたい よろいを 着た ネコ。自分の 基地を ぶあつい かべで ぐるりと かこんでしまった。',
    briefing: 'コアは 壁の 中。壁を こわして 進むか、飛行系で 壁を こえよう。',
    hint: 'ばくはつ系（ぼむにゃー）は たてものに 4倍の ダメージ。壁や 砲台を こわす 係に ぴったり。',
    victoryLine: '「まもりだけでは 勝てない」。ヨロイニャンは しずかに うなずいた。',
    defeatLine: '壁を こわす 係と、コアを ねらう 係を 分けてみよう。',
    mapId: 'map-fortress',
    difficulty: {
      enemyHpMult: 1.0, enemyDamageMult: 0.95,
      defenseDamageMult: 0.9, defenseHpMult: 1.0,
      firstSpawnDelayMs: 6500, enemySpawnRatePerSec: 7.66,
      unitPool: ['grunt', 'shooter', 'runner'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 550,
  },
  {
    id: 'ch5', no: 5,
    title: 'うちゅうの 橋の ばんにん',
    enemyName: 'ブリッジャ',
    enemyTitle: '橋の ばんにん',
    background: 'うちゅうの 橋を わたる ネコから お金を とって くらしている ネコ。橋は 2本しか ないと 知っていて、その 両方に 砲台を すえつけた。',
    briefing: '橋の 上では ネコが 1列に ならぶ。まとめて 出しすぎると、まとめて やられるよ。',
    hint: '2本の 橋に ネコを 分けると、砲台の ダメージも 半分ずつに なる。',
    victoryLine: 'もう お金は いらない。橋は みんなの ものに なった。',
    defeatLine: '1本の 橋に 集めすぎたかも。左右に 分けて わたってみよう。',
    mapId: 'map-river',
    difficulty: {
      enemyHpMult: 1.05, enemyDamageMult: 1.0,
      defenseDamageMult: 1.0, defenseHpMult: 1.05,
      firstSpawnDelayMs: 6000, enemySpawnRatePerSec: 6.3,
      unitPool: ['grunt', 'shooter', 'runner'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 650,
  },
  {
    id: 'ch6', no: 6,
    title: 'じゅうりょく沼の グラビニャ',
    enemyName: 'グラビニャ',
    enemyTitle: 'じゅうりょく つかい',
    background: 'じゅうりょくを あやつって、あたり 一面を 歩きにくい 沼に 変えてしまった ネコ。沼の 中では、どんなに 足の はやい ネコも ゆっくりに なる。',
    briefing: 'まん中の 沼は とおれるけど、おそくなる。左右の 道を 通るほうが はやいかも。',
    hint: '沼の 上は 砲台に 長く ねらわれる。タンク系で 受けながら、ぼむにゃーで 砲台を こわそう。',
    victoryLine: 'じゅうりょくが もとに もどり、ネコたちの 足どりが 軽くなった。',
    defeatLine: '沼を よけて、左右の はしを 通ってみよう。',
    mapId: 'map-swamp',
    difficulty: {
      enemyHpMult: 1.1, enemyDamageMult: 1.05,
      defenseDamageMult: 1.1, defenseHpMult: 1.1,
      firstSpawnDelayMs: 5500, enemySpawnRatePerSec: 7.58,
      unitPool: ['grunt', 'shooter', 'brute'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 780,
  },
  {
    id: 'ch7', no: 7,
    title: '星くだきアステロ',
    enemyName: 'アステロ',
    enemyTitle: '小わく星の あばれんぼう',
    background: '小わく星を くだいて 宇宙を ちらかす、あばれんぼうの ネコ。岩と 沼の ふくざつな 場所を、自分の 庭のように 使いこなす。',
    briefing: '岩・沼・砲台、ぜんぶ ある。どの 道が 一番 はやいか 考えよう。空を とぶ 敵には 近接は とどかない。遠距離・まほうを まぜよう。',
    hint: '砲台の しゃていは とても 長い。ネコを えらんでから 敵を タップすると、その敵だけを ねらえるよ。',
    victoryLine: 'ちらかった 小わく星の あたりに、しずかな 星の 光が もどった。',
    defeatLine: '通る 道を 変えるか、ネコの 組み合わせを 変えてみよう。',
    mapId: 'map-cliffs',
    difficulty: {
      enemyHpMult: 1.2, enemyDamageMult: 1.15,
      defenseDamageMult: 1.2, defenseHpMult: 1.15,
      firstSpawnDelayMs: 5000, enemySpawnRatePerSec: 9.6,
      unitPool: ['grunt', 'shooter', 'runner', 'flyer'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 920,
  },
  {
    id: 'ch8', no: 8,
    title: '銀河の こうてい クロマント',
    enemyName: 'クロマント',
    enemyTitle: '銀河の こうてい',
    background: '黒い マントを まとった 銀河の 王さま。3重の まもりに かこまれた さいごの とりで シタデルの おくで、じっと こちらを 見つめている。',
    briefing: '砲台も 電げきトラップも いちばん 多い。あわてずに、少しずつ まもりを けずっていこう。空を とぶ 敵には 近接は とどかない。遠距離・まほうを まぜよう。',
    hint: '「めかにゃー」は 砲台よりも しゃていが 長い。うたれずに 砲台を こわせる ただ1つの ネコだ。',
    victoryLine: '銀河に へいわが もどった。きみと ネコぐんだんの でんせつが はじまる。',
    defeatLine: 'ここまで 来たら もう ひといき。⚡を ためてから 一気に せめこもう。',
    mapId: 'map-citadel',
    difficulty: {
      enemyHpMult: 1.3, enemyDamageMult: 1.2,
      // 防衛施設が最多の章なので、HP倍率は上げない（威力だけで難しさを出す）
      defenseDamageMult: 1.3, defenseHpMult: 1.0,
      firstSpawnDelayMs: 4500, enemySpawnRatePerSec: 7.66,
      unitPool: ['grunt', 'shooter', 'brute', 'flyer'],
      // 増援ペースを上げるたびに、体数で指定したボス出現がどんどん早まる
      // （旧: 10秒間隔×9体=約90秒 → 2秒間隔×9体=約20秒 → 1.4秒間隔×45体=約68秒）。
      // 「終盤に1回だけ割りこむ」という元の意図に合わせて引き直した。
      // 現在のペース（施設健在で1.41秒/体）なら 4.5秒 + 70体 ≒ 開始103秒。
      // 生産施設をこわして増援を止めるほどボスも遅れて来る＝攻略のごほうびになる。
      bossAtSpawnCount: 70,
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 1200,
  },
];

export const CHAPTER_BY_ID: Record<string, CampaignChapter> =
  Object.fromEntries(CAMPAIGN.map(c => [c.id, c]));

// ── 章内の自動微調整（サポートモード）────────────────────────────────────
// Hunicke (2005) / Baldwin et al. (2014) に従い、**下方向のみ**・**明示表示つき**。
// 成功しているプレイヤーを難しくすること（上方向のDDA）は一切行わない。
export interface AssistLevel {
  level: 0 | 1 | 2;
  label: string;
  /** 敵の防衛施設と兵の与ダメージにかける倍率 */
  damageMult: number;
  /** ウェーブ間隔にかける倍率（大きいほど敵が来にくい） */
  waveIntervalMult: number;
  /** 開始⚡に加算 */
  bonusEnergy: number;
  description: string;
}

export const ASSIST_LEVELS: Record<0 | 1 | 2, AssistLevel> = {
  0: { level: 0, label: '', damageMult: 1, waveIntervalMult: 1, bonusEnergy: 0, description: '' },
  1: {
    level: 1, label: 'サポートモード',
    damageMult: 0.85, waveIntervalMult: 1.2, bonusEnergy: 60,
    description: '敵の攻撃が すこし弱くなり、⚡を多めに持ってスタートするよ。',
  },
  2: {
    level: 2, label: 'サポートモード＋',
    damageMult: 0.7, waveIntervalMult: 1.4, bonusEnergy: 140,
    description: '敵の攻撃がかなり弱くなり、援軍も来にくくなるよ。あきらめずにいこう！',
  },
};

/** 連敗数 → サポート段階。2連敗でLv1、4連敗でLv2。勝てば0に戻る。 */
export function assistLevelForLosses(consecutiveLosses: number): 0 | 1 | 2 {
  if (consecutiveLosses >= 4) return 2;
  if (consecutiveLosses >= 2) return 1;
  return 0;
}

/**
 * PvP用の難易度。対人戦では敵AIが動かない（相手プレイヤーが動かす）ので、
 * ウェーブ関連の値は使われない。意味を持つのは startEnergy と energyPerSec だけ。
 * 両者に同じ値を使うことで、資源の面で完全に対等な条件になる。
 */
export const PVP_DIFFICULTY: ChapterDifficulty = {
  enemyHpMult: 1, enemyDamageMult: 1,
  defenseDamageMult: 1, defenseHpMult: 1,
  firstSpawnDelayMs: 999999, enemySpawnRatePerSec: 0,
  unitPool: ['grunt'],
  startEnergy: 220, energyPerSec: 1.4,
};

// ── 難易度3段（ふつう・むずかしい・げきむず）と 脅威レベル（2026-11-15）─────────────
//
// ねらい：トップ層が「全章クリア」で終わらないこと。同じ章に、敵の強さ・数・種類・基地の配置がちがう3段を置く。
// 星は段ごと（1章で最大9つ）。むずかしい＝その章の ふつう をクリアで開く。げきむず＝むずかしい をクリアで開く。
//
// 倍率は docs/REBUILD_SPEC.md §2（HP ×1.35／×1.8、出現 ×1.25／×1.5）が出発点。
// 出現の倍率だけは、想定プレイヤーの勝率が目標帯に入るよう 章ごとに決めなおしている（TIER_SPAWN_MULT。`npm run test:balance`）。

export type ChapterTier = 'normal' | 'hard' | 'extreme';
export const TIER_ORDER: ChapterTier[] = ['normal', 'hard', 'extreme'];

export const TIER_INFO: Record<ChapterTier, {
  label: string; color: string;
  hpMult: number; damageMult: number;
  /** 勝利報酬（💠）の倍率 */
  rewardMult: number;
  /** ボスのシールドの枚数（ボスが出る章だけ） */
  bossShield: number;
  /** 手持ちのレベルの めやす に足す分（脅威レベルの基準） */
  baseLevelPlus: number;
  /**
   * 1戦で引ける 問題カードの まいすう（無ければ 上限なし）。章ごとの値は TIER_CARD_LIMIT（こちらは めやす・説明用）。
   * 正確に解くほど 多く出撃できる（docs/REBUILD_SPEC.md §1）。
   */
  cardLimit?: number;
}> = {
  normal:  { label: 'ふつう',     color: '#38bdf8', hpMult: 1.0,  damageMult: 1.0,  rewardMult: 1.0, bossShield: 1, baseLevelPlus: 0 },
  hard:    { label: 'むずかしい', color: '#f59e0b', hpMult: 1.35, damageMult: 1.1,  rewardMult: 1.5, bossShield: 2, baseLevelPlus: 12 },
  extreme: { label: 'げきむず',   color: '#ef4444', hpMult: 1.8,  damageMult: 1.2,  rewardMult: 2.2, bossShield: 3, baseLevelPlus: 24, cardLimit: 7 },
};

/**
 * げきむず の 問題カードの まいすう（章ごと。2026-11-15 CW-4b）。
 *
 * 問題を解いている間は戦闘が止まり、まちがえても何も失わないので、正答率は 勝ち負けに ほとんど効いていなかった
 *（勝率を分けていたのは 1手の速さ）。げきむず だけ カードの まいすうに上限をつけ、
 * **まちがえずに解いた カードだけが ⚡ になる＝正確に解くほど 多く出撃できる** 形にした。
 * 数えるのは「解きはじめた」カード（「やめて もどる」で答えずに閉じたものは数えない）。シールドを わる カードは数えない。
 * サポートモードでは +3／+6（ASSIST_CARD_BONUS）。決め方は scripts/balanceTest.ts（ACCURACY=1 と げきむず の帯）。
 */
export const TIER_CARD_LIMIT: Partial<Record<ChapterTier, Record<number, number>>> = {
  extreme: { 1: 6, 2: 7, 3: 10, 4: 8, 5: 5, 6: 7, 7: 8, 8: 6 },
};
/** サポートモードで まいすうに足す（Lv1／Lv2） */
export const ASSIST_CARD_BONUS: Record<0 | 1 | 2, number> = { 0: 0, 1: 3, 2: 6 };

/** その章・その段の カードの まいすう（上限なしは null） */
export function cardLimitFor(ch: Pick<CampaignChapter, 'no'>, tier: ChapterTier, assist: 0 | 1 | 2 = 0): number | null {
  const base = TIER_CARD_LIMIT[tier]?.[ch.no] ?? TIER_INFO[tier].cardLimit;
  return base == null ? null : base + ASSIST_CARD_BONUS[assist];
}

/** 段ごとに足す敵（その章の ふつう の敵に足す）。むずかしい＝1〜2種類、げきむず＝新しい敵がそろう */
const TIER_EXTRA_POOL: Record<ChapterTier, (no: number) => EnemyUnitKind[]> = {
  normal: () => [],
  hard: (no) => (no <= 2 ? ['kamikaze'] : no <= 5 ? ['guard', 'kamikaze'] : ['guard', 'medic']),
  extreme: (no) => (no <= 2 ? ['guard', 'kamikaze'] : ['guard', 'medic', 'kamikaze', 'flyer']),
};

/** ボスが割りこむ章（ふつう＝第8章だけ。むずかしい＝4・6・8章。げきむず＝全章）。値は「何体めで出るか」 */
function tierBossAt(ch: CampaignChapter, tier: ChapterTier): number | undefined {
  if (ch.difficulty.bossAtSpawnCount != null) return ch.difficulty.bossAtSpawnCount;
  if (tier === 'hard' && (ch.no === 4 || ch.no === 6)) return 45;
  if (tier === 'extreme') return 40 + ch.no * 3;
  return undefined;
}

/**
 * 段ごとの「出現の速さ」の倍率（章ごと）。「にがて」の勝率が目標帯に入るよう決めなおした値
 *（2026-11-15 CW-4a。育ち方を levelMult にし、想定装備を めやすのレベルに作りなおしたので 全部 決めなおした。RUNS=24）。
 * むずかしい は 手持ちが育っている想定（scripts/botSim.ts の loadoutForLevel）なので、序盤の章ほど大きい。
 * 変えたら `npm run test:balance:all`（3段＋脅威）。さがすときは scripts/tuneTiers.ts。
 */
export const TIER_SPAWN_MULT: Record<Exclude<ChapterTier, 'normal'>, Record<number, number>> = {
  hard:    { 1: 4.95, 2: 2.58, 3: 2.95, 4: 2.33, 5: 2.54, 6: 2.01, 7: 1.64, 8: 1.71 },
  extreme: { 1: 3.11, 2: 2.9, 3: 2.66, 4: 1.57, 5: 2.1525, 6: 1.95, 7: 1.47, 8: 1.54 },
};

/**
 * 段ごとの「敵の兵の強さ（HP・こうげき）」の追加の倍率（章ごと。無ければ 1）。
 * 敵の出る速さには下限（0.6秒に1体）があり、序盤の章では 出現を速めても 手ごたえが変わらない。そこは兵を強くする。
 * 変えたら `TIER=hard npm run test:balance`・`TIER=extreme npm run test:balance`（KNOB=power の tuneTiers でさがせる）。
 */
// むずかしい 第2章は 出現だけ速めると、とかない子が 敵をたおした分のエナジーで勝つことがあった（24回に1回）ので、兵の強さで合わせた
export const TIER_POWER_MULT: Record<ChapterTier, Record<number, number>> = {
  normal: {},
  hard: { 1: 1.6, 2: 1.3 },
  extreme: { 1: 1.34 },
};

/** その章・その段の難易度（サポート・脅威レベルをかける前） */
export function tierDifficulty(ch: CampaignChapter, tier: ChapterTier): ChapterDifficulty {
  const d = ch.difficulty;
  const t = TIER_INFO[tier];
  const bossAt = tierBossAt(ch, tier);
  const base: ChapterDifficulty = { ...d, bossAtSpawnCount: bossAt, bossShield: bossAt != null ? t.bossShield : 0 };
  if (tier === 'normal') {
    const p = TIER_POWER_MULT.normal[ch.no] ?? 1;
    return p === 1 ? base : { ...base, enemyHpMult: d.enemyHpMult * p, enemyDamageMult: d.enemyDamageMult * p };
  }
  const extra = TIER_EXTRA_POOL[tier](ch.no).filter(k => !d.unitPool.includes(k));
  const power = TIER_POWER_MULT[tier][ch.no] ?? 1;
  return {
    ...base,
    enemyHpMult: d.enemyHpMult * t.hpMult * power,
    defenseHpMult: d.defenseHpMult * (1 + (t.hpMult - 1) * 0.5),
    enemyDamageMult: d.enemyDamageMult * t.damageMult * power,
    defenseDamageMult: d.defenseDamageMult * t.damageMult,
    enemySpawnRatePerSec: d.enemySpawnRatePerSec * (TIER_SPAWN_MULT[tier][ch.no] ?? 1),
    unitPool: [...d.unitPool, ...extra],
  };
}

/** 章の「このくらい育っていれば ちょうどよい」レベル（手持ちの上位5系統の平均）。脅威レベルの基準 */
export const CHAPTER_BASE_LEVEL: Record<number, number> = { 1: 1, 2: 3, 5: 12, 3: 6, 4: 9, 6: 16, 7: 20, 8: 24 };
export function chapterBaseLevel(ch: CampaignChapter, tier: ChapterTier): number {
  return (CHAPTER_BASE_LEVEL[ch.no] ?? 1) + TIER_INFO[tier].baseLevelPlus;
}

/**
 * 脅威レベル：手持ちが章の基準より育っているぶん、敵も強くなる（育てすぎても楽勝にならない）。
 * SANMON の「相手のレベルは自分に合わせて上がる」と同じ考え方。**画面に「脅威 Lv.n」を出す**（隠れた調整はしない）。
 * 下がる方向には はたらかない（弱い手持ちで来た子を、さらに楽にはしない。そちらはサポートモード）。
 *
 * 育ち方の式（levelMult）に合わせる（2026-11-15 CW-4a）：敵の倍率 ＝ levelMult(基準 + G×育てた分) ÷ levelMult(基準)。上限 +120%。
 * 「脅威 Lv.n」の n ＝ round(G×育てた分)。G は 0.75 → 0.9（CW-4a）→ 0.99（CW-4b：1手の速さを そろえたら 0.9 では にがての差が +20 を超えた）。
 * **スキルは数えない**（学習で開く「脅威に追いつかれない強さ」＝学習のごほうび。data/skills.ts）。
 */
export const THREAT_GROWTH = 0.99;
export const THREAT_MAX_BONUS = 1.2;
export function threatLevel(avgLevel: number, baseLevel: number): number {
  return Math.max(0, Math.round(THREAT_GROWTH * (avgLevel - baseLevel)));
}
/** 敵（兵と施設）の HP・こうげきに掛ける倍率（1 以上） */
export function threatMultFor(avgLevel: number, baseLevel: number): number {
  const grown = Math.max(0, avgLevel - baseLevel);
  if (grown <= 0) return 1;
  return Math.min(1 + THREAT_MAX_BONUS, levelMult(baseLevel + THREAT_GROWTH * grown) / levelMult(baseLevel));
}
export function withThreat(d: ChapterDifficulty, mult: number): ChapterDifficulty {
  if (mult <= 1) return d;
  return {
    ...d,
    enemyHpMult: d.enemyHpMult * mult, enemyDamageMult: d.enemyDamageMult * mult,
    defenseHpMult: d.defenseHpMult * mult, defenseDamageMult: d.defenseDamageMult * mult,
  };
}

/** 星・クリアの記録の鍵。ふつう は章ID そのまま（前の記録と同じ）。ほかは「ch3:hard」 */
export const tierKey = (chapterId: string, tier: ChapterTier): string =>
  tier === 'normal' ? chapterId : `${chapterId}:${tier}`;

/** サポート段階を反映した実効難易度を返す */
export function effectiveDifficulty(
  ch: CampaignChapter, assist: 0 | 1 | 2, tier: ChapterTier = 'normal', threatMult = 1,
): ChapterDifficulty {
  const a = ASSIST_LEVELS[assist];
  const d = withThreat(tierDifficulty(ch, tier), threatMult);
  return {
    ...d,
    enemyDamageMult: d.enemyDamageMult * a.damageMult,
    defenseDamageMult: d.defenseDamageMult * a.damageMult,
    firstSpawnDelayMs: Math.round(d.firstSpawnDelayMs * a.waveIntervalMult),
    // waveIntervalMult が大きいほど「敵が来にくい」= ポイントがたまる速さを落とす
    enemySpawnRatePerSec: d.enemySpawnRatePerSec / a.waveIntervalMult,
    startEnergy: d.startEnergy + a.bonusEnergy,
  };
}
