/**
 * アプリの解答画面の一覧（app_id → ラウンド名 → 定義）。
 * 重いので、ここは AppRoundHost から必要になったときだけ読みこむ（初めの読みこみを遅くしない）。
 */
import type { AppRoundDef } from './types';
import { KARAKURI_ROUNDS } from './karakuri/sanmon';
import { MENSEKI4_ROUNDS } from './menseki4/sanmon';
import { KAWARI_ROUNDS } from './kawari/sanmon';
import { RIPPOUTAI_ROUNDS } from './rippoutai/sanmon';
import { SYOUSU_ROUNDS, DECIMAL_ROUNDS } from './syousu/sanmon';
import { BUNSUU4_ROUNDS } from './bunsuu4/sanmon';
import { SUIHEI_ROUNDS } from './suihei/sanmon';
import { GAISU_ROUNDS } from './gaisu/sanmon';
import { HISSAN_ROUNDS } from './hissan/sanmon';
import { BAI_ROUNDS } from './bai/sanmon';

export const APP_ROUNDS: Record<string, Record<string, AppRoundDef>> = {
  karakuri: KARAKURI_ROUNDS,
  menseki4: MENSEKI4_ROUNDS,
  kawari: KAWARI_ROUNDS,
  rippoutai: RIPPOUTAI_ROUNDS,
  syousu: SYOUSU_ROUNDS,
  decimal: DECIMAL_ROUNDS,
  bunsuu4: BUNSUU4_ROUNDS,
  suihei: SUIHEI_ROUNDS,
  gaisu: GAISU_ROUNDS,
  hissan: HISSAN_ROUNDS,
  bai: BAI_ROUNDS,
};
