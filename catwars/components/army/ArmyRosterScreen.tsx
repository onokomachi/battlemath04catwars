import React, { useEffect, useState } from 'react';
import { CHARACTERS, getCharacterSprite, stageForLevel, xpToNext, levelMult, MAX_LEVEL, CharacterFamily } from '../../data/characters';
import { useArmyStore } from '../../store/useArmyStore';
import { useStudyStore } from '../../store/useStudyStore';
import { familyShards, familyLevelCap, weakestUnitForFamily, nextShardHint, shardsFromServer, useShardSource, MAX_SHARDS } from '../../learn/shards';
import { loadPack, packLoaded, UNIT_NAME_BY_KEY, unitsForFamily } from '../../learn/gradePack';
import { skillsForFamily, unlockedSkillIds } from '../../data/skills';
import { SkillList, NewSkillNotice } from './SkillParts';
import { Button, Chip, Disclosure, Icon, Panel, ProgressBar, ScreenBackdrop, SectionTitle, TitleBar } from '../ui';

/** 系統の「上限・かけら・つぎにとく単元」 */
function capInfo(familyId: string, perfect: Record<string, number>) {
  const shards = familyShards(familyId, perfect);
  const cap = familyLevelCap(familyId, perfect);
  const weak = weakestUnitForFamily(familyId, perfect);
  return {
    shards, cap,
    nextUnit: weak ? UNIT_NAME_BY_KEY[weak] ?? weak : null,
    nextHint: weak ? nextShardHint(UNIT_NAME_BY_KEY[weak] ?? weak, weak, perfect) : '',
    units: unitsForFamily(familyId),
  };
}

interface Props {
  onBack: () => void;
}

/** 系統の色（accent）を 部品の --tone に わたす */
const famTone = (accent: string): React.CSSProperties => ({ ['--tone' as string]: accent, ['--tone-bg' as string]: `color-mix(in srgb, ${accent} 16%, transparent)` });

export const ArmyRosterScreen: React.FC<Props> = ({ onBack }) => {
  const { army } = useArmyStore();
  const perfect = useStudyStore(s => s.perfect);
  // サーバの かけら（名乗っているとき）が 読めたら かぞえなおす
  useShardSource(s => s.server);
  const [selected, setSelected] = useState<CharacterFamily | null>(null);
  // かけらは「その単元の出せる問題」で数える。問題の一覧を読みこんだら、もう一度かぞえる
  const [, setReady] = useState(packLoaded());
  useEffect(() => { let alive = true; loadPack().then(() => { if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);

  return (
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col" data-testid="army-screen">
      <ScreenBackdrop name="home" />
      <TitleBar title="ネコ部隊" onBack={onBack} right={<Chip><Icon name="cats" size={18} />{CHARACTERS.length}系統 / {CHARACTERS.length * 3}フォーム</Chip>} />
      <div className="flex-1 overflow-y-auto cw-scroll px-3 py-3 cw-enter">
        <div className="max-w-3xl mx-auto">
          {/* 新しく開いたスキル（1回だけ） */}
          {packLoaded() && <NewSkillNotice />}

          <div className="grid grid-cols-2 gap-3">
            {CHARACTERS.map(fam => {
              const entry = army[fam.id] ?? { level: 1, xp: 0, totalBattles: 0 };
              const stage = stageForLevel(entry.level);
              const form = fam.forms[stage - 1];
              const ci = capInfo(fam.id, perfect);
              const atCap = entry.level >= ci.cap;
              const nSkill = skillsForFamily(fam.id).length;
              const nOpen = unlockedSkillIds(fam.id, ci.shards).length;
              return (
                <button key={fam.id} type="button" onClick={() => setSelected(fam)} data-testid={`army-${fam.id}`}
                  className="cw-card cw-press flex flex-col items-center p-3 text-center" style={famTone(fam.accent)}>
                  <div className="relative">
                    <img src={getCharacterSprite(fam.spriteFamily, stage)} alt={form.name}
                      style={{ width: 72, height: 72, objectFit: 'contain' }} draggable={false} />
                    <span className="cw-chip font-cw-num absolute -top-1 -right-3" style={{ background: 'var(--cw-surface-strong)', color: 'var(--cw-fg)', boxShadow: `inset 0 0 0 1.5px ${fam.accent}` }}>Lv{entry.level}</span>
                  </div>
                  <div className="font-extrabold text-cw-16 mt-1 leading-tight" style={{ color: 'var(--cw-fg)' }}>{form.name}</div>
                  <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>{fam.displayName}・進化{stage}</div>
                  <ProgressBar className="w-full mt-2" tone={atCap ? 'reward' : 'growth'} label="けいけんち"
                    value={atCap ? 1 : entry.xp / xpToNext(entry.level)} />
                  <div className="w-full mt-1.5 flex items-center justify-center gap-x-3 gap-y-0.5 flex-wrap text-cw-12" data-testid="cap-line" style={{ color: 'var(--cw-fg-2)' }}>
                    <span>上限 Lv.{ci.cap}</span>
                    <span className="inline-flex items-center gap-0.5 font-cw-num" style={{ color: 'var(--cw-rare)' }}><Icon name="shard" size={16} />{ci.shards}/{MAX_SHARDS}</span>
                    {nSkill > 0 && (
                      <span className="inline-flex items-center" data-testid="skill-stars" aria-label={`スキル ${nOpen}/3`}>
                        {Array.from({ length: 3 }, (_, i) => (
                          <Icon key={i} name="star" size={16} style={i < nOpen ? undefined : { filter: 'grayscale(1) brightness(0.5)' }} />
                        ))}
                      </span>
                    )}
                  </div>
                  {atCap && ci.cap < MAX_LEVEL && ci.nextUnit && (
                    <div className="w-full mt-1 text-cw-12 leading-tight" style={{ color: 'var(--cw-reward)' }}>
                      {shardsFromServer() ? `つぎの上限：『${ci.nextUnit}』の 単元アプリで がんばろう` : `つぎの上限：『${ci.nextUnit}』を まちがえずに とこう`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <Disclosure title="レベルと かけらの しくみ" icon="shard" className="mt-3 mb-4">
            <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
              戦いに 出すと ネコに けいけんちが 入って レベルアップ！ Lv10と Lv30で すがたが 進化するニャ。<br />
              {shardsFromServer()
                ? <>レベルの上限は、そのネコの単元の 単元アプリで 本番テスト・実力の階段を がんばると 上がる（かけら 1つで +5・Lv60まで。SANMON と同じ かけら）。<br /></>
                : <>レベルの上限は、そのネコの単元を まちがえずに とくと 上がる（かけら 1つで +5・Lv60まで）。<br /></>}
              かけらが 2・4・8こに なると スキル（★）が ひらく。
            </p>
          </Disclosure>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <DetailModal fam={selected} entry={army[selected.id] ?? { level: 1, xp: 0, totalBattles: 0 }}
          info={capInfo(selected.id, perfect)}
          onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

const DetailModal: React.FC<{
  fam: CharacterFamily;
  entry: { level: number; xp: number; totalBattles: number };
  info: ReturnType<typeof capInfo>;
  onClose: () => void;
}> = ({ fam, entry, info, onClose }) => {
  const curStage = stageForLevel(entry.level);
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(6,10,28,0.78)' }} onClick={onClose} data-testid="army-detail">
      <Panel strong className="cw-enter w-full max-w-md max-h-[88dvh] overflow-y-auto cw-scroll"
        style={{ boxShadow: `var(--cw-shadow-panel), 0 0 0 1px ${fam.accent}`, ...famTone(fam.accent) }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-cw-num font-bold text-cw-20 leading-tight" style={{ color: 'var(--cw-fg)' }}>{fam.displayName}</h3>
            <p className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>{fam.role}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="army-close">とじる</Button>
        </div>

        {/* Current level summary */}
        <div className="flex items-center gap-3 mb-3 p-3 rounded-cw-md" style={{ background: 'var(--tone-bg)' }}>
          <span className="font-cw-num font-black text-cw-28 leading-none" style={{ color: 'var(--tone)' }}>Lv{entry.level}</span>
          <div className="flex-1 min-w-0">
            <div className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>バトル {entry.totalBattles} 回</div>
            <ProgressBar className="mt-1" tone="growth" label="けいけんち" value={entry.level >= MAX_LEVEL ? 1 : entry.xp / xpToNext(entry.level)} />
            <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>
              {entry.level >= MAX_LEVEL ? 'MAX' : entry.level >= info.cap ? `上限 Lv.${info.cap}（XPは入らない）` : `次のレベルまで ${xpToNext(entry.level) - entry.xp} XP`}
            </div>
          </div>
        </div>

        {/* レベルの上限と かけら */}
        <div className="cw-tone-rare mb-4 p-3 rounded-cw-md" style={{ background: 'var(--tone-bg)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)' }}>
          <div className="flex items-center gap-1.5 text-cw-14 font-extrabold" style={{ color: 'var(--cw-fg)' }}>
            <Icon name="shard" size={22} />上限 Lv.{info.cap}　かけら {info.shards}/{MAX_SHARDS}
          </div>
          <div className="text-cw-12 mt-1 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
            むすびついた単元：{info.units.length > 4 ? 'ぜんぶの単元' : info.units.map(u => `『${UNIT_NAME_BY_KEY[u] ?? u}』`).join('・')}
          </div>
          {info.cap < MAX_LEVEL && info.nextUnit && (
            <div className="text-cw-14 mt-1 leading-relaxed" style={{ color: 'var(--cw-reward)' }}>{info.nextHint}</div>
          )}
        </div>

        {/* スキル（かけらで開く） */}
        <SkillList familyId={fam.id} shards={info.shards} />

        {/* 3 evolution forms */}
        <SectionTitle tone="cat">しんか</SectionTitle>
        <div className="flex flex-col gap-2 mt-2">
          {fam.forms.map(form => {
            const unlocked = entry.level >= form.minLevel;
            const isCurrent = form.stage === curStage;
            const mult = levelMult(form.minLevel);
            return (
              <div key={form.stage} className="cw-card flex items-center gap-3 p-2.5"
                style={isCurrent ? { boxShadow: `var(--cw-shadow-panel), 0 0 0 1px ${fam.accent}` } : unlocked ? undefined : { background: 'var(--cw-surface-strong)' }}>
                <img src={getCharacterSprite(fam.spriteFamily, form.stage)} alt={form.name}
                  style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0, filter: unlocked ? undefined : 'grayscale(1) brightness(0.6)' }}
                  draggable={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-cw-14" style={{ color: unlocked ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>{unlocked ? form.name : '???'}</span>
                    {isCurrent && <Chip tone="cat">いま</Chip>}
                  </div>
                  <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>
                    {form.stage === 1 ? 'Lv1〜' : `Lv${form.minLevel}で進化`} ・ HP・攻 ×{mult.toFixed(2)}
                  </div>
                  <div className="text-cw-12 mt-0.5 leading-tight" style={{ color: 'var(--cw-fg-2)' }}>{unlocked ? form.flavor : '進化するとわかる！'}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Base stats */}
        {/* 射程・再出撃・攻城倍率は、どのネコをいつ出すかを決める中核の数字なので
            図鑑にも出す（砲台の射程4.5と見くらべられるようにする）。 */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { l: 'HP', v: Math.round(fam.base.hp * levelMult(entry.level)) },
            { l: '攻撃', v: Math.round(fam.base.damage * levelMult(entry.level)) },
            { l: '速さ', v: fam.base.moveSpeed.toFixed(1) },
            { l: '射程', v: fam.base.attackRange.toFixed(1) },
            { l: '再出撃', v: (fam.cooldownMs / 1000).toFixed(1) + '秒' },
            { l: '建物へ', v: '×' + fam.buildingDamageMult.toFixed(1) },
          ].map(s => (
            <div key={s.l} className="text-center p-2 rounded-cw-md" style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 0 0 1px var(--cw-line)' }}>
              <div className="font-cw-num font-bold text-cw-16" style={{ color: 'var(--cw-fg)' }}>{s.v}</div>
              <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div className="text-cw-12 mt-2 leading-relaxed" style={{ color: 'var(--cw-fg-3)' }}>
          ※ 敵の砲台は しゃてい4.5で とても 長い。とどかない ネコは、タンク系に うけてもらうか、
          たてものに つよい ネコ（ぼむにゃー ×4.0）で こわそう。
        </div>
      </Panel>
    </div>
  );
};
