/**
 * 図鑑（2026-11-16 CW-4c）：ネコ（系統×進化の段階）と 敵（兵の種類＋各章のボス）。docs/REBUILD_SPEC.md §3d。
 *
 * ・ネコ：その系統が使えるようになったら 段階1、Lv10・Lv30 で 段階2・3 を「見つけた」にする。まだのものは シルエットと会い方。
 * ・敵：戦闘で見たら登録、たおしたら「たおした数」。段（ふつう/むずかしい/げきむず）ごとの 勝ちのしるし。
 *   各章のボス（敵の たいちょう）は、その章で戦ったら登録、勝ったら たおした数と その段の しるし。
 *   見た・たおした は sim の外（戦闘の画面）で、盤上の敵の出入りから拾う（sim には手を入れない）。
 * 弱点のヒント（ENEMY_TRAIT_NOTE）は 見つけたあとにだけ出す。
 */
import { CHARACTERS, type CharacterFamily } from '../data/characters';
import { BARRACKS_UNLOCKS } from '../data/facilities';
import { CAMPAIGN, ENEMY_TRAIT_NOTE, ENEMY_UNIT_STATS, type EnemyUnitKind } from '../data/campaign';

// ── ネコ ──
/** 図鑑の鍵：「系統:段階」 */
export const catDexKey = (familyId: string, stage: 1 | 2 | 3) => `${familyId}:${stage}`;
export const CAT_DEX_KEYS: string[] = CHARACTERS.flatMap((c) => ([1, 2, 3] as const).map((st) => catDexKey(c.id, st)));

/** まだ会っていない ネコの「どうすれば会えるか」 */
export function catHowToMeet(fam: CharacterFamily, stage: 1 | 2 | 3): string {
  if (stage === 2) return 'Lv10 で しんか。たたかって・問題を といて 育てよう';
  if (stage === 3) return 'Lv30 で しんか。レベルの 上限は 単元を まちがえずに とくと 上がる';
  if (fam.isStarter) return 'はじめから なかま';
  const b = BARRACKS_UNLOCKS.find((u) => u.ids.includes(fam.id));
  if (b) return `兵舎を ${b.need}つ もつと なかまに なる（陣地づくりで 買える）`;
  return '「なかまを よぶ」（💠クレジット）で なかまに なる';
}

/** いま見つけている ネコの鍵（使える系統と レベルから） */
export function foundCatKeys(unlocked: string[], levels: Record<string, number>): string[] {
  const out: string[] = [];
  for (const c of CHARACTERS) {
    if (!unlocked.includes(c.id)) continue;
    const lv = levels[c.id] ?? 1;
    out.push(catDexKey(c.id, 1));
    if (lv >= 10) out.push(catDexKey(c.id, 2));
    if (lv >= 30) out.push(catDexKey(c.id, 3));
  }
  return out;
}

// ── 敵 ──
export interface EnemyDexEntry {
  /** 鍵：兵は「unit:grunt」、章のボスは「boss:ch1」 */
  key: string;
  kind: 'unit' | 'boss';
  name: string;
  /** 兵の種類（unit のとき） */
  unitKind?: EnemyUnitKind;
  /** 章（boss のとき） */
  chapterId?: string;
  chapterNo?: number;
  /** 絵（兵は ネコの絵を敵の色で。ボスは まだ絵が無いので 絵文字） */
  subType?: string;
  emoji: string;
  /** 説明（見つけたあとに出す） */
  note: string;
  /** 弱点のヒント（見つけたあとに出す） */
  hint?: string;
  /** どこで会えるか（まだのとき） */
  where: string;
}

const UNIT_ORDER: EnemyUnitKind[] = ['grunt', 'shooter', 'runner', 'brute', 'guard', 'medic', 'kamikaze', 'flyer', 'boss'];
const UNIT_EMOJI: Record<EnemyUnitKind, string> = {
  grunt: '🤖', shooter: '🔫', runner: '💨', brute: '🦾', flyer: '🪽', guard: '🛡️', medic: '💚', kamikaze: '💥', boss: '👹',
};
const UNIT_NOTE: Record<EnemyUnitKind, string> = {
  grunt: 'いちばん よく 出てくる ガラクタの 兵。数は 多いが うたれよわい。',
  shooter: 'すこし はなれた ところから うってくる。',
  runner: '足が はやい。基地まで いっきに かけこんでくる。',
  brute: 'HPが とても 多い 重たい ロボ。兵舎が あると 出てくる。',
  flyer: '空を とぶ ドローン。',
  guard: 'たてを もった ロボ。',
  medic: 'なかまを なおす ドローン。',
  kamikaze: 'ネコには 目もくれず 施設に つっこむ。',
  boss: '皇帝を まもる つよい 兵。シールドを もつことが ある。',
};
const UNIT_HINT: Partial<Record<EnemyUnitKind, string>> = {
  grunt: 'どの ネコでも たおせる。数で おされないように',
  shooter: 'タンク系で うけて、近接系で ちかづこう',
  runner: '基地の ちかくに 壁や 砲台を おこう',
  brute: '魔法系・爆発系で HPを けずろう。兵舎を こわすと 出てこない',
  boss: 'シールドは ふくしゅうカードで わる。われるまで ダメージが 1わりしか 入らない',
};

/** その兵が 出てくる いちばん早い ところ（ふつう→むずかしい→げきむず の順で） */
function unitWhere(kind: EnemyUnitKind): string {
  const ch = CAMPAIGN.find((c) => c.difficulty.unitPool.includes(kind));
  if (ch) return `ふつう 第${ch.no}章から 出てくる`;
  if (kind === 'kamikaze') return 'むずかしい の 第1章から 出てくる';
  if (kind === 'guard') return 'むずかしい の 第3章 か げきむず から 出てくる';
  if (kind === 'medic') return 'むずかしい の 第6章 か げきむず 第3章から 出てくる';
  if (kind === 'boss') return 'ふつう 第8章・むずかしい 第4章・げきむず の ボス戦で 出てくる';
  return 'むずかしい・げきむず で 出てくる';
}

export const ENEMY_DEX: EnemyDexEntry[] = [
  ...UNIT_ORDER.map((k): EnemyDexEntry => ({
    key: `unit:${k}`, kind: 'unit', unitKind: k,
    name: ENEMY_UNIT_STATS[k].label, subType: ENEMY_UNIT_STATS[k].subType, emoji: UNIT_EMOJI[k],
    note: UNIT_NOTE[k], hint: ENEMY_TRAIT_NOTE[k]?.counter ?? UNIT_HINT[k], where: unitWhere(k),
  })),
  ...CAMPAIGN.map((c): EnemyDexEntry => ({
    key: `boss:${c.id}`, kind: 'boss', chapterId: c.id, chapterNo: c.no,
    name: c.enemyName, emoji: '👑', note: `${c.enemyTitle}。${c.background}`, hint: c.hint,
    where: `第${c.no}章「${c.title}」で たたかう`,
  })),
];
export const ENEMY_DEX_BY_KEY: Record<string, EnemyDexEntry> = Object.fromEntries(ENEMY_DEX.map((e) => [e.key, e]));
export const unitDexKey = (k: string) => `unit:${k}`;
export const bossDexKey = (chapterId: string) => `boss:${chapterId}`;
/** 段の しるしの鍵：「unit:grunt@hard」 */
export const markKey = (dexKey: string, tier: string) => `${dexKey}@${tier}`;
