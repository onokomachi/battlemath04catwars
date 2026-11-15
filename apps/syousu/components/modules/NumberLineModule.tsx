// このファイルは単元アプリ syo4-syousu-v2 の src/components/modules/NumberLineModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数直線・大小くらべ モジュール。
 * - 大小くらべ: 2つの小数を不等号で比べ、数直線で「どちらが右（大きい）か」を視覚的に確認（Megz/Segz/Negz対策）
 * - 数直線: 小数を数直線上の正しい目もりに置く（ベンチマーク 0/0.5/1 で見当をつける）
 * タイマー無し・やさしいフィードバック・読み上げ（資料の低位児最適化）。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import { motion } from 'motion/react';
import { ChevronLeft, RotateCcw, Lightbulb, Ruler, Scale } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { AnswerEntry } from '../shared/AnswerEntry';
import {
  COMPARE_LEVELS, CompareLevel, ComparePair, generateCompare, relation,
  LINE_LEVELS, LineLevel, LineProblem, generateLine, lineTicks,
  ORDER_LEVELS, OrderLevel, OrderProblem, generateOrder,
} from '../../lib/numberLine';
import { useProgressStore } from '../../store/progressStore';
import { LevelCard } from '../ui/primitives';
import { Eye, ArrowDownUp, X } from 'lucide-react';
import { playClear, playSoftTry, playCorrect } from '../../lib/sound';
import { useAdaptive } from '../../lib/useAdaptive';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { Wand2 } from 'lucide-react';

interface Props { onExit: () => void; }
type Activity = 'compare' | 'line' | 'line-read' | 'order';

export const NumberLineModule: React.FC<Props> = ({ onExit }) => {
  const [phase, setPhase] = useState<'SETUP' | 'SIM'>('SETUP');
  const [activity, setActivity] = useState<Activity>('compare');
  const [mode, setMode] = useState<'fixed' | 'adaptive'>('fixed');
  const [compareLevel, setCompareLevel] = useState<CompareLevel>('compare-tenths');
  const [lineLevel, setLineLevel] = useState<LineLevel>('line-tenths');
  const [readLevel, setReadLevel] = useState<LineLevel>('line-tenths');
  const [orderLevel, setOrderLevel] = useState<OrderLevel>('order-3');
  const [pair, setPair] = useState<ComparePair | null>(null);
  const [lineProblem, setLineProblem] = useState<LineProblem | null>(null);
  const [readProblem, setReadProblem] = useState<LineProblem | null>(null);
  const [orderProblem, setOrderProblem] = useState<OrderProblem | null>(null);
  const compareAdaptive = useAdaptive(COMPARE_LEVELS.map((l) => l.id));
  const lineAdaptive = useAdaptive(LINE_LEVELS.map((l) => l.id));
  const effCompareLevel = mode === 'adaptive' ? compareAdaptive.level : compareLevel;
  const effLineLevel = mode === 'adaptive' ? lineAdaptive.level : lineLevel;
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);

  const startCompare = (lv: CompareLevel) => { setActivity('compare'); setMode('fixed'); setCompareLevel(lv); setPair(generateCompare(lv)); setPhase('SIM'); };
  const startLine = (lv: LineLevel) => { setActivity('line'); setMode('fixed'); setLineLevel(lv); setLineProblem(generateLine(lv)); setPhase('SIM'); };
  const startRead = (lv: LineLevel) => { setActivity('line-read'); setMode('fixed'); setReadLevel(lv); setReadProblem(generateLine(lv)); setPhase('SIM'); };
  const startOrder = (lv: OrderLevel) => { setActivity('order'); setMode('fixed'); setOrderLevel(lv); setOrderProblem(generateOrder(lv)); setPhase('SIM'); };
  const startCompareAdaptive = () => { setActivity('compare'); setMode('adaptive'); setPair(generateCompare(compareAdaptive.level)); setPhase('SIM'); };
  const startLineAdaptive = () => { setActivity('line'); setMode('adaptive'); setLineProblem(generateLine(lineAdaptive.level)); setPhase('SIM'); };

  if (phase === 'SETUP') {
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button onClick={onExit} className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2">
            <ChevronLeft size={24} /> 小数ランドへ
          </button>
          <h1 className="text-3xl font-black text-content text-center mb-6">数直線・大小くらべ</h1>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 text-amber-600"><Scale size={20} /><span className="font-black">大小くらべ</span></div>
            <button onClick={startCompareAdaptive} className="w-full mb-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-amber-500 text-white shadow hover:shadow-lg text-left transition-all active:scale-[0.98] flex items-center gap-3">
              <Wand2 size={24} /><div><div className="font-black">おまかせ（じどうレベル）</div><div className="text-sm text-white/80">むずかしさが かわるよ</div></div>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {COMPARE_LEVELS.map((lv) => (
                <LevelCard
                  key={lv.id}
                  label={lv.label}
                  desc={lv.description}
                  mastery={getMasteryStreak(lv.id)}
                  todayCount={getTodaySkillCount(lv.id)}
                  onClick={() => startCompare(lv.id)}
                  accentBorder="hover:border-amber-400"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3 text-amber-600"><Ruler size={20} /><span className="font-black">数直線におく</span></div>
            <button onClick={startLineAdaptive} className="w-full mb-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-amber-500 text-white shadow hover:shadow-lg text-left transition-all active:scale-[0.98] flex items-center gap-3">
              <Wand2 size={24} /><div><div className="font-black">おまかせ（じどうレベル）</div><div className="text-sm text-white/80">むずかしさが かわるよ</div></div>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LINE_LEVELS.map((lv) => (
                <LevelCard
                  key={lv.id}
                  label={lv.label}
                  desc={lv.description}
                  mastery={getMasteryStreak(lv.id)}
                  todayCount={getTodaySkillCount(lv.id)}
                  onClick={() => startLine(lv.id)}
                  accentBorder="hover:border-amber-400"
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3 text-amber-600"><Eye size={20} /><span className="font-black">数直線を よむ（数を こたえる）</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {LINE_LEVELS.map((lv) => (
                <LevelCard
                  key={lv.id}
                  label={lv.label}
                  desc="めもりの 数を よみとろう"
                  mastery={getMasteryStreak(`line-read-${lv.id}`)}
                  todayCount={getTodaySkillCount(`line-read-${lv.id}`)}
                  onClick={() => startRead(lv.id)}
                  accentBorder="hover:border-amber-400"
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3 text-amber-600"><ArrowDownUp size={20} /><span className="font-black">ならべかえ（大小の順）</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORDER_LEVELS.map((lv) => (
                <LevelCard
                  key={lv.id}
                  label={lv.label}
                  desc={lv.description}
                  mastery={getMasteryStreak(lv.id)}
                  todayCount={getTodaySkillCount(lv.id)}
                  onClick={() => startOrder(lv.id)}
                  accentBorder="hover:border-amber-400"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const adaptiveState = activity === 'compare' ? compareAdaptive : lineAdaptive;
  const subtitle = mode === 'adaptive' ? 'おまかせ'
    : activity === 'compare' ? COMPARE_LEVELS.find((l) => l.id === compareLevel)?.label
      : activity === 'line-read' ? `よむ・${LINE_LEVELS.find((l) => l.id === readLevel)?.label ?? ''}`
        : activity === 'order' ? ORDER_LEVELS.find((l) => l.id === orderLevel)?.label
          : LINE_LEVELS.find((l) => l.id === lineLevel)?.label;

  return (
    <AppShell title="数直線・大小くらべ" subtitle={subtitle} onBack={() => setPhase('SETUP')}>
      <div className="flex flex-col h-full">
        {mode === 'adaptive' && (
          <AdaptiveBar index={adaptiveState.index} total={adaptiveState.total} leveledUp={adaptiveState.leveledUp} onClearLevelUp={adaptiveState.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activity === 'compare' && pair && (
            <CompareActivity key={`${pair.aStr}-${pair.bStr}`} pair={pair} level={effCompareLevel} onNext={() => setPair(generateCompare(effCompareLevel))} onResult={mode === 'adaptive' ? compareAdaptive.onResult : undefined} />
          )}
          {activity === 'line' && lineProblem && (
            <LineActivity key={lineProblem.targetStr + lineProblem.max} problem={lineProblem} level={effLineLevel} onNext={() => setLineProblem(generateLine(effLineLevel))} onResult={mode === 'adaptive' ? lineAdaptive.onResult : undefined} />
          )}
          {activity === 'line-read' && readProblem && (
            <LineReadActivity key={readProblem.targetStr + readProblem.max} problem={readProblem} level={readLevel} onNext={() => setReadProblem(generateLine(readLevel))} />
          )}
          {activity === 'order' && orderProblem && (
            <OrderActivity key={orderProblem.items.join()} problem={orderProblem} level={orderLevel} onNext={() => setOrderProblem(generateOrder(orderLevel))} />
          )}
        </div>
      </div>
    </AppShell>
  );
};

/* ===================== 共通: 数直線の描画 ===================== */

interface Mark { value: number; label: string; color: string; }
interface NumberLineProps {
  min: number; max: number; step: number; majorEvery: number;
  marks?: Mark[];
  interactive?: boolean;
  onPick?: (v: number) => void;
  pickedValue?: number | null;
  correctValue?: number | null; // 採点後に正解を強調
}

const NumberLine: React.FC<NumberLineProps> = ({ min, max, step, majorEvery, marks = [], interactive, onPick, pickedValue, correctValue }) => {
  const ticks = useMemo(() => lineTicks(min, max, step), [min, max, step]);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const isMajor = (i: number) => i % majorEvery === 0;

  return (
    <div className="relative w-full" style={{ height: 150 }}>
      {/* マーク（ピン） */}
      {marks.map((m, i) => (
        <div key={i} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(m.value)}%`, top: 8 }}>
          <span className="px-2 py-0.5 rounded-lg text-white font-black text-lg shadow" style={{ backgroundColor: m.color }}>{m.label}</span>
          <div className="w-0.5 h-6" style={{ backgroundColor: m.color }} />
        </div>
      ))}

      {/* 軸線 */}
      <div className="absolute left-0 right-0 h-1 bg-slate-700 rounded-full" style={{ top: 70 }} />

      {/* 目もり */}
      {ticks.map((t, i) => {
        const picked = pickedValue != null && Math.abs(pickedValue - t) < 1e-9;
        const correct = correctValue != null && Math.abs(correctValue - t) < 1e-9;
        return (
          <div key={i} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct(t)}%`, top: 70 }}>
            <div className={`${isMajor(i) ? 'h-5 w-1' : 'h-3 w-0.5'} ${correct ? 'bg-emerald-500' : 'bg-slate-500'}`} />
            {interactive && (
              <button
                onClick={() => onPick?.(t)}
                aria-label={`${t}`}
                className={`mt-1 rounded-full transition-all active:scale-90 ${
                  correct ? 'bg-emerald-500 ring-4 ring-emerald-200' :
                  picked ? 'bg-rose-400 ring-4 ring-rose-200' : 'bg-amber-400 hover:bg-amber-500'
                }`}
                style={{ width: 26, height: 26 }}
              />
            )}
            {isMajor(i) && (
              <span className={`mt-1 text-sm font-black ${t === (min + max) / 2 ? 'text-amber-600' : 'text-muted'}`}>{Number(t.toFixed(1))}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ===================== 大小くらべ ===================== */

const REL_LABEL: Record<string, string> = { '>': 'A は B より 大きい', '<': 'A は B より 小さい', '=': 'A と B は 等しい' };

export const CompareActivity: React.FC<{ pair: ComparePair; level: CompareLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ pair, level, onNext, onResult, onMiss }) => {
  const correct = relation(pair.aStr, pair.bStr);
  const a = Number(pair.aStr), b = Number(pair.bStr);
  const [picked, setPicked] = useState<'>' | '<' | '=' | null>(null);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'number-line',
    skillId: level,
    record: recordResult,
    abandonLabel: () => `${pair.aStr} ${correct} ${pair.bStr}`,
  });

  const maxVal = Math.max(a, b);
  const lineCfg = maxVal <= 1
    ? { min: 0, max: 1, step: 0.1, majorEvery: 5 }
    : { min: 0, max: Math.max(3, Math.ceil(maxVal)), step: 0.5, majorEvery: 2 };

  const verdict = correct === '='
    ? `${pair.aStr} と ${pair.bStr} は 同じ大きさだね。`
    : `${(correct === '>' ? pair.aStr : pair.bStr)} の ほうが 右にあるね。だから ${pair.aStr} ${correct} ${pair.bStr}。`;

  const choose = (r: '>' | '<' | '=') => {
    if (solved) return;
    setPicked(r);
    if (r === correct) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      rec.finish(`${pair.aStr} ${correct} ${pair.bStr}`);
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
    }
  };

  const btn = (r: '>' | '<' | '=') => {
    const isCorrect = solved && r === correct;
    const isWrong = picked === r && r !== correct;
    return (
      <button key={r} onClick={() => choose(r)} disabled={solved}
        className={`w-24 h-24 rounded-3xl text-5xl font-black shadow-md transition-all active:scale-95 ${
          isCorrect ? 'bg-emerald-500 text-white' : isWrong ? 'bg-rose-100 text-rose-400' : 'bg-surface border-2 border-line text-content hover:border-amber-400'
        }`}>{r}</button>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-8 md:p-12">
          {/* 式 */}
          <div className="flex items-center justify-center gap-4 md:gap-8 mb-8">
            <span className="text-5xl md:text-6xl font-black text-blue-600 tabular-nums">{pair.aStr}</span>
            <span className="w-16 h-16 rounded-2xl bg-surface-3 flex items-center justify-center text-4xl font-black text-faint">
              {solved ? correct : '?'}
            </span>
            <span className="text-5xl md:text-6xl font-black text-rose-500 tabular-nums">{pair.bStr}</span>
          </div>

          {!solved && (
            <>
              <p className="text-center text-muted font-bold mb-4">あてはまる しるしを えらぼう</p>
              <div className="flex justify-center gap-4 mb-2">{(['>', '=', '<'] as const).map(btn)}</div>
              {picked && picked !== correct && (
                <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2">
                  <Lightbulb className="text-amber-500 shrink-0 mt-0.5" size={20} />
                  <p className="text-content font-bold">
                    数直線で たしかめよう。
                    {correct === '='
                      ? `${pair.aStr} と ${pair.bStr} は 同じ 場所だよ。`
                      : `${correct === '>' ? pair.aStr : pair.bStr} の ほうが 右にある = 大きい よ。`}
                    下の 数直線を 見てね。
                  </p>
                </div>
              )}
            </>
          )}

          {/* 数直線（まちがえた後・正解後に表示） */}
          {(solved || (picked && picked !== correct)) && (
            <div className="mt-6">
              <NumberLine {...lineCfg} marks={[
                { value: a, label: pair.aStr, color: '#2563eb' },
                { value: b, label: pair.bStr, color: '#f43f5e' },
              ]} />
            </div>
          )}

          {solved && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">
                {verdict}
              </div>
              <div>
                <button onClick={onNext} className="mt-6 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===================== 数直線におく ===================== */

const LineActivity: React.FC<{ problem: LineProblem; level: LineLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const { target, targetStr, min, max, step, majorEvery } = problem;
  const [picked, setPicked] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'number-line',
    skillId: level,
    record: recordResult,
    abandonLabel: () => `${targetStr} を数直線に`,
  });

  const pick = (v: number) => {
    if (solved) return;
    setPicked(v);
    if (Math.abs(v - target) < 1e-9) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      rec.finish(`${targetStr} を数直線に`);
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
      const mid = (min + max) / 2;
      setHint(target < mid ? `まんなか(${Number(mid.toFixed(1))})より 左をさがそう。` : `まんなか(${Number(mid.toFixed(1))})より 右をさがそう。`);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-8 md:p-12">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2 className="text-2xl font-black text-content">
              <span className="text-amber-600 text-4xl tabular-nums">{targetStr}</span> は どこかな？
            </h2>
          </div>
          <p className="text-center text-muted font-bold mb-8">正しい 目もりの ●を タップしよう</p>

          <div className="px-2 md:px-6 py-4">
            <NumberLine min={min} max={max} step={step} majorEvery={majorEvery}
              interactive={!solved} onPick={pick} pickedValue={picked}
              correctValue={solved ? target : null}
              marks={solved ? [{ value: target, label: targetStr, color: '#10b981' }] : []}
            />
          </div>

          {!solved && hint && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2 justify-center">
              <Lightbulb className="text-amber-500 shrink-0" size={20} />
              <p className="text-muted font-bold">{hint}</p>
            </div>
          )}

          {solved && (
            <div className="text-center mt-4">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">
                せいかい！ {targetStr} は ここだね。
              </div>
              <div>
                <button onClick={onNext} className="mt-6 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===================== 数直線をよむ（数を答える） ===================== */

export const LineReadActivity: React.FC<{ problem: LineProblem; level: LineLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const { target, targetStr, min, max, step, majorEvery } = problem;
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'number-line',
    skillId: `line-read-${level}`,
    record: recordResult,
    abandonLabel: () => `${targetStr} をよむ`,
  });

  const submit = (v: string) => {
    if (solved) return;
    if (Math.abs(Number(v) - target) < 1e-9) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      rec.finish(`${targetStr} をよむ`);
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
      setHint(`◆の ところの めもりを よく見よう。${min} と ${max} の あいだだよ。`);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-8 md:p-12">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2 className="text-2xl font-black text-content">◆の めもりは いくつ？</h2>
          </div>
          <p className="text-center text-muted font-bold mb-8">数直線を よんで キーパッドで こたえてね</p>

          <div className="px-2 md:px-6 py-4">
            <NumberLine min={min} max={max} step={step} majorEvery={majorEvery}
              marks={[{ value: target, label: solved ? targetStr : '◆', color: solved ? '#10b981' : '#f59e0b' }]}
            />
          </div>

          {!solved && hint && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2 justify-center">
              <Lightbulb className="text-amber-500 shrink-0" size={20} />
              <p className="text-muted font-bold">{hint}</p>
            </div>
          )}

          {!solved ? (
            <div className="mt-6">
              <AnswerEntry onSubmit={submit} allowDecimal accentText="text-amber-600" />
            </div>
          ) : (
            <div className="text-center mt-4">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">
                せいかい！ ◆は {targetStr} だね。
              </div>
              <div>
                <button onClick={onNext} className="mt-6 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===================== ならべかえ ===================== */

export const OrderActivity: React.FC<{ problem: OrderProblem; level: OrderLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const { items, dir, sorted } = problem;
  const [placed, setPlaced] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'number-line',
    skillId: level,
    record: recordResult,
    abandonLabel: () => `${dirLabel}にならべる`,
  });

  const remaining = items.filter((it) => !placed.includes(it));
  const dirLabel = dir === 'asc' ? '小さい順（左がいちばん小さい）' : '大きい順（左がいちばん大きい）';

  const tap = (it: string) => {
    if (solved) return;
    if (it === sorted[placed.length]) {
      const next = [...placed, it];
      setPlaced(next);
      setHint(null);
      if (next.length === sorted.length) {
        setSolved(true);
        playClear();
        confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
        rec.finish(`${dirLabel}にならべる`);
        onResult?.(mistakes === 0);
      } else {
        playCorrect();
      }
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
      setHint(dir === 'asc'
        ? 'いちばん 小さい数から えらぼう。けたの 長さでなく、上の位から くらべてね。'
        : 'いちばん 大きい数から えらぼう。けたの 長さでなく、上の位から くらべてね。');
    }
  };

  const undo = () => {
    if (solved || placed.length === 0) return;
    setPlaced(placed.slice(0, -1));
    setHint(null);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2 className="text-2xl font-black text-content">{dirLabel}に ならべよう</h2>
          </div>
          <p className="text-center text-muted font-bold mb-6">小さい順／大きい順に なるよう カードを 左から タップ</p>

          {/* 並べた結果 */}
          <div className="flex flex-wrap items-center justify-center gap-2 min-h-[72px] mb-6 p-3 rounded-2xl bg-surface-2 border border-line">
            {placed.length === 0 && <span className="text-faint font-bold">ここに ならびます</span>}
            {placed.map((it, i) => (
              <React.Fragment key={it}>
                <span className="px-4 py-2 rounded-xl bg-amber-500 text-white font-black text-2xl tabular-nums shadow">{it}</span>
                {i < placed.length - 1 && <span className="text-muted font-black">›</span>}
              </React.Fragment>
            ))}
          </div>

          {!solved && (
            <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
              {remaining.map((it) => (
                <button key={it} onClick={() => tap(it)} className="px-5 py-4 rounded-2xl bg-surface border-2 border-line hover:border-amber-400 text-content font-black text-3xl tabular-nums shadow-sm transition-all active:scale-95">
                  {it}
                </button>
              ))}
            </div>
          )}

          {!solved && hint && (
            <div className="mt-2 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2 justify-center">
              <Lightbulb className="text-amber-500 shrink-0" size={20} />
              <p className="text-muted font-bold">{hint}</p>
            </div>
          )}

          {solved ? (
            <div className="text-center mt-4">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">せいかい！ ぜんぶ ならべられたね。</div>
              <div>
                <button onClick={onNext} className="mt-6 px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button>
              </div>
            </div>
          ) : (
            placed.length > 0 && (
              <div className="text-center">
                <button onClick={undo} className="inline-flex items-center gap-2 text-muted hover:text-content font-bold px-4 py-2 rounded-xl hover:bg-surface-3">
                  <X size={18} /> ひとつ もどす
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
