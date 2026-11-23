import React from 'react';
import { Icon, type IconName } from './icons';

/** 💠⚡🪙🔥 などの 数。アイコン＋数字（Orbitron）。押せない（的ではない） */
export const StatPill: React.FC<{ icon: IconName; value: React.ReactNode; label: string; 'data-testid'?: string }> = ({ icon, value, label, ...rest }) => (
  <span className="cw-pill" role="status" aria-label={`${label} ${typeof value === 'string' || typeof value === 'number' ? value : ''}`} {...rest}>
    <Icon name={icon} size={22} />
    <span className="font-cw-num font-bold text-cw-14" style={{ color: 'var(--cw-fg)' }}>{value}</span>
  </span>
);
