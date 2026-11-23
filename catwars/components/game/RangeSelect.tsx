import React, { useMemo, useState } from 'react';
import { PACK_UNITS } from '../../learn/gradePack';
import { Button, Icon, ScreenBackdrop, TitleBar } from '../ui';

interface Props {
  lockedUnits?: Set<string>;
  onBack: () => void;
  /** えらんだ単元の鍵 */
  onConfirm: (unitKeys: string[]) => void;
  /** つぎへ の ボタンの文（週がわりの遠征では 出撃メンバーへ） */
  nextLabel?: string;
}

/**
 * 出撃前の「出題範囲」選択（スピードモードと同じ発想）。
 * ここで選んだ単元の問題が、戦闘中にランダム出題され、正解すると ⚡エナジー を稼げる。
 * 既定は解放ずみ全単元。単元(ワールド)単位でオン/オフを切り替える簡潔なUI。
 */
export const RangeSelect: React.FC<Props> = ({ lockedUnits, onBack, onConfirm, nextLabel }) => {
  // 単元アプリのある単元（SOL の単元アプリと同じ問題を出す）。閉じている単元は出さない
  const openCategories = useMemo(
    () => PACK_UNITS.filter(c => !lockedUnits?.has(c.key)),
    [lockedUnits],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(openCategories.map(c => c.key)));

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });

  const allOn = selected.size === openCategories.length;
  /** えらんだ単元の鍵（gradePack の PackUnit.key） */
  const chosenSubtopics = openCategories.filter(c => selected.has(c.key)).map(c => c.key);

  return (
    <div className="cw-screen h-[100dvh] flex flex-col overflow-hidden" data-testid="range-screen">
      <ScreenBackdrop name="stage" />
      <TitleBar title="出題範囲をえらぶ" onBack={onBack}
        right={
          <Button variant="secondary" size="sm"
            onClick={() => setSelected(allOn ? new Set([openCategories[0].key]) : new Set(openCategories.map(c => c.key)))}>
            {allOn ? 'ぜんぶ外す' : 'ぜんぶ選ぶ'}
          </Button>
        } />

      <div className="flex-1 overflow-y-auto cw-scroll px-4 py-3 cw-enter">
        <div className="mx-auto max-w-[980px]">
          <p className="text-cw-14 leading-relaxed mb-3" style={{ color: 'var(--cw-fg-2)' }}>
            えらんだ単元の問題（SOL のアプリと同じ問題）が、<b style={{ color: 'var(--cw-reward)' }}>戦闘中にランダム出題</b>されます。
            正解すると <b style={{ color: 'var(--cw-reward)' }}>⚡エナジー</b> が手に入り、ネコをどんどん出撃させられる！
          </p>
          <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-2.5">
            {openCategories.map(c => {
              const on = selected.has(c.key);
              return (
                <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={on}
                  className={`cw-card cw-press cw-tone-growth flex items-center gap-3 px-3 min-h-[60px] ${on ? 'cw-card-on' : ''}`}
                  style={{ background: on ? 'var(--tone-bg)' : undefined }}>
                  {on
                    ? <Icon name="check" size={28} />
                    : <span aria-hidden className="w-7 h-7 rounded-full flex-shrink-0" style={{ boxShadow: 'inset 0 0 0 2px var(--cw-line-strong)' }} />}
                  <span className="text-cw-14 font-bold leading-tight" style={{ color: on ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pt-3 relative z-10"
        style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 1px 0 var(--cw-line)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="mx-auto max-w-[980px]">
          <Button variant="primary" size="xl" fullWidth disabled={chosenSubtopics.length === 0} data-testid="range-next"
            onClick={() => onConfirm(chosenSubtopics)}>
            {nextLabel ?? 'この範囲で ステージえらびへ →'}
          </Button>
        </div>
      </div>
    </div>
  );
};
