// ── CAT-WARS 経済ブリッジ ───────────────────────────────────────────────
// 戦闘中の問題（SOL の単元アプリと同じ問題）を まちがえずに解くたびに、
// CAT-WARS の通貨・部隊育成・学習の記録へ報酬を流し込む。
//
//   💠 クレジット … ずっと残る通貨。施設を買う・レベルを上げる・傭兵召集。問題と勝利でたまる。
//   ⚡ エナジー    … その日だけの通貨。出撃バフ（DailyBuffsPanel）に使う。
//   部隊XP         … 出撃の5枠の系統に入る（上限は かけら＝learn/shards.ts）。
//   学習の記録     … まちがえずに解いた回数（かけら）と、きょうの数（その日に動かせる施設）。useStudyStore。
//   シールコイン   … 収集のカプセル（collection/coins.ts）。まちがえずに解いたときだけ。useCollectionStore。
//   （内部の store フィールド名 resources.gold=💠 / dailyStars=⚡ は そのまま）
//
// 数は data/rewards.ts（scripts/progressionSim.ts と同じもの）。

import { usePlayerStore } from './store/usePlayerStore';
import { useProgressStore } from './store/useProgressStore';
import { useArmyStore } from './store/useArmyStore';
import { useStudyStore } from './store/useStudyStore';
import { difficultyFactor } from './data/problemWeights';
import { CREDIT_PER_CORRECT, ENERGY_PER_CORRECT, STUDY_XP_PER_CORRECT } from './data/rewards';
import { recordCollectionAnswer } from './collection/record';
import type { LogLike } from 'learning-app-kit/sync';
import { getStudent } from 'learning-app-kit/sync';
import { CATALOGS } from 'learning-app-kit/catalog';
import { isPortalConfigured } from './portal/config';
import { answerSync, CATWARS_APP_ID } from './portal/answerSync';
import { PACK_UNITS } from './learn/gradePack';

/* ── 学級ポータルへの 1問の記録（CW-5a で形・CW-5b・2026-11-16 から送る）─────────────────────
 * 持ち主の決定（2026-11-16）：戦闘の中で解いた問題は **学習の記録として送る**。
 * 送り方（端末に のこす・まとめて送る・ことわられたら あとで送りなおす）は portal/answerSync.ts。
 *
 * 形のきまり（スタミナが二重に たまらない・「戦闘→スタミナ→戦闘」の輪に ならないため）：
 *   - app_id は 'catwars'（単元アプリの app_id では送らない。単元アプリの app_id で送ると、サーバの _sanmon_pools が
 *     小4算数のアプリの正解として 町のスタミナを ふやし、熟達・町の解放・出撃1回の数 にも入ってしまう）。
 *   - skill_id は 単元アプリの skill_id（カタログと同じ文字列。前に何も足さない）。
 *   - **カタログ catwars（kit）に無い skill_id は送らない**。module_id は カタログで その項目が入っている町
 *     （1つの項目は1つの町にだけ入っている。わり算の筆算の 検算などは ÷1けた の町。戦闘の単元と ずれることがある）。
 *   - label は「たたかい：」で はじめる（SANMON の「バトル：」と同じ考え：サーバが 見分けられるように）。
 *   - detail は 付けない（sync_events は detail のある行を 本番テストとして test_result に入れるため）。
 *   - 最初の まちがいの型・答え は 解答画面（apps/）が わたせるように なったら入れる（いまの apps/ の onMiss は 何も わたさない）。
 *   - おためし・体験版は 送らない（getStudent() が null。SANMON の syncLearningToPortal と同じ）。
 */

export { CATWARS_APP_ID };
/** 記録の label の はじめ（サーバが「戦闘の中の答え」と見分ける） */
export const CATWARS_LABEL_PREFIX = 'たたかい：';
/** 送る（CW-5b。サーバの準備の前は ことわられるが、端末に のこして あとで送りなおす） */
export const PORTAL_SEND_ENABLED = true;

/** カタログ catwars：skill_id → 町（module_id） */
const CATALOG_TOWN = new Map<string, string>(
  (CATALOGS[CATWARS_APP_ID]?.modules ?? []).flatMap((m) => m.skills.map((sk) => [sk.skill_id, m.module_id] as [string, string])),
);
/** その skill_id が入っている カタログ catwars の町（無ければ null＝送らない） */
export const catalogTownOf = (skillId: string): string | null => CATALOG_TOWN.get(skillId) ?? null;

export interface PortalAnswer {
  unitKey: string;
  skillId: string;
  perfect: boolean;
  /** 単元アプリの app_id（無ければ 単元から引く） */
  appId?: string;
  /** 項目の名前（カタログの label） */
  label?: string;
  difficulty?: number;
  /** 1問の 最初の まちがいの型・答え（解答画面が わたせるときだけ） */
  missType?: string;
  missAnswer?: string;
  ts: number;
}

let seq = 0;
/** 1問ぶんの記録（kit の LogLike）。カタログ catwars に無い skill_id は null（送らない） */
export function buildPortalLog(a: PortalAnswer): LogLike | null {
  const town = catalogTownOf(a.skillId);
  if (!town) return null;
  const app = a.appId ?? PACK_UNITS.find((u) => u.key === a.unitKey)?.appId ?? '';
  seq = (seq + 1) % 1000;
  return {
    id: `cw-${a.ts}-${seq}`.slice(0, 64),
    ts: a.ts,
    skillId: a.skillId,
    moduleId: town,
    correct: a.perfect,
    mistakes: a.perfect ? 0 : 1,
    label: `${CATWARS_LABEL_PREFIX}${app ? `[${app}] ` : ''}${a.label ?? a.skillId}`.slice(0, 80),
    ...(a.perfect ? {} : { missType: a.missType, missAnswer: a.missAnswer }),
  };
}

/** 1問の記録を 学級ポータルへ（端末に のこして まとめて送る）。のこした記録を返す（おためし・カタログに無い項目は null） */
export function sendAnswerToPortal(a: PortalAnswer): LogLike | null {
  if (!PORTAL_SEND_ENABLED || !isPortalConfigured || !getStudent()) return null;   // おためし・体験版・つないでいないビルドは 送らない
  const log = buildPortalLog(a);
  if (!log) return null;
  return answerSync.queue(log) ? log : null;
}

/** むずかしさ3を 1.0 とした倍率（1で約0.75倍、5で約1.25倍） */
function studyMultiplier(difficulty = 3): number {
  return difficultyFactor(difficulty) / difficultyFactor(3);
}

/**
 * 1問ぶんの結果を CAT-WARS の経済に反映する（戦闘中の問題から呼ぶ）。
 * @param perfect まちがえずに解けたか
 * @param item 単元の key・記録の名前（単元アプリの skill_id）・むずかしさ 1〜5
 * @param formation 出撃の5枠（XP を入れる系統）
 */
export function grantStudyReward(
  perfect: boolean,
  item: { unitKey: string; skillId: string; difficulty?: number; appId?: string; label?: string },
  formation: string[],
): void {
  const progress = useProgressStore.getState();
  // 学習量を記録（バフのティア解放条件・連続日数）
  try { progress.recordAnswer(item.skillId ?? 'study', perfect); } catch { /* noop */ }
  useStudyStore.getState().record(item.unitKey, item.skillId, perfect);
  // 収集：シールコイン（学習の成果だけ）・ふくしゅう・れんぞく学習の記録（collection/）
  try { recordCollectionAnswer({ unitKey: item.unitKey, skillId: item.skillId, difficulty: item.difficulty, perfect }); } catch { /* noop */ }
  // 学級ポータルへの記録（名乗っているときだけ。上の sendAnswerToPortal）
  try { sendAnswerToPortal({ unitKey: item.unitKey, skillId: item.skillId, appId: item.appId, label: item.label, perfect, difficulty: item.difficulty, ts: Date.now() }); } catch { /* noop */ }
  if (!perfect) return;

  const m = studyMultiplier(item.difficulty ?? 3);
  usePlayerStore.getState().addResources(Math.round(CREDIT_PER_CORRECT * m));
  progress.addDailyStars(Math.max(1, Math.round(ENERGY_PER_CORRECT * m)));
  const army = useArmyStore.getState();
  const xp = Math.max(1, Math.round(STUDY_XP_PER_CORRECT * m));
  for (const id of formation) army.addXp(id, xp);
}
