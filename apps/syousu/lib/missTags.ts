// このファイルは単元アプリ syo4-syousu-v2 の src/lib/missTags.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * つまずきの種類タグ（まちがいマップ用）。AIは使わず、出題側が分かっている範囲で
 * 誤答に「種類」を付ける。ErrorHunter は正解理由が既知なので最も質が高い。
 * 計算モジュールは値から原因を断定できないため、コース単位の控えめなタグに留める（誤帰属を避ける）。
 */
import { REASONS } from './errorHunter';

export const MISS_TAG_LABELS: Record<string, string> = {
  point: '小数点の いち',
  align: '位を そろえる',
  megz: '大小くらべ（けたの 長さ）',
  regroup: 'くり上がり・両替',
  borrow: 'くり下がり',
  'calc-addsub': 'たし算・ひき算の 計算',
  'calc-muldiv': 'かけ算・わり算の 計算',
  compare: '大小くらべ',
  numberline: '数直線の 読みとり',
  placevalue: '位取り',
  wordproblem: 'ことばの もんだい（しき）',
};

export function missTagLabel(tag: string): string {
  return MISS_TAG_LABELS[tag] ?? tag;
}

/** ErrorHunter の「正解の理由」テキストを傾向タグに変換。 */
export function reasonToTag(reason: string): string {
  switch (reason) {
    case REASONS.POINT: return 'point';
    case REASONS.ALIGN: return 'align';
    case REASONS.MEGZ: return 'megz';
    case REASONS.REGROUP: return 'regroup';
    case REASONS.BORROW: return 'borrow';
    default: return 'other';
  }
}
