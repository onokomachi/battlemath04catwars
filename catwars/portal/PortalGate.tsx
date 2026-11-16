/**
 * 学級ポータルの入口（名乗り・単元の鍵）。kit の JoinGate を CAT-WARS むけに つつむ（2026-11-16）。
 *
 * kit の JoinGate は、名乗った子に 授業の時間だけ「MODE SELECT（SOLO ひとりで／DUO ふたりで）」と
 * 右下の「● SOLO」ボタン（PlayModeGate）を出す。CAT-WARS は ごほうびのゲームで ふたりで学ぶ記録は 想定していないうえ、
 * 右下のボタンが 陣地づくりの「出撃！」と 戦闘の下のバーに重なる。JoinGate には それを出さない引数が無い（kit 2fc93b1）。
 * そこで：
 *   - 名乗っていない（おためし・体験版・ログイン必須の入力画面・デモ）→ JoinGate（chip なし・デモは allowWithout で通す）。PlayModeGate は 名乗るまで 何も出さない。
 *   - 名乗っている → JoinGate の かわりに AppAccessGate だけ（JoinGate が 名乗った子に出すのは PlayModeGate と これだけ）。
 * 記録は SOLO として送られる：DUO の区間（kit の lak_pair_spans_v1）は kit の PlayModeGate で DUO を選んだときしか できない（ほかのアプリの選択は オリジンがちがうので とどかない）。
 * 前に（このつつみが無いころ）DUO を選んでいた端末は、開いたときに forceSolo で その区間を閉じる。
 * 名乗りなおしは ホームの「がっきゅうコード」（kit の JoinSettingsRow）。名乗る・消すと saveProfile.ts が 読みなおす。
 */
import React, { useEffect, useState } from 'react';
import { getStudent, subscribeStudent, forceSolo, isTrial } from 'learning-app-kit/sync';
import { JoinGate, AppAccessGate } from 'learning-app-kit/react';
import { PORTAL, isPortalConfigured } from './config';
import { isDemo } from './demoMode';
import { enterDemo } from './saveProfile';

export const PortalGate: React.FC = () => {
  const [named, setNamed] = useState(() => !!getStudent());
  useEffect(() => subscribeStudent((s) => setNamed(!!s)), []);
  useEffect(() => { if (named) { try { forceSolo(); } catch { /* noop */ } } }, [named]);
  if (named && !isTrial()) return isPortalConfigured ? <AppAccessGate config={PORTAL} /> : null;
  // デモモード（0000・0。紹介用）は「ログイン必須」でも通す（SANMON の allowWithout={isDemo} と同じ）。必須の入力画面からも デモに入れる
  return <JoinGate config={PORTAL} chip={false} allowWithout={isDemo} onDemo={enterDemo} />;
};
