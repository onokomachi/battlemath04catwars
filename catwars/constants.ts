import { BuildingType, Troop } from './types';
import { CHARACTERS } from './data/characters';

export const BUILDING_STATS: Record<BuildingType, {
  name: string;
  cost: { gold: number };
  hp: number;
  description: string;
  role: string; // Detailed functional role
  productionRate?: number; // Per minute
  capacity?: number;
  width: number;
  height: number;
  color: string;
  icon: string;
  damage?: number;
  range?: number;
  /** 攻撃間隔(ms)。未指定なら 1000ms 扱い */
  attackSpeed?: number;
  /** 新しい標的をとらえてから初弾を撃つまでの「照準時間」(ms)。予告として機能する */
  aimTimeMs?: number;
  buildTime: number; // Seconds
}> = {
  [BuildingType.TOWN_HALL]: {
    name: 'コア',
    cost: { gold: 500 },
    hp: 1500,
    description: '基地の中心。こわされると負け。陣地の いちばん奥に おこう。',
    role: '基地の中心（いちばん大事）',
    width: 2,
    height: 2,
    color: 'bg-gradient-to-b from-blue-400 to-blue-700 border-2 border-blue-300',
    icon: '🏰',
    buildTime: 10
  },
  [BuildingType.GOLD_MINE]: {
    name: '発電所',
    cost: { gold: 100 },
    hp: 400,
    productionRate: 100,
    description: '勝ったときの 💠クレジットが ふえる（1つにつき +5%・レベルごとに +1%）。戦場には おかない。',
    role: '勝利の 💠 をふやす',
    width: 1,
    height: 1,
    color: 'bg-gradient-to-b from-yellow-300 to-yellow-600 border-2 border-yellow-200',
    icon: '⛏️',
    buildTime: 5
  },
  [BuildingType.BARRACKS]: {
    name: '兵舎',
    cost: { gold: 200 },
    hp: 500,
    description: 'もっている数で、出撃できる ネコの系統が ふえる。戦場には おかない。',
    role: 'ネコの系統を ひらく',
    width: 1,
    height: 1,
    color: 'bg-gradient-to-b from-red-500 to-red-800 border-2 border-red-400',
    icon: '⚔️',
    buildTime: 8
  },
  [BuildingType.ARMY_CAMP]: {
    name: 'キャンプ',
    cost: { gold: 200 },
    hp: 400,
    description: '陣地に おくと、戦闘で つかえる 呪文（ヒール・レイジ）が 1つずつ ふえる。',
    role: '呪文を ふやす',
    width: 2,
    height: 2,
    color: 'bg-gradient-to-b from-green-600 to-green-900 border-2 border-green-500',
    icon: '⛺',
    buildTime: 8
  },
  [BuildingType.WALL]: {
    name: '壁',
    cost: { gold: 50 },
    hp: 1000,
    description: 'がんじょうな かべ。地上の敵の 通り道を ふさいで、コアに とどくまでの 時間を のばす。',
    role: '通り道を ふさぐ',
    width: 1,
    height: 1,
    color: 'bg-gradient-to-b from-stone-300 to-stone-600 border border-stone-400',
    icon: '', // Walls look better as blocks
    buildTime: 1
  },
  [BuildingType.CANNON]: {
    // 「大砲」のイラストが手持ちレーザー銃に見えるとの指摘を受け、
    // 名称も据え置き型であることが伝わる「砲台」に変更（BuildingType自体は互換のため無変更）。
    name: '砲台',
    cost: { gold: 150 },
    hp: 600,
    // ⑥ バランス調整（旧: damage 20 / range 4 / 攻撃間隔 1000ms = 20 DPS）
    //   → 10.8 DPS。基本ネコ(HP60)が倒れるまで 5.6秒。
    //   根拠と目標値は catwars/data/campaign.ts 冒頭および docs/CATWARS_DESIGN.md を参照。
    //
    // 【射程の再調整】射程 3.2 は遠距離系ネコ(にゃーちゃー 3.5)より短く、
    // 「撃たれずに一方的に削れる」状態だった＝砲台がまったく脅威にならない。
    // 4.5 にして標準の遠距離系(最大3.5)より確実に長くし、
    //   ・突っこむなら タンク系で受けながら
    //   ・撃ち合うなら 射程5.0の「めかにゃー」で
    // という選択を迫る形にした。DPSは据え置きなのでTTK下限(4秒)は維持される。
    damage: 14,
    range: 4.5,
    attackSpeed: 1300,
    aimTimeMs: 700,
    description: '地面に すえつけた 砲台。敵を 1体ずつ ねらう。うつ前に 0.7びょう ねらいを さだめる。壁の むこうは ねらえない。',
    role: '防衛防御 [単体地上専用] (標準防衛)',
    width: 1,
    height: 1,
    color: 'bg-gradient-to-b from-gray-700 to-black border-2 border-gray-600',
    icon: '💣',
    buildTime: 15
  },
  [BuildingType.HIDDEN_TESLA]: {
    // 「隠しテスラ」は名前だけでは何の施設か伝わらないとの指摘を受け、
    // 効果がそのまま伝わる「電撃トラップ」に改名（BuildingType自体は互換のため無変更）。
    name: '電撃トラップ',
    cost: { gold: 500 },
    hp: 600,
    // ⑥ バランス調整（旧: damage 40 / range 3.5 / 1000ms = 40 DPS → 基本ネコが1.5秒で溶けた）
    //   → 11 DPS・射程2.6。「1発が重いが発射が遅い」形にして奇襲の鋭さは残しつつ、
    //   最難関の第8章（防衛威力×1.3）でも基本ネコのTTKが4.2秒を下回らないようにした。
    damage: 22,
    range: 2.6,
    attackSpeed: 2000,
    aimTimeMs: 250,
    description: '地面に かくれた ワナ。敵が ちかづくと とびだして 電撃を はなつ。とどく はんいは みじかい。壁の むこうは ねらえない。',
    role: '防衛奇襲 [単体対地対空] (高DPS奇襲)',
    width: 1,
    height: 1,
    color: 'bg-gradient-to-b from-cyan-400 to-blue-600 border-2 border-cyan-200',
    icon: '⚡',
    buildTime: 30
  }
};

// 8系統のキャラ図鑑から初期兵士を生成（単一ソース化）
export const INITIAL_TROOPS: Troop[] = CHARACTERS.map((c) => ({
  id: c.id,
  name: c.forms[0].name,
  count: 0,
  damage: c.base.damage,
  hp: c.base.hp,
  target: c.base.target,
  moveSpeed: c.base.moveSpeed,
}));

export const MOCK_ENEMY_BASE = [
  { type: BuildingType.TOWN_HALL, x: 7, y: 7 },
  { type: BuildingType.GOLD_MINE, x: 5, y: 7 },
  { type: BuildingType.GOLD_MINE, x: 9, y: 7 },
  { type: BuildingType.CANNON, x: 7, y: 5 },
  { type: BuildingType.WALL, x: 6, y: 6 },
  { type: BuildingType.WALL, x: 7, y: 6 },
  { type: BuildingType.WALL, x: 8, y: 6 },
  { type: BuildingType.HIDDEN_TESLA, x: 8, y: 8 }, 
];