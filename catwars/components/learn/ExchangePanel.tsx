import React, { useState } from 'react';
import { useProgressStore } from '../../store/useProgressStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { CHARACTERS, CHARACTER_BY_ID, getCharacterSprite } from '../../data/characters';
import { sfx } from '../../utils/audioEngine';
import { Button, Card, Chip, ConfirmDialog, Icon, Notice, Panel } from '../ui';

// レアネコの解放コスト（💠クレジット・永続）。ボスは高価。
const creditCostFor = (id: string): number => (id.startsWith('boss') ? 1500 : 500);

export const ExchangePanel: React.FC = () => {
  const { permanentUnlocks, addPermanentUnlock } = useProgressStore();
  const { resources, spendResources } = usePlayerStore();
  const credits = Math.floor(resources.gold);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; cost: number } | null>(null);

  const isUnlocked = (id: string) => permanentUnlocks.includes(id);
  // ふつうの系統は 兵舎の数で開く（基地の 兵舎）。ここは ボスの系統だけ（2026-11-15 CW-4a）
  const rares = CHARACTERS.filter(c => c.id.startsWith('boss'));

  const confirmBuy = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (!spendResources(p.cost)) { sfx.incorrect(); return; }
    addPermanentUnlock(p.id);
    sfx.correct();
    setFlash(p.id);
    setTimeout(() => setFlash(null), 600);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-3" data-testid="exchange-panel">
      <Panel className="cw-tone-action">
        <div className="flex items-center gap-3">
          <Icon name="credit" size={44} />
          <div>
            <div className="font-cw-num font-black text-cw-40 leading-none" style={{ color: 'var(--cw-action)' }}>{credits}</div>
            <div className="text-cw-14 mt-1" style={{ color: 'var(--cw-fg-2)' }}>クレジット（永続）</div>
          </div>
        </div>
      </Panel>
      <Notice tone="neutral" icon="bulb">
        クレジットを つかうと、ボスの 宇宙ネコを <b style={{ color: 'var(--cw-growth)' }}>ずっと</b> つかえるように なるよ。
        ほかの系統は、陣地づくりで 兵舎を ふやすと ひらく。
      </Notice>

      <div className="flex flex-col gap-2.5">
        {rares.map((c) => {
          const cost = creditCostFor(c.id);
          const owned = isUnlocked(c.id);
          const canAfford = !owned && credits >= cost;
          const isFlashing = flash === c.id;
          return (
            <Card key={c.id} tone={owned ? 'growth' : 'rare'} data-testid={`exchange-${c.id}`}
              className={isFlashing ? 'cw-reward-pop' : ''}
              icon={<img src={getCharacterSprite(c.spriteFamily, 1)} alt="" draggable={false} className="w-11 h-11 object-contain" />}
              title={<span className="flex items-center gap-1.5">{c.forms[0].name}<Chip tone="danger">BOSS</Chip></span>}
              sub={c.role}
              right={owned ? (
                <Chip tone="growth"><Icon name="check" size={18} />解放ずみ</Chip>
              ) : (
                <Button variant={canAfford ? 'primary' : 'secondary'} size="md" disabled={!canAfford} onClick={() => setPending({ id: c.id, cost })} className="min-w-[96px]">
                  <span className="font-cw-num font-black">{cost}</span><Icon name="credit" size={22} />
                </Button>
              )} />
          );
        })}
      </div>

      <p className="text-cw-14 text-center mt-4" style={{ color: 'var(--cw-fg-2)' }}>
        もんだいを といて クレジットを あつめよう！
      </p>

      <ConfirmDialog
        open={pending !== null}
        variant="primary"
        title="クレジットを つかう？"
        message={pending ? (
          <>クレジット <b style={{ color: 'var(--cw-action)' }}>{pending.cost}</b> をつかって<br />
            「{CHARACTER_BY_ID[pending.id]?.forms[0].name}」を <b style={{ color: 'var(--cw-growth)' }}>ずっと</b> 解放します。いい？</>
        ) : ''}
        confirmLabel="解放する"
        onConfirm={confirmBuy}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
