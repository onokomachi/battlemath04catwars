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
import { Button, Card, Chip, Disclosure, FacilityImg, Icon, Notice, Panel, ScreenBackdrop, TitleBar, TRAIT_ICON, iconOr } from '../ui';

/** 基地の ちいさな ずの 色（トークン）：コア＝行動・砲台＝危険・電撃＝ごほうび・かべ＝うす・キャンプ＝成長 */
const COLOR: Record<string, string> = {
  [BuildingType.TOWN_HALL]: 'var(--cw-action)', [BuildingType.CANNON]: 'var(--cw-danger)', [BuildingType.HIDDEN_TESLA]: 'var(--cw-reward)',
  [BuildingType.WALL]: 'var(--cw-fg-3)', [BuildingType.ARMY_CAMP]: 'var(--cw-growth)',
};

/** 基地の ちいさな ず（敵陣 x 18〜27・y 0〜15。左が 攻める側） */
export const BasePreview: React.FC<{ buildings: { type: BuildingType; x: number; y: number }[]; cell?: number }> = ({ buildings, cell = 9 }) => {
  const x0 = GRID_W - BASE_MAX_W;
  return (
    <svg width={BASE_MAX_W * cell} height={GRID_H * cell} viewBox={`0 0 ${BASE_MAX_W * cell} ${GRID_H * cell}`}
      className="flex-shrink-0" style={{ background: 'var(--cw-surface-strong)', borderRadius: 'var(--cw-r-sm)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)' }} data-testid="base-preview" role="img" aria-label="基地の ようす">
      {buildings.filter((b) => b.x >= x0).map((b, i) => {
        const st = BUILDING_STATS[b.type];
        return <rect key={i} x={(b.x - x0) * cell + 0.5} y={b.y * cell + 0.5} width={st.width * cell - 1} height={st.height * cell - 1} rx={1.5}
          fill={COLOR[b.type] ?? 'var(--cw-fg)'} opacity={b.type === BuildingType.WALL ? 0.7 : 0.95} />;
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

/** 基地の くみあわせ（コア・砲台・電撃・かべ・キャンプ）を 施設の 絵で */
const Legend: React.FC<{ d: { cannons: number; teslas: number; walls: number; camps: number } }> = ({ d }) => (
  <div className="flex flex-wrap gap-1.5 mt-2">
    {([
      [BuildingType.TOWN_HALL, 'コア', null],
      [BuildingType.CANNON, '砲台', d.cannons],
      [BuildingType.HIDDEN_TESLA, '電撃', d.teslas],
      [BuildingType.WALL, 'かべ', d.walls],
      [BuildingType.ARMY_CAMP, 'キャンプ', d.camps],
    ] as [BuildingType, string, number | null][]).map(([t, label, n]) => (
      <Chip key={t}><FacilityImg type={t} size={20} /><span style={{ color: 'var(--cw-fg)' }}>{label}{n != null ? `×${n}` : ''}</span></Chip>
    ))}
  </div>
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
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col" data-testid="friend-screen">
      <ScreenBackdrop name="friend" />
      <TitleBar title="なかまの 基地に いく" onBack={onBack} subtitle={<>{day} の 3つ（日づけが かわると 入れかわる）</>} />
      <div className="flex-1 overflow-y-auto cw-scroll px-4 py-3 cw-enter">
        <div className="max-w-3xl w-full mx-auto space-y-3">
          {counts === 'sample' && (
            <Notice tone="action" icon="bulb" data-testid="friend-sample-note">
              おためしでは「みほんの 基地」で あそべるよ（コンピュータが つくった 基地）。がっきゅうコードを 入れると、同じ学級の なかまの 基地に せめこめる。
            </Notice>
          )}
          {counts === 'class' && error && (
            <Notice tone="reward" icon="warn" data-testid="friend-error">
              なかまの 基地を よみこめなかったよ。いまは みほんの 基地で あそぼう（あとで もういちど ひらくと よめるかも）。
            </Notice>
          )}
          {loading && <p className="text-cw-14 text-center py-6" style={{ color: 'var(--cw-fg-2)' }} data-testid="friend-loading">なかまの 基地を さがしているよ…</p>}
          {!loading && targets.map((t) => {
            const su = friendSetup(t, avgLevel);
            const d = describeBase({ buildings: su.enemyBase, levels: t.base.levels });
            return (
              <Card key={t.slot} data-testid={`friend-target-${t.slot}`} tone={t.sample ? 'neutral' : 'action'}
                className="!items-start !p-4" media={<BasePreview buildings={su.enemyBase} />}
                title={<span className="flex items-center gap-2"><span data-testid="friend-label">{t.label}</span>{t.sample && <Chip>みほん</Chip>}</span>}
                sub={<>戦場：{su.map.name}（第{t.chapterNo}章）</>}>
                <Legend d={d} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" data-testid="friend-level">
                  <Chip tone="danger"><Icon name="enemy" size={18} />てきの つよさ Lv.{su.enemyLevel}</Chip>
                  <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>きみの ネコの レベルに あわせて きまる</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {su.difficulty.unitPool.map((k) => (
                    <Chip key={k}>
                      <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="w-5 h-5 object-contain" />
                      {ENEMY_TRAIT_NOTE[k] && <Icon name={iconOr(TRAIT_ICON, k)} size={16} />}
                      <span style={{ color: 'var(--cw-fg)' }}>{ENEMY_UNIT_STATS[k].label}</span>
                    </Chip>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>きょうの きみの いちばん</span>
                    <StarRow n={mine(t.slot)} size={20} />
                  </div>
                  <Button variant="primary" size="md" onClick={() => onPick(t, day)} data-testid={`friend-go-${t.slot}`} locked={!!locked} className="min-w-[132px]">
                    <Icon name="sortie" size={26} />せめる
                  </Button>
                </div>
              </Card>
            );
          })}
          {locked && <p className="flex items-center justify-center gap-1.5 text-cw-14 font-bold text-center" style={{ color: 'var(--cw-danger)' }}><Icon name="lock" size={18} />{locked}</p>}
          <Disclosure title="なかまの 基地の きまり" icon="friend" className="mb-4">
            <ul className="text-cw-14 leading-relaxed list-disc pl-5 space-y-1" style={{ color: 'var(--cw-fg-2)' }}>
              <li>だれの 基地かは 分からない（番号も 名前も 出ないよ）。せめても、なかまには 何も つたわらない。</li>
              <li>まもっているのは コンピュータ。なかまは その場に いなくていい。</li>
              <li>★は かったうえで、まちがえずに とけた わりあいで きまる（はやさでは きまらない）。</li>
              <li>{bonusLeft ? `きょう 1回目の 勝ち（まちがえずに 1問いじょう とく）で 💠${FRIEND_ATTACK_CREDITS}。` : 'きょうの 💠 は もう もらったよ。なんかいでも ちょうせん できる。'}</li>
              <li>きみの 基地も「陣地づくり」で 配置すると、同じ学級の なかまが せめられるようになるよ（だれが せめたかは きみにも 伝わらない）。</li>
            </ul>
          </Disclosure>
        </div>
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
