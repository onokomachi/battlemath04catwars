import './index.css';
// 学級／おためし の セーブの入れかえ。ストアが localStorage を読む前に動かすので、CatWars より先に読みこむ（CW-5a）
import './catwars/portal/saveProfile';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { adoptStudentFromUrl, endTrial } from 'learning-app-kit/sync';
import { CatWars } from './catwars/components/CatWars';
import { ErrorBoundary } from './catwars/components/ui/ErrorBoundary';
import { PORTAL } from './catwars/portal/config';
import { PortalGate } from './catwars/portal/PortalGate';
import { Button, Panel } from './catwars/components/ui';
import { trialOnClassDevice, trialBlocked, isDemo } from './catwars/portal/saveProfile';

// SOL から #c=<学級コード>&n=<番号> 付きで来たら、その子として名乗る（await しない。つないでいないビルドでは何もしない）
void adoptStudentFromUrl(PORTAL);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {trialBlocked() ? (
        // 学級コードが入っている（デモモードの）端末で、体験のリンクから開いた（学級・デモのセーブを守るため、このタブでは遊ばせない。SANMON と同じ）
        <div className="w-full min-h-[100dvh] grid place-items-center p-6 text-center" style={{ fontFamily: 'var(--cw-font)', color: 'var(--cw-fg)' }}>
          <Panel strong className="max-w-sm">
            <p className="text-cw-20 font-extrabold mb-2">{trialOnClassDevice() ? 'この たんまつは がっきゅうコードが 入っているよ' : 'この たんまつは デモモードに なっているよ'}</p>
            <p className="text-cw-14 mb-4" style={{ color: 'var(--cw-fg-2)' }}>たいけんばんでは なく、ふつうの CAT-WARS で あそんでね。</p>
            <Button variant="primary" size="lg" fullWidth onClick={endTrial}>ふつうの CAT-WARS を ひらく</Button>
          </Panel>
        </div>
      ) : <CatWars />}
      {/* デモモード（紹介用）であることを いつも小さく出す（SANMON と同じ。押せない）。おわるのは ホームの「デモを おわる」。
          CAT-WARS は 左上に「← もどる」が ある画面が多いので、文字は「DEMO」だけ（「きろくは おくられません」は ホームの デモの説明に） */}
      {isDemo() && (
        <div className="cw-chip cw-tone-reward fixed top-1 left-1 z-[280] pointer-events-none font-cw-num tracking-widest" style={{ background: 'var(--cw-surface-strong)' }} data-testid="demo-badge" aria-label="デモモード（きろくは おくられません）">
          DEMO
        </div>
      )}
    </ErrorBoundary>
    {/* 学級コードの入力（はじめの1回）。つないでいないビルドでは何も出さない。
        右下の入口（chip）は出さない：戦闘の下のバーに重なるため。あとから名乗る入口は ホームの「がっきゅうコード」（portal/PortalCard.tsx）。
        名乗ったあとの SOLO/DUO（右下の「● SOLO」と MODE SELECT）も出さない（portal/PortalGate.tsx） */}
    <PortalGate />
  </React.StrictMode>,
);
