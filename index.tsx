import './index.css';
// 学級／おためし の セーブの入れかえ。ストアが localStorage を読む前に動かすので、CatWars より先に読みこむ（CW-5a）
import './catwars/portal/saveProfile';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { adoptStudentFromUrl, endTrial } from 'learning-app-kit/sync';
import { JoinGate } from 'learning-app-kit/react';
import { CatWars } from './catwars/components/CatWars';
import { ErrorBoundary } from './catwars/components/ui/ErrorBoundary';
import { PORTAL } from './catwars/portal/config';
import { trialOnClassDevice } from './catwars/portal/saveProfile';

// SOL から #c=<学級コード>&n=<番号> 付きで来たら、その子として名乗る（await しない。つないでいないビルドでは何もしない）
void adoptStudentFromUrl(PORTAL);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {trialOnClassDevice() ? (
        // 学級コードが入っている端末で、体験のリンクから開いた（学級のセーブを守るため、このタブでは遊ばせない。SANMON と同じ）
        <div className="w-full min-h-[100dvh] grid place-items-center p-6 text-center text-white" style={{ fontFamily: '"M PLUS Rounded 1c", sans-serif' }}>
          <div className="rounded-2xl border border-white/15 p-6 max-w-sm" style={{ background: 'rgba(6,10,24,0.8)' }}>
            <p className="text-lg font-black mb-2">この たんまつは がっきゅうコードが 入っているよ</p>
            <p className="text-sm text-white/70 mb-4">たいけんばんでは なく、ふつうの CAT-WARS で あそんでね。</p>
            <button onClick={endTrial} className="w-full py-3 rounded-xl font-bold border-2 border-[#38bdf8] text-[#38bdf8]">ふつうの CAT-WARS を ひらく</button>
          </div>
        </div>
      ) : <CatWars />}
    </ErrorBoundary>
    {/* 学級コードの入力（はじめの1回）。つないでいないビルドでは何も出さない。
        右下の入口（chip）は出さない：戦闘の下のバーに重なるため。あとから名乗る入口は ホームの「がっきゅうコード」（portal/PortalCard.tsx） */}
    <JoinGate config={PORTAL} chip={false} />
  </React.StrictMode>,
);
