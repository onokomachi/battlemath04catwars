import React from 'react';
import { useOptionalImage } from './useOptionalImage';

export type BackdropName = 'home' | 'stage' | 'expedition' | 'collection' | 'friend' | 'versus';

/**
 * 画面の うしろの絵の差しこみ口。`/assets/bg/bg-<name>.webp`（なければ `.png`）を 薄く出す。
 * 絵が どちらも 無ければ 何も出さない（地の グラデ＋星だけ。index.css の body）。
 * 絵は あとから 足す（同じ名前で上書きしない：新しい名前で足して ここを書きかえる）。
 */
export const ScreenBackdrop: React.FC<{ name: BackdropName }> = ({ name }) => {
  const src = useOptionalImage([`/assets/bg/bg-${name}.webp`, `/assets/bg/bg-${name}.png`]);
  if (!src) return null;
  return (
    <div className="cw-backdrop" aria-hidden data-testid="screen-backdrop" data-backdrop={name}>
      <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.55 }} />
      {/* 下に向かって 暗く（字が 読める） */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,10,28,0.05) 0%, rgba(6,10,28,0.55) 55%, rgba(6,10,28,0.92) 100%)' }} />
    </div>
  );
};
