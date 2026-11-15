// このファイルは単元アプリ wari-hissann3 の src/components/modules/CheckModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * たしかめ算（検算）モジュール。
 * 「わる数 × 商 ＋ あまり ＝ わられる数」の式を、□を順番にうめて完成させる。
 * 答えの確かめの習慣（テスト頻出）を身につける。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { QuotRemEntry } from '../shared/QuotRemEntry';
import { ScratchPad } from 'learning-app-kit/react';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { CHECK_LEVELS, CheckLevel, CheckProblem, generateCheck } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = CHECK_LEVELS.map((l) => l.id);

export const CheckModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<CheckLevel>('check-nodiv');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<CheckLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="たしかめ算" subtitle="わる数 × 商 ＋ あまり ＝ わられる数" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {CHECK_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-emerald-400"
              onClick={() => { setLevel(l.id); setRound((r) => r + 1); setMode('level'); }}
            />
          ))}
        </div>
        <button
          onClick={() => { setRound((r) => r + 1); setMode('auto'); }}
          className="w-full p-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Wand2 size={22} /> おまかせモード（じどうで レベルアップ）
        </button>
      </SetupScreen>
    );
  }

  const activeLevel = mode === 'auto' ? adaptive.level : level;

  return (
    <AppShell title="たしかめ算" subtitle={CHECK_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <CheckRound
            key={`${activeLevel}-${round}`}
            level={activeLevel}
            onNext={() => setRound((r) => r + 1)}
            onResult={mode === 'auto' ? adaptive.onResult : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
};

export const CheckRound: React.FC<{
  level: CheckLevel;
  problem?: CheckProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<CheckProblem>(() => given ?? generateCheck(level));
  const [filled, setFilled] = useState<number[]>([]);
  const [stage, setStage] = useState<'answer' | 'second' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [showScratch, setShowScratch] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'check', skillId: level, record: recordResult });

  const hasRem = problem.remainder > 0;
  const isFindNum = problem.kind === 'findnum';
  const isShiki = problem.variant === 'shiki';
  const current = filled.length;

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(isFindNum
        ? `ある数÷${problem.secondDivisor} を もとめる`
        : `${problem.dividend} ÷ ${problem.divisor} の たしかめ`);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submit = (v: string) => {
    if (Number(v) === problem.blanks[current]) {
      const next = [...filled, Number(v)];
      setFilled(next);
      setHint(null);
      if (next.length === problem.blanks.length) {
        if (isFindNum) {
          playCorrect();
          setHint(`ある数は ${problem.dividend}！ では ${problem.dividend} ÷ ${problem.secondDivisor} を 計算しよう。`);
          setStage('second');
        } else {
          finish();
        }
      } else {
        playCorrect();
      }
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const submitSecond = (q: string, r: string) => {
    const okQ = Number(q) === problem.secondQuotient;
    const okR = Number(r || '0') === problem.secondRemainder;
    if (okQ && okR) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`${problem.dividend} ÷ ${problem.secondDivisor} を 筆算で ていねいに 計算しよう。わりきれないときは あまりも 答えてね。`);
    }
  };

  /** 空らん（□）の表示。今うめる場所は強調する */
  const Slot: React.FC<{ index: number }> = ({ index }) => {
    const isFilled = index < filled.length;
    const isActive = index === current && stage === 'answer';
    return (
      <span
        className={`inline-flex items-center justify-center min-w-[3.2rem] h-14 px-2 mx-1 rounded-xl border-2 text-3xl font-black tabular-nums align-middle ${
          isFilled
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : isActive
              ? 'border-brand bg-surface-2 text-brand animate-pulse'
              : 'border-dashed border-line text-faint'
        }`}
      >
        {isFilled ? filled[index] : '□'}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        {/* 出題カード */}
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {isFindNum ? (
            <>
              <p className="text-xl md:text-2xl font-black text-content leading-relaxed mb-4">
                ある数を {problem.divisor} でわったら、商が {problem.quotient} で あまりは {problem.remainder} に なりました。この数を {problem.secondDivisor} でわったときの 答えを もとめましょう。
              </p>
              {/* けん算の式で「ある数」をもとめる */}
              <div className="bg-surface-2 border border-line rounded-2xl p-4 text-2xl md:text-3xl font-black text-content tabular-nums leading-loose">
                {problem.divisor} × {problem.quotient} ＋ {problem.remainder} ＝ <Slot index={0} />
              </div>
              {stage === 'answer' && (
                <p className="text-muted font-bold mt-3">まず けん算の式で「ある数」を もとめよう</p>
              )}
              {stage === 'second' && (
                <p className="text-content font-black text-2xl tabular-nums mt-3">{problem.dividend} ÷ {problem.secondDivisor} ＝ ？</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-black text-faint mb-2">
                {isShiki ? 'この わり算の けん算の式を 書きましょう' : 'この計算が 合っているか、たしかめ算で かくにんしよう'}
              </p>
              <div className="text-4xl md:text-5xl font-black text-content tabular-nums tracking-wide mb-4">
                {problem.dividend} ÷ {problem.divisor} = {problem.quotient}{hasRem ? ` あまり ${problem.remainder}` : ''}
              </div>
              {/* たしかめの式（□を順番にうめる） */}
              <div className="bg-surface-2 border border-line rounded-2xl p-4 text-2xl md:text-3xl font-black text-content tabular-nums leading-loose">
                {isShiki ? (
                  <>
                    <Slot index={0} /> × {problem.quotient} ＋ <Slot index={1} /> ＝ <Slot index={2} />
                  </>
                ) : (
                  <>
                    {problem.divisor} × <Slot index={0} />
                    {hasRem && <> ＋ <Slot index={1} /></>}
                    {' '}＝ <Slot index={hasRem ? 2 : 1} />
                  </>
                )}
              </div>
              {stage === 'answer' && (
                <p className="text-muted font-bold mt-3">
                  いま うめるのは 「{problem.blankLabels[current]}」 の □ だよ
                </p>
              )}
            </>
          )}
        </div>

        {hint && <HintBox tone={stage === 'second' && mistakes === 0 ? 'hint' : 'wrong'}>{hint}</HintBox>}

        {stage === 'answer' && (
          <AnswerEntry onSubmit={submit} allowDecimal={false} submitLabel="□に 入れる" accentText="text-emerald-600" />
        )}

        {stage === 'second' && (
          <>
            <div className="text-center mb-3">
              <button
                onClick={() => setShowScratch((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-black text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-all"
              >
                {showScratch ? '📝 けいさんらんを とじる' : '📝 筆算で けいさんする'}
              </button>
            </div>
            {showScratch && problem.secondDivisor != null && (
              <div className="mb-3">
                <ScratchPad ops={['÷', '×', '-', '+']} decimal={false} initial={{ op: '÷', a: String(problem.dividend), b: String(problem.secondDivisor) }} />
              </div>
            )}
            <QuotRemEntry withRemainder onSubmit={submitSecond} />
          </>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={
              isFindNum ? (
                <span className="tabular-nums">
                  ある数 ＝ {problem.divisor} × {problem.quotient} ＋ {problem.remainder} ＝ {problem.dividend}。{problem.dividend} ÷ {problem.secondDivisor} ＝ {problem.secondQuotient}{(problem.secondRemainder ?? 0) > 0 ? ` あまり ${problem.secondRemainder}` : ''}！
                </span>
              ) : (
                <span className="tabular-nums">
                  {problem.divisor} × {problem.quotient}{hasRem ? ` ＋ ${problem.remainder}` : ''} ＝ {problem.dividend} で ピッタリ！
                </span>
              )
            }
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-emerald-500 hover:bg-emerald-600"
          />
        )}
      </div>
    </div>
  );
};
