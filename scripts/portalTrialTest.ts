/**
 * [17] 体験版（SOL の体験の入口 #trial から開いたタブ。CW-5c）の試験。  npm run test:portal（portalTest.ts のあと）
 * サーバは ぜんぶ 差しかえる（本番のサーバには 何も送らない）。
 *   - 先生が PRISM の管理タブで閉じた項目（出撃・ネコ部隊・あつめる）だけが閉じる。はじめは全部 使える
 *   - 名乗らない（学級コードが入っていても getStudent は null）・スタミナを使わない・記録もセーブも送らない
 *   - デモの しるしが あっても 体験は体験のまま
 */
import './lib/memStorage';
import './lib/trialEnv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTrial, getStudent, loadPortalConfig, trialAllows, TRIAL_FEATURE_SETS } from 'learning-app-kit/sync';
import { CATWARS_TRIAL_KEYS, catwarsTrialKeyOf } from '../catwars/portal/trialFeatures';
import { createSortieGate } from '../catwars/portal/gate';
import { createAnswerSync } from '../catwars/portal/answerSync';
import { createSaveSync } from '../catwars/portal/saveSync';
import { exportBundle, importBundle } from '../catwars/portal/saveBundle';
import { buildPortalLog } from '../catwars/bridge';
import { unitSkillIds } from '../catwars/learn/gradePack';
import { isDemo, DEMO_KEY } from '../catwars/portal/saveProfile';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const g = globalThis as unknown as { fetch: unknown; localStorage: Storage };

console.log('[17] 体験版');
check(isTrial() === true, '体験のタブ（#trial を受け取った）');

// 項目のキー（kit の TRIAL_FEATURE_SETS.catwars と同じ。PRISM の管理タブが この一覧から項目を出す）
const kitSet = (TRIAL_FEATURE_SETS as unknown as Record<string, { key: string }[] | undefined>).catwars;
if (kitSet) check(JSON.stringify(kitSet.map((f) => f.key)) === JSON.stringify(Object.values(CATWARS_TRIAL_KEYS)), `kit の項目と同じキー：${kitSet.map((f) => f.key).join('・')}`);
else console.log('  - kit 0.37.0 より前（TRIAL_FEATURE_SETS.catwars が無い）：キーの くらべは kit を上げたあと');
check(catwarsTrialKeyOf('range') === 'sortie' && catwarsTrialKeyOf('battle') === 'sortie' && catwarsTrialKeyOf('prep') === 'sortie', '出撃の画面（範囲〜戦闘）→ sortie');
check(catwarsTrialKeyOf('army') === 'army' && catwarsTrialKeyOf('buffs') === 'army' && catwarsTrialKeyOf('mercs') === 'army', 'ネコ部隊・出撃バフ・なかまを よぶ → army');
check(catwarsTrialKeyOf('collection') === 'collection' && catwarsTrialKeyOf('home') === null, 'あつめる → collection・ホームは 項目に入らない');

// はじめ（設定がまだ読めていない・項目の設定が無い）は 全部 使える
check(Object.values(CATWARS_TRIAL_KEYS).every((k) => trialAllows(k)), 'はじめは 全部 使える');

// 先生が「ネコ部隊」を閉じた（サーバの portal_app_config を差しかえる）
const calls: string[] = [];
let features: Record<string, boolean> = { army: false };
g.fetch = async (url: string) => {
  calls.push(String(url));
  if (String(url).endsWith('/rpc/portal_app_config')) {
    return new Response(JSON.stringify({ require_join: false, app_id: 'catwars', trial_listed: true, trial_features: features }), { status: 200 });
  }
  return new Response('null', { status: 200 });
};
const CFG = { supabaseUrl: 'https://fake-portal.test', supabaseKey: 'sb_publishable_dummy' };
await loadPortalConfig(CFG);
check(trialAllows('army') === false, '閉じた項目（ネコ部隊）は 使えない');
check(trialAllows('sortie') === true && trialAllows('collection') === true, 'ほかの項目は 使える');
features = { sortie: false, collection: false };
await loadPortalConfig(CFG);
check(!trialAllows('sortie') && !trialAllows('collection') && trialAllows('army'), '設定を変えると 読みなおしで 変わる');
calls.length = 0;

// 名乗らない：学級コードが入っていても（ふつうは index.tsx が あそばせないが、念のため）
g.localStorage.setItem('lak_student_v1', JSON.stringify({ studentId: 'stu-x', joinCode: 'X', number: 3 }));
check(getStudent() === null, '体験中は 名乗っていない（getStudent が null）');

// 関門：スタミナを使わない
const spent: string[] = [];
const gate = createSortieGate({
  configured: () => true,
  studentId: () => getStudent()?.studentId ?? null,
  spend: async (...a) => { spent.push(String(a[1])); return { ok: true, stamina: 0 }; },
  fetchModes: async () => { spent.push('modes'); return { ok: true, modes: {} }; },
  newEventId: () => 'ev-1',
});
const r = await gate.startBattle({ formation: ['magic'], status: null, modes: { catwars: false } });
check(r.ok === true && r.spent === false && spent.length === 0, '出撃の関門：スタミナを使わない・モードの鍵を聞かない');

// 記録・セーブを送らない
const sent: string[] = [];
const as = createAnswerSync({
  configured: () => true,
  studentId: () => getStudent()?.studentId ?? null,
  flush: async () => { sent.push('flush'); return { ok: true }; },
  store: () => g.localStorage,
  setTimer: (fn) => { fn(); return 1; },
  clearTimer: () => { /* noop */ },
});
check(as.queue(buildPortalLog({ unitKey: 'fraction', skillId: unitSkillIds('fraction')[0], perfect: true, ts: 1 })!) === false, '記録：のこさない');
await as.flushNow();
const ss = createSaveSync({
  configured: () => true,
  studentId: () => getStudent()?.studentId ?? null,
  load: async () => { sent.push('load'); return { ok: true, data: null }; },
  save: async () => { sent.push('save'); return true; },
  exportBundle, importBundle, store: () => g.localStorage,
});
await ss.pushSave();
await ss.pullSaveIfNewer();
check(sent.length === 0 && calls.length === 0, `記録も セーブも 送らない・読まない（${sent.length + calls.length} 回）`);

// デモの しるしが あっても 体験は体験のまま
g.localStorage.setItem(DEMO_KEY, '1');
check(isDemo() === false, 'デモの しるしが あっても 体験のタブは デモにしない');
g.localStorage.removeItem(DEMO_KEY);

// 画面のつなぎ（ソース）
const cw = readFileSync(join(process.cwd(), 'catwars/components/CatWars.tsx'), 'utf8');
check(/useTrialAllows\(\)/.test(cw) && /<TrialLock\b/.test(cw), 'CatWars.tsx：閉じた項目は kit の TrialLock（「たいけんばんでは つかえないよ」）');
check(/if \(viewKey && !trialOpen\(viewKey\)\)/.test(cw), '閉じた項目の画面には ボタン以外の道からも 入れない');
check(/data-testid="trial-chip"/.test(cw), 'ホームに「たいけんばん」の しるし');

console.log(fails === 0 ? '\nぜんぶ 合格' : `\n${fails} こ 不合格`);
process.exit(fails === 0 ? 0 : 1);
