import React from 'react';
import type { Tone } from './Card';

/** 小さな札（角 8）。文は 12px。色は 役目の色 */
export const Chip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`cw-chip cw-tone-${tone} ${className}`}>{children}</span>
);
