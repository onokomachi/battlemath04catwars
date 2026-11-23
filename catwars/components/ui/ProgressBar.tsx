import React from 'react';
import type { Tone } from './Card';

/** 進み具合の バー（太さ 8）。0〜1。色は 役目の色 */
export const ProgressBar: React.FC<{ value: number; tone?: Tone; label?: string; className?: string }> = ({ value, tone = 'growth', label, className = '' }) => (
  <div className={`cw-tone-${tone} ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}>
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,170,255,0.16)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: 'var(--tone)' }} />
    </div>
  </div>
);
