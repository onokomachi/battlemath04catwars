/** 単元アプリの AppShell / AdaptiveBar の代わり（SANMON ではアプリの外枠を使わない） */
import React from 'react';
export const AppShell: React.FC<{ title?: string; subtitle?: string; onBack?: () => void; children?: React.ReactNode; [k: string]: unknown }> = ({ children }) => <>{children}</>;
export const AdaptiveBar: React.FC<Record<string, unknown>> = () => null;
