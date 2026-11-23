import React from 'react';
import { Button } from './Button';
import { Icon } from './icons';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * アプリ全体のエラーバウンダリ。
 * 子コンポーネントの描画クラッシュで画面全体が真っ白になるのを防ぎ、
 * 進捗データ(localStorage)を保持したまま復帰手段を提示する。
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BattleMath] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-full flex items-center justify-center p-6" style={{ background: 'var(--cw-bg-0)', color: 'var(--cw-fg)', fontFamily: 'var(--cw-font)' }}>
          <div className="max-w-md text-center">
            <div className="flex justify-center mb-4"><Icon name="warn" size={56} /></div>
            <h1 className="text-cw-20 font-extrabold mb-2">エラーが発生しました</h1>
            <p className="text-cw-14 mb-6" style={{ color: 'var(--cw-fg-2)' }}>
              学習データは保存されています。再読み込みして続きから遊べます。
            </p>
            <Button variant="danger" size="lg" onClick={() => window.location.reload()}>再読み込み</Button>
            <details className="mt-6 text-left text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>
              <summary className="cursor-pointer min-h-[44px] flex items-center">エラー詳細</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{String(this.state.error)}</pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
