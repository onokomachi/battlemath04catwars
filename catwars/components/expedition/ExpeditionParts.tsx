/**
 * 週がわりの遠征の画面（CW-6a・2026-11-17）：ホームのカード・遠征の説明・結果画面に足す 今週の星。
 *
 * **個人の順位・ほかの子の星は 出さない**（サーバも 返さない）。出すのは 学級の星の合計・目標・達成の印・自分の星だけ。
 * 名乗っていない（おためし・体験版）ときは 学級の合計に入らない と出す。デモは 見本の数（サーバを読まない）。
 */
import React, { useEffect } from 'react';
import { ENEMY_TRAIT_NOTE, ENEMY_UNIT_STATS } from '../../data/campaign';
import { ENEMY_UNIT_SPRITE } from '../../data/enemySprites';
import {
  expeditionDifficulty, expeditionEnemyLevel, EXPEDITION_GOAL_COINS, EXPEDITION_GOAL_PER_STUDENT, type Expedition,
} from '../../expedition/expedition';
import { daysLeftInWeek } from '../../expedition/week';
import { useExpeditionStore } from '../../store/useExpeditionStore';
import { useClassExpedition, refreshClassExpedition, flushExpedition, expeditionNamed, type ClassWeek } from '../../portal/expeditionSync';
import { usePortal } from '../../portal/usePortal';
import { isPortalConfigured } from '../../portal/config';
import { isDemo } from '../../portal/demoMode';
import { Button, Card, Chip, Disclosure, Icon, Panel, ProgressBar, ScreenBackdrop, SectionTitle, TitleBar, RULE_ICON, TRAIT_ICON, iconOr } from '../ui';

export const StarRow: React.FC<{ n: number | null | undefined; size?: number }> = ({ n, size = 14 }) => (
  <span aria-label={n == null ? 'まだ' : `ほし ${n}`} className="inline-flex gap-0.5 align-middle">
    {[1, 2, 3].map((i) => (
      <Icon key={i} name="star" size={Math.max(size, 16)} style={n != null && n >= i ? undefined : { filter: 'grayscale(1) brightness(0.55)', opacity: 0.7 }} />
    ))}
  </span>
);

/** 名乗っているか（学級の合計に入るか） */
function useCounts(): 'class' | 'trial' | 'demo' | 'offline' {
  usePortal((s) => s.student); // 名乗ったら 読みなおす
  if (isDemo()) return 'demo';
  if (expeditionNamed()) return 'class';
  return isPortalConfigured ? 'trial' : 'offline';
}

/** 学級の合計・目標・達成のバー */
const ClassGoalBar: React.FC<{ w: ClassWeek; sample?: boolean; compact?: boolean }> = ({ w, sample, compact }) => {
  const pct = w.goal > 0 ? Math.min(1, w.total / w.goal) : 0;
  return (
    <div data-testid="expedition-class-goal">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-cw-12" style={{ color: 'var(--cw-fg-2)' }}>がっきゅうの ほし{sample ? '（デモの みほん）' : ''}</span>
        <span className="text-cw-14 font-bold font-cw-num" style={{ color: w.achieved ? 'var(--cw-growth)' : 'var(--cw-reward)' }}>
          <Icon name="star" size={18} className="inline-block align-[-3px] mr-0.5" />{w.total} / {w.goal}{w.achieved ? ' たっせい！' : ''}
        </span>
      </div>
      <ProgressBar value={pct} tone={w.achieved ? 'growth' : 'reward'} />
      {!compact && (
        <p className="text-cw-12 mt-1.5 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>
          {w.achieved
            ? `🎉 学級の もくひょう たっせい！ 今週 遠征に ちょうせんした みんなに 🪙${EXPEDITION_GOAL_COINS}`
            : `もくひょうは 学級の 人数 × ${EXPEDITION_GOAL_PER_STUDENT}。とどいたら 今週 ちょうせんした みんなに 🪙${EXPEDITION_GOAL_COINS}`}
        </p>
      )}
    </div>
  );
};

/** 学級の合計を読む（ホーム・説明を開いたとき。名乗っていなければ 何もしない） */
function useClassRefresh(): void {
  const student = usePortal((s) => s.student);
  useEffect(() => { void flushExpedition().finally(() => { void refreshClassExpedition(); }); }, [student?.studentId]);
}

/** ホームの 遠征のカード */
export const ExpeditionCard: React.FC<{ expedition: Expedition; locked?: string | null; onOpen: () => void }> = ({ expedition: e, locked, onOpen }) => {
  useClassRefresh();
  const mine = useExpeditionStore((s) => s.best[e.weekStart]);
  const left = daysLeftInWeek(Date.now());
  return (
    <Card icon="expedition" title="週がわりの 遠征" data-testid="expedition-card"
      sub={<>「{e.rule.name}」・あと {left}日で つぎの 遠征</>}
      right={<span className="flex flex-col items-end"><span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>今週の きみ</span><StarRow n={mine ?? null} size={16} /></span>}
      lockReason={locked ?? undefined} locked={!!locked}
      onClick={onOpen} />
  );
};

/** 学級の もくひょうを たっせいしたときの ごほうび（ホームの カードの下） */
export const ExpeditionRewardNote: React.FC = () => {
  const reward = useClassExpedition((s) => s.reward);
  if (reward <= 0) return null;
  return (
    <p className="mt-2 text-center text-cw-14 font-bold" style={{ color: 'var(--cw-growth)' }} role="status" data-testid="expedition-reward">
      🎉 学級の もくひょう たっせいの ごほうび 🪙{reward} を もらったよ！
    </p>
  );
};

/** 遠征の説明（ホームのカード → ここ → 出撃の範囲えらび） */
export const ExpeditionScreen: React.FC<{
  expedition: Expedition; avgLevel: number; locked?: string | null; onBack: () => void; onStart: () => void;
}> = ({ expedition: e, avgLevel, locked, onBack, onStart }) => {
  useClassRefresh();
  const counts = useCounts();
  const data = useClassExpedition((s) => s.data);
  const mine = useExpeditionStore((s) => s.best[e.weekStart]);
  const d = expeditionDifficulty(e, avgLevel);
  const lv = expeditionEnemyLevel(avgLevel);
  const last = data?.lastWeek;
  return (
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col" data-testid="expedition-screen">
      <ScreenBackdrop name="expedition" />
      <TitleBar title="週がわりの 遠征" onBack={onBack} subtitle={<>{e.weekStart} の 週（月曜 0:00 に かわる）</>} />
      <div className="flex-1 overflow-y-auto cw-scroll px-4 py-3 cw-enter">
        <div className="max-w-2xl w-full mx-auto space-y-3">
          {/* 主役：今週の ルール */}
          <Panel strong className="cw-tone-rare" style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-rare)' }}>
            <div className="flex items-center gap-4">
              <span className="cw-card-icon flex-shrink-0" style={{ width: 80, height: 80, borderRadius: 'var(--cw-r-lg)' }}>
                <Icon name={iconOr(RULE_ICON, e.rule.id)} size={56} />
              </span>
              <div className="min-w-0">
                <Chip tone="rare">今週の ルール</Chip>
                <div className="text-cw-28 font-extrabold leading-tight mt-1" style={{ color: 'var(--cw-fg)' }} data-testid="expedition-rule">{e.rule.name}</div>
              </div>
            </div>
            <p className="text-cw-16 leading-relaxed mt-3" style={{ color: 'var(--cw-fg)' }}>{e.rule.desc(e.ctx)}</p>
            <p className="flex items-start gap-2 text-cw-14 leading-snug mt-2" style={{ color: 'var(--cw-reward)' }}>
              <Icon name="bulb" size={22} className="mt-0.5" /><span>{e.rule.hint}</span>
            </p>
          </Panel>

          <div className="grid sm:grid-cols-2 gap-3">
            <Panel>
              <SectionTitle tone="action">戦場</SectionTitle>
              <div className="text-cw-20 font-extrabold mt-2" style={{ color: 'var(--cw-fg)' }}>{e.map.name}</div>
              <div className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>第{e.chapter.no}章の 戦場（{e.chapter.enemyName}の とりで）</div>
              <div className="flex items-center gap-2 mt-3" data-testid="expedition-level">
                <Chip tone="danger"><Icon name="enemy" size={18} />てきの つよさ Lv.{lv}</Chip>
              </div>
              <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>きみの ネコの レベルに あわせて きまる</div>
            </Panel>
            <Panel data-testid="expedition-enemies">
              <SectionTitle tone="danger">出てくる 敵</SectionTitle>
              <ul className="flex flex-wrap gap-2 mt-2">
                {d.unitPool.map((k) => (
                  <li key={k}>
                    <Chip tone="neutral" className="min-h-[32px]">
                      <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="w-6 h-6 object-contain" />
                      {ENEMY_TRAIT_NOTE[k] && <Icon name={iconOr(TRAIT_ICON, k)} size={18} />}
                      <span style={{ color: 'var(--cw-fg)' }}>{ENEMY_UNIT_STATS[k].label}</span>
                    </Chip>
                  </li>
                ))}
                {d.bossAtSpawnCount != null && (
                  <li><Chip tone="reward" className="min-h-[32px]"><Icon name="crown" size={20} />おやぶん（シールド {d.bossShield ?? 0}まい）</Chip></li>
                )}
              </ul>
            </Panel>
          </div>

          <Panel className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle tone="reward">今週の きみの いちばん</SectionTitle>
              <StarRow n={mine ?? null} size={24} />
            </div>
            {data && (counts === 'class' || counts === 'demo') && <ClassGoalBar w={data.thisWeek} sample={data.sample} />}
            {last && counts === 'class' && (
              <p className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>先週：学級の ほし ★{last.total} / {last.goal}{last.achieved ? '（たっせい）' : ''}</p>
            )}
            {counts === 'trial' && <p className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>おためしでは 学級の ほしには 入らないよ。</p>}
          </Panel>

          <Disclosure title="★の きまり" icon="star">
            <ul className="text-cw-14 leading-relaxed list-disc pl-5 space-y-1" style={{ color: 'var(--cw-fg-2)' }}>
              <li>今週は なんかいでも ちょうせん できる。のこるのは いちばん よい ★（0〜3）。</li>
              <li>★は かったうえで、まちがえずに とけた わりあいで きまる（はやさでは きまらない）。</li>
              <li>だれが なん★かは だれにも 見えない。見えるのは 学級の ごうけい だけ。</li>
            </ul>
          </Disclosure>
        </div>
      </div>
      {/* 下の 出撃バー */}
      <div className="flex-shrink-0 px-4 pt-2 pb-3 relative z-10" style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 1px 0 var(--cw-line)' }}>
        <div className="max-w-2xl mx-auto">
          {locked && <p className="flex items-center justify-center gap-1.5 text-cw-14 font-bold mb-2 text-center" style={{ color: 'var(--cw-danger)' }}><Icon name="lock" size={18} />{locked}</p>}
          <Button variant="primary" size="xl" fullWidth data-testid="expedition-start" locked={!!locked} onClick={onStart}>
            <Icon name="sortie" size={32} />遠征に しゅつげき
          </Button>
          <p className="text-cw-12 text-center mt-1.5" style={{ color: 'var(--cw-fg-3)' }}>出撃と同じく スタミナを つかうよ（おためしは つかわない）</p>
        </div>
      </div>
    </div>
  );
};

/** 結果画面に足す：今週の自分の星・学級の合計（とどいたら） */
export const ExpeditionResultNote: React.FC<{ weekStart: string; perfect: number }> = ({ weekStart, perfect }) => {
  const counts = useCounts();
  const mine = useExpeditionStore((s) => s.best[weekStart]);
  const pending = useExpeditionStore((s) => s.pending);
  const data = useClassExpedition((s) => s.data);
  return (
    <Panel pad={false} className="mb-3 p-3 text-left rounded-cw-md" data-testid="expedition-result">
      <div className="flex items-center justify-between gap-2">
        <span className="text-cw-14 font-bold" style={{ color: 'var(--cw-fg)' }}>今週の きみの いちばん</span>
        <StarRow n={mine ?? null} size={18} />
      </div>
      {perfect <= 0 && <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-2)' }}>まちがえずに とけた 問題が ないと 記録に のこらないよ。</p>}
      {counts === 'class' && perfect > 0 && (
        <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-2)' }}>{pending && pending.weekStart === weekStart ? '学級に おくっているよ…' : '学級の ほしに 入ったよ。'}</p>
      )}
      {counts === 'trial' && <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-2)' }}>おためしでは 学級の ほしには 入らないよ。</p>}
      {data && (counts === 'class' || counts === 'demo') && data.thisWeek.weekStart === weekStart && (
        <div className="mt-2"><ClassGoalBar w={data.thisWeek} sample={data.sample} compact /></div>
      )}
    </Panel>
  );
};
