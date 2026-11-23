import React from 'react';

/** すりガラスの パネル（角 22）。画面の まとまりを 1枚に する */
export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; pad?: boolean }> = ({
  strong, pad = true, className = '', children, ...rest
}) => (
  <div className={`cw-panel ${strong ? 'cw-panel-strong' : ''} ${pad ? 'p-4' : ''} ${className}`} {...rest}>{children}</div>
);
