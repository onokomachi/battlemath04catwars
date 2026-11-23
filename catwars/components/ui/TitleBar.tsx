import React from 'react';
import { Icon } from './icons';
import { sfx } from '../../utils/audioEngine';

interface TitleBarProps {
  title: React.ReactNode;
  /** 題の下の 小さな 文（12px） */
  subtitle?: React.ReactNode;
  /** 「もどる」。無ければ 出さない */
  onBack?: () => void;
  backLabel?: string;
  /** 右がわ（💠などの 数・ボタン） */
  right?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

/** 画面の上の帯：もどる（44px いじょうの的）＋ 題 ＋ 右に 数。全部の画面で これを使う */
export const TitleBar: React.FC<TitleBarProps> = ({ title, subtitle, onBack, backLabel = 'もどる', right, className = '', ...rest }) => (
  <header className={`flex items-center gap-3 px-4 py-2 flex-shrink-0 min-h-[64px] relative z-10 ${className}`}
    style={{ background: 'var(--cw-surface-strong)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: 'inset 0 -1px 0 var(--cw-line), inset 0 1px 0 var(--cw-top-light)' }} {...rest}>
    {onBack && (
      <button type="button" onClick={() => { sfx.tap(); onBack(); }} aria-label={backLabel}
        className="cw-btn cw-press cw-btn-secondary min-h-[44px] min-w-[44px] px-3 text-cw-14 flex-shrink-0" data-testid="title-back">
        <Icon name="back" size={22} /><span>{backLabel}</span>
      </button>
    )}
    <div className="min-w-0 flex-1">
      <h2 className="text-cw-20 font-extrabold leading-tight truncate" style={{ color: 'var(--cw-fg)' }}>{title}</h2>
      {subtitle && <p className="text-cw-12 truncate" style={{ color: 'var(--cw-fg-3)' }}>{subtitle}</p>}
    </div>
    {right && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">{right}</div>}
  </header>
);
