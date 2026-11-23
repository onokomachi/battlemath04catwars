import React from 'react';
import { Icon, type IconName } from './icons';
import type { Tone } from './Card';

/** ひとこと の お知らせ（めやす・注意・ひらけない わけ）。左に アイコン・文は 14px 以上。色は 役目の色 */
export const Notice: React.FC<{
  tone?: Tone; icon?: IconName; children: React.ReactNode; className?: string; role?: string; 'data-testid'?: string;
}> = ({ tone = 'neutral', icon, children, className = '', ...rest }) => (
  <div className={`cw-panel cw-tone-${tone} flex items-start gap-2.5 px-3 py-2.5 text-cw-14 leading-snug ${className}`}
    style={{ borderRadius: 'var(--cw-r-md)', color: 'var(--cw-fg-2)', background: 'var(--tone-bg)' }} {...rest}>
    {icon && <Icon name={icon} size={24} className="mt-0.5" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);
