#!/usr/bin/env node
/**
 * 持ち主が つくった 絵（Gemini など）を、画面の「差しこみ口」の 大きさ・形式に して 置く道具。
 *
 *   node scripts/import-art.mjs <画像ファイル> <名前>        … 1まい
 *   node scripts/import-art.mjs <フォルダ>                    … 名前どおりの ファイル（<名前>.png / .jpg / .jpeg / .webp）を まとめて
 *
 * 名前（置き場所）：
 *   bg-home | bg-stage | bg-expedition | bg-collection | bg-friend | bg-versus   → public/assets/bg/<名前>.webp        横 1600px・品質 82
 *   emblem-catwars                                                            → public/assets/emblem/<名前>.webp    512px・白い背景を 消す
 *   capsule-machine | capsule-open                                            → public/assets/capsule/<名前>.webp   512px・白い背景を 消す
 *
 * しるし・カプセルは「ふちから つながっている 白」だけを 透明に する（キャラの中の 白＝ハイライト・目 は のこす）。
 * 入力に もともと 透明が あるときは そのまま つかう。背景は 拡大しない（1600px より 小さければ そのまま）。
 *
 * オプション：
 *   --tol <0〜80>   白と みなす ずれ（既定 28。JPEG の にじみが 多いときは 大きく、キャラの 白が 消えるときは 小さく）
 *   --as <名前>     べつの 名前で 書く（すでに ある 絵は 上書きしない きまり。書いたあと ScreenBackdrop.tsx などの 名前を 書きかえる）
 *   --out <dir>     置き場の 根（既定 public/assets。試しに 使う）
 *   --dry           書かずに 何が 起きるかだけ 出す
 *
 * 画面は 絵が 無くても 崩れない。絵を 置いたら npm run build で 確かめる（docs/UI_STYLE.md）。
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SLOTS = {
  'bg-home': { dir: 'bg', kind: 'bg' }, 'bg-stage': { dir: 'bg', kind: 'bg' }, 'bg-expedition': { dir: 'bg', kind: 'bg' },
  'bg-collection': { dir: 'bg', kind: 'bg' }, 'bg-friend': { dir: 'bg', kind: 'bg' }, 'bg-versus': { dir: 'bg', kind: 'bg' },
  'emblem-catwars': { dir: 'emblem', kind: 'cutout' },
  'capsule-machine': { dir: 'capsule', kind: 'cutout' }, 'capsule-open': { dir: 'capsule', kind: 'cutout' },
};
const EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const tol = Math.max(0, Math.min(80, Number(flag('--tol') ?? 28)));
const asName = flag('--as');
const outRoot = path.resolve(flag('--out') ?? 'public/assets');
const dry = bool('--dry');

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (args.length === 0) fail('使い方: node scripts/import-art.mjs <画像ファイル> <名前>  または  <フォルダ>\n  名前: ' + Object.keys(SLOTS).join(' / '));

/** ふちから つながる 白（各色が 255 から tol いない）を 透明に する。のこりの ふちを すこし なめらかに する */
export function cutOutWhite(rgba, w, h, tolerance) {
  const near = (i) => rgba[i] >= 255 - tolerance && rgba[i + 1] >= 255 - tolerance && rgba[i + 2] >= 255 - tolerance;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop();
    rgba[p * 4 + 3] = 0; removed++;
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  // ふちの にじみ：透明に となりあう うすい色は 半分 透明に（白いふちが のこらないように）
  const edge = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (rgba[p * 4 + 3] === 0) continue;
    if ((x > 0 && rgba[(p - 1) * 4 + 3] === 0) || (x < w - 1 && rgba[(p + 1) * 4 + 3] === 0) || (y > 0 && rgba[(p - w) * 4 + 3] === 0) || (y < h - 1 && rgba[(p + w) * 4 + 3] === 0)) edge.push(p);
  }
  for (const p of edge) {
    const lo = Math.min(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
    if (lo > 255 - tolerance * 2.2) rgba[p * 4 + 3] = Math.round(255 * Math.max(0, (255 - lo) / (tolerance * 2.2)));
  }
  return removed;
}

async function convert(file, name) {
  const slot = SLOTS[name];
  if (!slot) fail(`名前が ちがうよ「${name}」。使える名前: ${Object.keys(SLOTS).join(' / ')}`);
  const stem = asName ?? name;
  const outDir = path.join(outRoot, slot.dir);
  const out = path.join(outDir, `${stem}.webp`);
  if (fs.existsSync(out) && !dry) fail(`${path.relative(process.cwd(), out)} は もう あるよ。同じ名前で 上書きしない きまり（端末に 古い絵が のこる）。--as <あたらしい名前> で 足してね。`);
  const src = sharp(file, { failOn: 'none' }).rotate();
  const meta = await src.metadata();
  let info;
  let buf;
  if (slot.kind === 'bg') {
    const pipeline = src.flatten({ background: '#060a1c' }).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82, effort: 5 });
    if (dry) { console.log(`(dry) ${name}: ${meta.width}x${meta.height} → 横 1600px 以下の WebP（品質 82） → ${out}`); return; }
    ({ data: buf, info } = await pipeline.toBuffer({ resolveWithObject: true }));
    console.log(`✓ ${name}: ${meta.width}x${meta.height} → ${info.width}x${info.height}  ${(buf.length / 1024).toFixed(0)}KB`);
  } else {
    const { data, info: ri } = await src.ensureAlpha().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
    const hadAlpha = meta.hasAlpha && (() => { for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true; return false; })();
    let removed = 0;
    if (!hadAlpha) removed = cutOutWhite(data, ri.width, ri.height, tol);
    if (dry) { console.log(`(dry) ${name}: ${meta.width}x${meta.height} → ${ri.width}x${ri.height}・${hadAlpha ? 'もともと 透明あり' : `白を 消す ${(100 * removed / (ri.width * ri.height)).toFixed(0)}%`} → ${out}`); return; }
    ({ data: buf, info } = await sharp(data, { raw: { width: ri.width, height: ri.height, channels: 4 } }).webp({ quality: 90, alphaQuality: 100, effort: 5 }).toBuffer({ resolveWithObject: true }));
    console.log(`✓ ${name}: ${meta.width}x${meta.height} → ${info.width}x${info.height}・${hadAlpha ? 'もともと 透明あり' : `白を 消した ${(100 * removed / (ri.width * ri.height)).toFixed(0)}%`}  ${(buf.length / 1024).toFixed(0)}KB`);
    if (!hadAlpha && removed / (ri.width * ri.height) < 0.02) console.log(`  ! ほとんど 消えなかったよ。背景が 白じゃ ないか、ふちに 白が つながって いない かも（--tol を 大きく）`);
    if (!hadAlpha && removed / (ri.width * ri.height) > 0.85) console.log(`  ! 8わりいじょう 消えたよ。キャラまで 消えて いないか 見てね（--tol を 小さく）`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, buf);
  if (asName) console.log(`  → 画面が この名前を 読むように、${slot.kind === 'bg' ? 'catwars/components/ui/ScreenBackdrop.tsx' : 'ホームの HomeEmblem（CatWars.tsx）／CollectionScreen.tsx'} の 名前を 書きかえてね`);
}

const [first, second] = args;
if (!fs.existsSync(first)) fail(`${first} が ないよ`);
if (fs.statSync(first).isDirectory()) {
  let n = 0;
  for (const name of Object.keys(SLOTS)) {
    const f = EXTS.map((e) => path.join(first, name + e)).find((p) => fs.existsSync(p));
    if (f) { await convert(f, name); n++; }
  }
  if (n === 0) fail(`${first} に 名前どおりの 絵が ないよ（${Object.keys(SLOTS).join(' / ')} の .png/.jpg）`);
  console.log(`${n}まい 取りこんだよ。`);
} else {
  if (!second) fail('名前を わすれているよ。例: node scripts/import-art.mjs ~/bg.png bg-home');
  await convert(first, second);
}
