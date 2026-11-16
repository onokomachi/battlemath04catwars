#!/usr/bin/env node
/**
 * 単元アプリの写し（apps/）を、SANMON の apps/ と同じにする。
 *
 * 正本は各単元アプリ。SANMON が `npm run sync-apps` で写したもの（apps/ と apps/_shims・sanmon.tsx）を、ここへそのまま写す。
 * ここでは手で直さない（直すときは 単元アプリ → SANMON → ここ の順）。
 *
 *   node scripts/sync-apps-from-sanmon.mjs           # ../syo4-battlemath04pokemon/apps から写す
 *   node scripts/sync-apps-from-sanmon.mjs --check   # ずれていないかだけ見る（ずれていたら exit 1）
 *   SANMON_ROOT=/path/to/syo4-battlemath04pokemon node scripts/sync-apps-from-sanmon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(process.env.SANMON_ROOT ?? path.resolve(root, '..', 'syo4-battlemath04pokemon'), 'apps');
const to = path.join(root, 'apps');
const check = process.argv.includes('--check');
if (!fs.existsSync(from)) { console.error(`! ${from} が無い（SANMON を となりに clone する）`); process.exit(check ? 0 : 1); }

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))]);
const src = new Set(walk(from)), dst = new Set(walk(to));
let drift = 0, copied = 0, removed = 0;
for (const rel of src) {
  const a = fs.readFileSync(path.join(from, rel));
  const b = dst.has(rel) ? fs.readFileSync(path.join(to, rel)) : null;
  if (b && a.equals(b)) continue;
  if (check) { console.log(`ずれ: apps/${rel}`); drift++; continue; }
  fs.mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
  fs.writeFileSync(path.join(to, rel), a); copied++;
}
for (const rel of dst) {
  if (src.has(rel)) continue;
  if (check) { console.log(`余分: apps/${rel}`); drift++; continue; }
  fs.rmSync(path.join(to, rel)); removed++;
}
if (check) { console.log(drift ? `✗ ${drift} 件ずれています` : '✓ 写しは SANMON と同じです'); process.exit(drift ? 1 : 0); }
console.log(`写した ${copied} 件・消した ${removed} 件`);
