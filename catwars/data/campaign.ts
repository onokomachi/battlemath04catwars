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

export type EnemyUnitKind = 'grunt' | 'shooter' | 'runner' | 'brute' | 'flyer' | 'boss';

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
export const BARRACKS_ONLY_UNITS: EnemyUnitKind[] = ['brute', 'flyer'];

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
    title: '月のはずれの前哨基地',
    enemyName: 'ガラクタ隊長',
    enemyTitle: 'ノラボット隊 隊長',
    background: '宇宙にすてられたガラクタが集まって生まれたロボネコ。ひろった部品を勝手に組み立てて、月のはずれに小さな基地をつくってしまった。',
    briefing: 'まもりの設備はまだ無い。ネコを出して、まっすぐコアをこわそう。',
    hint: '⚡は じぶんでは たまらないよ。左下の 問題カードを といて ⚡ を 手に入れよう。むずかしい カードほど ⚡ が 多い！',
    victoryLine: 'ガラクタ隊長はバラバラになって逃げていった。宇宙への第一歩だ！',
    defeatLine: 'つぎはもっとたくさんネコを出してみよう。',
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
    title: 'クレーター峡谷のふたご',
    enemyName: 'ミギー＆ヒダリー',
    enemyTitle: 'ふたごの見張り番',
    background: 'いつもケンカばかりしている双子の見張りネコ。ふたりで峡谷の上の道と下の道を1本ずつ守っている。',
    briefing: '道が2本ある。砲台が待ちかまえている道と、あいている道を見きわめよう。',
    hint: '砲台は岩のむこうがわは撃てない。岩のかげを通ればあんぜんだよ。',
    victoryLine: 'ふたごは「おまえのせいだ！」とケンカしながら退散した。',
    defeatLine: '2本の道を、べつべつに攻めてみるのはどうかな？',
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
    title: '隕石王のなわばり',
    enemyName: 'ロックニャン',
    enemyTitle: '隕石王',
    background: '隕石をあやつって自分のなわばりをつくる、いばりんぼうのネコ。中央に大きな隕石のかべを積み上げて通せんぼしている。',
    briefing: '中央の隕石はこわせない。上か下から回りこんで、敵のコアをねらおう。',
    hint: '砲台は遠距離系より射程が長い。タンク系（にゃいあんと）を先に出して、砲撃を受けてもらおう。',
    victoryLine: '隕石王のなわばりは、こなごなにくずれ落ちた。',
    defeatLine: 'タンク系を先に出して、砲台のねらいを引きつけてみよう。',
    mapId: 'map-grassland',
    difficulty: {
      enemyHpMult: 0.9, enemyDamageMult: 0.85,
      defenseDamageMult: 0.8, defenseHpMult: 0.9,
      firstSpawnDelayMs: 7000, enemySpawnRatePerSec: 8.2,
      unitPool: ['grunt', 'shooter'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 460,
  },
  {
    id: 'ch4', no: 4,
    title: '鉄壁のヨロイニャン',
    enemyName: 'ヨロイニャン',
    enemyTitle: '要塞の守備隊長',
    background: '「まもりこそ最強」が口ぐせの、かたい鎧を着たネコ。自分の基地を分厚い装甲壁でぐるりと囲んでしまった。',
    briefing: 'コアは壁の中。壁をこわして進むか、飛行系で壁をこえよう。',
    hint: '爆発系（ぼむにゃー）は建物に4倍ダメージ。壁や砲台をこわす係にぴったり。',
    victoryLine: '「まもりだけでは勝てない」。ヨロイニャンは静かにうなずいた。',
    defeatLine: '壁をこわす係と、コアをねらう係を分けてみよう。',
    mapId: 'map-fortress',
    difficulty: {
      enemyHpMult: 1.0, enemyDamageMult: 0.95,
      defenseDamageMult: 0.9, defenseHpMult: 1.0,
      firstSpawnDelayMs: 6500, enemySpawnRatePerSec: 5.3,
      unitPool: ['grunt', 'shooter', 'runner'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 550,
  },
  {
    id: 'ch5', no: 5,
    title: '軌道ブリッジの番人',
    enemyName: 'ブリッジャ',
    enemyTitle: '橋の番人',
    background: '軌道ブリッジの通行料をとって暮らしているネコ。橋は2本しかないと知っていて、その両方に砲台をすえつけた。',
    briefing: '橋の上ではネコが1列にならぶ。まとめて出しすぎると、まとめてやられるよ。',
    hint: '2本の橋に部隊を分けると、砲台のダメージも半分ずつになる。',
    victoryLine: '通行料はもう不要。橋はみんなのものになった。',
    defeatLine: '1本の橋に集めすぎたかも。左右に分けて渡ってみよう。',
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
    title: '重力沼のグラビニャ',
    enemyName: 'グラビニャ',
    enemyTitle: '重力使い',
    background: '重力をあやつって、あたり一面を歩きにくい沼に変えてしまったネコ。沼の中では、どんなに足のはやいネコもゆっくりになる。',
    briefing: '中央の沼はとおれるけど、おそくなる。左右の道を通るほうがはやいかも。',
    hint: '沼の上は砲台に長くねらわれる。タンク系で受けながら、ぼむにゃーで砲台をこわそう。',
    victoryLine: '重力がもとにもどり、ネコたちの足どりが軽くなった。',
    defeatLine: '沼を避けて、左右のはしを通ってみよう。',
    mapId: 'map-swamp',
    difficulty: {
      enemyHpMult: 1.1, enemyDamageMult: 1.05,
      defenseDamageMult: 1.1, defenseHpMult: 1.1,
      firstSpawnDelayMs: 5500, enemySpawnRatePerSec: 5.6,
      unitPool: ['grunt', 'shooter', 'brute'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 780,
  },
  {
    id: 'ch7', no: 7,
    title: '星くだきアステロ',
    enemyName: 'アステロ',
    enemyTitle: '小惑星帯の破壊者',
    background: '小惑星をくだいて宇宙をちらかす、あばれんぼうのネコ。岩と沼のふくざつな地形を、自分の庭のように使いこなす。',
    briefing: '岩・沼・砲台、ぜんぶある。どのルートが一番はやいか考えよう。',
    hint: '砲台の射程はとても長い。ネコを選んでから敵をタップすると、その敵だけを集中してねらえるよ。',
    victoryLine: 'ちらかった小惑星帯に、しずかな星の光がもどった。',
    defeatLine: 'ルートを変えるか、部隊の組み合わせを変えてみよう。',
    mapId: 'map-cliffs',
    difficulty: {
      enemyHpMult: 1.2, enemyDamageMult: 1.15,
      defenseDamageMult: 1.2, defenseHpMult: 1.15,
      firstSpawnDelayMs: 5000, enemySpawnRatePerSec: 4.9,
      unitPool: ['grunt', 'shooter', 'runner', 'flyer'],
      startEnergy: PLAYER_START_ENERGY, energyPerSec: 0,
    },
    rewardCredits: 920,
  },
  {
    id: 'ch8', no: 8,
    title: '銀河皇帝ニャースベイダー',
    enemyName: 'ニャースベイダー',
    enemyTitle: '銀河皇帝',
    background: '黒いマントをまとった銀河の支配者。三重の防衛線をもつ最終要塞シタデルの奥で、じっとこちらを見つめている。',
    briefing: '砲台も電撃トラップもいちばん多い。あわてずに、少しずつ防衛をけずっていこう。',
    hint: '「めかにゃー」は砲台よりも射程が長い。撃たれずに砲台をつぶせる唯一のネコだ。',
    victoryLine: '銀河にへいわがもどった。きみとネコ軍団の伝説がはじまる。',
    defeatLine: 'ここまで来たらもう一息。⚡をためてから一気に攻めこもう。',
    mapId: 'map-citadel',
    difficulty: {
      enemyHpMult: 1.3, enemyDamageMult: 1.2,
      // 防衛施設が最多の章なので、HP倍率は上げない（威力だけで難しさを出す）
      defenseDamageMult: 1.3, defenseHpMult: 1.0,
      firstSpawnDelayMs: 4500, enemySpawnRatePerSec: 3.6,
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

/** サポート段階を反映した実効難易度を返す */
export function effectiveDifficulty(ch: CampaignChapter, assist: 0 | 1 | 2): ChapterDifficulty {
  const a = ASSIST_LEVELS[assist];
  const d = ch.difficulty;
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
