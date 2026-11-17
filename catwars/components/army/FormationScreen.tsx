import React, { useEffect, useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID, getCharacterSprite, stageForLevel } from '../../data/characters';
import {
  CampaignChapter, ChapterTier, ENEMY_TRAIT_NOTE, ENEMY_UNIT_STATS, TIER_INFO, tierDifficulty, type EnemyUnitKind,
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

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

interface Props {
  chapter: CampaignChapter;
  tier: ChapterTier;
  onBack: () => void;
  onProceed: () => void;
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
export const FormationScreen: React.FC<Props> = ({ chapter, tier, onBack, onProceed }) => {
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
  const td = tierDifficulty(chapter, tier);
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

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" style={font} data-testid="formation-screen">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: 'rgba(6,10,24,0.85)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="text-white/60 hover:text-white text-sm">← もどる</button>
        <div className="min-w-0">
          <h2 className="text-[#a3e635] font-bold text-sm leading-tight" style={fontMono}>出撃メンバー</h2>
          <p className="text-white/45 text-[10px] truncate">第{chapter.no}章「{chapter.title}」{tier === 'normal' ? '' : `（${tierInfo.label}）`}</p>
        </div>
        <span className="ml-auto text-[#a3e635] font-bold text-sm" style={fontMono}>{formation.length}/{FORMATION_SIZE}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* 出てくる敵と たおし方 */}
        <div className="p-3 rounded-xl" data-testid="formation-enemies"
          style={{ background: `${tierInfo.color}12`, border: `1px solid ${tierInfo.color}55` }}>
          <div className="font-bold text-[11px] mb-1.5" style={{ color: tierInfo.color, ...fontMono }}>▸ 出てくる 敵と たおし方</div>
          <ul className="space-y-1">
            {td.unitPool.map(k => {
              const note = ENEMY_TRAIT_NOTE[k];
              return (
                <li key={k} className="text-[11px] leading-snug text-white/85">
                  <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="inline-block w-5 h-5 object-contain align-middle mr-1" />
                  <span className="font-bold">{note ? `${note.icon} ` : ''}{ENEMY_UNIT_STATS[k].label}</span>
                  {note && <span className="text-white/65">　{note.counter}</span>}
                </li>
              );
            })}
            {td.bossAtSpawnCount != null && (
              <li className="text-[11px] leading-snug text-[#fde68a]">
                <img src={ENEMY_UNIT_SPRITE.boss} alt="" draggable={false} className="inline-block w-5 h-5 object-contain align-middle mr-1" />
                <span className="font-bold">👑 ボス（{ENEMY_UNIT_STATS.boss.label}）</span>
                {(td.bossShield ?? 0) > 0 && <span className="text-white/70">　シールドは ふくしゅうカードで わる</span>}
              </li>
            )}
          </ul>
        </div>

        {warnings.length > 0 && (
          <div className="mt-2 p-2.5 rounded-xl space-y-1" data-testid="formation-warning"
            style={{ background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.45)' }}>
            {warnings.map(w => <p key={w} className="text-[11px] text-[#fde68a] leading-snug">{w}</p>)}
          </div>
        )}

        {/* 5枠 */}
        <div className="mt-3 grid grid-cols-5 gap-2 max-w-md" data-testid="formation-slots">
          {Array.from({ length: FORMATION_SIZE }, (_, i) => {
            const id = formation[i];
            const fam = id ? CHARACTER_BY_ID[id] : null;
            const lv = id ? army[id]?.level ?? 1 : 1;
            return (
              <button key={i} onClick={() => id && toggle(id)}
                className="aspect-square rounded-xl border-2 flex flex-col items-center justify-center"
                style={{ borderColor: fam ? fam.accent : 'rgba(255,255,255,0.15)', background: fam ? `${fam.accent}18` : 'rgba(255,255,255,0.03)' }}>
                {fam ? (
                  <>
                    <img src={getCharacterSprite(fam.spriteFamily, stageForLevel(lv))} alt={fam.displayName}
                      style={{ width: 36, height: 36, objectFit: 'contain' }} draggable={false} />
                    <span className="text-[9px] text-white/80 leading-none mt-0.5">{fam.displayName}</span>
                    {skillStars(fam.id) && <span className="text-[8px] text-[#facc15] leading-none" data-testid="slot-skill-stars">{skillStars(fam.id)}</span>}
                  </>
                ) : <span className="text-white/25 text-lg">＋</span>}
              </button>
            );
          })}
        </div>
        <p className="text-white/40 text-[10px] mt-1">下から タップで 入れる・上の枠を タップで はずす（5つまで）</p>

        {/* えらべる系統 */}
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CHARACTERS.map(fam => {
            const open = unlocked.includes(fam.id);
            const on = formation.includes(fam.id);
            const lv = army[fam.id]?.level ?? 1;
            const tags = [reachesAir(fam.id) ? '🪽空にとどく' : '', fam.id === 'magic' ? '🛡️たてに強い' : ''].filter(Boolean);
            return (
              <button key={fam.id} onClick={() => toggle(fam.id)} disabled={!open}
                data-family={fam.id}
                className="flex items-center gap-2 p-2 rounded-xl border-2 text-left transition-all active:scale-95"
                style={{
                  borderColor: on ? fam.accent : 'rgba(255,255,255,0.1)',
                  background: on ? `${fam.accent}22` : 'rgba(255,255,255,0.03)',
                  opacity: open ? 1 : 0.5,
                }}>
                <div className="relative flex-shrink-0">
                  <img src={getCharacterSprite(fam.spriteFamily, stageForLevel(lv))} alt={fam.displayName}
                    style={{ width: 40, height: 40, objectFit: 'contain', filter: open ? undefined : 'grayscale(1) brightness(0.6)' }}
                    draggable={false} />
                  {!open && <span className="absolute inset-0 flex items-center justify-center text-lg">🔒</span>}
                </div>
                <div className="min-w-0">
                  <div className="text-white text-xs font-bold leading-tight">{fam.displayName} <span style={{ color: fam.accent, ...fontMono }}>Lv{lv}</span>{skillStars(fam.id) && <span className="text-[#facc15] text-[10px]" title="ひらいている スキルの数"> {skillStars(fam.id)}</span>}</div>
                  <div className="text-white/50 text-[10px] leading-tight truncate">{open ? fam.role : lockNote(fam.id)}</div>
                  {open && tags.length > 0 && <div className="text-[9px] text-[#a3e635] leading-tight">{tags.join(' ')}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 pt-3 flex-shrink-0"
        style={{ background: 'rgba(6,10,24,0.92)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <button onClick={() => { if (formation.length > 0) { setFormation(formation); sfx.select(); onProceed(); } }}
          disabled={formation.length === 0}
          className="w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ ...fontMono, background: 'rgba(163,230,53,0.16)', border: '2px solid #a3e635', color: '#d9f99d' }}>
          🏰 このメンバーで 陣地づくりへ →
        </button>
      </div>
    </div>
  );
};
