import React, { useEffect, useState } from 'react';
import { CHARACTERS, getCharacterSprite, stageForLevel, xpToNext, levelMult, MAX_LEVEL, CharacterFamily } from '../../data/characters';
import { useArmyStore } from '../../store/useArmyStore';
import { useStudyStore } from '../../store/useStudyStore';
import { familyShards, familyLevelCap, weakestUnitForFamily, skillsToNextShard, MAX_SHARDS } from '../../learn/shards';
import { loadPack, packLoaded, UNIT_NAME_BY_KEY, unitsForFamily } from '../../learn/gradePack';
import { skillsForFamily, unlockedSkillIds } from '../../data/skills';
import { SkillList, NewSkillNotice } from './SkillParts';

/** 系統の「上限・かけら・つぎにとく単元」 */
function capInfo(familyId: string, perfect: Record<string, number>) {
  const shards = familyShards(familyId, perfect);
  const cap = familyLevelCap(familyId, perfect);
  const weak = weakestUnitForFamily(familyId, perfect);
  return {
    shards, cap,
    nextUnit: weak ? UNIT_NAME_BY_KEY[weak] ?? weak : null,
    nextSkills: weak ? skillsToNextShard(weak, perfect) : 0,
    units: unitsForFamily(familyId),
  };
}

interface Props {
  onBack: () => void;
}

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

export const ArmyRosterScreen: React.FC<Props> = ({ onBack }) => {
  const { army } = useArmyStore();
  const perfect = useStudyStore(s => s.perfect);
  const [selected, setSelected] = useState<CharacterFamily | null>(null);
  // かけらは「その単元の出せる問題」で数える。問題の一覧を読みこんだら、もう一度かぞえる
  const [, setReady] = useState(packLoaded());
  useEffect(() => { let alive = true; loadPack().then(() => { if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-[#0a0e1a] overflow-y-auto" style={font}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 sticky top-0 z-10"
        style={{ background: 'rgba(10,14,26,0.95)' }}>
        <button onClick={onBack} className="text-white/50 hover:text-white text-sm">← もどる</button>
        <h2 className="text-[#22d3ee] font-bold text-base" style={fontMono}>ネコ部隊</h2>
        <span className="text-white/40 text-xs ml-auto">{CHARACTERS.length}系統 / {CHARACTERS.length * 3}フォーム</span>
      </div>

      {/* 新しく開いたスキル（1回だけ） */}
      {packLoaded() && <div className="px-3 pt-3"><NewSkillNotice /></div>}

      {/* Grid of families */}
      <div className="grid grid-cols-2 gap-3 p-3">
        {CHARACTERS.map(fam => {
          const entry = army[fam.id] ?? { level: 1, xp: 0, totalBattles: 0 };
          const stage = stageForLevel(entry.level);
          const form = fam.forms[stage - 1];
          const ci = capInfo(fam.id, perfect);
          const atCap = entry.level >= ci.cap;
          return (
            <button key={fam.id} onClick={() => setSelected(fam)}
              className="flex flex-col items-center p-3 rounded-2xl border transition-all active:scale-95"
              style={{ borderColor: `${fam.accent}55`, background: `${fam.accent}0d` }}>
              <div className="relative">
                <img src={getCharacterSprite(fam.spriteFamily, stage)} alt={form.name}
                  style={{ width: 72, height: 72, objectFit: 'contain' }} draggable={false} />
                <span className="absolute -top-1 -right-1 text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: fam.accent, color: '#0a0e1a', ...fontMono }}>
                  Lv{entry.level}
                </span>
              </div>
              <div className="text-white font-bold text-sm mt-1 text-center leading-tight">{form.name}</div>
              <div className="text-white/40 text-[10px]">{fam.displayName}・進化{stage}</div>
              {/* XP bar */}
              <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full" style={{
                  width: atCap ? '100%' : `${Math.min(100, (entry.xp / xpToNext(entry.level)) * 100)}%`,
                  background: atCap ? '#facc15' : fam.accent,
                }} />
              </div>
              <div className="w-full mt-1 text-[10px] leading-tight" data-testid="cap-line">
                <span className="text-white/60">上限 Lv.{ci.cap}</span>
                <span className="text-[#c4b5fd]">　💎{ci.shards}/{MAX_SHARDS}</span>
                {skillsForFamily(fam.id).length > 0 && (
                  <span className="text-[#facc15]" data-testid="skill-stars">　{'★'.repeat(unlockedSkillIds(fam.id, ci.shards).length)}<span className="text-white/20">{'☆'.repeat(3 - unlockedSkillIds(fam.id, ci.shards).length)}</span></span>
                )}
              </div>
              {atCap && ci.cap < MAX_LEVEL && ci.nextUnit && (
                <div className="w-full mt-0.5 text-[10px] leading-tight text-[#fde68a]">
                  つぎの上限：『{ci.nextUnit}』を まちがえずに とこう
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-white/30 text-xs px-6 pb-4">
        戦闘に出すと ネコに 経験値が 入って レベルアップ！ Lv10と Lv30で すがたが 進化するニャ。<br />
        レベルの上限は、そのネコの単元を まちがえずに とくと 上がる（💎かけら 1つで +5・Lv60まで）。<br />
        💎かけらが 2・4・8こに なると スキル（★）が ひらく。
      </p>

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
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl p-5 max-h-[88dvh] overflow-y-auto"
        style={{ background: 'linear-gradient(160deg,#0a0e1a,#161029)', border: `2px solid ${fam.accent}`, ...font }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-bold text-lg" style={fontMono}>{fam.displayName}</h3>
            <p className="text-white/50 text-xs">{fam.role}</p>
          </div>
          <button onClick={onClose} className="text-white/40 text-2xl leading-none">×</button>
        </div>

        {/* Current level summary */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: `${fam.accent}14` }}>
          <span className="font-black text-2xl" style={{ color: fam.accent, ...fontMono }}>Lv{entry.level}</span>
          <div className="flex-1">
            <div className="text-white/70 text-xs">バトル {entry.totalBattles} 回</div>
            <div className="w-full h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full" style={{
                width: entry.level >= MAX_LEVEL ? '100%' : `${Math.min(100, (entry.xp / xpToNext(entry.level)) * 100)}%`,
                background: fam.accent,
              }} />
            </div>
            <div className="text-white/40 text-[10px] mt-0.5">
              {entry.level >= MAX_LEVEL ? 'MAX' : entry.level >= info.cap ? `上限 Lv.${info.cap}（XPは入らない）` : `次のレベルまで ${xpToNext(entry.level) - entry.xp} XP`}
            </div>
          </div>
        </div>

        {/* レベルの上限と かけら */}
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(196,181,253,0.08)', border: '1px solid rgba(196,181,253,0.3)' }}>
          <div className="text-[#c4b5fd] text-xs font-bold">上限 Lv.{info.cap}　💎かけら {info.shards}/{MAX_SHARDS}</div>
          <div className="text-white/60 text-[10px] mt-1 leading-relaxed">
            むすびついた単元：{info.units.length > 4 ? 'ぜんぶの単元' : info.units.map(u => `『${UNIT_NAME_BY_KEY[u] ?? u}』`).join('・')}
          </div>
          {info.cap < MAX_LEVEL && info.nextUnit && (
            <div className="text-[#fde68a] text-[11px] mt-1 leading-relaxed">
              つぎの上限：『{info.nextUnit}』を まちがえずに とこう（あと {info.nextSkills}こうもくを 3回ずつ）
            </div>
          )}
        </div>

        {/* スキル（かけらで開く） */}
        <SkillList familyId={fam.id} shards={info.shards} />

        {/* 3 evolution forms */}
        <div className="text-white/60 text-xs font-bold mb-2" style={fontMono}>しんか</div>
        <div className="flex flex-col gap-2">
          {fam.forms.map(form => {
            const unlocked = entry.level >= form.minLevel;
            const isCurrent = form.stage === curStage;
            const mult = levelMult(form.minLevel);
            return (
              <div key={form.stage}
                className="flex items-center gap-3 p-2.5 rounded-xl border"
                style={{
                  borderColor: isCurrent ? fam.accent : 'rgba(255,255,255,0.08)',
                  background: isCurrent ? `${fam.accent}14` : 'rgba(255,255,255,0.02)',
                  opacity: unlocked ? 1 : 0.45,
                }}>
                <div className="relative flex-shrink-0">
                  <img src={getCharacterSprite(fam.spriteFamily, form.stage)} alt={form.name}
                    style={{ width: 56, height: 56, objectFit: 'contain', filter: unlocked ? undefined : 'grayscale(1) brightness(0.6)' }}
                    draggable={false} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold text-sm">{unlocked ? form.name : '???'}</span>
                    {isCurrent && <span className="text-[9px] px-1.5 rounded-full font-bold" style={{ background: fam.accent, color: '#0a0e1a' }}>いま</span>}
                  </div>
                  <div className="text-white/40 text-[10px]">
                    {form.stage === 1 ? 'Lv1〜' : `Lv${form.minLevel}で進化`} ・ HP・攻 ×{mult.toFixed(2)}
                  </div>
                  <div className="text-white/50 text-[10px] mt-0.5 leading-tight">{unlocked ? form.flavor : '進化するとわかる！'}</div>
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
            <div key={s.l} className="text-center p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-white font-bold text-base" style={fontMono}>{s.v}</div>
              <div className="text-white/40 text-[10px]">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="text-white/35 text-[10px] mt-2 leading-relaxed">
          ※ 敵の砲台は しゃてい4.5で とても 長い。とどかない ネコは、タンク系に うけてもらうか、
          たてものに つよい ネコ（ぼむにゃー ×4.0）で こわそう。
        </div>
      </div>
    </div>
  );
};
