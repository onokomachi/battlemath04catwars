import React from 'react';

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
        <div className="h-screen w-full flex items-center justify-center bg-gray-950 p-6">
          <div className="max-w-md text-center">
            <p className="text-4xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold text-white mb-2">エラーが発生しました</h1>
            <p className="text-sm text-gray-400 mb-6">
              学習データは保存されています。再読み込みして続きから遊べます。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-700 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-lg transition-colors"
            >
              再読み込み
            </button>
            <details className="mt-6 text-left text-xs text-gray-500">
              <summary className="cursor-pointer">エラー詳細</summary>
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
