import React, { useEffect, useState } from 'react';
import { CHARACTERS, CHARACTER_BY_ID } from '../../data/characters';
import { SKILL_BY_ID, SKILL_SHARDS, skillsForFamily } from '../../data/skills';
import { familySkillIds } from '../../learn/shards';
import { UNIT_NAME_BY_KEY, unitsForFamily } from '../../learn/gradePack';
import { useStudyStore } from '../../store/useStudyStore';
import { useSkillStore } from '../../store/useSkillStore';
import { Icon, SectionTitle } from '../ui';

/**
 * スキルの画面部品（2026-11-15 CW-4b）。
 * - SkillList：図鑑の系統の画面に 3つ（開いている＝色つき・説明／まだ＝鍵「『単元名』の かけらが nこで ひらく」）
 * - NewSkillNotice：まだ見せていない 開いたスキルを「あたらしい スキル！」で1回だけ出す（結果画面・図鑑）
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
      <SectionTitle tone="rare">スキル</SectionTitle>
      <div className="flex flex-col gap-2 mt-2">
        {list.map(s => {
          const need = SKILL_SHARDS[s.slot];
          const open = shards >= need;
          return (
            <div key={s.id} data-skill={s.id} data-open={open ? '1' : '0'}
              className="cw-card cw-tone-rare flex items-start gap-2.5 p-3"
              style={open ? { boxShadow: `var(--cw-shadow-panel), 0 0 0 1px ${fam.accent}` } : { background: 'var(--cw-surface-strong)' }}>
              <Icon name={open ? 'star' : 'lock'} size={26} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-cw-14" style={{ color: open ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>{s.name}</div>
                {open
                  ? <div className="text-cw-14 mt-0.5 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>{s.desc}</div>
                  : <div className="text-cw-12 mt-0.5 leading-snug flex items-center gap-1 flex-wrap" style={{ color: 'var(--cw-reward)' }}><Icon name="shard" size={16} />{unitNames(familyId)}の かけらが {need}こで ひらく（いま {shards}こ）</div>}
              </div>
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

/** 「あたらしい スキル！」：出したときに見せたことにする（同じスキルは2回出さない） */
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
