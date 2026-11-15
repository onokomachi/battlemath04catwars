// このファイルは単元アプリ wari-hissann3 の src/components/shared/HissanBracket.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 筆算の「わく」の静的表示（テスト・見当づけ・エラーハンター用）。
 * 例:  ______
 *   31 ) 8 0
 * 商の行（誤った位置の再現つき）や □入りの わられる数 にも対応する。
 */
import React from 'react';

interface Props {
  /** わられる数（'6□9' のように □ を含んでもよい） */
  dividend: string;
  divisor: string;
  /** 商の行に表示する文字列（省略時は商の行なし） */
  quotient?: string;
  /** 商を書きはじめる列（0=いちばん左）。省略時は右づめ */
  quotientOffset?: number;
  /** 商を誤りとして赤系で表示するか */
  quotientWrong?: boolean;
  className?: string;
}

export const HissanBracket: React.FC<Props> = ({
  dividend,
  divisor,
  quotient,
  quotientOffset,
  quotientWrong = false,
  className = '',
}) => {
  const cols = dividend.length;
  const cell = 44; // 1マスの幅(px)
  const divisorW = Math.max(52, divisor.length * 26 + 14);
  const qStart = quotient != null
    ? (quotientOffset ?? cols - quotient.length)
    : 0;

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `${divisorW}px repeat(${cols}, ${cell}px)`,
  };

  return (
    <div className={`inline-block font-mono text-3xl md:text-4xl leading-none select-none ${className}`}>
      {/* 商の行 */}
      {quotient != null && (
        <div className="grid items-center text-center" style={gridStyle}>
          <div />
          {Array.from({ length: cols }, (_, i) => {
            const ch = i >= qStart && i - qStart < quotient.length ? quotient[i - qStart] : '';
            return (
              <div key={i} className={`h-12 flex items-center justify-center font-bold ${quotientWrong ? 'text-rose-500' : 'text-content'}`}>
                {ch}
              </div>
            );
          })}
        </div>
      )}

      {/* わく（わる数 ｜ わられる数） */}
      <div className="grid items-center text-center relative h-14" style={gridStyle}>
        <div className="flex justify-end pr-2 text-content font-bold border-r-4 border-content h-full items-center">
          {divisor}
        </div>
        <div className="absolute right-0 top-0 border-t-4 border-content" style={{ left: divisorW - 2 }} />
        {dividend.split('').map((d, i) => (
          <div key={i} className="h-14 flex items-center justify-center font-bold text-content">
            {d === '□' ? (
              <span className="inline-flex w-9 h-9 items-center justify-center border-2 border-dashed border-amber-400 rounded-lg text-amber-500 text-2xl">□</span>
            ) : (
              d
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
