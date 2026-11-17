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

const fontMono = { fontFamily: 'Orbitron, monospace' };
const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const ACCENT = '#c084fc';

export const StarRow: React.FC<{ n: number | null | undefined; size?: number }> = ({ n, size = 14 }) => (
  <span aria-label={n == null ? 'まだ' : `ほし ${n}`} style={{ fontSize: size, letterSpacing: 1 }}>
    {[1, 2, 3].map((i) => <span key={i} style={{ color: n != null && n >= i ? '#facc15' : 'rgba(255,255,255,0.22)' }}>★</span>)}
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
      <div className="flex items-center justify-between mb-1">
        <span className="text-white/70 text-[11px]">がっきゅうの ほし{sample ? '（デモの みほん）' : ''}</span>
        <span className="text-[11px] font-bold" style={{ color: w.achieved ? '#a3e635' : '#fde68a', ...fontMono }}>
          ★{w.total} / {w.goal}{w.achieved ? ' たっせい！' : ''}
        </span>
      </div>
      <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, background: w.achieved ? 'linear-gradient(90deg,#22c55e,#a3e635)' : 'linear-gradient(90deg,#7c3aed,#facc15)' }} />
      </div>
      {!compact && (
        <p className="text-white/50 text-[10px] mt-1 leading-snug">
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
  const counts = useCounts();
  const data = useClassExpedition((s) => s.data);
  const reward = useClassExpedition((s) => s.reward);
  const mine = useExpeditionStore((s) => s.best[e.weekStart]);
  const left = daysLeftInWeek(Date.now());
  return (
    <div className="px-4 pt-4">
      <button onClick={onOpen} data-testid="expedition-card" aria-disabled={locked ? true : undefined}
        className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all active:scale-[0.99] ${locked ? 'opacity-70' : ''}`}
        style={{ borderColor: ACCENT, background: 'linear-gradient(135deg, rgba(124,58,237,0.20), rgba(15,23,42,0.6))', boxShadow: `0 0 16px ${ACCENT}44`, ...font }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{e.rule.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] tracking-[0.2em]" style={{ color: ACCENT, ...fontMono }}>WEEKLY EXPEDITION</div>
            <div className="text-white font-black text-base leading-tight">週がわりの 遠征「{e.rule.name}」</div>
            <div className="text-white/55 text-[11px] truncate">戦場：{e.map.name}（第{e.chapter.no}章）・あと {left}日で つぎの 遠征</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-white/50 text-[10px]">今週の きみ</div>
            <StarRow n={mine ?? null} size={16} />
          </div>
        </div>
        <div className="mt-2.5">
          {data && (counts === 'class' || counts === 'demo')
            ? <ClassGoalBar w={data.thisWeek} sample={data.sample} />
            : <p className="text-white/55 text-[11px] leading-snug" data-testid="expedition-not-counted">
                {counts === 'class' ? 'がっきゅうの ほしを よみこみ中…（よめないときは あとで もういちど）'
                  : counts === 'offline' ? '学級の ほしは、がっきゅうポータルに つないだ アプリで あつまるよ。'
                  : 'おためしでは 学級の ほしには 入らないよ（がっきゅうコードを 入れると 入る）。'}
              </p>}
        </div>
        {locked && <p className="mt-1.5 text-[11px] text-[#fca5a5]">🔒 {locked}</p>}
      </button>
      {reward > 0 && (
        <p className="mt-1.5 text-center text-[12px] font-bold text-[#a3e635]" role="status" data-testid="expedition-reward">
          🎉 学級の もくひょう たっせいの ごほうび 🪙{reward} を もらったよ！
        </p>
      )}
    </div>
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
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col" style={font} data-testid="expedition-screen">
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <button onClick={onBack} className="text-white/60 hover:text-white text-sm">← もどる</button>
        <div className="min-w-0">
          <h2 className="font-bold text-sm leading-tight" style={{ color: ACCENT, ...fontMono }}>週がわりの 遠征</h2>
          <p className="text-white/45 text-[10px]">{e.weekStart} の 週（月曜 0:00 に かわる）</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-w-2xl w-full mx-auto">
        <div className="rounded-2xl border p-4" style={{ borderColor: `${ACCENT}88`, background: 'rgba(124,58,237,0.14)' }}>
          <div className="flex items-center gap-3">
            <span className="text-4xl leading-none">{e.rule.icon}</span>
            <div className="min-w-0">
              <div className="text-white/50 text-[10px]">今週の ルール</div>
              <div className="text-white font-black text-lg leading-tight" data-testid="expedition-rule">{e.rule.name}</div>
            </div>
          </div>
          <p className="text-white/85 text-[13px] leading-relaxed mt-2">{e.rule.desc(e.ctx)}</p>
          <p className="text-[#facc15]/90 text-[12px] leading-relaxed mt-1">💡 {e.rule.hint}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 p-3" style={{ background: 'rgba(6,10,24,0.55)' }}>
            <div className="text-white/50 text-[10px] mb-0.5">戦場</div>
            <div className="text-white font-bold text-sm">{e.map.name}</div>
            <div className="text-white/50 text-[11px]">第{e.chapter.no}章の 戦場（{e.chapter.enemyName}の とりで）</div>
            <div className="mt-2 text-[11px] text-[#f9a8d4]" data-testid="expedition-level">
              てきの つよさ Lv.{lv}（きみの ネコの レベルに あわせて きまる）
            </div>
          </div>
          <div className="rounded-xl border border-white/10 p-3" style={{ background: 'rgba(6,10,24,0.55)' }} data-testid="expedition-enemies">
            <div className="text-white/50 text-[10px] mb-1">出てくる 敵</div>
            <ul className="space-y-1">
              {d.unitPool.map((k) => {
                const note = ENEMY_TRAIT_NOTE[k];
                return (
                  <li key={k} className="text-[11px] leading-snug text-white/85">
                    <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="inline-block w-5 h-5 object-contain align-middle mr-1" />
                    <span className="font-bold">{note ? `${note.icon} ` : ''}{ENEMY_UNIT_STATS[k].label}</span>
                  </li>
                );
              })}
              {d.bossAtSpawnCount != null && <li className="text-[11px] text-[#fde68a]">👑 おやぶん（シールド {d.bossShield ?? 0}まい）</li>}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 p-3 space-y-2" style={{ background: 'rgba(6,10,24,0.55)' }}>
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-[12px]">今週の きみの いちばん</span>
            <StarRow n={mine ?? null} size={18} />
          </div>
          {data && (counts === 'class' || counts === 'demo') && <ClassGoalBar w={data.thisWeek} sample={data.sample} />}
          {last && counts === 'class' && (
            <p className="text-white/45 text-[10px]">先週：学級の ほし ★{last.total} / {last.goal}{last.achieved ? '（たっせい）' : ''}</p>
          )}
          {counts === 'trial' && <p className="text-white/55 text-[11px]">おためしでは 学級の ほしには 入らないよ。</p>}
          <ul className="text-white/60 text-[11px] leading-relaxed list-disc pl-4">
            <li>今週は なんかいでも ちょうせん できる。のこるのは いちばん よい ★（0〜3）。</li>
            <li>★は かったうえで、まちがえずに とけた わりあいで きまる（はやさでは きまらない）。</li>
            <li>だれが なん★かは だれにも 見えない。見えるのは 学級の ごうけい だけ。</li>
          </ul>
        </div>

        {locked && <p className="text-[12px] text-[#fca5a5] text-center">🔒 {locked}</p>}
        <button onClick={onStart} data-testid="expedition-start" aria-disabled={locked ? true : undefined}
          className={`w-full py-4 rounded-2xl border-2 font-black text-lg text-white transition-all active:scale-95 ${locked ? 'opacity-60 grayscale' : ''}`}
          style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.18)', boxShadow: '0 0 18px rgba(239,68,68,0.45)', ...fontMono }}>
          ⚔️ 遠征に しゅつげき
        </button>
        <p className="text-white/40 text-[10px] text-center pb-4">出撃と同じく スタミナを つかうよ（おためしは つかわない）</p>
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
    <div className="mb-3 p-3 rounded-xl text-left" data-testid="expedition-result"
      style={{ background: 'rgba(124,58,237,0.16)', border: `1px solid ${ACCENT}77` }}>
      <div className="flex items-center justify-between">
        <span className="text-white/80 text-[12px] font-bold">今週の きみの いちばん</span>
        <StarRow n={mine ?? null} size={18} />
      </div>
      {perfect <= 0 && <p className="text-white/55 text-[11px] mt-1">まちがえずに とけた 問題が ないと 記録に のこらないよ。</p>}
      {counts === 'class' && perfect > 0 && (
        <p className="text-white/60 text-[11px] mt-1">{pending && pending.weekStart === weekStart ? '学級に おくっているよ…' : '学級の ほしに 入ったよ。'}</p>
      )}
      {counts === 'trial' && <p className="text-white/55 text-[11px] mt-1">おためしでは 学級の ほしには 入らないよ。</p>}
      {data && (counts === 'class' || counts === 'demo') && data.thisWeek.weekStart === weekStart && (
        <div className="mt-2"><ClassGoalBar w={data.thisWeek} sample={data.sample} compact /></div>
      )}
    </div>
  );
};
