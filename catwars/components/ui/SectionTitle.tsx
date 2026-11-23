import React from 'react';

/** 画面の中の 小見出し（14px）。左に 色の たて線 */
export const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode; tone?: 'action' | 'reward' | 'growth' | 'rare' | 'danger' | 'cat' | 'neutral' | 'opp'; className?: string }> = ({ children, right, tone = 'action', className = '' }) => (
  <div className={`flex items-center justify-between gap-3 cw-tone-${tone} ${className}`}>
    <h3 className="flex items-center gap-2 text-cw-14 font-extrabold" style={{ color: 'var(--cw-fg-2)' }}>
      <span aria-hidden className="inline-block w-1 h-4 rounded-full" style={{ background: 'var(--tone)' }} />
      {children}
    </h3>
    {right && <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>{right}</span>}
  </div>
);
