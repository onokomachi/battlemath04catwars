/**
 * 単元アプリの components/ui/primitives.tsx の代わり（SANMON 用）。
 *
 * アプリの解答画面（Round）は そのまま写して使う。ちがうのは2つだけ:
 * - ResultPanel に「つぎの もんだい」ボタンを出さない。次へ進むのは SANMON（バトル・練習）の役目なので、
 *   ここにボタンがあると、押しても何も起きない ボタンになる。ほめ言葉と解説は そのまま出す。
 * - SetupScreen / LevelCard（アプリのレベル選択画面）は SANMON では使わないので、最小限にしてある。
 */
import React from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';

type BtnVariant = 'primary' | 'secondary' | 'ghost';
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }> = ({ variant = 'primary', className = '', children, ...rest }) => {
  const base = 'rounded-2xl font-black transition-all active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100';
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong shadow-lg',
    secondary: 'bg-surface border-2 border-line text-content hover:bg-surface-2',
    ghost: 'text-muted hover:bg-surface-3',
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest}>{children}</button>;
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...rest }) => (
  <div className={`bg-surface border border-line rounded-[28px] shadow-xl ${className}`} {...rest}>{children}</div>
);

export const Chip: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${className}`}>{children}</span>
);

export const MasteryBar: React.FC<{ value: number; segments?: number }> = () => null;

export const HintBox: React.FC<{ children: React.ReactNode; tone?: 'hint' | 'wrong' }> = ({ children, tone = 'hint' }) => (
  <div className={`rounded-3xl p-5 border flex items-start gap-3 ${tone === 'wrong' ? 'bg-amber-50 border-amber-200' : 'bg-surface-2 border-line'}`}>
    <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${tone === 'wrong' ? 'bg-amber-100 text-amber-600' : 'bg-surface-3 text-brand'}`}>
      <Lightbulb size={24} />
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-content font-bold leading-relaxed">{children}</p>
    </div>
  </div>
);

export const ResultPanel: React.FC<{ perfect: boolean; detail?: React.ReactNode; onNext?: () => void; nextLabel?: string; accentClass?: string; verdict?: 'correct' | 'wrong' }> = ({ perfect, detail }) => (
  <div className="flex flex-col items-center text-center p-5 bg-surface-2 border border-line rounded-3xl">
    <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center">
      <Sparkles size={30} />
    </div>
    <h3 className="text-lg font-black text-content mt-2 mb-1">{perfect ? 'パーフェクト！' : 'できたね！'}</h3>
    {detail && <div className="text-content font-bold text-sm">{detail}</div>}
  </div>
);

export const SetupScreen: React.FC<{ title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }> = ({ children }) => <>{children}</>;

export const LevelCard: React.FC<{ label: string; desc: string; mastery?: number; todayCount?: number; onClick: () => void; accentBorder?: string }> = ({ label, onClick }) => (
  <button onClick={onClick}>{label}</button>
);
