import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppRoundHost } from '../../learn/AppRoundHost';
import { loadPack, rewardWeight, PACK_UNITS, type PackRound, type RoundRegistry } from '../../learn/gradePack';
import { sfx } from '../../utils/audioEngine';
import { useReviewStore } from '../../store/useReviewStore';
import { Button, Chip, Icon, Panel } from '../ui';
import type { Tone } from '../ui';

/**
 * 問題カード（戦闘の主役の操作。2026-11-15）。
 *
 * 戦闘のエナジーは自動ではたまらない。**手札の3枚から1枚をえらんで解くと、エナジーが手に入る**。
 * - 手札は「やさしい・ふつう・むずかしい」を1枚ずつ（えらんだ単元の中から）。むずかしいほど ⚡ が多い。自分でえらべる
 * - 問題は SOL の単元アプリと同じ問題・同じ答え方（AppRoundHost）。解いている間、戦闘は止まる
 * - 一度もまちがえずに解くと ⚡。まちがえても罰はない（ヒントで最後まで解ける。その問題の ⚡ は無し・連続は切れる）
 * - 連続でまちがえずに解くと ×1.2、×1.4 …（さいだい ×2.0）
 * - 解いたカードは、新しいカードに入れかわる
 * - ボスにシールドがあるときは、手札の上に 4枚めの「🛡️ シールドを わる（ふくしゅう）」カードが出る（2026-11-15）。
 *   中身は その子が まちがえた項目（useReviewStore。ポータルにつなぐ前の「復習の時期が来た項目」の代わり）。
 *   無ければ「むずかしい」帯から。まちがえずに解けたら シールドが1枚われて、ふつうの ⚡ も入る。まちがえても罰はない
 * - げきむず だけ、1戦で引ける カードの まいすうに上限がある（cardLimit。2026-11-15 CW-4b）。答えを出した カードを1まい と数える
 *  （「やめて もどる」で答えずに閉じたものは数えない。シールドの カードは数えない）。まちがえずに解くほど ⚡ が多く入る＝正確さへの ごほうび。
 *   使いきると 手札は出なくなり、のこりの ⚡ と 盤上のネコで たたかう
 */
interface Props {
  /** 出撃前にえらんだ単元の鍵 */
  unitKeys: string[];
  /** むずかしさ3の問題を、まちがえずに解いたときの基準エナジー */
  baseReward: number;
  /** いまエナジーが足りない（カードを目立たせる） */
  poor: boolean;
  /** 解きはじめた・戦場にもどった（戦闘を止める・動かす） */
  onOpenChange: (open: boolean) => void;
  onReward: (energy: number) => void;
  /** 1問ごとの結果。perfect＝一度もまちがえなかった */
  onAnswered: (item: PackRound, perfect: boolean) => void;
  /** いま盤上にいる敵の シールドの合計（0 なら シールドのカードは出ない） */
  shieldLayers?: number;
  /** シールドのカードを まちがえずに解けた（シールドを1枚わる） */
  onShieldBreak?: () => void;
  /** 1戦で引ける カードの まいすう（げきむず だけ。null・無しは 上限なし） */
  cardLimit?: number | null;
}

/** 手札の中で シールドのカードを指す番号 */
const SHIELD_IDX = 3;

/** 3まいの 色：やさしい＝成長（ミント）・ふつう＝行動（シアン）・むずかしい＝めずらしい（バイオレット） */
type Band = 'easy' | 'mid' | 'hard';
const BANDS: { band: Band; label: string; tone: Tone; match: (d: number) => boolean }[] = [
  { band: 'easy', label: 'やさしい', tone: 'growth', match: (d) => d <= 2 },
  { band: 'mid', label: 'ふつう', tone: 'action', match: (d) => d === 3 },
  { band: 'hard', label: 'むずかしい', tone: 'rare', match: (d) => d >= 4 },
];
const UNIT_NAME: Record<string, string> = Object.fromEntries(PACK_UNITS.map((u) => [u.key, u.name]));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
/** 連続でまちがえずに解くと増える。上限 ×2.0 */
export const comboMultiplier = (n: number): number => Math.min(2.0, 1 + (Math.max(1, n) - 1) * 0.2);

export const ProblemCards: React.FC<Props> = ({
  unitKeys, baseReward, poor, onOpenChange, onReward, onAnswered, shieldLayers = 0, onShieldBreak, cardLimit = null,
}) => {
  /** 答えを出した カードの数（シールドの カードは数えない） */
  const [usedCards, setUsedCards] = useState(0);
  const cardsLeft = cardLimit == null ? null : Math.max(0, cardLimit - usedCards);
  const outOfCards = cardsLeft === 0;
  const addMiss = useReviewStore((s) => s.addMiss);
  const clearOne = useReviewStore((s) => s.clearOne);
  const [pack, setPack] = useState<{ registry: RoundRegistry; rounds: PackRound[] } | null>(null);
  useEffect(() => { let on = true; void loadPack().then((p) => { if (on) setPack(p); }); return () => { on = false; }; }, []);

  const pool = useMemo(() => (pack ? pack.rounds.filter((r) => unitKeys.includes(r.unitKey)) : []), [pack, unitKeys]);
  /** その帯のカードを1枚引く（いま手札にある項目は さける。帯に無ければ全体から） */
  const draw = useCallback((band: Band, avoid: PackRound[]): PackRound | null => {
    if (pool.length === 0) return null;
    const def = BANDS.find((b) => b.band === band)!;
    const fresh = pool.filter((r) => !avoid.some((a) => a.unitKey === r.unitKey && a.skillId === r.skillId));
    const inBand = fresh.filter((r) => def.match(r.difficulty));
    return pick(inBand.length ? inBand : fresh.length ? fresh : pool);
  }, [pool]);

  const [hand, setHand] = useState<(PackRound | null)[]>([null, null, null]);
  useEffect(() => {
    if (pool.length === 0) return;
    const h: PackRound[] = [];
    for (const b of BANDS) { const c = draw(b.band, h); if (c) h.push(c); }
    setHand(h);
  // 範囲が決まったときに1回だけ配る
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  /** シールドを わる カード：まちがえた項目（えらんだ単元のもの）から。無ければ「むずかしい」帯から */
  const drawReview = useCallback((avoid?: PackRound | null): PackRound | null => {
    const misses = useReviewStore.getState().misses;
    const cand = pool.filter((r) => misses.some((m) => m.unitKey === r.unitKey && m.skillId === r.skillId));
    const fresh = cand.filter((r) => !(avoid && avoid.unitKey === r.unitKey && avoid.skillId === r.skillId));
    if (fresh.length) return pick(fresh);
    if (cand.length) return pick(cand);
    return draw('hard', avoid ? [avoid] : []);
  }, [pool, draw]);
  const [shieldCard, setShieldCard] = useState<PackRound | null>(null);
  useEffect(() => {
    if (shieldLayers > 0 && !shieldCard && pool.length > 0) setShieldCard(drawReview());
  }, [shieldLayers, shieldCard, pool, drawReview]);

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const [result, setResult] = useState<'perfect' | 'missed' | null>(null);
  const [solved, setSolved] = useState(false);
  const [gained, setGained] = useState(0);
  /** 同じカードを開きなおしても 同じ問題にならないよう、開くたびに変える */
  const [serial, setSerial] = useState(0);

  const isShield = openIdx === SHIELD_IDX;
  const item = openIdx === null ? null : isShield ? shieldCard : hand[openIdx];
  const rewardOf = (r: PackRound) => Math.round(baseReward * rewardWeight(r.difficulty));

  const open = (i: number) => {
    if (i === SHIELD_IDX ? !shieldCard : !hand[i]) return;
    sfx.tap?.();
    setResult(null); setSolved(false); setGained(0); setSerial((n) => n + 1);
    setOpenIdx(i); onOpenChange(true);
  };

  const onFirstResult = useCallback((perfect: boolean) => {
    if (!item) return;
    if (!isShield) setUsedCards((n) => n + 1);
    onAnswered(item, perfect);
    if (perfect) {
      const n = comboRef.current + 1;
      comboRef.current = n; setCombo(n);
      const total = Math.round(rewardOf(item) * comboMultiplier(n));
      setGained(total); setResult('perfect'); sfx.correct(); onReward(total);
      // ふくしゅうで まちがえずに解けた：シールドを1枚わって、その項目は ふくしゅうから はずす
      if (isShield) { onShieldBreak?.(); clearOne(item); }
    } else {
      comboRef.current = 0; setCombo(0);
      setResult('missed'); sfx.incorrect();
      // まちがえた項目は ふくしゅうに回す（シールドのカードに出る）
      addMiss(item);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isShield, baseReward, onReward, onAnswered, onShieldBreak]);

  /** 答えの出たカードを入れかえて、戦場へもどる */
  const close = () => {
    if (openIdx !== null && result !== null) {
      const i = openIdx;
      if (i === SHIELD_IDX) setShieldCard(shieldLayers > 0 ? drawReview(shieldCard) : null);
      else setHand((h) => { const next = h.slice(); next[i] = draw(BANDS[i].band, h.filter((x, k): x is PackRound => !!x && k !== i)); return next; });
    }
    setOpenIdx(null); onOpenChange(false);
  };

  return (
    <>
      {/* 手札（下の操作の列の すぐ上に 横ならび）。エナジーが足りないときは 光る */}
      <div className="absolute z-[60] flex flex-col gap-1.5 pointer-events-none" data-testid="hand"
        style={{ left: 10, right: 72, bottom: 'calc(var(--cw-hotbar-h, 150px) + 10px)' }}>
        <div className="flex items-stretch gap-1.5 flex-wrap pointer-events-auto">
          <span className="cw-chip self-center" style={{ background: 'var(--cw-surface-strong)', color: 'var(--cw-fg)', minHeight: 28 }}>
            といて <Icon name="energy" size={16} /> を ためよう{combo >= 1 && <><Icon name="streak" size={16} /><b className="font-cw-num">{combo}</b></>}
          </span>
          {cardsLeft !== null && (
            <span data-testid="cards-left" className="cw-chip cw-tone-danger self-center" style={{ background: 'var(--cw-surface-strong)', minHeight: 28 }}>
              <span>のこり {cardsLeft} まい</span>
              <span style={{ color: 'var(--cw-fg-2)' }}>/ {cardLimit}</span>
            </span>
          )}
          {outOfCards && (
            <div data-testid="cards-out" className="cw-panel cw-panel-strong rounded-cw-md px-3 py-2 text-cw-14 font-bold leading-snug"
              style={{ color: 'var(--cw-reward)' }}>
              カードを つかいきった！ いまの ネコで がんばれ
            </div>
          )}
          {shieldLayers > 0 && shieldCard && (
            <button data-testid="shield-card" type="button" onClick={() => open(SHIELD_IDX)}
              className="cw-card cw-press cw-tone-action cw-card-on cw-nudge text-left px-3 py-1.5 min-h-[56px] min-w-[200px] max-w-[300px] flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-cw-14 font-extrabold flex items-center gap-1.5" style={{ color: 'var(--cw-action)' }}><Icon name="target" size={20} />シールドを わる</span>
                <span className="text-cw-14 font-black font-cw-num" style={{ color: 'var(--cw-fg)' }}>×{shieldLayers}</span>
              </span>
              <span className="block text-cw-14 font-bold leading-tight truncate" style={{ color: 'var(--cw-fg)' }}>{shieldCard.label}</span>
              <span className="block text-cw-12 truncate" style={{ color: 'var(--cw-fg-2)' }}>ふくしゅう・{UNIT_NAME[shieldCard.unitKey] ?? ''}</span>
            </button>
          )}
        </div>
        {!pack && <div className="cw-panel rounded-cw-md px-3 py-2 text-cw-14 pointer-events-auto self-start" style={{ color: 'var(--cw-fg-2)' }}>よみこみ中…</div>}
        {pack && pool.length === 0 && <div className="cw-panel rounded-cw-md px-3 py-2 text-cw-14 pointer-events-auto self-start" style={{ color: 'var(--cw-fg-2)' }}>出せる問題がありません</div>}
        <div className="flex gap-1.5 pointer-events-auto">
          {!outOfCards && hand.map((c, i) => c && (
            <button key={`${i}-${c.unitKey}-${c.skillId}`} type="button" onClick={() => open(i)}
              data-band={BANDS[i].band}
              className={`cw-card cw-press cw-tone-${BANDS[i].tone} ${poor ? 'cw-card-on cw-nudge' : ''} text-left px-3 py-1.5 min-h-[60px] flex-1 min-w-0 max-w-[260px]`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-cw-12 font-extrabold" style={{ color: 'var(--tone)' }}>{BANDS[i].label}</span>
                <span className="flex items-center gap-0.5 font-cw-num text-cw-14 font-black" style={{ color: 'var(--cw-reward)' }}>
                  +{Math.round(rewardOf(c) * comboMultiplier(combo + 1))}<Icon name="energy" size={16} />
                </span>
              </span>
              <span className="block text-cw-14 font-bold leading-tight truncate" style={{ color: 'var(--cw-fg)' }}>{c.label}</span>
              <span className="block text-cw-12 truncate" style={{ color: 'var(--cw-fg-2)' }}>{UNIT_NAME[c.unitKey] ?? ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 解く画面（戦闘は止まっている） */}
      {item && pack && (
        <div className="fixed inset-0 z-[140] flex flex-col" data-testid="quiz-overlay" style={{ background: 'rgba(6,10,28,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="flex items-center gap-2 px-3 py-2 flex-wrap" data-testid="quiz-header"
            style={{ background: 'var(--cw-surface-strong)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: 'inset 0 -1px 0 var(--cw-line), inset 0 1px 0 var(--cw-top-light)' }}>
            {isShield
              ? <span className="font-extrabold text-cw-16 flex items-center gap-1.5" style={{ color: 'var(--cw-action)' }}><Icon name="target" size={24} />シールドブレイク</span>
              : <span className="font-extrabold text-cw-16 flex items-center gap-1.5" style={{ color: 'var(--cw-reward)' }}><Icon name="energy" size={24} />エナジーチャージ</span>}
            <Chip tone="action">
              {item.label}　+{Math.round(rewardOf(item) * comboMultiplier(comboRef.current + (result === 'perfect' ? 0 : 1)))}<Icon name="energy" size={14} />
            </Chip>
            {combo >= 2 && <Chip tone="reward"><Icon name="streak" size={16} />{combo}れんぞく</Chip>}
            <Button variant="secondary" size="sm" className="ml-auto" onClick={close}>
              {result === null ? 'やめて もどる' : '戦場へもどる'}<Icon name="back" size={18} className="rotate-180" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto cw-scroll p-3 flex flex-col items-center">
            <div className="w-full max-w-2xl">
              {result === 'perfect' && (
                <Panel strong pad={false} className="cw-reward-pop text-center mb-2 rounded-cw-md py-2 px-3 font-black text-cw-16" role="status"
                  style={{ color: 'var(--cw-growth)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-growth)' }}>
                  <Icon name="check" size={24} className="inline-block align-[-6px] mr-1" />せいかい！ {isShield ? 'シールドが われた！ ' : ''}+{gained}⚡{combo >= 2 ? `　${combo}れんぞく ×${comboMultiplier(combo).toFixed(1)}` : ''}
                </Panel>
              )}
              {result === 'missed' && (
                <Panel strong pad={false} className="text-center mb-2 rounded-cw-md py-2 px-3 text-cw-14 font-bold" role="status" style={{ color: 'var(--cw-fg)' }}>
                  {isShield
                    ? (solved ? 'さいごまで とけたね。シールドは つぎの カードで わろう！' : 'ヒントを見て、さいごまで といてみよう（シールドは つぎの カードで）')
                    : (solved ? 'さいごまで とけたね。つぎの カードで ⚡ を とろう！' : 'ヒントを見て、さいごまで といてみよう（⚡ は つぎの カードで）')}
                </Panel>
              )}
              <AppRoundHost key={serial} registry={pack.registry} item={item} onFirstResult={onFirstResult} onSolved={() => setSolved(true)} />
              {(result === 'perfect' || solved) && (
                <Button variant="success" size="lg" fullWidth className="mt-3" onClick={close}>
                  戦場へもどる<Icon name="back" size={22} className="rotate-180" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** 星（★1〜3）は data/rewards.ts（進み方の計算と同じもの） */
export { starsFor } from '../../data/rewards';
