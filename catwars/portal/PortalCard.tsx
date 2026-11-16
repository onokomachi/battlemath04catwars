/**
 * 学級ポータルの 画面の部品（CW-5a・2026-11-16）。
 *   PortalCard      … ホーム：名乗りの入口（kit の JoinSettingsRow）と スタミナ（共通＋町）。おためし・体験版の説明
 *   SortieStamina   … 出撃の前（陣地づくりの「出撃！」の上）：この出撃で使う町・町のスタミナ・共通・1回の数・ことわられたわけ
 * つないでいないビルドでは どちらも何も出さない（今までどおり）。
 */
import React, { useState } from 'react';
import { JoinSettingsRow } from 'learning-app-kit/react';
import { isTrial } from 'learning-app-kit/sync';
import { SANMON_RULES, SANMON_UNITS } from 'learning-app-kit/sanmon';
import { PORTAL, isPortalConfigured } from './config';
import { usePortal, sortieLock } from './usePortal';
import { sortieStamina } from './stamina';

const fontMono = { fontFamily: 'Orbitron, monospace' };

/** 開発の画面の確かめで「名乗っている」を差しかえたときも出す */
const portalOn = (): boolean => isPortalConfigured || !!usePortal.getState().student;

export const PortalCard: React.FC = () => {
  const student = usePortal((s) => s.student);
  const status = usePortal((s) => s.status);
  const loaded = usePortal((s) => s.loaded);
  const modes = usePortal((s) => s.modes);
  const [openJoin, setOpenJoin] = useState(false);
  if (!portalOn()) return null;
  const trial = isTrial();
  const towns = Object.entries(status?.towns ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => ({ name: SANMON_UNITS.find((u) => u.key === k)?.name ?? k, n }));
  const lock = student ? sortieLock(modes) : null;

  return (
    <div className="px-4 pt-3" data-testid="portal-card">
      <div className="rounded-2xl border border-[#38bdf8]/30 p-3" style={{ background: 'rgba(6,10,24,0.6)' }}>
        {student ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-white/80 text-xs font-bold">がっきゅうコード {student.joinCode}・{student.number}ばん</span>
              <span className="text-[#fbbf24] text-xs font-bold" data-testid="stamina-common">
                ⚡スタミナ 共通 <span style={fontMono}>{loaded ? status?.stamina ?? 0 : '…'}</span>
                <span className="text-white/40">/{SANMON_RULES.maxStamina}</span>
              </span>
            </div>
            {loaded && (
              <p className="text-white/60 text-[11px] mt-1 leading-relaxed">
                {towns.length > 0
                  ? <>町の スタミナ：{towns.map((t) => `『${t.name}』${t.n}`).join('・')}</>
                  : '単元アプリで れんしゅうすると、その単元の 町の スタミナが たまるよ（SANMON と おなじ スタミナ）'}
              </p>
            )}
            <p className="text-white/45 text-[10px] mt-1">出撃1回で スタミナを つかうよ（SANMON の ぼうけんの バトル1回と おなじ）。</p>
            {lock && <p className="text-[#fca5a5] text-[11px] mt-1 font-bold" data-testid="portal-lock">🔒 {lock}</p>}
          </>
        ) : trial ? (
          <p className="text-white/70 text-[11px] leading-relaxed">いまは たいけんばん。スタミナは つかわないよ。きろくは のこらないよ。</p>
        ) : (
          <p className="text-white/70 text-[11px] leading-relaxed" data-testid="portal-otameshi">
            いまは <b className="text-white">おためし</b>。スタミナを つかわずに あそべるよ。きろくは 先生に とどかないし、
            おためしの セーブは がっきゅうコードを 入れると べつに なるよ。
          </p>
        )}
        {isPortalConfigured && !trial && (
          student && !openJoin ? (
            <button onClick={() => setOpenJoin(true)} className="mt-2 text-[11px] text-[#7dd3fc] underline underline-offset-4">がっきゅうコードを 入れなおす</button>
          ) : (
            <div className="mt-2 bg-white rounded-xl p-2"><JoinSettingsRow config={PORTAL} /></div>
          )
        )}
      </div>
    </div>
  );
};

export const SortieStamina: React.FC<{ formation: readonly string[]; message?: string | null }> = ({ formation, message }) => {
  const student = usePortal((s) => s.student);
  const status = usePortal((s) => s.status);
  const loaded = usePortal((s) => s.loaded);
  if (!portalOn()) return null;
  if (!student) {
    return (
      <p className="text-center text-white/50 text-[11px] pb-1.5" data-testid="sortie-otameshi">
        {isTrial() ? 'たいけんばん' : 'おためし'}：スタミナは つかわないよ
      </p>
    );
  }
  const st = sortieStamina(formation, status);
  return (
    <div className="rounded-xl border border-[#fbbf24]/40 px-3 py-2 mb-1.5" style={{ background: 'rgba(251,191,36,0.08)' }} data-testid="sortie-stamina">
      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
        <span className="text-[#fde68a] font-bold">⚡スタミナ{st.townName ? `（『${st.townName}』の 町から）` : ''}</span>
        <span className="text-white/80" style={fontMono}>
          {loaded ? <>町 {st.town}/{SANMON_RULES.townCap} ・ 共通 {st.common}/{SANMON_RULES.maxStamina}</> : '…'}
        </span>
      </div>
      <div className="text-white/55 text-[10px] mt-0.5">
        出撃 1回 {st.cost}{loaded ? `・あと ${st.times}回` : ''}（町 → 共通 の じゅんに つかう。数は サーバが きめる）
      </div>
      {message && <p className="text-[#fde68a] text-[12px] font-bold mt-1.5 leading-relaxed" role="status" data-testid="sortie-message">{message}</p>}
    </div>
  );
};
