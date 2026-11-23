import React from 'react';
import { Icon } from './icons';

export type ButtonVariant = 'primary' | 'reward' | 'danger' | 'secondary' | 'ghost' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary＝いま押す（シアン）／reward＝ごほうびを もらう（ゴールド）／danger＝やめる・あぶない／secondary＝ふつう／ghost＝ひかえめ／success＝せいこう（ミント） */
  variant?: ButtonVariant;
  /** 高さの最小：xs・sm＝44／md＝48／lg＝56／xl＝64／hero＝96（いちばん押したい 1つだけ） */
  size?: ButtonSize;
  /**
   * 押せない見た目（面を暗く・鍵・わけの文）。わけを 文で出す。
   * ここでは onClick を止めない（押すと わけを出す画面がある）。止めたいときは disabled を使う。
   */
  lockReason?: string;
  /** 押せない見た目だけ（わけの文は 別に出すとき） */
  locked?: boolean;
  fullWidth?: boolean;
}

const SIZE: Record<ButtonSize, string> = {
  xs: 'min-h-[44px] px-4 text-cw-14',
  sm: 'min-h-[44px] px-4 text-cw-14',
  md: 'min-h-[48px] px-5 text-cw-16',
  lg: 'min-h-[56px] px-6 text-cw-16',
  xl: 'min-h-[64px] px-7 text-cw-20',
  hero: 'min-h-[96px] px-6 text-cw-28',
};

/** 共通のボタン。色は 役目で えらぶ（docs/UI_STYLE.md）。高さは 最小 44px（ふつうは 48px いじょう） */
export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', className = '', lockReason, locked, fullWidth, disabled, ...props
}) => {
  const off = !!(lockReason || locked);
  return (
    <button
      type="button"
      className={`cw-btn cw-press cw-btn-${variant} ${SIZE[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      aria-disabled={off || undefined}
      {...props}
    >
      {lockReason ? (
        <span className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1.5"><Icon name="lock" size={20} />{children}</span>
          <span className="text-cw-12 font-bold" style={{ color: 'var(--cw-fg-3)' }}>{lockReason}</span>
        </span>
      ) : children}
    </button>
  );
};
