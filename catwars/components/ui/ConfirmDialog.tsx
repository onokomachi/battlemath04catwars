import React from 'react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 決める ボタンの 役目：reward（ごほうび・お金）／primary／danger */
  variant?: 'reward' | 'primary' | 'danger';
  /** 古い呼び出しの色の指定（いまは 使わない。variant で えらぶ） */
  accent?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 共通の確認モーダル。希少な通貨の消費など、誤操作を防ぎたい操作に使う。 */
export const ConfirmDialog: React.FC<Props> = ({
  open, title, message, confirmLabel = 'はい', cancelLabel = 'やめる', variant = 'primary', onConfirm, onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(6,10,28,0.78)', fontFamily: 'var(--cw-font)' }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} className="cw-panel cw-panel-strong cw-enter w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-cw-20 font-extrabold mb-2" style={{ color: 'var(--cw-fg)' }}>{title}</h3>
        <div className="text-cw-14 mb-5 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{message}</div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={variant} className="flex-1" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
};
