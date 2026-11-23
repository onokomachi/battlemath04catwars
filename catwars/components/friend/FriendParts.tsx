/**
 * なかまの 基地を 攻める 画面（CW-6b・2026-11-17）：ホームのカード・相手をえらぶ画面・結果画面に足す 今日の星。
 *
 * **子どもの安全**：相手は「なかまの 基地 A・B・C」と出す（**出席番号も 名前も 出さない**。サーバも 返さない）。
 * 攻めたことは 相手に 伝わらない・勝ち負けの数も 出さない。出すのは 自分の きょうの星だけ。
 * みほんの 基地（コンピュータが つくった もの）は「みほん」と はっきり出す。
 */
import React, { useEffect, useMemo } from 'react';
import { BuildingType, GRID_H, GRID_W, BASE_MAX_W } from '../../types';
import { BUILDING_STATS } from '../../constants';
import { ENEMY_TRAIT_NOTE, ENEMY_UNIT_STATS } from '../../data/campaign';
import { ENEMY_UNIT_SPRITE } from '../../data/enemySprites';
import { FRIEND_ATTACK_CREDITS, buildTargets, dayIndexOf, friendSetup, jstDateOf, type FriendTarget } from '../../friend/friendAttack';
import { describeBase } from '../../friend/baseShape';
import { useFriendOffers, loadFriendOffers, friendNamed } from '../../portal/friendSync';
import { useFriendStore } from '../../store/useFriendStore';
import { usePortal } from '../../portal/usePortal';
import { isDemo } from '../../portal/demoMode';
import { StarRow } from '../expedition/ExpeditionParts';
import { Card, Panel, ScreenBackdrop, TitleBar } from '../ui';

const fontMono = { fontFamily: 'Orbitron, monospace' };
const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const ACCENT = '#38bdf8';

const COLOR: Record<string, string> = {
  [BuildingType.TOWN_HALL]: '#3b82f6', [BuildingType.CANNON]: '#ef4444', [BuildingType.HIDDEN_TESLA]: '#facc15',
  [BuildingType.WALL]: '#94a3b8', [BuildingType.ARMY_CAMP]: '#22c55e',
};

/** 基地の ちいさな ず（敵陣 x 18〜27・y 0〜15。左が 攻める側） */
export const BasePreview: React.FC<{ buildings: { type: BuildingType; x: number; y: number }[]; cell?: number }> = ({ buildings, cell = 9 }) => {
  const x0 = GRID_W - BASE_MAX_W;
  return (
    <svg width={BASE_MAX_W * cell} height={GRID_H * cell} viewBox={`0 0 ${BASE_MAX_W * cell} ${GRID_H * cell}`}
      className="rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }} data-testid="base-preview" role="img" aria-label="基地の ようす">
      {buildings.filter((b) => b.x >= x0).map((b, i) => {
        const st = BUILDING_STATS[b.type];
        return <rect key={i} x={(b.x - x0) * cell + 0.5} y={b.y * cell + 0.5} width={st.width * cell - 1} height={st.height * cell - 1} rx={1.5}
          fill={COLOR[b.type] ?? '#fff'} opacity={b.type === BuildingType.WALL ? 0.75 : 0.95} />;
      })}
    </svg>
  );
};

/** 名乗っているか（なかまの 基地を 読むか）／おためし・デモ・つないでいない */
function useCounts(): 'class' | 'sample' {
  usePortal((s) => s.student);
  return !isDemo() && friendNamed() ? 'class' : 'sample';
}

/** ホームの カード */
export const FriendCard: React.FC<{ locked?: string | null; onOpen: () => void }> = ({ locked, onOpen }) => (
  <Card icon="friend" title="なかまの 基地に いく" data-testid="friend-card"
    sub="同じ学級の なかまの 基地の 配置に せめこもう"
    lockReason={locked ?? undefined} locked={!!locked} onClick={onOpen} />
);

/** 相手を えらぶ（3つ）。avgLevel＝手持ちの平均レベル（敵の強さ「てき Lv」を 出す） */
export const FriendScreen: React.FC<{
  avgLevel: number; locked?: string | null; onBack: () => void; onPick: (t: FriendTarget, day: string) => void;
}> = ({ avgLevel, locked, onBack, onPick }) => {
  const counts = useCounts();
  const st = useFriendOffers((s) => s.status);
  const offers = useFriendOffers((s) => s.data);
  const error = useFriendOffers((s) => s.error);
  const saved = useFriendStore();
  useEffect(() => { void loadFriendOffers(); }, []);
  const day = offers?.day ?? jstDateOf(Date.now());
  const targets = useMemo(
    () => buildTargets(dayIndexOf(Date.parse(`${day}T12:00:00+09:00`)), offers?.real ?? []),
    [day, offers],
  );
  const mine = (slot: string) => (saved.day === day ? saved.stars[slot] ?? null : null);
  const bonusLeft = saved.bonusDay !== day;
  const loading = counts === 'class' && st === 'loading';
  return (
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col" style={font} data-testid="friend-screen">
      <ScreenBackdrop name="friend" />
      <TitleBar title="なかまの 基地に いく" onBack={onBack} subtitle={<>{day} の 3つ（日づけが かわると 入れかわる）</>} />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-w-3xl w-full mx-auto">
        {counts === 'sample' && (
          <p className="text-white/60 text-[11px] leading-relaxed rounded-xl border border-white/10 p-2.5" data-testid="friend-sample-note" style={{ background: 'rgba(6,10,24,0.55)' }}>
            おためしでは「みほんの 基地」で あそべるよ（コンピュータが つくった 基地）。がっきゅうコードを 入れると、同じ学級の なかまの 基地に せめこめる。
          </p>
        )}
        {counts === 'class' && error && (
          <p className="text-[#fde68a] text-[11px] leading-relaxed rounded-xl border border-[#fde68a]/30 p-2.5" data-testid="friend-error" style={{ background: 'rgba(120,53,15,0.25)' }}>
            なかまの 基地を よみこめなかったよ。いまは みほんの 基地で あそぼう（あとで もういちど ひらくと よめるかも）。
          </p>
        )}
        {loading && <p className="text-white/55 text-[12px] text-center py-6" data-testid="friend-loading">なかまの 基地を さがしているよ…</p>}
        {!loading && targets.map((t) => {
          const su = friendSetup(t, avgLevel);
          const d = describeBase({ buildings: su.enemyBase, levels: t.base.levels });
          return (
            <div key={t.slot} className="rounded-2xl border p-3 flex gap-3" data-testid={`friend-target-${t.slot}`}
              style={{ borderColor: t.sample ? 'rgba(255,255,255,0.18)' : `${ACCENT}88`, background: 'rgba(6,10,24,0.6)' }}>
              <BasePreview buildings={su.enemyBase} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-black text-sm leading-tight truncate" data-testid="friend-label">{t.label}</span>
                  {t.sample && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white/30 text-white/70 whitespace-nowrap">みほん</span>}
                </div>
                <div className="text-white/55 text-[11px] mt-0.5">戦場：{su.map.name}（第{t.chapterNo}章）</div>
                <div className="text-white/70 text-[11px] mt-1">
                  🏰コア ・ 🔴砲台×{d.cannons} ・ 🟡電撃×{d.teslas} ・ ⬜かべ×{d.walls} ・ 🟢キャンプ×{d.camps}
                </div>
                <div className="text-[11px] text-[#f9a8d4] mt-0.5" data-testid="friend-level">てきの つよさ Lv.{su.enemyLevel}（きみの ネコの レベルに あわせて きまる）</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {su.difficulty.unitPool.map((k) => (
                    <span key={k} className="text-[10px] text-white/80 rounded-full border border-white/15 px-1.5 py-0.5">
                      <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="inline-block w-4 h-4 object-contain align-middle mr-0.5" />
                      {ENEMY_TRAIT_NOTE[k]?.icon ?? ''}{ENEMY_UNIT_STATS[k].label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/50 text-[10px]">きょうの きみの いちばん</span>
                    <StarRow n={mine(t.slot)} size={15} />
                  </div>
                  <button onClick={() => onPick(t, day)} data-testid={`friend-go-${t.slot}`} aria-disabled={locked ? true : undefined}
                    className={`px-3 py-2 rounded-xl border-2 font-black text-sm text-white transition-all active:scale-95 ${locked ? 'opacity-60 grayscale' : ''}`}
                    style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.18)', ...fontMono }}>
                    ⚔️ せめる
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {locked && <p className="text-[12px] text-[#fca5a5] text-center">🔒 {locked}</p>}
        <ul className="text-white/55 text-[11px] leading-relaxed list-disc pl-4 pb-4">
          <li>だれの 基地かは 分からない（番号も 名前も 出ないよ）。せめても、なかまには 何も つたわらない。</li>
          <li>まもっているのは コンピュータ。なかまは その場に いなくていい。</li>
          <li>★は かったうえで、まちがえずに とけた わりあいで きまる（はやさでは きまらない）。</li>
          <li>{bonusLeft ? `きょう 1回目の 勝ち（まちがえずに 1問いじょう とく）で 💠${FRIEND_ATTACK_CREDITS}。` : 'きょうの 💠 は もう もらったよ。なんかいでも ちょうせん できる。'}</li>
          <li>きみの 基地も「陣地づくり」で 配置すると、同じ学級の なかまが せめられるようになるよ（だれが せめたかは きみにも 伝わらない）。</li>
        </ul>
      </div>
    </div>
  );
};

/** 結果画面に足す：きょうの その枠の 自分の星・💠 */
export const FriendResultNote: React.FC<{ day: string; slot: string; label: string; perfect: number }> = ({ day, slot, label, perfect }) => {
  const saved = useFriendStore();
  const mine = saved.day === day ? saved.stars[slot] ?? null : null;
  return (
    <Panel pad={false} className="mb-3 p-3 text-left rounded-cw-md" data-testid="friend-result">
      <div className="flex items-center justify-between gap-2">
        <span className="text-cw-14 font-bold" style={{ color: 'var(--cw-fg)' }}>きょうの「{label}」</span>
        <StarRow n={mine} size={18} />
      </div>
      {perfect <= 0 && <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-2)' }}>まちがえずに とけた 問題が ないと 記録に のこらないよ。</p>}
      <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>せめた ことは なかまには 伝わらないよ。</p>
    </Panel>
  );
};
