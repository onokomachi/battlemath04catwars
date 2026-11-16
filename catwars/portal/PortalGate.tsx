/**
 * 学級ポータルの入口（名乗り・単元の鍵）。kit の JoinGate を CAT-WARS むけの引数で出す（2026-11-16。CW-5c で kit 0.37.0 の playMode を使う形に）。
 *
 * - `playMode={false}`：名乗った子にも SOLO/DUO（kit の PlayModeGate：授業の時間の「MODE SELECT」と右下の「● SOLO」）を出さない。
 *   CAT-WARS は ごほうびのゲームで ふたりで学ぶ記録は 想定していないうえ、右下のボタンが 陣地づくりの「出撃！」と 戦闘の下のバーに重なる。
 *   （kit 0.36.0 までは この引数が無く、名乗っているときは JoinGate の かわりに AppAccessGate だけを出す つつみ にしていた）
 * - `chip={false}`：右下の名乗りの入口は出さない（戦闘の下のバーに重なる）。名乗りなおしは ホームの「がっきゅうコード」（kit の JoinSettingsRow）。
 * - `allowWithout={isDemo}`・`onDemo={enterDemo}`：デモモード（0000・0。紹介用）は「ログイン必須」でも通す・必須の入力画面からも入れる（SANMON と同じ）。
 * 名乗り・ログイン必須・体験版・単元の鍵（AppAccessGate）の動きは kit の JoinGate のまま。
 * 記録は SOLO として送られる：前に DUO を選んでいた端末は、名乗っているとき開いたら forceSolo で その区間を閉じる。
 */
import React, { useEffect, useState } from 'react';
import { getStudent, subscribeStudent, forceSolo } from 'learning-app-kit/sync';
import { JoinGate } from 'learning-app-kit/react';
import { PORTAL } from './config';
import { isDemo } from './demoMode';
import { enterDemo } from './saveProfile';

export const PortalGate: React.FC = () => {
  const [named, setNamed] = useState(() => !!getStudent());
  useEffect(() => subscribeStudent((s) => setNamed(!!s)), []);
  useEffect(() => { if (named) { try { forceSolo(); } catch { /* noop */ } } }, [named]);
  return <JoinGate config={PORTAL} chip={false} playMode={false} allowWithout={isDemo} onDemo={enterDemo} />;
};
