/**
 * 学年パックの検査：すべての単元に出せる問題があり、すべての項目で問題を作れることを確かめる。
 *   npm run test:pack
 * （解答画面は React の部品なので、ここでは問題を作る関数 make だけを呼ぶ。SANMON の verify-app-rounds と同じ考え方）
 */
import { APP_ROUNDS } from '../apps/registry';
import { buildPackRounds, PACK_UNITS } from '../catwars/learn/gradePack';

const rounds = buildPackRounds(APP_ROUNDS);
let bad = 0;
for (const u of PACK_UNITS) {
  const mine = rounds.filter((r) => r.unitKey === u.key);
  const diffs = [1, 2, 3, 4, 5].map((d) => mine.filter((r) => r.difficulty === d).length).join('/');
  console.log(`${mine.length ? '✓' : '✗'} ${u.name}（${u.key}・${u.appId}）: ${mine.length}項目  むずかしさ1〜5=${diffs}`);
  if (mine.length === 0) bad++;
}
let made = 0;
for (const r of rounds) {
  const def = APP_ROUNDS[r.regKey]?.[r.round];
  if (!def?.make) continue;
  try {
    for (let i = 0; i < 20; i++) { if (def.make(r.skillId) == null) throw new Error('null'); }
    made++;
  } catch (e) { console.log(`✗ 問題を作れない: ${r.regKey}/${r.round} (${r.skillId}) ${(e as Error).message}`); bad++; }
}
const keys = new Set(rounds.map((r) => `${r.unitKey}/${r.skillId}`));
if (keys.size !== rounds.length) { console.log(`✗ 同じ単元に同じ項目が重なっている（${rounds.length - keys.size}件）`); bad++; }
console.log(`合計 ${rounds.length} 項目・うち ${made} 項目で問題を各20回作れた`);
process.exit(bad ? 1 : 0);
