import React from 'react';
import { Icon, type IconName } from './icons';

export type Tone = 'action' | 'reward' | 'growth' | 'rare' | 'danger' | 'cat' | 'neutral';

interface CardProps {
  /** 左の絵：アイコン名か 絵（ネコ・施設の img など） */
  icon?: IconName | React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** 右がわの 状態（星・数・「New」など） */
  right?: React.ReactNode;
  /** アイコンの下地の色（役目の色）。枠は 色分けしない */
  tone?: Tone;
  onClick?: () => void;
  /** 押せない見た目（わけは lockReason に） */
  locked?: boolean;
  lockReason?: string;
  className?: string;
  'data-testid'?: string;
}

/** 押せるカード：左に 絵・まんなかに 題と 説明（2行まで）・右に 状態。ホームの 6枚は これで そろえる */
export const Card: React.FC<CardProps> = ({ icon, title, sub, right, tone = 'neutral', onClick, locked, lockReason, className = '', ...rest }) => {
  const off = !!(locked || lockReason);
  const body = (
    <>
      <span className="cw-card-icon">{typeof icon === 'string' ? <Icon name={icon as IconName} size={38} /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-cw-16 font-extrabold leading-tight" style={{ color: off ? 'var(--cw-fg-2)' : 'var(--cw-fg)' }}>{title}</span>
        {(sub || lockReason) && (
          <span className="block text-cw-12 mt-0.5" style={{ color: 'var(--cw-fg-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {lockReason ? <><Icon name="lock" size={14} className="inline-block align-[-2px] mr-1" />{lockReason}</> : sub}
          </span>
        )}
      </span>
      {right && <span className="flex-shrink-0 text-right">{right}</span>}
    </>
  );
  const cls = `cw-card cw-tone-${tone} flex items-center gap-3 p-3 min-h-[76px] w-full ${onClick ? 'cw-press cursor-pointer' : ''} ${className}`;
  return onClick
    ? <button type="button" onClick={onClick} aria-disabled={off || undefined} className={cls} {...rest}>{body}</button>
    : <div className={cls} {...rest}>{body}</div>;
};
