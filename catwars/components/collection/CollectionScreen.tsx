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
import { CHARACTERS, getCharacterSprite } from '../../data/characters';
import { TIER_INFO, TIER_ORDER } from '../../data/campaign';
import { refreshCollection, buildBadgeInput } from '../../collection/record';
import { ArtImg, BadgeMedal, DecorFlag, StickerView } from './CollectionParts';
import { sfx } from '../../utils/audioEngine';
import { Button, Icon, Panel, ScreenBackdrop, SectionTitle, TitleBar, useOptionalImage, type IconName } from '../ui';

/**
 * あつめる（2026-11-16 CW-4c）：図鑑（ネコ・敵）・バッジ・カプセル・アルバム・称号とかざり。docs/REBUILD_SPEC.md §3d。
 * どれも 強さには ひびかない（ネコの育ち方は「ネコ部隊」）。
 */

export type CollectionTab = 'dex' | 'badges' | 'capsule' | 'album' | 'title';
const TABS: { id: CollectionTab; label: string; icon: IconName }[] = [
  { id: 'dex', label: 'ずかん', icon: 'dex' },
  { id: 'badges', label: 'バッジ', icon: 'medal' },
  { id: 'capsule', label: 'カプセル', icon: 'capsule' },
  { id: 'album', label: 'アルバム', icon: 'album' },
  { id: 'title', label: 'しょうごう', icon: 'ribbon' },
];

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** 下地つきの 小さな 数の札（図鑑・バッジ・アルバムの 進み） */
const Count: React.FC<{ icon: IconName; have: number; total: number; label: string }> = ({ icon, have, total, label }) => (
  <span className="cw-pill" title={`${label} ${pct(have, total)}%`} aria-label={`${label} ${have}/${total}（${pct(have, total)}%）`}>
    <Icon name={icon} size={22} />
    <span className="font-cw-num font-bold text-cw-14">{have}<span style={{ color: 'var(--cw-fg-3)' }}>/{total}</span></span>
  </span>
);

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
    <div className="cw-screen h-[100dvh] flex flex-col overflow-hidden" data-testid="collection-screen">
      <ScreenBackdrop name="collection" />
      <TitleBar title="あつめる" onBack={onBack}
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end" data-testid="collection-progress">
            <Count icon="dex" have={dexHave} total={dexTotal} label="ずかん" />
            <Count icon="medal" have={badgeTiers} total={BADGE_TIER_TOTAL} label="バッジ" />
            <Count icon="album" have={stickers} total={STICKERS.length} label="アルバム" />
            <span className="cw-pill" aria-label={`シールコイン ${col.coins}`}><Icon name="coin" size={22} /><span className="font-cw-num font-bold text-cw-14">{col.coins}</span></span>
          </div>
        } />
      <div className="flex-shrink-0 px-4 pt-3 pb-2 overflow-x-auto cw-scroll">
        <div className="mx-auto max-w-[980px] grid grid-cols-5 gap-2 min-w-[560px]" role="tablist" aria-label="あつめる">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-tab={t.id} onClick={() => { sfx.select(); setTab(t.id); }}
              className="cw-seg cw-press cw-tone-action min-h-[48px] px-2 flex items-center justify-center gap-1.5 text-cw-14 font-extrabold whitespace-nowrap">
              <Icon name={t.icon} size={24} />{t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto cw-scroll px-4 pt-2 pb-6">
        <div className="mx-auto max-w-[980px] cw-enter" key={tab}>
          {tab === 'dex' && <DexTab />}
          {tab === 'badges' && <BadgesTab />}
          {tab === 'capsule' && <CapsuleTab onAlbum={() => setTab('album')} />}
          {tab === 'album' && <AlbumTab />}
          {tab === 'title' && <TitleTab />}
        </div>
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
      <div className="grid grid-cols-2 gap-2 mb-3">
        {([['cats', 'cats', `ネコ ${catHave}/${CAT_DEX_KEYS.length}`, 'growth'], ['enemies', 'enemy', `てき ${enemyHave}/${ENEMY_DEX.length}`, 'danger']] as const).map(([id, icon, label, tone]) => (
          <button key={id} type="button" data-sub={id} aria-selected={sub === id} onClick={() => setSub(id)}
            className={`cw-seg cw-press cw-tone-${tone} min-h-[48px] flex items-center justify-center gap-2 text-cw-14 font-extrabold`}>
            <Icon name={icon} size={24} />{label}
          </button>
        ))}
      </div>
      {sub === 'cats' ? <CatDex found={cats} /> : <EnemyDex />}
    </div>
  );
};

const CatDex: React.FC<{ found: string[] }> = ({ found }) => (
  <div className="flex flex-col gap-3" data-testid="cat-dex">
    {CHARACTERS.map((fam) => (
      <Panel key={fam.id} className="!p-3">
        <div className="text-cw-14 font-extrabold mb-2 flex items-center gap-2" style={{ color: 'var(--cw-fg)' }}>
          <span aria-hidden className="inline-block w-1 h-4 rounded-full" style={{ background: fam.accent }} />{fam.displayName}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((st) => {
            const ok = found.includes(catDexKey(fam.id, st));
            const form = fam.forms[st - 1];
            return (
              <div key={st} className="flex items-center gap-2 p-2 rounded-cw-md min-w-0" data-found={ok ? '1' : '0'}
                style={{ background: ok ? 'rgba(148,170,255,0.1)' : 'rgba(6,10,28,0.45)' }}>
                <img src={getCharacterSprite(fam.spriteFamily, st)} alt="" draggable={false}
                  style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0, filter: ok ? undefined : 'brightness(0) opacity(0.5)' }} />
                <div className="min-w-0">
                  <div className="text-cw-14 font-bold leading-tight truncate" style={{ color: 'var(--cw-fg)' }}>{ok ? form.name : '？？？'}</div>
                  <div className="text-cw-12 leading-snug" style={{ color: ok ? 'var(--cw-fg-3)' : 'var(--cw-reward)' }}>
                    {ok ? `しんか${st}` : catHowToMeet(fam, st)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    ))}
  </div>
);

const EnemyPic: React.FC<{ e: EnemyDexEntry; ok: boolean; size?: number }> = ({ e, ok, size = 64 }) => {
  if (e.image) {
    // 見つけるまでは かげ（形だけ）
    return (
      <img src={e.image} alt="" draggable={false} data-testid="enemy-pic"
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0,
          filter: ok ? 'drop-shadow(0 0 3px rgba(248,113,113,0.6))' : 'brightness(0) opacity(0.5)' }} />
    );
  }
  return (
    <div className="flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: ok ? 'rgba(248,113,113,0.16)' : 'rgba(6,10,28,0.5)', boxShadow: 'inset 0 0 0 2px rgba(248,113,113,0.5)', fontSize: size * 0.5 }}>
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
      <p className="text-cw-12 mb-2" style={{ color: 'var(--cw-fg-3)' }}>戦いで 見ると のる。たおすと 数が ふえる。しるし（●）は ふつう・むずかしい・げきむず で たおした（ボスは 勝った）しるし。</p>
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2">
        {ENEMY_DEX.map((e) => {
          const ok = seen.includes(e.key);
          return (
            <div key={e.key} className="cw-card flex gap-3 p-3" data-found={ok ? '1' : '0'}
              style={{ boxShadow: ok ? 'var(--cw-shadow-panel), 0 0 0 1px rgba(248,113,113,0.45)' : undefined, background: ok ? undefined : 'rgba(6,10,28,0.45)' }}>
              <EnemyPic e={e} ok={ok} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-cw-14 font-extrabold" style={{ color: 'var(--cw-fg)' }}>{ok ? e.name : '？？？'}</span>
                  {e.kind === 'boss' && <span className="cw-chip cw-tone-reward">第{e.chapterNo}章 ボス</span>}
                  {ok && <span className="text-cw-12 ml-auto" style={{ color: 'var(--cw-fg-3)' }}>たおした {defeated[e.key] ?? 0}</span>}
                </div>
                {ok ? (
                  <>
                    <div className="text-cw-12 leading-snug mt-0.5" style={{ color: 'var(--cw-fg-2)' }}>{e.note}</div>
                    {e.hint && <div className="text-cw-12 leading-snug mt-0.5 flex gap-1" style={{ color: 'var(--cw-action)' }}><Icon name="bulb" size={16} className="mt-px" />{e.hint}</div>}
                    <div className="flex gap-3 mt-1" aria-label="段ごとの しるし">
                      {TIER_ORDER.map((t) => {
                        const has = marks.includes(markKey(e.key, t));
                        return (
                          <span key={t} className="text-cw-12 flex items-center gap-1" style={{ color: has ? 'var(--cw-fg)' : 'var(--cw-fg-3)' }}>
                            <span style={{ color: has ? TIER_INFO[t].color : undefined }}>{has ? '●' : '○'}</span>{TIER_INFO[t].label}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-cw-12 leading-snug mt-0.5" style={{ color: 'var(--cw-reward)' }}>{e.where}</div>
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
      <p className="text-cw-12 mb-3 leading-relaxed" style={{ color: 'var(--cw-fg-3)' }}>
        バッジは 学習の 量と しつ だけで とれる（はやさ・勝った数・あそんだ時間 では とれない）。
        とると <Icon name="coin" size={16} className="inline-block align-[-3px]" />シールコイン（銅 {BADGE_COINS[1]}・銀 {BADGE_COINS[2]}・金 {BADGE_COINS[3]}）。
      </p>
      {(['study', 'unit', 'battle', 'hidden'] as BadgeGroup[]).map((g) => (
        <div key={g} className="mb-4">
          <SectionTitle tone="growth" className="mb-2">{GROUP_LABEL[g]}</SectionTitle>
          <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2">
            {BADGES.filter((b) => b.group === g).map((b) => {
              const tier = Math.min(b.tiers.length, badges[b.id] ?? 0);
              const locked = !!b.hidden && tier === 0;
              const v = b.measure(input);
              const next = b.tiers[tier];
              return (
                <div key={b.id} className="cw-card flex items-center gap-3 p-3" data-badge={b.id} data-tier={tier}
                  style={{ boxShadow: tier > 0 ? `var(--cw-shadow-panel), 0 0 0 1px ${tierColor(b, tier)}88` : undefined }}>
                  <BadgeMedal id={b.id} tier={tier} locked={locked} size={56} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-cw-14 font-extrabold truncate" style={{ color: 'var(--cw-fg)' }}>{locked ? '？？？' : b.name}</span>
                      {tier > 0 && tierLabel(b, tier) && <span className="text-cw-12 font-black" style={{ color: tierColor(b, tier) }}>{tierLabel(b, tier)}</span>}
                    </div>
                    {locked ? (
                      <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>とると わかる かくしバッジ</div>
                    ) : next != null ? (
                      <>
                        <div className="text-cw-12 leading-snug" style={{ color: 'var(--cw-reward)' }}>
                          {b.tiers.length > 1 && `つぎの${TIER_NAME[(tier + 1) as 1 | 2 | 3]}：`}{b.cond(next)}
                        </div>
                        <div className="h-2 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgba(148,170,255,0.16)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (v / next) * 100)}%`, background: 'var(--cw-growth)' }} />
                        </div>
                      </>
                    ) : (
                      <div className="text-cw-12 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>{b.cond(b.tiers[b.tiers.length - 1])}・とった！</div>
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
  // カプセルの機械の絵（あれば）。無ければ アイコンの カプセル
  const machine = useOptionalImage(['/assets/capsule/capsule-machine.webp', '/assets/capsule/capsule-machine.png']);
  // 回したとき（シールが出る ところ）に 上に 見せる ひらいた カプセルの絵（あれば）。無ければ 今までの 演出だけ
  const openPic = useOptionalImage(['/assets/capsule/capsule-open.webp', '/assets/capsule/capsule-open.png']);
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

  const capsulePic = (
    <div style={opening ? { animation: 'cw-capsule-shake 0.35s ease-in-out infinite' } : undefined}>
      {machine
        ? <img src={machine} alt="" draggable={false} data-testid="capsule-machine" className="h-[200px] w-auto object-contain" />
        : <Icon name="capsule" size={120} />}
    </div>
  );

  return (
    <div className="grid gap-3 min-[900px]:grid-cols-2 items-start" data-testid="capsule">
      <Panel>
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-cw-16 font-extrabold"><Icon name="capsule" size={26} />シールカプセル</span>
          <span className="flex items-center gap-1.5 font-cw-num font-black text-cw-16" style={{ color: 'var(--cw-reward)' }}><Icon name="coin" size={24} />{coins}</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-cw-lg py-4 mb-3" style={{ minHeight: 220, background: 'radial-gradient(circle, rgba(56,189,248,0.14), transparent 70%)' }}>
          {opening ? capsulePic : last ? (
            <div className="flex flex-col items-center gap-1.5 cw-enter cw-reward-pop rounded-cw-lg p-2" data-testid="pull-result">
              {openPic && <img src={openPic} alt="" draggable={false} data-testid="capsule-open" className="h-[72px] w-auto object-contain" />}
              <StickerView s={last.sticker} size={104} />
              <div className="text-cw-16 font-extrabold" style={{ color: 'var(--cw-fg)' }}>{last.sticker.name}</div>
              <div className="text-cw-14 font-black" style={{ color: RARITY_INFO[last.sticker.rarity].color }}>
                {RARITY_INFO[last.sticker.rarity].stars} {RARITY_INFO[last.sticker.rarity].label}{last.pity && '（天井！）'}
              </div>
              <div className="text-cw-12" style={{ color: 'var(--cw-fg-2)' }}>
                {last.dup ? `もう もっていた → シールのかけら +${last.fragGain}` : 'あたらしい シール！ アルバムに はったよ'}
              </div>
            </div>
          ) : capsulePic}
        </div>
        <Button variant="reward" size="xl" fullWidth onClick={doPull} disabled={!can} data-testid="pull">
          1回 まわす（<Icon name="coin" size={24} />{CAPSULE_RULES.cost}）
        </Button>
        {coins < CAPSULE_RULES.cost && (
          <div className="text-cw-12 mt-1.5 text-center" style={{ color: 'var(--cw-fg-3)' }}>あと 🪙{CAPSULE_RULES.cost - coins}。まちがえずに とくと たまるよ</div>
        )}
        <div className="mt-2 text-center text-cw-14" data-testid="pity">
          <span className="font-bold" style={{ color: 'var(--cw-rare)' }}>あと {left}回で レアいじょう かくてい</span>
          <span style={{ color: 'var(--cw-fg-3)' }}>（{CAPSULE_RULES.pity}回で 天井）</span>
        </div>
        <Button variant="secondary" size="md" fullWidth className="mt-2" onClick={onAlbum}><Icon name="album" size={24} />アルバムを 見る</Button>
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel data-testid="rates">
          <SectionTitle tone="rare" className="mb-2">出る かくりつ</SectionTitle>
          <table className="w-full text-cw-12">
            <tbody>
              {RARITY_ORDER.map((r) => {
                const kinds = STICKERS.filter((s) => s.rarity === r).length;
                return (
                  <tr key={r} style={{ borderTop: '1px solid var(--cw-line)' }}>
                    <td className="py-1.5 font-bold" style={{ color: RARITY_INFO[r].color }}>{RARITY_INFO[r].stars} {RARITY_INFO[r].label}</td>
                    <td className="py-1.5 text-right font-cw-num font-bold" style={{ color: 'var(--cw-fg)' }}>{RARITY_RATE[r]}%</td>
                    <td className="py-1.5 text-right" style={{ color: 'var(--cw-fg-3)' }}>{kinds}しゅるい（1しゅるい {(RARITY_RATE[r] / kinds).toFixed(2)}%）</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-cw-12 mt-2 leading-relaxed" style={{ color: 'var(--cw-fg-3)' }}>
            9回 つづけて「ふつう」だったら、10回めは かならず レアいじょう（そのときの レア・スーパーレア・でんせつ の わりあいは ふだんと 同じ）。
            シールは かざり。強さは かわらない。ぜんぶ あつめても とくべつな ごほうびは ないよ。
          </div>
        </Panel>

        <Panel data-testid="exchange">
          <div className="flex items-center justify-between mb-1">
            <SectionTitle tone="rare">シールのかけら で こうかん</SectionTitle>
            <span className="flex items-center gap-1.5 font-cw-num font-black text-cw-14" style={{ color: 'var(--cw-rare)' }}><Icon name="shard" size={22} />{cap.frag}</span>
          </div>
          <div className="text-cw-12 mb-2 leading-relaxed" style={{ color: 'var(--cw-fg-3)' }}>
            ダブると かけら（ふつう {DUP_FRAGMENTS.normal}・レア {DUP_FRAGMENTS.rare}・スーパーレア {DUP_FRAGMENTS.super}・でんせつ {DUP_FRAGMENTS.legend}）。
            ためると まだ もっていない すきな シールと こうかん（{RARITY_ORDER.map((r) => `${RARITY_INFO[r].label} ${EXCHANGE_COST[r]}`).join('・')}）。
          </div>
          {msg && <div className="text-cw-14 mb-1 font-bold" style={{ color: 'var(--cw-growth)' }}>{msg}</div>}
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto cw-scroll">
            {unowned.length === 0 && <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>ぜんぶ もっているよ</span>}
            {unowned.map((s) => {
              const cost = EXCHANGE_COST[s.rarity];
              const ok = cap.frag >= cost;
              return (
                <button key={s.id} type="button" disabled={!ok}
                  onClick={() => { if (exchange(s.id)) { sfx.select(); setMsg(`「${s.name}」と こうかんした！`); } }}
                  className="cw-seg cw-press min-h-[44px] flex items-center gap-1.5 px-3 text-cw-12 font-bold"
                  style={{ boxShadow: `inset 0 0 0 1px ${ok ? RARITY_INFO[s.rarity].color : 'var(--cw-line)'}`, color: ok ? 'var(--cw-fg)' : 'var(--cw-fg-3)' }}>
                  {ok ? <ArtImg src={s.image} size={24} fallback={<span>{s.emoji}</span>} /> : <Icon name="lock" size={18} />}{ok ? s.name : RARITY_INFO[s.rarity].label}
                  <span className="flex items-center gap-0.5" style={{ color: 'var(--cw-fg-3)' }}><Icon name="shard" size={14} />{cost}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel className="text-cw-12 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
          <div className="flex items-center gap-2 text-cw-14 font-extrabold mb-1" style={{ color: 'var(--cw-fg)' }}><Icon name="coin" size={22} />シールコインの もらいかた</div>
          ・その日 はじめて まちがえずに とく：+{COIN_RULES.firstOfDay}<br />
          ・まちがえずに {COIN_RULES.perPerfect}問 とくごとに +1（1日 {COIN_RULES.dailyPerfectCap}まいまで）<br />
          ・バッジを とる：銅 +{BADGE_COINS[1]}・銀 +{BADGE_COINS[2]}・金 +{BADGE_COINS[3]}<br />
          ・章の 星が ふえる：星1つ +{COIN_RULES.star}<br />
          <span style={{ color: 'var(--cw-fg-3)' }}>💠クレジット・⚡エナジーでは まわせない。お金も つかわない。</span>
        </Panel>
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
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-cw-16 font-extrabold"><Icon name="album" size={26} />シール アルバム</span>
        <span className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>{have}/{STICKERS.length}しゅるい（{pct(have, STICKERS.length)}%）</span>
      </div>
      {RARITY_ORDER.map((r) => (
        <div key={r} className="mb-4">
          <div className="text-cw-14 font-extrabold mb-1.5" style={{ color: RARITY_INFO[r].color }}>{RARITY_INFO[r].stars} {RARITY_INFO[r].label}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
            {STICKERS.filter((s) => s.rarity === r).map((s) => {
              const n = stickers[s.id] ?? 0;
              return (
                <button key={s.id} type="button" onClick={() => n > 0 && setSel(s)} className="cw-press flex flex-col items-center gap-1 py-1 min-h-[88px]" data-owned={n > 0 ? '1' : '0'}
                  aria-label={n > 0 ? s.name : 'まだ もっていない シール'}>
                  <StickerView s={s} size={64} owned={n > 0} count={n} />
                  <span className="text-cw-12 leading-tight text-center" style={{ color: n > 0 ? 'var(--cw-fg)' : 'var(--cw-fg-3)' }}>
                    {n > 0 ? s.name : '？？？'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {sel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(6,10,28,0.78)' }} onClick={() => setSel(null)}>
          <div className="cw-panel cw-panel-strong cw-enter p-5 max-w-xs w-full flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: `var(--cw-shadow-panel), 0 0 0 2px ${sel.frame}` }}>
            <StickerView s={sel} size={128} />
            <div className="text-cw-20 font-extrabold" style={{ color: 'var(--cw-fg)' }}>{sel.name}</div>
            <div className="text-cw-14 font-black" style={{ color: RARITY_INFO[sel.rarity].color }}>{RARITY_INFO[sel.rarity].stars} {RARITY_INFO[sel.rarity].label}</div>
            <div className="text-cw-14 text-center leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{sel.note}</div>
            <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>もっている まいすう：{stickers[sel.id] ?? 0}</div>
            <Button variant="secondary" className="mt-1" onClick={() => setSel(null)}>とじる</Button>
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
    <div className="grid gap-4 min-[900px]:grid-cols-2 items-start" data-testid="titles">
      <div>
        <div className="flex items-center gap-2 text-cw-16 font-extrabold mb-1"><Icon name="ribbon" size={26} />しょうごう（ホームに 出る）</div>
        <div className="text-cw-12 mb-2" style={{ color: 'var(--cw-fg-3)' }}>バッジ {have.badgeTiers}こ・シール {have.stickers}しゅるい。見た目だけ（強さは かわらない）</div>
        <div className="flex flex-col gap-2">
          {TITLES.map((t) => {
            const open = isOpen(t.need, have);
            const on = col.title === t.id;
            return (
              <button key={t.id} type="button" disabled={!open} onClick={() => { col.setTitle(t.id); sfx.select(); }} data-title={t.id} data-open={open ? '1' : '0'}
                className="cw-seg cw-press cw-tone-reward min-h-[52px] flex items-center justify-between gap-2 px-3 text-left"
                style={{ boxShadow: on ? 'var(--cw-lit-reward)' : undefined, background: on ? 'var(--tone-bg)' : undefined }}>
                <span className="flex items-center gap-2 text-cw-14 font-extrabold" style={{ color: open ? 'var(--cw-reward)' : 'var(--cw-fg-3)' }}>
                  {!open && <Icon name="lock" size={18} />}{t.name}
                </span>
                <span className="text-cw-12" style={{ color: on ? 'var(--cw-reward)' : 'var(--cw-fg-3)' }}>{on ? 'つけている' : open ? 'えらぶ' : t.how}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 text-cw-16 font-extrabold mb-1"><DecorFlag size={26} />基地の はた（かざり）</div>
        <div className="text-cw-12 mb-2" style={{ color: 'var(--cw-fg-3)' }}>ホームの 基地に たつ。見た目だけ</div>
        <div className="grid grid-cols-2 gap-2">
          {DECORS.map((d) => {
            const open = isOpen(d.need, have);
            const on = col.decor === d.id;
            return (
              <button key={d.id} type="button" disabled={!open} onClick={() => { col.setDecor(d.id); sfx.select(); }} data-decor={d.id}
                className="cw-seg cw-press cw-tone-action min-h-[60px] flex items-center gap-2 px-3 text-left"
                style={{ boxShadow: on ? 'var(--cw-lit-action)' : undefined, background: on ? 'var(--tone-bg)' : undefined, opacity: open ? 1 : 0.85 }}>
                <DecorFlag id={d.id} size={32} />
                <div className="min-w-0">
                  <div className="text-cw-14 font-bold truncate" style={{ color: 'var(--cw-fg)' }}>{d.name}</div>
                  <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>{on ? 'たてている' : open ? 'えらぶ' : d.how}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
