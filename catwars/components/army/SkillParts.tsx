import React, { useEffect, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID } from '../../data/characters';
import { SKILL_BY_ID, SKILL_SHARDS, skillsForFamily } from '../../data/skills';
import { familySkillIds } from '../../learn/shards';
import { UNIT_NAME_BY_KEY, unitsForFamily } from '../../learn/gradePack';
import { useStudyStore } from '../../store/useStudyStore';
import { useSkillStore } from '../../store/useSkillStore';
import { Icon } from '../ui';

/**
 * スキルの画面部品（2026-11-15 CW-4b）。
 * - SkillList：図鑑の系統の画面に 3つ（開いている＝色つき・説明／まだ＝🔒「『単元名』の かけらが nこで ひらく」）
 * - NewSkillNotice：まだ見せていない 開いたスキルを「✨ あたらしい スキル！」で1回だけ出す（結果画面・図鑑）
 */

/** 系統に結びついた単元の名前（『分数』・『小数のしくみ』）。全単元のときは「ぜんぶの単元」 */
function unitNames(familyId: string): string {
  const u = unitsForFamily(familyId);
  if (u.length > 4) return 'ぜんぶの単元';
  return u.map(k => `『${UNIT_NAME_BY_KEY[k] ?? k}』`).join('');
}

export const SkillList: React.FC<{ familyId: string; shards: number }> = ({ familyId, shards }) => {
  const list = skillsForFamily(familyId);
  const fam = CHARACTER_BY_ID[familyId];
  if (list.length === 0) return null;
  return (
    <div className="mb-4" data-testid="skill-list">
      <div className="text-white/60 text-xs font-bold mb-2" style={{ fontFamily: 'Orbitron, monospace' }}>スキル</div>
      <div className="flex flex-col gap-1.5">
        {list.map(s => {
          const need = SKILL_SHARDS[s.slot];
          const open = shards >= need;
          return (
            <div key={s.id} data-skill={s.id} data-open={open ? '1' : '0'}
              className="p-2.5 rounded-xl border"
              style={{
                borderColor: open ? fam.accent : 'rgba(255,255,255,0.1)',
                background: open ? `${fam.accent}1c` : 'rgba(255,255,255,0.02)',
              }}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{open ? '★' : '🔒'}</span>
                <span className="font-bold text-sm" style={{ color: open ? '#fff' : 'rgba(255,255,255,0.5)' }}>{s.name}</span>
              </div>
              {open
                ? <div className="text-[11px] text-white/80 mt-0.5 leading-snug">{s.desc}</div>
                : <div className="text-[10px] text-[#fde68a]/80 mt-0.5 leading-snug">{unitNames(familyId)}の かけらが {need}こで ひらく（いま {shards}こ）</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 開いていて まだ見せていない スキル（全系統） */
function unseenSkills(perfect: Record<string, number>, seen: string[]): string[] {
  return CHARACTERS.flatMap(c => familySkillIds(c.id, perfect)).filter(id => !seen.includes(id));
}

/** 「✨ あたらしい スキル！」：出したときに見せたことにする（同じスキルは2回出さない） */
export const NewSkillNotice: React.FC = () => {
  const perfect = useStudyStore(s => s.perfect);
  const markSeen = useSkillStore(s => s.markSeen);
  const [shown, setShown] = useState<string[]>(() => unseenSkills(perfect, useSkillStore.getState().seen));
  // 戦闘中に かけらが ふえたぶんも ひろう
  useEffect(() => {
    const more = unseenSkills(perfect, useSkillStore.getState().seen).filter(id => !shown.includes(id));
    if (more.length) setShown(v => [...v, ...more]);
  }, [perfect, shown]);
  useEffect(() => { if (shown.length) markSeen(shown); }, [shown, markSeen]);
  if (shown.length === 0) return null;
  return (
    <div className="cw-panel mb-3 rounded-cw-md p-3 text-left" data-testid="new-skill"
      style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-rare)' }}>
      <div className="font-black text-cw-14 mb-1 flex items-center gap-1.5" style={{ color: 'var(--cw-rare)' }}><Icon name="star" size={20} />あたらしい スキル！</div>
      {shown.map(id => {
        const s = SKILL_BY_ID[id];
        if (!s) return null;
        const fam = CHARACTER_BY_ID[s.family];
        return (
          <div key={id} className="text-cw-12 leading-snug" style={{ color: 'var(--cw-fg)' }}>
            <b style={{ color: fam?.accent }}>{fam?.displayName}</b>「{s.name}」：{s.desc}
          </div>
        );
      })}
      <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>単元を まちがえずに とけたから ひらいたよ。いつも 自動で 効く</div>
    </div>
  );
};
