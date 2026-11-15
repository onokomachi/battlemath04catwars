/**
 * 学年パック：その学年で「どの単元の、どの問題を出すか」。
 *
 * CAT-WARS の問題は、SOL の単元アプリと同じ問題・同じ答え方にする（2026-11-15 持ち主と決めた）。
 * 問題の作り方と解答画面は apps/<app>/（単元アプリの写し。SANMON と同じもの）。
 * ここは「単元（町）→ 出せる問題（ラウンド）」の対応だけを持つ。
 *
 * ゲーム本体はこのパックだけを見る。5年・6年は、パック（単元の一覧・apps の写し・カタログ）を足す。
 * 単元の一覧と分け方は kit の SANMON_UNITS と同じ（共通スタミナ・町のスタミナの鍵をそろえるため）。
 */
import { CATALOGS, lookupSkill } from 'learning-app-kit/catalog';
import { SANMON_UNITS } from 'learning-app-kit/sanmon';
import type { AppRoundDef } from '../../apps/types';

export type RoundRegistry = Record<string, Record<string, AppRoundDef>>;

export interface PackUnit {
  /** 単元の鍵（kit の町の key と同じ） */
  key: string;
  name: string;
  appId: string;
  /** その単元に入れるモジュール（無ければアプリの全部） */
  modules?: string[];
}

export interface PackRound {
  unitKey: string;
  appId: string;
  /** apps/registry の鍵（app → round） */
  regKey: string;
  round: string;
  /** 出すレベル（単元アプリの skill_id。記録の名前もこれ） */
  skillId: string;
  label: string;
  moduleTitle: string;
  /** むずかしさ 1〜5（カタログの並びから。あとで学級の正答率に置きかえる） */
  difficulty: number;
}

/** 1つの単元アプリの問題が、registry の複数の鍵に分かれているもの */
const REG_KEYS: Record<string, string[]> = { syousu: ['syousu', 'decimal'] };

/** わり算の筆算は2つの単元に分かれる：筆算そのもの（hissan-?-1＝÷1けた／?-2・?-3＝÷2けた）。ほかの項目は共有 */
const unitAccepts = (unitKey: string, skillId: string): boolean => {
  const m = /^hissan-\d-(\d)$/.exec(skillId);
  if (!m) return true;
  if (unitKey === 'div1') return m[1] === '1';
  if (unitKey === 'div2') return m[1] !== '1';
  return true;
};

export const GRADE = 4;

/** 単元アプリのある単元だけ（アプリの無い単元は、単元アプリと同じ問題が無いので出さない） */
export const PACK_UNITS: PackUnit[] = SANMON_UNITS
  .filter((u) => !!u.appId)
  .map((u) => ({ key: u.key, name: u.name, appId: u.appId!, modules: u.modules }));

/** アプリのカタログでの並び順（小さいほど先に学ぶ） */
function catalogOrder(appId: string, skillId: string): number {
  const all = (CATALOGS[appId]?.modules ?? []).flatMap((m) => m.skills.map((x) => x.skill_id));
  const i = all.indexOf(skillId);
  return i < 0 ? all.length : i;
}

/** registry（apps の解答画面の一覧）から、単元ごとの出せる問題を作る */
export function buildPackRounds(registry: RoundRegistry): PackRound[] {
  const out: PackRound[] = [];
  for (const u of PACK_UNITS) {
    for (const regKey of REG_KEYS[u.appId] ?? [u.appId]) {
      for (const [round, def] of Object.entries(registry[regKey] ?? {})) {
        // 1つのラウンドに複数のレベルがあるときは、レベルごとに1件にする（記録の名前を項目にそろえるため）
        for (const skillId of def.levels) {
          const s = lookupSkill(u.appId, skillId);
          if (!s || s.is_extra) continue;
          if (u.modules && !u.modules.includes(s.module_id)) continue;
          if (!unitAccepts(u.key, skillId)) continue;
          out.push({
            unitKey: u.key, appId: u.appId, regKey, round, skillId,
            label: s.label, moduleTitle: s.module_title, difficulty: 3,
          });
        }
      }
    }
  }
  // 同じ単元に同じ項目が2つの鍵から入ることがあるので、1つにする
  const seen = new Set<string>();
  const uniq = out.filter((r) => { const k = `${r.unitKey}/${r.skillId}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // むずかしさ 1〜5：**その単元の中で**先に学ぶ項目ほど 1、あとの項目ほど 5（あとで学級の正答率に置きかえる）
  for (const u of PACK_UNITS) {
    const mine = uniq.filter((r) => r.unitKey === u.key).sort((a, b) => catalogOrder(a.appId, a.skillId) - catalogOrder(b.appId, b.skillId));
    mine.forEach((r, i) => { r.difficulty = mine.length < 2 ? 3 : 1 + Math.round((i / (mine.length - 1)) * 4); });
  }
  out.length = 0; out.push(...uniq);
  return out;
}

let cache: { registry: RoundRegistry; rounds: PackRound[] } | null = null;
let loading: Promise<{ registry: RoundRegistry; rounds: PackRound[] }> | null = null;

/** 解答画面は重いので、要るときにだけ読みこむ */
export function loadPack(): Promise<{ registry: RoundRegistry; rounds: PackRound[] }> {
  if (cache) return Promise.resolve(cache);
  loading ??= import('../../apps/registry').then((m) => {
    const registry = m.APP_ROUNDS as RoundRegistry;
    cache = { registry, rounds: buildPackRounds(registry) };
    return cache;
  });
  return loading;
}

/** 報酬の重み（0.75〜1.45）。むずかしい項目ほど多い。かんたんな項目だけの周回を得にしない */
export function rewardWeight(difficulty: number): number {
  const d = Math.max(1, Math.min(5, difficulty || 3));
  return 0.75 + 0.175 * (d - 1);
}
