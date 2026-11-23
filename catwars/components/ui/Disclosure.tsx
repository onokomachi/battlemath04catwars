import React, { useState } from 'react';
import { Icon, type IconName } from './icons';

/** たたんで おける 枠。見出し（48px いじょうの的）を 押すと ひらく */
export const Disclosure: React.FC<{
  title: React.ReactNode; icon?: IconName; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode; className?: string; 'data-testid'?: string;
}> = ({ title, icon, defaultOpen = false, right, children, className = '', ...rest }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`cw-panel overflow-hidden ${className}`} {...rest}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[52px] px-4 flex items-center gap-2 cw-press text-left" style={{ color: 'var(--cw-fg)' }}>
        {icon && <Icon name={icon} size={24} />}
        <span className="flex-1 text-cw-14 font-extrabold">{title}</span>
        {right && <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>{right}</span>}
        <Icon name="chevron" size={22} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s var(--cw-ease)' }} />
      </button>
      {open && <div className="px-4 pb-4 cw-enter">{children}</div>}
    </div>
  );
};
