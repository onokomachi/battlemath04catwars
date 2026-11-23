import React, { useEffect, useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID, getCharacterSprite, stageForLevel } from '../../data/characters';
import {
  CampaignChapter, ChapterTier, ChapterDifficulty, ENEMY_TRAIT_NOTE, ENEMY_UNIT_STATS, TIER_INFO, tierDifficulty, type EnemyUnitKind,
} from '../../data/campaign';
import { ENEMY_UNIT_SPRITE } from '../../data/enemySprites';
import { useArmyStore, effectiveFormation, FORMATION_SIZE } from '../../store/useArmyStore';
import { useBaseStore } from '../../store/useBaseStore';
import { useProgressStore } from '../../store/useProgressStore';
import { unlockedFamilies } from '../../utils/battleLoadout';
import { barracksNeededFor } from '../../data/facilities';
import { sfx } from '../../utils/audioEngine';
import { useStudyStore } from '../../store/useStudyStore';
import { familySkillIds } from '../../learn/shards';
import { skillsForFamily } from '../../data/skills';
import { loadPack, packLoaded } from '../../learn/gradePack';
import { BuildingType } from '../../types';
import { Button, Chip, Disclosure, FacilityImg, Icon, Panel, ScreenBackdrop, SectionTitle, TitleBar } from '../ui';

interface Props {
  chapter: CampaignChapter;
  tier: ChapterTier;
  onBack: () => void;
  onProceed: () => void;
  /** 敵の顔ぶれを 差しかえる（週がわりの遠征。無ければ その章・段の きまり） */
  difficulty?: ChapterDifficulty;
}

/** 空をとぶ敵に とどくか（射程2以上・飛行） */
const reachesAir = (id: string) => (CHARACTER_BY_ID[id]?.base.attackRange ?? 0) >= 2 || id === 'flying';
const isRanged = (id: string) => (CHARACTER_BY_ID[id]?.base.attackRange ?? 0) >= 2;

/** 5枠と、出てくる敵から、注意を出す（止めはしない） */
export function formationWarnings(formation: string[], pool: EnemyUnitKind[]): string[] {
  const out: string[] = [];
  if (pool.includes('flyer') && !formation.some(reachesAir)) out.push('⚠️ 空をとぶ敵に とどく ネコが いないよ（遠距離・魔法・飛行を 入れよう）');
  if (pool.includes('guard') && !formation.includes('magic')) out.push('⚠️ たて持ちには 魔法が よくきくよ（魔法系を 入れると 楽になる）');
  if (pool.includes('kamikaze') && !formation.some(isRanged)) out.push('⚠️ ばくだんロボが 施設に つっこんでくる。とどく前に たおせる 遠距離を 入れよう');
  return out;
}

/**
 * 出撃メンバーをえらぶ（5枠。ステージえらび → ここ → 陣地づくり → 戦闘）。
 * その章・その段に出てくる敵と たおし方を 同じ画面に出し、「この敵には この系統」が見て分かるようにする。
 */
export const FormationScreen: React.FC<Props> = ({ chapter, tier, onBack, onProceed, difficulty }) => {
  const army = useArmyStore(s => s.army);
  const saved = useArmyStore(s => s.formation);
  const setFormation = useArmyStore(s => s.setFormation);
  const owned = useBaseStore(s => s.owned);
  const permanentUnlocks = useProgressStore(s => s.permanentUnlocks);
  const perfect = useStudyStore(s => s.perfect);
  // かけら（＝スキル）は「出せる問題」で数える。ここで読みこんでおくと、戦闘の始まりで sim に渡すスキルとも そろう
  const [, setReady] = useState(packLoaded());
  useEffect(() => { let alive = true; loadPack().then(() => { if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);
  /** 開いているスキルの数を ★ で（スキルの無い系統は 空） */
  const skillStars = (id: string): string => (skillsForFamily(id).length ? '★'.repeat(familySkillIds(id, perfect).length) : '');

  const unlocked = useMemo(() => unlockedFamilies(owned, permanentUnlocks), [owned, permanentUnlocks]);
  const formation = useMemo(() => effectiveFormation(saved, unlocked), [saved, unlocked]);
  const td = difficulty ?? tierDifficulty(chapter, tier);
  const warnings = formationWarnings(formation, td.unitPool);
  const tierInfo = TIER_INFO[tier];

  const toggle = (id: string) => {
    if (!unlocked.includes(id)) return;
    if (formation.includes(id)) {
      if (formation.length <= 1) return; // 0こには しない
      setFormation(formation.filter(x => x !== id));
      sfx.tap();
      return;
    }
    if (formation.length >= FORMATION_SIZE) return;
    setFormation([...formation, id]);
    sfx.tap();
  };

  const lockNote = (id: string): string => {
    const need = barracksNeededFor(id);
    if (need != null) return `兵舎を ${need}つ もつと ひらく`;
    return '「なかまを よぶ」（💠）で ひらく';
  };

  const slotLv = (id: string) => army[id]?.level ?? 1;
  const starsOf = (id: string) => familySkillIds(id, perfect).length;
  const hasSkills = (id: string) => skillsForFamily(id).length > 0;

  return (
    <div className="cw-screen h-[100dvh] flex flex-col overflow-hidden" data-testid="formation-screen">
      <ScreenBackdrop name="stage" />
      <TitleBar title="出撃メンバー" onBack={onBack}
        subtitle={<>第{chapter.no}章「{chapter.title}」{tier === 'normal' ? '' : `（${tierInfo.label}）`}</>}
        right={<Chip tone="growth"><Icon name="cats" size={18} />{formation.length}/{FORMATION_SIZE}</Chip>} />

      <div className="flex-1 overflow-y-auto cw-scroll px-4 py-3 cw-enter">
        <div className="mx-auto max-w-[980px] grid gap-3 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
          {/* 左：5枠・注意・出てくる敵 */}
          <div className="flex flex-col gap-3">
            <Panel>
              <SectionTitle tone="growth" right="下から タップで 入れる・上の枠を タップで はずす">出撃する 5ひき</SectionTitle>
              <div className="mt-3 grid grid-cols-5 gap-2" data-testid="formation-slots">
                {Array.from({ length: FORMATION_SIZE }, (_, i) => {
                  const id = formation[i];
                  const fam = id ? CHARACTER_BY_ID[id] : null;
                  return (
                    <button key={i} type="button" onClick={() => id && toggle(id)} aria-label={fam ? `${fam.displayName}を はずす` : 'あいている枠'}
                      className="cw-press rounded-cw-md flex flex-col items-center justify-center py-2 min-h-[104px]"
                      style={{
                        background: fam ? `${fam.accent}22` : 'rgba(148,170,255,0.06)',
                        boxShadow: fam ? `0 0 0 2px ${fam.accent}` : 'inset 0 0 0 1px var(--cw-line)',
                      }}>
                      {fam ? (
                        <>
                          <img src={getCharacterSprite(fam.spriteFamily, stageForLevel(slotLv(fam.id)))} alt={fam.displayName}
                            style={{ width: 60, height: 60, objectFit: 'contain' }} draggable={false} />
                          <span className="text-cw-12 font-bold leading-tight mt-0.5" style={{ color: 'var(--cw-fg)' }}>{fam.displayName}</span>
                          <span className="text-cw-12 font-cw-num leading-tight" style={{ color: 'var(--cw-fg-2)' }}>Lv{slotLv(fam.id)}</span>
                          {hasSkills(fam.id) && starsOf(fam.id) > 0 && (
                            <span className="flex gap-0.5 mt-0.5" data-testid="slot-skill-stars" aria-label={`スキル ${starsOf(fam.id)}こ`}>
                              {Array.from({ length: starsOf(fam.id) }, (_, k) => <Icon key={k} name="star" size={12} />)}
                            </span>
                          )}
                        </>
                      ) : <span className="text-cw-28 font-bold" style={{ color: 'var(--cw-fg-3)' }}>＋</span>}
                    </button>
                  );
                })}
              </div>
            </Panel>

            {warnings.length > 0 && (
              <div className="cw-panel cw-tone-reward p-3 flex flex-col gap-2" data-testid="formation-warning" style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-reward)' }}>
                {warnings.map(w => (
                  <p key={w} className="flex items-start gap-2 text-cw-14 leading-snug" style={{ color: 'var(--cw-fg)' }}>
                    <Icon name="warn" size={22} className="mt-0.5" />{w.replace(/^⚠️\s*/, '')}
                  </p>
                ))}
              </div>
            )}

            {/* 出てくる敵と たおし方 */}
            <Disclosure title="出てくる 敵と たおし方" icon="enemy" defaultOpen data-testid="formation-enemies">
              <ul className="flex flex-col gap-2">
                {td.unitPool.map(k => {
                  const note = ENEMY_TRAIT_NOTE[k];
                  return (
                    <li key={k} className="flex items-center gap-2 text-cw-14">
                      <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="w-8 h-8 object-contain flex-shrink-0" />
                      <span><span className="font-bold">{note ? `${note.icon} ` : ''}{ENEMY_UNIT_STATS[k].label}</span>
                        {note && <span className="text-cw-12 block" style={{ color: 'var(--cw-fg-3)' }}>{note.counter}</span>}</span>
                    </li>
                  );
                })}
                {td.bossAtSpawnCount != null && (
                  <li className="flex items-center gap-2 text-cw-14">
                    <img src={ENEMY_UNIT_SPRITE.boss} alt="" draggable={false} className="w-8 h-8 object-contain flex-shrink-0" />
                    <span><span className="font-bold" style={{ color: 'var(--cw-reward)' }}>ボス（{ENEMY_UNIT_STATS.boss.label}）</span>
                      {(td.bossShield ?? 0) > 0 && <span className="text-cw-12 block" style={{ color: 'var(--cw-fg-3)' }}>シールドは ふくしゅうカードで わる</span>}</span>
                  </li>
                )}
              </ul>
            </Disclosure>
          </div>

          {/* 右：えらべる系統 */}
          <div className="grid grid-cols-2 gap-2">
            {CHARACTERS.map(fam => {
              const open = unlocked.includes(fam.id);
              const on = formation.includes(fam.id);
              const lv = slotLv(fam.id);
              const tags = [reachesAir(fam.id) ? '空にとどく' : '', fam.id === 'magic' ? 'たてに強い' : ''].filter(Boolean);
              return (
                <button key={fam.id} type="button" onClick={() => toggle(fam.id)} disabled={!open}
                  data-family={fam.id}
                  className="cw-card cw-press flex items-center gap-2 p-2 min-h-[84px] text-left"
                  style={{
                    background: on ? `${fam.accent}26` : undefined,
                    boxShadow: on ? `var(--cw-shadow-panel), 0 0 0 2px ${fam.accent}` : undefined,
                    opacity: open ? 1 : 0.8,
                  }}>
                  <div className="relative flex-shrink-0">
                    <img src={getCharacterSprite(fam.spriteFamily, stageForLevel(lv))} alt={fam.displayName}
                      style={{ width: 56, height: 56, objectFit: 'contain', filter: open ? undefined : 'grayscale(1) brightness(0.6)' }}
                      draggable={false} />
                    {!open && <span className="absolute inset-0 flex items-center justify-center"><Icon name="lock" size={26} /></span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-cw-14 font-extrabold leading-tight" style={{ color: 'var(--cw-fg)' }}>{fam.displayName}</span>
                      <span className="text-cw-12 font-cw-num font-bold px-1.5 rounded-cw-sm" style={{ background: `${fam.accent}33`, color: 'var(--cw-fg)' }}>Lv{lv}</span>
                      {hasSkills(fam.id) && starsOf(fam.id) > 0 && (
                        <span className="flex gap-0.5" title="ひらいている スキルの数">{Array.from({ length: starsOf(fam.id) }, (_, k) => <Icon key={k} name="star" size={12} />)}</span>
                      )}
                    </div>
                    <div className="text-cw-12 leading-tight" style={{ color: 'var(--cw-fg-3)' }}>{open ? fam.role : lockNote(fam.id)}</div>
                    {open && tags.length > 0 && <div className="text-cw-12 leading-tight font-bold" style={{ color: 'var(--cw-growth)' }}>{tags.join('・')}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pt-3 relative z-10"
        style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 1px 0 var(--cw-line)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="mx-auto max-w-[980px]">
          <Button variant="primary" size="xl" fullWidth disabled={formation.length === 0} data-testid="formation-proceed"
            onClick={() => { if (formation.length > 0) { setFormation(formation); sfx.select(); onProceed(); } }}>
            <FacilityImg type={BuildingType.TOWN_HALL} size={34} />このメンバーで 陣地づくりへ<span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
