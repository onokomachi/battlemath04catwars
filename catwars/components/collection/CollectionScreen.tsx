import React, { useEffect, useMemo, useState } from 'react';
import { useCollectionStore } from '../../store/useCollectionStore';
import { useCampaignStore } from '../../store/useCampaignStore';
import {
  CAPSULE_RULES, DUP_FRAGMENTS, EXCHANGE_COST, RARITY_INFO, RARITY_ORDER, RARITY_RATE, STICKERS, ownedKinds,
  type PullResult, type StickerDef,
} from '../../collection/stickers';
import { BADGES, BADGE_TIER_TOTAL, badgeTierCount, tierColor, tierLabel, TIER_NAME, type BadgeGroup } from '../../collection/badges';
import { BADGE_COINS, COIN_RULES } from '../../collection/coins';
import { CAT_DEX_KEYS, ENEMY_DEX, catDexKey, catHowToMeet, markKey, type EnemyDexEntry } from '../../collection/dex';
import { DECORS, TITLES, isOpen } from '../../collection/titles';
import { CHARACTERS, getCharacterSprite, spriteFamilyForSubType } from '../../data/characters';
import { TIER_INFO, TIER_ORDER } from '../../data/campaign';
import { refreshCollection, buildBadgeInput } from '../../collection/record';
import { ArtImg, BadgeMedal, DecorFlag, StickerView } from './CollectionParts';
import { sfx } from '../../utils/audioEngine';

/**
 * あつめる（2026-11-16 CW-4c）：図鑑（ネコ・敵）・バッジ・カプセル・アルバム・称号とかざり。docs/REBUILD_SPEC.md §3d。
 * どれも 強さには ひびかない（ネコの育ち方は「ネコ部隊」）。
 */

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

export type CollectionTab = 'dex' | 'badges' | 'capsule' | 'album' | 'title';
const TABS: { id: CollectionTab; label: string; icon: string }[] = [
  { id: 'dex', label: 'ずかん', icon: '📖' },
  { id: 'badges', label: 'バッジ', icon: '🏅' },
  { id: 'capsule', label: 'カプセル', icon: '🎰' },
  { id: 'album', label: 'アルバム', icon: '📒' },
  { id: 'title', label: 'しょうごう', icon: '🎖️' },
];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export const CollectionScreen: React.FC<{ onBack: () => void; initialTab?: CollectionTab }> = ({ onBack, initialTab = 'dex' }) => {
  const [tab, setTab] = useState<CollectionTab>(initialTab);
  const col = useCollectionStore();
  // 開いたときに いまの学習の記録で バッジ・ネコの図鑑を 決めなおす
  useEffect(() => { refreshCollection(); }, []);

  const dexHave = col.cats.filter((k) => CAT_DEX_KEYS.includes(k)).length + col.enemySeen.filter((k) => ENEMY_DEX.some((e) => e.key === k)).length;
  const dexTotal = CAT_DEX_KEYS.length + ENEMY_DEX.length;
  const stickers = ownedKinds(col.cap.stickers);
  const badgeTiers = badgeTierCount(col.badges);

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-[#0a0e1a] overflow-hidden" style={font}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10" style={{ background: 'rgba(10,14,26,0.95)' }}>
        <button onClick={onBack} className="text-white/60 hover:text-white text-sm shrink-0">← もどる</button>
        <h2 className="text-[#7dd3fc] font-bold text-base shrink-0" style={fontMono}>あつめる</h2>
        <div className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-[11px] text-white/70" data-testid="collection-progress">
          <span>📖 {dexHave}/{dexTotal}（{pct(dexHave, dexTotal)}%）</span>
          <span>🏅 {badgeTiers}/{BADGE_TIER_TOTAL}（{pct(badgeTiers, BADGE_TIER_TOTAL)}%）</span>
          <span>📒 {stickers}/{STICKERS.length}（{pct(stickers, STICKERS.length)}%）</span>
          <span className="text-[#fde68a] font-bold">🪙 {col.coins}</span>
        </div>
      </div>
      <div className="flex gap-1.5 px-3 py-2 border-b border-white/10 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} data-tab={t.id} onClick={() => { sfx.select(); setTab(t.id); }}
            className="px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all"
            style={{
              background: tab === t.id ? 'rgba(125,211,252,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tab === t.id ? '#7dd3fc' : 'rgba(255,255,255,0.12)'}`,
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.65)',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'dex' && <DexTab />}
        {tab === 'badges' && <BadgesTab />}
        {tab === 'capsule' && <CapsuleTab onAlbum={() => setTab('album')} />}
        {tab === 'album' && <AlbumTab />}
        {tab === 'title' && <TitleTab />}
      </div>
    </div>
  );
};

// ── 図鑑 ─────────────────────────────────────────
const DexTab: React.FC = () => {
  const [sub, setSub] = useState<'cats' | 'enemies'>('cats');
  const cats = useCollectionStore((s) => s.cats);
  const seen = useCollectionStore((s) => s.enemySeen);
  const catHave = cats.filter((k) => CAT_DEX_KEYS.includes(k)).length;
  const enemyHave = seen.filter((k) => ENEMY_DEX.some((e) => e.key === k)).length;
  return (
    <div>
      <div className="flex gap-2 mb-3">
        {([['cats', `🐱 ネコ ${catHave}/${CAT_DEX_KEYS.length}`], ['enemies', `👾 てき ${enemyHave}/${ENEMY_DEX.length}`]] as const).map(([id, label]) => (
          <button key={id} data-sub={id} onClick={() => setSub(id)}
            className="flex-1 py-2 rounded-xl text-sm font-bold"
            style={{
              background: sub === id ? 'rgba(163,230,53,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${sub === id ? '#a3e635' : 'rgba(255,255,255,0.12)'}`, color: sub === id ? '#fff' : 'rgba(255,255,255,0.6)',
            }}>{label}</button>
        ))}
      </div>
      {sub === 'cats' ? <CatDex found={cats} /> : <EnemyDex />}
    </div>
  );
};

const CatDex: React.FC<{ found: string[] }> = ({ found }) => (
  <div className="flex flex-col gap-2" data-testid="cat-dex">
    {CHARACTERS.map((fam) => (
      <div key={fam.id} className="rounded-2xl border p-2" style={{ borderColor: `${fam.accent}44`, background: `${fam.accent}0a` }}>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: fam.accent }}>{fam.displayName}</div>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((st) => {
            const ok = found.includes(catDexKey(fam.id, st));
            const form = fam.forms[st - 1];
            return (
              <div key={st} className="flex items-center gap-2 p-1.5 rounded-xl min-w-0" data-found={ok ? '1' : '0'}
                style={{ background: ok ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)' }}>
                <img src={getCharacterSprite(fam.spriteFamily, st)} alt="" draggable={false}
                  style={{ width: 48, height: 48, objectFit: 'contain', flexShrink: 0, filter: ok ? undefined : 'brightness(0) opacity(0.55)' }} />
                <div className="min-w-0">
                  <div className="text-white text-[12px] font-bold leading-tight truncate">{ok ? form.name : '？？？'}</div>
                  <div className="text-[10px] leading-snug" style={{ color: ok ? 'rgba(255,255,255,0.55)' : '#fde68a' }}>
                    {ok ? `しんか${st}` : catHowToMeet(fam, st)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const EnemyPic: React.FC<{ e: EnemyDexEntry; ok: boolean; size?: number }> = ({ e, ok, size = 52 }) => {
  const fam = e.subType ? spriteFamilyForSubType(e.subType) : null;
  if (fam) {
    return (
      <img src={getCharacterSprite(fam, 1)} alt="" draggable={false}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, transform: 'scaleX(-1)',
          filter: ok ? 'hue-rotate(150deg) brightness(0.85) drop-shadow(0 0 3px rgba(239,68,68,0.8))' : 'brightness(0) opacity(0.55)' }} />
    );
  }
  return (
    <div className="flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: ok ? 'rgba(239,68,68,0.18)' : 'rgba(0,0,0,0.4)', border: '2px solid rgba(239,68,68,0.5)', fontSize: size * 0.5 }}>
      {ok ? e.emoji : '？'}
    </div>
  );
};

const EnemyDex: React.FC = () => {
  const seen = useCollectionStore((s) => s.enemySeen);
  const defeated = useCollectionStore((s) => s.enemyDefeated);
  const marks = useCollectionStore((s) => s.marks);
  return (
    <div data-testid="enemy-dex">
      <p className="text-[11px] text-white/50 mb-2">戦いで 見ると のる。たおすと 数が ふえる。しるし（●）は ふつう・むずかしい・げきむず で たおした（ボスは 勝った）しるし。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ENEMY_DEX.map((e) => {
          const ok = seen.includes(e.key);
          return (
            <div key={e.key} className="flex gap-2.5 p-2.5 rounded-2xl border" data-found={ok ? '1' : '0'}
              style={{ borderColor: ok ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.08)', background: ok ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)' }}>
              <EnemyPic e={e} ok={ok} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white font-bold text-[13px]">{ok ? e.name : '？？？'}</span>
                  {e.kind === 'boss' && <span className="text-[9px] px-1.5 rounded-full bg-[#facc15]/20 text-[#facc15]">第{e.chapterNo}章 ボス</span>}
                  {ok && <span className="text-[10px] text-white/50 ml-auto">たおした {defeated[e.key] ?? 0}</span>}
                </div>
                {ok ? (
                  <>
                    <div className="text-[10px] text-white/60 leading-snug mt-0.5">{e.note}</div>
                    {e.hint && <div className="text-[10px] text-[#7dd3fc] leading-snug mt-0.5">💡 {e.hint}</div>}
                    <div className="flex gap-2 mt-1" aria-label="段ごとの しるし">
                      {TIER_ORDER.map((t) => {
                        const has = marks.includes(markKey(e.key, t));
                        return (
                          <span key={t} className="text-[10px] flex items-center gap-0.5" style={{ color: has ? TIER_INFO[t].color : 'rgba(255,255,255,0.25)' }}>
                            {has ? '●' : '○'} {TIER_INFO[t].label}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-[#fde68a] leading-snug mt-0.5">{e.where}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── バッジ ─────────────────────────────────────────
const GROUP_LABEL: Record<BadgeGroup, string> = { study: '学習', battle: '戦い（星は まちがえずに とけた わりあい）', unit: '単元', hidden: 'かくしバッジ' };

const BadgesTab: React.FC = () => {
  const badges = useCollectionStore((s) => s.badges);
  const input = useMemo(() => buildBadgeInput(), [badges]);
  return (
    <div data-testid="badge-list">
      <p className="text-[11px] text-white/55 mb-2 leading-relaxed">
        バッジは 学習の 量と しつ だけで とれる（はやさ・勝った数・あそんだ時間 では とれない）。
        とると 🪙シールコイン（銅 {BADGE_COINS[1]}・銀 {BADGE_COINS[2]}・金 {BADGE_COINS[3]}）。
      </p>
      {(['study', 'unit', 'battle', 'hidden'] as BadgeGroup[]).map((g) => (
        <div key={g} className="mb-3">
          <div className="text-white/70 text-xs font-bold mb-1.5">{GROUP_LABEL[g]}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BADGES.filter((b) => b.group === g).map((b) => {
              const tier = Math.min(b.tiers.length, badges[b.id] ?? 0);
              const locked = !!b.hidden && tier === 0;
              const v = b.measure(input);
              const next = b.tiers[tier];
              return (
                <div key={b.id} className="flex items-center gap-2.5 p-2.5 rounded-2xl border" data-badge={b.id} data-tier={tier}
                  style={{ borderColor: tier > 0 ? `${tierColor(b, tier)}88` : 'rgba(255,255,255,0.08)', background: tier > 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)' }}>
                  <BadgeMedal id={b.id} tier={tier} locked={locked} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-bold text-[13px] truncate">{locked ? '？？？' : b.name}</span>
                      {tier > 0 && tierLabel(b, tier) && <span className="text-[10px] font-black" style={{ color: tierColor(b, tier) }}>{tierLabel(b, tier)}</span>}
                    </div>
                    {locked ? (
                      <div className="text-[10px] text-white/45">とると わかる かくしバッジ</div>
                    ) : next != null ? (
                      <>
                        <div className="text-[10px] text-[#fde68a] leading-snug">
                          {b.tiers.length > 1 && `つぎの${TIER_NAME[(tier + 1) as 1 | 2 | 3]}：`}{b.cond(next)}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (v / next) * 100)}%`, background: '#7dd3fc' }} />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-white/55 leading-snug">{b.cond(b.tiers[b.tiers.length - 1])}・とった！</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── カプセル ─────────────────────────────────────────
const CapsuleTab: React.FC<{ onAlbum: () => void }> = ({ onAlbum }) => {
  const coins = useCollectionStore((s) => s.coins);
  const cap = useCollectionStore((s) => s.cap);
  const pull = useCollectionStore((s) => s.pull);
  const exchange = useCollectionStore((s) => s.exchange);
  const [last, setLast] = useState<PullResult | null>(null);
  const [opening, setOpening] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const left = CAPSULE_RULES.pity - cap.sinceUp;
  const can = coins >= CAPSULE_RULES.cost && !opening;
  const unowned = STICKERS.filter((s) => !(cap.stickers[s.id] > 0));

  const doPull = () => {
    if (!can) return;
    sfx.select();
    const r = pull();
    if (!r) return;
    setLast(null); setOpening(true); setMsg(null);
    window.setTimeout(() => { setLast(r); setOpening(false); }, 700);
  };

  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="capsule">
      <div className="rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-white font-bold">🎰 シールカプセル</span>
          <span className="text-[#fde68a] font-black" style={fontMono}>🪙 {coins}</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl py-4 mb-2" style={{ minHeight: 170, background: 'radial-gradient(circle, rgba(125,211,252,0.12), transparent 70%)' }}>
          {opening ? (
            <div className="text-6xl" style={{ animation: 'cw-capsule-shake 0.35s ease-in-out infinite' }}>🔮</div>
          ) : last ? (
            <div className="flex flex-col items-center gap-1.5" data-testid="pull-result">
              <StickerView s={last.sticker} size={96} />
              <div className="text-white font-bold">{last.sticker.name}</div>
              <div className="text-[11px] font-black" style={{ color: RARITY_INFO[last.sticker.rarity].color }}>
                {RARITY_INFO[last.sticker.rarity].stars} {RARITY_INFO[last.sticker.rarity].label}{last.pity && '（天井！）'}
              </div>
              <div className="text-[11px] text-white/70">
                {last.dup ? `もう もっていた → シールのかけら +${last.fragGain}` : 'あたらしい シール！ アルバムに はったよ'}
              </div>
            </div>
          ) : (
            <div className="text-6xl opacity-80">🔮</div>
          )}
        </div>
        <button onClick={doPull} disabled={!can} data-testid="pull"
          className="w-full py-3 rounded-xl font-black text-base transition-all active:scale-95"
          style={{ background: can ? 'linear-gradient(90deg,#0ea5e9,#a855f7)' : 'rgba(255,255,255,0.08)', color: can ? '#fff' : 'rgba(255,255,255,0.4)' }}>
          1回 まわす（🪙{CAPSULE_RULES.cost}）
        </button>
        {coins < CAPSULE_RULES.cost && (
          <div className="text-[11px] text-white/55 mt-1.5 text-center">あと 🪙{CAPSULE_RULES.cost - coins}。まちがえずに とくと たまるよ</div>
        )}
        <div className="mt-2 text-center text-[12px]" data-testid="pity">
          <span className="text-[#c4b5fd] font-bold">あと {left}回で レアいじょう かくてい</span>
          <span className="text-white/40">（{CAPSULE_RULES.pity}回で 天井）</span>
        </div>
        <button onClick={onAlbum} className="w-full mt-2 py-1.5 rounded-lg text-[12px] text-[#7dd3fc] border border-[#7dd3fc]/30">📒 アルバムを 見る</button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.03)' }} data-testid="rates">
          <div className="text-white font-bold text-sm mb-1.5">出る かくりつ</div>
          <table className="w-full text-[12px]">
            <tbody>
              {RARITY_ORDER.map((r) => {
                const kinds = STICKERS.filter((s) => s.rarity === r).length;
                return (
                  <tr key={r} className="border-t border-white/5">
                    <td className="py-1" style={{ color: RARITY_INFO[r].color }}>{RARITY_INFO[r].stars} {RARITY_INFO[r].label}</td>
                    <td className="py-1 text-right text-white font-bold" style={fontMono}>{RARITY_RATE[r]}%</td>
                    <td className="py-1 text-right text-white/50">{kinds}しゅるい（1しゅるい {(RARITY_RATE[r] / kinds).toFixed(2)}%）</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[10px] text-white/50 mt-1.5 leading-relaxed">
            9回 つづけて「ふつう」だったら、10回めは かならず レアいじょう（そのときの レア・スーパーレア・でんせつ の わりあいは ふだんと 同じ）。
            シールは かざり。強さは かわらない。ぜんぶ あつめても とくべつな ごほうびは ないよ。
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(255,255,255,0.03)' }} data-testid="exchange">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-bold text-sm">🧩 シールのかけら で こうかん</span>
            <span className="text-[#c4b5fd] font-black" style={fontMono}>🧩 {cap.frag}</span>
          </div>
          <div className="text-[10px] text-white/55 mb-1.5 leading-relaxed">
            ダブると かけら（ふつう {DUP_FRAGMENTS.normal}・レア {DUP_FRAGMENTS.rare}・スーパーレア {DUP_FRAGMENTS.super}・でんせつ {DUP_FRAGMENTS.legend}）。
            ためると まだ もっていない すきな シールと こうかん（{RARITY_ORDER.map((r) => `${RARITY_INFO[r].label} ${EXCHANGE_COST[r]}`).join('・')}）。
          </div>
          {msg && <div className="text-[11px] text-[#a3e635] mb-1">{msg}</div>}
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {unowned.length === 0 && <span className="text-[11px] text-white/50">ぜんぶ もっているよ</span>}
            {unowned.map((s) => {
              const cost = EXCHANGE_COST[s.rarity];
              const ok = cap.frag >= cost;
              return (
                <button key={s.id} disabled={!ok}
                  onClick={() => { if (exchange(s.id)) { sfx.select(); setMsg(`「${s.name}」と こうかんした！`); } }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border"
                  style={{ borderColor: ok ? RARITY_INFO[s.rarity].color : 'rgba(255,255,255,0.08)', color: ok ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                  {ok ? <ArtImg src={s.image} size={18} fallback={<span>{s.emoji}</span>} /> : <span>？</span>}{ok ? s.name : RARITY_INFO[s.rarity].label}<span className="text-white/50">🧩{cost}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 p-3 text-[11px] text-white/65 leading-relaxed" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-white font-bold text-sm mb-1">🪙 シールコインの もらいかた</div>
          ・その日 はじめて まちがえずに とく：+{COIN_RULES.firstOfDay}<br />
          ・まちがえずに {COIN_RULES.perPerfect}問 とくごとに +1（1日 {COIN_RULES.dailyPerfectCap}まいまで）<br />
          ・バッジを とる：銅 +{BADGE_COINS[1]}・銀 +{BADGE_COINS[2]}・金 +{BADGE_COINS[3]}<br />
          ・章の 星が ふえる：星1つ +{COIN_RULES.star}<br />
          <span className="text-white/45">💠クレジット・⚡エナジーでは まわせない。お金も つかわない。</span>
        </div>
      </div>
    </div>
  );
};

// ── アルバム ─────────────────────────────────────────
const AlbumTab: React.FC = () => {
  const stickers = useCollectionStore((s) => s.cap.stickers);
  const [sel, setSel] = useState<StickerDef | null>(null);
  const have = ownedKinds(stickers);
  return (
    <div data-testid="album">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-bold text-sm">📒 シール アルバム</span>
        <span className="text-[12px] text-white/70">{have}/{STICKERS.length}しゅるい（{pct(have, STICKERS.length)}%）</span>
      </div>
      {RARITY_ORDER.map((r) => (
        <div key={r} className="mb-3">
          <div className="text-[11px] font-bold mb-1" style={{ color: RARITY_INFO[r].color }}>{RARITY_INFO[r].stars} {RARITY_INFO[r].label}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
            {STICKERS.filter((s) => s.rarity === r).map((s) => {
              const n = stickers[s.id] ?? 0;
              return (
                <button key={s.id} onClick={() => n > 0 && setSel(s)} className="flex flex-col items-center gap-0.5" data-owned={n > 0 ? '1' : '0'}>
                  <StickerView s={s} size={60} owned={n > 0} count={n} />
                  <span className="text-[10px] leading-tight text-center" style={{ color: n > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}>
                    {n > 0 ? s.name : '？？？'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {sel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" onClick={() => setSel(null)}>
          <div className="rounded-3xl p-5 max-w-xs w-full flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}
            style={{ background: 'linear-gradient(160deg,#0a0e1a,#161029)', border: `2px solid ${sel.frame}` }}>
            <StickerView s={sel} size={128} />
            <div className="text-white font-bold text-lg">{sel.name}</div>
            <div className="text-[12px] font-black" style={{ color: RARITY_INFO[sel.rarity].color }}>{RARITY_INFO[sel.rarity].stars} {RARITY_INFO[sel.rarity].label}</div>
            <div className="text-[12px] text-white/70 text-center leading-relaxed">{sel.note}</div>
            <div className="text-[11px] text-white/45">もっている まいすう：{stickers[sel.id] ?? 0}</div>
            <button onClick={() => setSel(null)} className="mt-1 px-5 py-1.5 rounded-full border border-white/30 text-white/80 text-sm">とじる</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 称号・かざり ─────────────────────────────────────────
const TitleTab: React.FC = () => {
  const col = useCollectionStore();
  useCampaignStore();  // 星が かわったら かきなおす
  const have = { badgeTiers: badgeTierCount(col.badges), stickers: ownedKinds(col.cap.stickers), badges: col.badges };
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="titles">
      <div>
        <div className="text-white font-bold text-sm mb-1">🎖️ しょうごう（ホームに 出る）</div>
        <div className="text-[10px] text-white/50 mb-2">バッジ {have.badgeTiers}こ・シール {have.stickers}しゅるい。見た目だけ（強さは かわらない）</div>
        <div className="flex flex-col gap-1.5">
          {TITLES.map((t) => {
            const open = isOpen(t.need, have);
            const on = col.title === t.id;
            return (
              <button key={t.id} disabled={!open} onClick={() => { col.setTitle(t.id); sfx.select(); }} data-title={t.id} data-open={open ? '1' : '0'}
                className="flex items-center justify-between px-3 py-2 rounded-xl border text-left"
                style={{
                  borderColor: on ? '#facc15' : open ? 'rgba(250,204,21,0.3)' : 'rgba(255,255,255,0.08)',
                  background: on ? 'rgba(250,204,21,0.14)' : 'rgba(255,255,255,0.02)',
                }}>
                <span className="text-[13px] font-bold" style={{ color: open ? '#fde68a' : 'rgba(255,255,255,0.35)' }}>{open ? t.name : `🔒 ${t.name}`}</span>
                <span className="text-[10px]" style={{ color: on ? '#facc15' : 'rgba(255,255,255,0.5)' }}>{on ? 'つけている' : open ? 'えらぶ' : t.how}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-white font-bold text-sm mb-1">🚩 基地の はた（かざり）</div>
        <div className="text-[10px] text-white/50 mb-2">ホームの 基地に たつ。見た目だけ</div>
        <div className="grid grid-cols-2 gap-2">
          {DECORS.map((d) => {
            const open = isOpen(d.need, have);
            const on = col.decor === d.id;
            return (
              <button key={d.id} disabled={!open} onClick={() => { col.setDecor(d.id); sfx.select(); }} data-decor={d.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left"
                style={{
                  borderColor: on ? '#7dd3fc' : 'rgba(255,255,255,0.1)', background: on ? 'rgba(125,211,252,0.12)' : 'rgba(255,255,255,0.02)',
                  opacity: open ? 1 : 0.5,
                }}>
                <DecorFlag id={d.id} size={30} />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-white truncate">{d.name}</div>
                  <div className="text-[10px] text-white/50">{on ? 'たてている' : open ? 'えらぶ' : `🔒 ${d.how}`}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
