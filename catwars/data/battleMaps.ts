import { BUILDING_STATS } from '../constants';
import type { ChapterTier } from './campaign';
import { BattleMap, TerrainTile, BuildingType, GRID_W, GRID_H } from '../types';

// ── CAT-WARS 戦場フィールド（全8種・ストーリーの章と1対1）────────────────────
//
// 盤面は 28×16 の横長（iPad 横持ち前提）。左が自陣、右が敵陣。
//
// 自陣ゾーンの広さは章ごとに変える。「たくさん置ける章」と「ほとんど置けない章」を
// 交互に配置することで、毎回ちがう組み立てを考えることになり、
// ひとつの必勝パターンで流せなくなる（＝マンネリ化しない）。
//
//   第1章 10幅(広) → 第2章 6幅 → 第3章 10幅(広) → 第4章 4幅(最狭)
//   → 第5章 8幅 → 第6章 10幅(広) → 第7章 5幅 → 第8章 8幅
//
// ギミックは第3章から段階的に導入する（第1〜2章は素の盤面で基本操作に集中させる）。
//   溶岩(LAVA)     … 乗っているあいだ継続ダメージ。通行は可能
//   流星(meteor)   … 予告円が出てから着弾。見てから避けられる
//   巣(alienNest)  … 中立エイリアンが湧き、敵味方の区別なく襲う
//   巨大生物(titan)… 決まった経路を往復し、進路のキャラを攻撃する

const row = (y: number, type: TerrainTile['type'], xMin = 0, xMax = GRID_W - 1): TerrainTile[] =>
  Array.from({ length: xMax - xMin + 1 }, (_, i) => ({ x: xMin + i, y, type }));

const col = (x: number, type: TerrainTile['type'], yMin = 0, yMax = GRID_H - 1): TerrainTile[] =>
  Array.from({ length: yMax - yMin + 1 }, (_, i) => ({ x, y: yMin + i, type }));

const cell = (x: number, y: number, type: TerrainTile['type']): TerrainTile => ({ x, y, type });

const rect = (
  xMin: number, yMin: number, xMax: number, yMax: number, type: TerrainTile['type'],
): TerrainTile[] => {
  const out: TerrainTile[] = [];
  for (let y = yMin; y <= yMax; y++) for (let x = xMin; x <= xMax; x++) out.push({ x, y, type });
  return out;
};

export const BATTLE_MAPS: BattleMap[] = [
  // ── 第1章: 障害物なし・自陣は最大幅。まず「出す→進む→こわす」だけを体験させる ──
  {
    id: 'map-outpost',
    name: 'ルナ・アウトポスト',
    description: 'さえぎるものが何もない月面の前哨基地。じっくり陣地を組んで、まっすぐ攻めこもう！',
    terrain: [],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 3 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 12 },
      // 敵の増援もキャンプから出る（第1章はまだ1つだけ）
      { type: BuildingType.ARMY_CAMP, x: 21, y: 3 },
    ],
    playerDeployZone: { xMin: 0, xMax: 9, yMin: 0, yMax: 15 },
  },

  // ── 第2章: 岩で通路が2本に。自陣は6幅とやや狭い ──
  {
    id: 'map-canyon',
    name: 'クレーター峡谷',
    description: '岩壁が通路を2本に分けている。上と下、どちらから攻める？',
    terrain: [
      ...col(14, 'ROCK', 0, 5),
      ...col(14, 'ROCK', 10, 15),
      ...col(15, 'ROCK', 0, 5),
      ...col(15, 'ROCK', 10, 15),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 19, y: 3 },
      { type: BuildingType.CANNON, x: 19, y: 12 },
      // ②の見直し: 壁が3マス(y6-8)だけでコアの真下(y9)がノーガードだったため、
      // 上下1マスずつ余白を持たせて5マス(y5-9)に拡張。まっすぐ来た部隊は壁で
      // 止め、大回りしてきた部隊は上下の砲台(19,3)(19,12)が咎める形にする。
      { type: BuildingType.WALL, x: 22, y: 5 },
      { type: BuildingType.WALL, x: 22, y: 6 },
      { type: BuildingType.WALL, x: 22, y: 7 },
      { type: BuildingType.WALL, x: 22, y: 8 },
      { type: BuildingType.WALL, x: 22, y: 9 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 1 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 11 },
      { type: BuildingType.BARRACKS, x: 26, y: 4 },
    ],
    playerDeployZone: { xMin: 0, xMax: 5, yMin: 0, yMax: 15 },
  },

  // ── 第3章: 自陣は再び最大幅。溶岩ギミックの初登場（避ければ無傷） ──
  {
    id: 'map-grassland',
    name: 'ネビュラ・フロント',
    description: '中央に燃える溶岩の川。上下の岩場を回りこめば安全に近づける。',
    terrain: [
      ...rect(15, 5, 17, 10, 'LAVA'),
      ...col(13, 'ROCK', 4, 11),
      ...col(20, 'ROCK', 2, 5),
      ...col(20, 'ROCK', 10, 13),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 22, y: 3 },
      { type: BuildingType.CANNON, x: 22, y: 12 },
      // ②の見直し: 上に1マス足して壁をコアの上下対称(y5-9)にそろえた
      { type: BuildingType.WALL, x: 23, y: 5 },
      { type: BuildingType.WALL, x: 23, y: 6 },
      { type: BuildingType.WALL, x: 23, y: 7 },
      { type: BuildingType.WALL, x: 23, y: 8 },
      { type: BuildingType.WALL, x: 23, y: 9 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 7 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 2 },
      { type: BuildingType.BARRACKS, x: 26, y: 12 },
    ],
    playerDeployZone: { xMin: 0, xMax: 9, yMin: 0, yMax: 15 },
  },

  // ── 第4章: 自陣4幅（最狭）。壁の要塞＋流星ギミック ──
  {
    id: 'map-fortress',
    name: 'アイアン・フォートレス',
    description: '分厚い装甲壁の要塞。空からは流星がふりそそぐ。陣地はせまい――攻めに賭けよう。',
    terrain: [
      ...col(8, 'ROCK', 0, 3),
      ...col(8, 'ROCK', 12, 15),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 20, y: 4 },
      { type: BuildingType.CANNON, x: 20, y: 11 },
      { type: BuildingType.HIDDEN_TESLA, x: 21, y: 8 },
      { type: BuildingType.WALL, x: 22, y: 5 },
      { type: BuildingType.WALL, x: 22, y: 6 },
      { type: BuildingType.WALL, x: 22, y: 7 },
      { type: BuildingType.WALL, x: 22, y: 8 },
      { type: BuildingType.WALL, x: 22, y: 9 },
      { type: BuildingType.WALL, x: 22, y: 10 },
      { type: BuildingType.WALL, x: 23, y: 5 },
      { type: BuildingType.WALL, x: 23, y: 10 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 2 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 12 },
      { type: BuildingType.BARRACKS, x: 26, y: 5 },
    ],
    playerDeployZone: { xMin: 0, xMax: 3, yMin: 0, yMax: 15 },
    meteorZones: [
      { x: 13, y: 4, radius: 2.2, intervalMs: 9000, warningMs: 1800, damage: 30 },
      { x: 17, y: 11, radius: 2.2, intervalMs: 11000, warningMs: 1800, damage: 30 },
    ],
  },

  // ── 第5章: 自陣8幅。橋＝密集リスク＋中立エイリアンの巣 ──
  {
    id: 'map-river',
    name: 'オービタル・クロス',
    description: '2本の軌道ブリッジ。橋のたもとにはエイリアンの巣があり、だれかまわず襲ってくる。',
    terrain: [
      ...col(14, 'WATER'),
      ...col(15, 'WATER'),
      cell(14, 3, 'BRIDGE'), cell(15, 3, 'BRIDGE'),
      cell(14, 12, 'BRIDGE'), cell(15, 12, 'BRIDGE'),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 18, y: 3 },
      { type: BuildingType.CANNON, x: 18, y: 12 },
      { type: BuildingType.CANNON, x: 22, y: 7 },
      // ②の見直し: 壁が (23,6)(23,9) の2マスだけで、コアの真横(y7,8)が
      // まる見えだった。連続した壁(y6-9)にして、砲台(22,7)がその手前で
      // まっすぐ来る部隊を狙い撃ちできる配置にした。
      { type: BuildingType.WALL, x: 23, y: 6 },
      { type: BuildingType.WALL, x: 23, y: 7 },
      { type: BuildingType.WALL, x: 23, y: 8 },
      { type: BuildingType.WALL, x: 23, y: 9 },
      { type: BuildingType.HIDDEN_TESLA, x: 21, y: 10 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 1 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 12 },
      { type: BuildingType.BARRACKS, x: 26, y: 4 },
      { type: BuildingType.BARRACKS, x: 26, y: 10 },
    ],
    playerDeployZone: { xMin: 0, xMax: 7, yMin: 0, yMax: 15 },
    alienNests: [
      { x: 17, y: 3, intervalMs: 14000, max: 2 },
      { x: 17, y: 12, intervalMs: 14000, max: 2 },
    ],
  },

  // ── 第6章: 自陣は再び最大幅。重力沼＋巨大生物が中央を往復する ──
  {
    id: 'map-swamp',
    name: 'グラビティ・マーシュ',
    description: '重力異常の沼。中央を巨大なヌシが行ったり来たりしている。通るタイミングに気をつけて。',
    terrain: [
      ...rect(12, 4, 19, 11, 'SWAMP'),
      ...col(11, 'ROCK', 0, 2),
      ...col(11, 'ROCK', 13, 15),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 21, y: 3 },
      { type: BuildingType.CANNON, x: 21, y: 12 },
      { type: BuildingType.CANNON, x: 22, y: 7 },
      { type: BuildingType.HIDDEN_TESLA, x: 20, y: 8 },
      // ②の見直し: (23,8) が抜けていて、コアのすぐ横に壁のすき間ができて
      // いた(意図しない抜け穴)。y6-9の連続した壁にふさいだ。
      { type: BuildingType.WALL, x: 23, y: 6 },
      { type: BuildingType.WALL, x: 23, y: 7 },
      { type: BuildingType.WALL, x: 23, y: 8 },
      { type: BuildingType.WALL, x: 23, y: 9 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 12 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 1 },
      { type: BuildingType.BARRACKS, x: 26, y: 5 },
      { type: BuildingType.BARRACKS, x: 26, y: 9 },
    ],
    playerDeployZone: { xMin: 0, xMax: 9, yMin: 0, yMax: 15 },
    titan: {
      path: [{ x: 15, y: 1 }, { x: 15, y: 14 }],
      moveSpeed: 1.1,
      damage: 34,
      attackRange: 2.0,
      attackSpeed: 1600,
      hp: 2200,
    },
  },

  // ── 第7章: 自陣5幅と狭い。溶岩＋流星＋巣の複合 ──
  {
    id: 'map-cliffs',
    name: 'アステロイド・ゾーン',
    description: '溶岩・流星・エイリアン。ぜんぶある。せまい陣地から、すきまをぬって突破せよ。',
    terrain: [
      ...col(10, 'ROCK', 2, 9),
      ...col(18, 'ROCK', 6, 13),
      ...rect(12, 2, 15, 4, 'LAVA'),
      ...rect(13, 11, 16, 13, 'LAVA'),
      ...rect(12, 6, 16, 9, 'SWAMP'),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 24, y: 7 },
      { type: BuildingType.CANNON, x: 20, y: 2 },
      { type: BuildingType.CANNON, x: 21, y: 7 },
      { type: BuildingType.CANNON, x: 20, y: 13 },
      { type: BuildingType.HIDDEN_TESLA, x: 22, y: 4 },
      { type: BuildingType.HIDDEN_TESLA, x: 22, y: 11 },
      { type: BuildingType.WALL, x: 23, y: 6 },
      { type: BuildingType.WALL, x: 23, y: 7 },
      { type: BuildingType.WALL, x: 23, y: 8 },
      { type: BuildingType.WALL, x: 23, y: 9 },
      { type: BuildingType.GOLD_MINE, x: 26, y: 0 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 2 },
      { type: BuildingType.ARMY_CAMP, x: 25, y: 12 },
      { type: BuildingType.BARRACKS, x: 26, y: 9 },
    ],
    playerDeployZone: { xMin: 0, xMax: 4, yMin: 0, yMax: 15 },
    meteorZones: [
      { x: 19, y: 7, radius: 2.4, intervalMs: 8500, warningMs: 1600, damage: 34 },
    ],
    alienNests: [
      { x: 14, y: 7, intervalMs: 13000, max: 3 },
    ],
  },

  // ── 第8章: 自陣8幅。最終要塞＋全ギミック ──
  {
    id: 'map-citadel',
    name: 'ギャラクティック・シタデル',
    description: '銀河皇帝の最終要塞。溶岩、流星、エイリアン、そしてヌシ。すべてを越えてコアへ。',
    terrain: [
      ...col(10, 'ROCK', 0, 3),
      ...col(10, 'ROCK', 12, 15),
      ...rect(13, 0, 15, 3, 'LAVA'),
      ...rect(13, 12, 15, 15, 'LAVA'),
      ...rect(17, 6, 20, 9, 'SWAMP'),
    ],
    enemyBase: [
      { type: BuildingType.TOWN_HALL, x: 25, y: 7 },
      { type: BuildingType.CANNON, x: 19, y: 2 },
      { type: BuildingType.CANNON, x: 19, y: 13 },
      { type: BuildingType.CANNON, x: 22, y: 5 },
      { type: BuildingType.CANNON, x: 22, y: 10 },
      { type: BuildingType.HIDDEN_TESLA, x: 23, y: 7 },
      { type: BuildingType.HIDDEN_TESLA, x: 21, y: 8 },
      { type: BuildingType.WALL, x: 24, y: 5 },
      { type: BuildingType.WALL, x: 24, y: 6 },
      { type: BuildingType.WALL, x: 24, y: 9 },
      { type: BuildingType.WALL, x: 24, y: 10 },
      { type: BuildingType.WALL, x: 23, y: 5 },
      { type: BuildingType.WALL, x: 23, y: 10 },
      { type: BuildingType.GOLD_MINE, x: 27, y: 1 },
      { type: BuildingType.GOLD_MINE, x: 27, y: 14 },
      { type: BuildingType.ARMY_CAMP, x: 26, y: 3 },
      { type: BuildingType.ARMY_CAMP, x: 26, y: 11 },
      { type: BuildingType.BARRACKS, x: 27, y: 6 },
      { type: BuildingType.BARRACKS, x: 27, y: 9 },
    ],
    playerDeployZone: { xMin: 0, xMax: 7, yMin: 0, yMax: 15 },
    meteorZones: [
      { x: 12, y: 7, radius: 2.4, intervalMs: 9000, warningMs: 1700, damage: 36 },
      { x: 18, y: 3, radius: 2.2, intervalMs: 12000, warningMs: 1700, damage: 36 },
    ],
    alienNests: [
      { x: 16, y: 12, intervalMs: 15000, max: 2 },
    ],
    titan: {
      path: [{ x: 11, y: 8 }, { x: 18, y: 8 }],
      moveSpeed: 1.0,
      damage: 40,
      attackRange: 2.0,
      attackSpeed: 1600,
      hp: 2600,
    },
  },
];

export const BATTLE_MAP_BY_ID: Record<string, BattleMap> =
  Object.fromEntries(BATTLE_MAPS.map(m => [m.id, m]));

// ── PvP用の対称マップ ────────────────────────────────────────────────────
//
// キャンペーンのマップは「左＝自陣／右＝敵陣」の非対称設計なので、対人戦には
// そのまま使えない。地形が x=13.5 を軸に**完全に鏡写し**になるマップを用意し、
// どちらの側に立っても条件が同じになるようにする。
// 敵拠点（enemyBase）は空で、両者が陣地づくりで組んだ配置がそのまま入る。
const mirrorX = (x: number) => GRID_W - 1 - x;

/** 左半分に置いた地形を、右半分へ鏡写しにして返す */
const symmetric = (left: TerrainTile[]): TerrainTile[] => [
  ...left,
  ...left.map(t => ({ x: mirrorX(t.x), y: t.y, type: t.type })),
];

export const PVP_MAPS: BattleMap[] = [
  {
    id: 'pvp-mirror',
    name: 'ミラー・アリーナ',
    description: '左右まったく同じ形の対戦場。おたがいの陣地から せめこもう！',
    terrain: symmetric([
      ...col(9, 'ROCK', 1, 4),
      ...col(9, 'ROCK', 11, 14),
      ...rect(11, 6, 12, 9, 'SWAMP'),
    ]),
    enemyBase: [],
    playerDeployZone: { xMin: 0, xMax: 7, yMin: 0, yMax: GRID_H - 1 },
  },
  {
    id: 'pvp-crossfire',
    name: 'クロスファイア',
    description: '中央に溶岩の帯。上下を回りこむか、思いきって突っきるか。',
    terrain: symmetric([
      ...rect(12, 0, 13, 3, 'LAVA'),
      ...rect(12, 12, 13, 15, 'LAVA'),
      ...col(8, 'ROCK', 6, 9),
    ]),
    enemyBase: [],
    playerDeployZone: { xMin: 0, xMax: 6, yMin: 0, yMax: GRID_H - 1 },
  },
];

export const PVP_MAP_BY_ID: Record<string, BattleMap> =
  Object.fromEntries(PVP_MAPS.map(m => [m.id, m]));

/**
 * 陣地の配置を左右反転する。P2（右側）の陣地を、P1が左に組んだのと
 * 同じ形のまま右半分へ写すために使う。
 * 幅 w の建物は [x, x+w-1] を占めるので、反転後の左端は GRID_W - x - w。
 */
export function mirrorBase<T extends { type: BuildingType; x: number; y: number }>(
  base: T[],
  widthOf: (type: BuildingType) => number,
): T[] {
  return base.map(b => ({ ...b, x: GRID_W - b.x - widthOf(b.type) }));
}

/** 自陣ゾーンの広さ（マス数）。拠点づくり画面の説明に使う。 */
export function zoneSize(m: BattleMap): { w: number; h: number; cells: number } {
  const z = m.playerDeployZone;
  const w = z.xMax - z.xMin + 1;
  const h = z.yMax - z.yMin + 1;
  return { w, h, cells: w * h };
}

// ── 難易度の段ごとの敵の基地（2026-11-15）──────────────────────────────
//
// むずかしい＝砲台を1つ、げきむず＝砲台2つと電撃トラップ1つを、敵のコアの手前に足す
// （同じ章でも、段がちがうと 攻める道すじを 考えなおすことになる）。
// 置く場所は、コアに近い順に「地形も施設も無いマス」をさがして決める（毎回同じ結果）。

const TIER_EXTRA_DEFENSE: Record<ChapterTier, BuildingType[]> = {
  normal: [],
  hard: [BuildingType.CANNON],
  extreme: [BuildingType.CANNON, BuildingType.CANNON, BuildingType.HIDDEN_TESLA],
};

export function tierEnemyBase(map: BattleMap, tier: ChapterTier): BattleMap['enemyBase'] {
  const extra = TIER_EXTRA_DEFENSE[tier];
  if (extra.length === 0) return map.enemyBase;
  const base = map.enemyBase.slice();
  const core = base.find(b => b.type === BuildingType.TOWN_HALL) ?? base[0];
  if (!core) return base;
  const terrain = new Set(map.terrain.filter(t => t.type !== 'GRASS').map(t => `${t.x},${t.y}`));
  const taken = (): Set<string> => {
    const s = new Set<string>();
    for (const b of base) {
      const st = BUILDING_STATS[b.type];
      // 1マスの余白をあける（通り道をふさぎきらない・施設どうしが くっつかない）
      for (let dy = -1; dy <= st.height; dy++) for (let dx = -1; dx <= st.width; dx++) s.add(`${b.x + dx},${b.y + dy}`);
    }
    return s;
  };
  const minX = map.playerDeployZone.xMax + 6;
  for (const type of extra) {
    const st = BUILDING_STATS[type];
    const used = taken();
    let best: { x: number; y: number; score: number } | null = null;
    for (let x = minX; x <= core.x - 2; x++) {
      for (let y = 1; y <= GRID_H - 1 - st.height; y++) {
        let ok = true;
        for (let dy = 0; dy < st.height && ok; dy++) for (let dx = 0; dx < st.width && ok; dx++) {
          const k = `${x + dx},${y + dy}`;
          if (terrain.has(k) || used.has(k)) ok = false;
        }
        if (!ok) continue;
        // コアの3〜5マス手前を いちばんよい場所とする。同点は 上から・左から
        const dx = core.x - x, dy = Math.abs(y - core.y);
        const score = Math.abs(dx - 4) * 2 + Math.abs(dy - 3);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    if (best) base.push({ type, x: best.x, y: best.y });
  }
  return base;
}
