/**
 * 出撃のスタミナ：どの町から使うか・1回いくつか（CW-5a・2026-11-16）。純粋な関数だけ（試験 scripts/portalTest.ts）。
 *
 * - スタミナは SANMON と共通（kit の SanmonStatus。数えるのはサーバの sanmon_status／sanmon_spend）。
 * - 出撃1回は SANMON の ぼうけんのバトル1回と同じ。サーバの sanmon_spend は reason に「@町」があると
 *   その町の達成度で 数を決めなおす（送った数は使わない）。ここは画面に「1回 n」を出すための 同じ数え方。
 * - 町：出撃メンバーの系統に結びついた単元（learn/gradePack の FAMILY_UNITS）のうち、
 *   その町で使えるスタミナ（町のスタミナ）が いちばん多い町。同じなら 1回の数が少ない町、それも同じなら 学習の順で先の町。
 */
import { SANMON_RULES, SANMON_UNITS, staminaForTown, type SanmonStatus } from 'learning-app-kit/sanmon';
import { CATALOGS } from 'learning-app-kit/catalog';
import { PACK_UNITS, unitsForFamily } from '../learn/gradePack';

/*
 * ── 町の達成度 と バトル1回の数 ─────────────────────────────────────
 * SANMON の utils/townCost.ts と同じ（2026-11-11・11-12 先生と決めた。サーバは _sanmon_town_cost）。
 *   達成度＝その町の単元の練習の項目のうち 熟達（5問れんぞくノーミス）した割合。100％→2・75％以上→3・50％以上→4・それより下→5。
 *   アプリの無い町は 3（CAT-WARS では アプリの無い町は えらばれない）。
 * 2つのアプリに同じ写しがあるので、kit に移すのが よい（持ち主に相談。docs/PORTAL.md）。
 */
const unitSkills = new Map<string, string[]>(
  SANMON_UNITS.filter((u) => u.appId && CATALOGS[u.appId]).map((u) => [
    u.key,
    CATALOGS[u.appId!].modules
      .filter((m) => !u.modules || u.modules.includes(m.module_id))
      .flatMap((m) => m.skills.map((s) => s.skill_id)),
  ]),
);

/** その町の達成度（0〜1）。アプリの無い町は null */
export function townMastery(status: Pick<SanmonStatus, 'apps'> | null | undefined, townKey: string | null | undefined): number | null {
  if (!townKey) return null;
  const skills = unitSkills.get(townKey);
  const unit = SANMON_UNITS.find((u) => u.key === townKey);
  if (!skills || skills.length === 0 || !unit?.appId) return null;
  const mastered = new Set(status?.apps?.[unit.appId]?.mastered ?? []);
  return skills.filter((s) => mastered.has(s)).length / skills.length;
}

export const NO_APP_TOWN_COST = 3;

/** 出撃1回のスタミナ（めやす。決めるのはサーバ） */
export function sortieCost(status: Pick<SanmonStatus, 'apps'> | null | undefined, townKey: string | null | undefined): number {
  const unit = townKey ? SANMON_UNITS.find((u) => u.key === townKey) : undefined;
  if (unit && !unit.appId) return NO_APP_TOWN_COST;
  const r = townMastery(status, townKey);
  if (r == null) return SANMON_RULES.battleCost;
  if (r >= 1) return 2;
  if (r >= 0.75) return 3;
  if (r >= 0.5) return 4;
  return SANMON_RULES.battleCost;
}

/** 出撃メンバーの系統に結びついた単元の key（重なりなし・学習の順） */
export function candidateTowns(formation: readonly string[]): string[] {
  const set = new Set<string>();
  for (const f of formation) for (const k of unitsForFamily(f)) set.add(k);
  if (set.size === 0) for (const u of PACK_UNITS) set.add(u.key);
  const order = SANMON_UNITS.map((u) => u.key);
  return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** その出撃で スタミナを使う町（上の きまり） */
export function pickSortieTown(formation: readonly string[], status: Pick<SanmonStatus, 'stamina' | 'towns' | 'apps'> | null | undefined): string | null {
  const cands = candidateTowns(formation);
  let best: string | null = null;
  let bestTown = -1;
  let bestCost = Infinity;
  for (const k of cands) {
    const t = staminaForTown(status, k).town;
    const c = sortieCost(status, k);
    if (t > bestTown || (t === bestTown && c < bestCost)) { best = k; bestTown = t; bestCost = c; }
  }
  return best;
}

export const townNameOf = (key: string | null | undefined): string =>
  (key && SANMON_UNITS.find((u) => u.key === key)?.name) || '';

/** 出撃の前に出す スタミナのようす（町・共通・1回の数・あと何回） */
export interface SortieStamina {
  townKey: string | null;
  townName: string;
  town: number;
  common: number;
  cost: number;
  /** あと何回 出撃できるか（めやす） */
  times: number;
  enough: boolean;
}
export function sortieStamina(formation: readonly string[], status: Pick<SanmonStatus, 'stamina' | 'towns' | 'apps'> | null | undefined): SortieStamina {
  const townKey = pickSortieTown(formation, status);
  const s = staminaForTown(status, townKey);
  const cost = sortieCost(status, townKey);
  return { townKey, townName: townNameOf(townKey), town: s.town, common: s.common, cost, times: Math.floor(s.total / cost), enough: s.total >= cost };
}

/** スタミナが たりないときの やさしい案内（責めない） */
export function shortageMessage(st: Pick<SortieStamina, 'townName' | 'town' | 'common' | 'cost'>): string {
  const where = st.townName ? `『${st.townName}』の 単元アプリ` : '単元アプリ';
  return `スタミナが あと すこし たりないよ（町 ${st.town}・共通 ${st.common}。出撃には ${st.cost}）。${where}で れんしゅうすると たまるよ。たまったら また 出撃しよう！`;
}
