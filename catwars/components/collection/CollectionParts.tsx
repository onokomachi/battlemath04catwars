import React, { useEffect, useState } from 'react';
import { RARITY_INFO, type StickerDef } from '../../collection/stickers';
import { BADGE_BY_ID, badgeFrame, tierColor, tierLabel } from '../../collection/badges';
import { ENEMY_DEX_BY_KEY } from '../../collection/dex';
import { CHARACTER_BY_ID, getCharacterSprite } from '../../data/characters';
import { DECOR_BY_ID, TITLE_BY_ID } from '../../collection/titles';
import { useCollectionStore } from '../../store/useCollectionStore';
import { CAPSULE_RULES } from '../../collection/stickers';

/**
 * 収集の画面部品（2026-11-16 CW-4c）。
 * StickerView（シール1まい）・BadgeMedal（バッジ）・GainsSummary（戦闘の結果画面の「あたらしく 手に入れたもの」）・
 * NewBadgeNotice（ホームで1回）・TitleChip・DecorFlag。
 * 絵（シール・バッジ・はたの SVG／PNG）は ArtImg で出す。読めなかったら 絵文字に もどる（docs/ART_STYLE.md）。
 */

/** 絵を出す。読めなかったら fallback（絵文字など）を出す */
export const ArtImg: React.FC<{ src?: string; size: number; fallback: React.ReactNode; style?: React.CSSProperties; alt?: string }> = ({ src, size, fallback, style, alt = '' }) => {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [src]);
  if (!src || bad) return <>{fallback}</>;
  return <img src={src} alt={alt} draggable={false} onError={() => setBad(true)} style={{ width: size, height: size, objectFit: 'contain', ...style }} />;
};

/** シール1まい（絵があれば絵、なければ絵文字。わくの色は シールの色、レアいじょうは ゆっくり光る＝index.css の .cw-glow） */
export const StickerView: React.FC<{ s: StickerDef; size?: number; owned?: boolean; count?: number }> = ({ s, size = 64, owned = true, count }) => {
  const rc = RARITY_INFO[s.rarity].color;
  const glow = owned && s.rarity !== 'normal';
  return (
    <div className={`relative flex items-center justify-center rounded-2xl shrink-0${glow ? ' cw-glow' : ''}${glow && s.rarity === 'legend' ? ' cw-glow-legend' : ''}`}
      style={{
        width: size, height: size,
        background: owned ? `radial-gradient(circle at 35% 30%, ${s.frame}55, ${s.frame}18 70%)` : 'rgba(255,255,255,0.04)',
        border: `3px solid ${owned ? s.frame : 'rgba(255,255,255,0.12)'}`,
        ['--glow' as string]: glow ? (s.rarity === 'legend' ? rc : `${rc}cc`) : undefined,
      } as React.CSSProperties}>
      {owned ? (
        <ArtImg src={s.image} alt={s.name} size={size * 0.84}
          fallback={<span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{s.emoji}</span>} />
      ) : (
        <span className="text-white/25 font-black" style={{ fontSize: size * 0.4 }}>？</span>
      )}
      {count != null && count > 1 && (
        <span className="absolute -bottom-1 -right-1 text-[10px] font-black px-1.5 rounded-full bg-black/80 text-white border border-white/30">×{count}</span>
      )}
    </div>
  );
};

/** バッジの メダル（台＝段の色の SVG、まんなかに 絵柄。まだのときは 台を灰色・絵柄を 灰色のシルエットに） */
export const BadgeMedal: React.FC<{ id: string; tier: number; size?: number; locked?: boolean }> = ({ id, tier, size = 44, locked }) => {
  const def = BADGE_BY_ID[id];
  if (!def) return null;
  const c = tierColor(def, tier);
  const got = tier > 0;
  const motif = size * 0.62;
  const emoji = <span style={{ fontSize: size * 0.44, lineHeight: 1 }}>{locked ? '❔' : def.icon}</span>;
  const plain = (
    <div className="absolute inset-0 rounded-full"
      style={{ border: `3px solid ${c}`, background: got ? `radial-gradient(circle at 35% 30%, ${c}55, ${c}10 75%)` : 'rgba(255,255,255,0.03)' }} />
  );
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }} data-medal={got ? 'on' : 'off'}>
      <span className="absolute inset-0" style={{ filter: got ? undefined : 'grayscale(1)', opacity: got ? 1 : 0.4 }}>
        <ArtImg src={badgeFrame(def, tier)} size={size} fallback={plain} />
      </span>
      <span className="relative flex items-center justify-center" style={{ width: motif, height: motif }}>
        {locked
          ? <span className="font-black text-white/60" style={{ fontSize: size * 0.4, lineHeight: 1 }}>？</span>
          : <ArtImg src={def.image} size={motif} fallback={<span style={{ filter: got ? undefined : 'grayscale(1)', opacity: got ? 1 : 0.55 }}>{emoji}</span>}
              style={got ? undefined : { filter: 'brightness(0) invert(0.75)', opacity: 0.5 }} />}
      </span>
    </div>
  );
};

/** 図鑑の鍵 → 名前と絵（結果画面で使う） */
export function dexLabel(key: string): { name: string; img?: string; emoji?: string } {
  const e = ENEMY_DEX_BY_KEY[key];
  if (e) {
    return { name: e.name, img: e.image, emoji: e.emoji };
  }
  const [famId, st] = key.split(':');
  const fam = CHARACTER_BY_ID[famId];
  if (fam) {
    const stage = (Number(st) || 1) as 1 | 2 | 3;
    return { name: fam.forms[stage - 1].name, img: getCharacterSprite(fam.spriteFamily, stage) };
  }
  return { name: key };
}

export interface Gains {
  coins: number;
  badges: { id: string; tier: number }[];
  dex: string[];
}

/** 戦闘の結果画面：あたらしく 手に入れたもの（バッジ・図鑑・シールコイン） */
export const GainsSummary: React.FC<{ gains: Gains | null }> = ({ gains }) => {
  const coins = useCollectionStore((s) => s.coins);
  if (!gains) return null;
  const empty = gains.coins <= 0 && gains.badges.length === 0 && gains.dex.length === 0;
  if (empty) return null;
  return (
    <div className="mb-3 rounded-xl p-3 text-left" data-testid="gains"
      style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.14), rgba(250,204,21,0.12))', border: '1px solid rgba(56,189,248,0.55)' }}>
      <div className="text-[#7dd3fc] font-black text-sm mb-1.5">🎁 あたらしく 手に入れたもの</div>
      {gains.badges.map((b) => {
        const def = BADGE_BY_ID[b.id];
        if (!def) return null;
        return (
          <div key={b.id} className="flex items-center gap-2 mb-1">
            <BadgeMedal id={b.id} tier={b.tier} size={30} />
            <div className="text-[12px] text-white leading-tight">
              バッジ「{def.name}」{tierLabel(def, b.tier) && <b style={{ color: tierColor(def, b.tier) }}> {tierLabel(def, b.tier)}</b>}
            </div>
          </div>
        );
      })}
      {gains.dex.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-[11px] text-white/70">📖 図鑑に のった：</span>
          {gains.dex.map((k) => {
            const d = dexLabel(k);
            return (
              <span key={k} className="flex items-center gap-1 text-[11px] text-white bg-white/10 rounded-full pl-0.5 pr-2 py-0.5">
                {d.img
                  ? <img src={d.img} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                  : <span>{d.emoji}</span>}
                {d.name}
              </span>
            );
          })}
        </div>
      )}
      {gains.coins > 0 && (
        <div className="text-[12px] text-[#fde68a] mt-1.5">
          🪙 シールコイン +{gains.coins}（いま {coins}まい{coins >= CAPSULE_RULES.cost ? '。カプセルを まわせるよ' : ''}）
        </div>
      )}
    </div>
  );
};

/** ホーム：まだ知らせていない バッジを1回だけ出す */
export const NewBadgeNotice: React.FC = () => {
  const badges = useCollectionStore((s) => s.badges);
  const seen = useCollectionStore((s) => s.badgesSeen);
  const markSeen = useCollectionStore((s) => s.markBadgesSeen);
  const [shown, setShown] = useState<{ id: string; tier: number }[]>([]);
  useEffect(() => {
    const fresh = Object.entries(badges).filter(([id, t]) => t > (seen[id] ?? 0)).map(([id, tier]) => ({ id, tier }));
    if (fresh.length) {
      setShown((v) => [...v.filter((x) => !fresh.some((f) => f.id === x.id)), ...fresh]);
      markSeen(fresh.map((f) => f.id));
    }
  }, [badges, seen, markSeen]);
  if (shown.length === 0) return null;
  return (
    <div className="mx-4 mt-3 rounded-xl p-3" data-testid="new-badge"
      style={{ background: 'linear-gradient(135deg, rgba(250,204,21,0.16), rgba(56,189,248,0.12))', border: '1px solid rgba(250,204,21,0.6)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[#facc15] font-black text-sm">🏅 あたらしい バッジ！</span>
        <button onClick={() => setShown([])} className="text-white/50 text-xs px-2">とじる</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {shown.map((b) => {
          const def = BADGE_BY_ID[b.id];
          if (!def) return null;
          return (
            <div key={b.id} className="flex items-center gap-1.5">
              <BadgeMedal id={b.id} tier={b.tier} size={28} />
              <span className="text-[12px] text-white">{def.name}{tierLabel(def, b.tier) && ` ${tierLabel(def, b.tier)}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** えらんだ称号 */
export const TitleChip: React.FC = () => {
  const title = useCollectionStore((s) => s.title);
  const t = TITLE_BY_ID[title] ?? TITLE_BY_ID.rookie;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full" data-testid="title-chip"
      style={{ background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.5)', color: '#fde68a' }}>
      🎖️ {t.name}
    </span>
  );
};

/** 基地の はた（かざり。強さには ひびかない）。絵が読めないときは 2色の しまの はた＋絵文字 */
export const DecorFlag: React.FC<{ id?: string; size?: number }> = ({ id, size = 28 }) => {
  const cur = useCollectionStore((s) => s.decor);
  const d = DECOR_BY_ID[id ?? cur] ?? DECOR_BY_ID['flag-blue'];
  const plain = (
    <span className="inline-flex items-end shrink-0" style={{ height: size }}>
      <span style={{ width: 2, height: size, background: '#cbd5e1', borderRadius: 1 }} />
      <span className="flex items-center justify-center"
        style={{
          width: size * 0.95, height: size * 0.62, alignSelf: 'flex-start',
          background: `linear-gradient(135deg, ${d.colors[0]} 0 50%, ${d.colors[1]} 50% 100%)`,
          clipPath: 'polygon(0 0, 100% 0, 82% 50%, 100% 100%, 0 100%)', fontSize: size * 0.36,
        }}>
        {d.emoji}
      </span>
    </span>
  );
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ height: size }} title={d.name} data-testid="decor-flag">
      <ArtImg src={d.image} alt={d.name} size={size * 1.25} fallback={plain} />
    </span>
  );
};
