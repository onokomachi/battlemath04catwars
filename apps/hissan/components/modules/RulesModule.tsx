// このファイルは単元アプリ wari-hissann3 の src/components/modules/RulesModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * わり算のきまりモジュール。
 * 「わられる数と わる数に 同じ数を かけても（同じ数で わっても）商は 変わらない」を、
 * 何十÷何十 → 何百÷何百 → あまりの10倍注意 → □うめ の順で身につける。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { QuotRemEntry } from '../shared/QuotRemEntry';
import { AnswerEntry } from '../shared/AnswerEntry';
import { ScratchPad } from 'learning-app-kit/react';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { RULES_LEVELS, RulesLevel, RulesProblem, generateRules } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = RULES_LEVELS.map((l) => l.id);

export const RulesModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<RulesLevel>('rules-tens');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<RulesLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="わり算のきまり" subtitle="10や100の まとまりで うまく 計算しよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {RULES_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-cyan-400"
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
    <AppShell title="わり算のきまり" subtitle={RULES_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <RulesRound
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

export const RulesRound: React.FC<{
  level: RulesLevel;
  problem?: RulesProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<RulesProblem>(() => given ?? generateRules(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [pickedMulti, setPickedMulti] = useState<number[]>([]);
  const [showScratch, setShowScratch] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'rules', skillId: level, record: recordResult });
  const withRemainder = problem.kind === 'calc' && problem.remainder > 0;
  const MULTI_LABELS = ['ア', 'イ', 'ウ', 'エ'];

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submitCalc = (q: string, r: string) => {
    const okQ = Number(q) === problem.quotient;
    const okR = !withRemainder || Number(r || '0') === problem.remainder;
    if (okQ && okR) {
      finish(`${problem.dividend} ÷ ${problem.divisor}`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const submitBlank = (v: string) => {
    if (Number(v) === problem.blankAnswer) {
      finish(`${problem.exprLeft} ＝ ${problem.exprRight}`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const chooseOne = (i: number) => {
    if (i === problem.answerIndex) {
      finish(`${problem.dividend} ÷ ${problem.divisor}`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint(problem.hint);
    }
  };

  const toggleMulti = (i: number) => {
    setPickedMulti((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : prev.length >= 2 ? prev : [...prev, i]));
  };

  const submitMulti = () => {
    const want = problem.answerIndices ?? [];
    const got = [...pickedMulti].sort((a, b) => a - b);
    if (got.length === want.length && got.every((x, i) => x === want[i])) {
      finish(`${problem.dividend} ÷ ${problem.divisor} と 商が等しい式`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {problem.kind === 'calc' && (
            <>
              <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">
                {problem.dividend} ÷ {problem.divisor}
              </div>
              {level === 'rules-rem' && <p className="text-muted font-bold mt-3">あまりの 大きさに 気をつけて！</p>}
              {level === 'rules-kufu' && <p className="text-muted font-bold mt-3">0を消す くふうで 計算しよう。あまりに 気をつけて！</p>}
            </>
          )}
          {problem.kind === 'blank' && (
            <>
              <p className="text-muted font-bold mb-2">商が 同じに なるように、□に あてはまる数を 入れよう</p>
              <div className="text-4xl md:text-5xl font-black text-content tabular-nums tracking-wide">
                {problem.exprLeft} ＝ {problem.exprRight}
              </div>
            </>
          )}
          {(problem.kind === 'choice' || problem.kind === 'multi') && (
            <>
              <div className="text-4xl md:text-5xl font-black text-content tabular-nums tracking-wider mb-3">
                {problem.dividend} ÷ {problem.divisor}
              </div>
              <p className="text-lg md:text-xl font-black text-content leading-relaxed">{problem.text}</p>
            </>
          )}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && problem.kind === 'calc' && (
          <div className="text-center">
            <button
              onClick={() => setShowScratch((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-black text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-all"
            >
              {showScratch ? '📝 けいさんらんを とじる' : '📝 筆算で けいさんする'}
            </button>
          </div>
        )}
        {stage === 'answer' && problem.kind === 'calc' && showScratch && (
          <ScratchPad ops={['÷', '×', '-', '+']} decimal={false} initial={{ op: '÷', a: String(problem.dividend), b: String(problem.divisor) }} />
        )}

        {stage === 'answer' && problem.kind === 'calc' && (
          <QuotRemEntry withRemainder={withRemainder} onSubmit={submitCalc} />
        )}
        {stage === 'answer' && problem.kind === 'blank' && (
          <AnswerEntry onSubmit={submitBlank} allowDecimal={false} accentText="text-cyan-600" />
        )}
        {stage === 'answer' && problem.kind === 'choice' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices!.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseOne(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-cyan-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {stage === 'answer' && problem.kind === 'multi' && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {problem.choices!.map((c, i) => (
                <button
                  key={i}
                  onClick={() => toggleMulti(i)}
                  className={`p-5 rounded-2xl border-2 text-xl font-black tabular-nums transition-all active:scale-[0.98] flex items-center gap-3 ${
                    pickedMulti.includes(i)
                      ? 'bg-cyan-500 border-cyan-500 text-white shadow-lg'
                      : 'bg-surface border-line text-content hover:border-cyan-400'
                  }`}
                >
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${pickedMulti.includes(i) ? 'bg-white/25' : 'bg-surface-3 text-muted'}`}>
                    {MULTI_LABELS[i]}
                  </span>
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={submitMulti}
              disabled={pickedMulti.length !== 2}
              className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
                pickedMulti.length === 2 ? 'bg-cyan-500 hover:bg-cyan-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
              }`}
            >
              この2つで こたえる
            </button>
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={
              problem.explain
                ? <span>{problem.explain}</span>
                : problem.kind === 'calc'
                  ? <span className="tabular-nums">{problem.dividend} ÷ {problem.divisor} = {problem.quotient}{problem.remainder > 0 ? ` あまり ${problem.remainder}` : ''}</span>
                  : <span className="tabular-nums">{problem.exprLeft} ＝ {problem.exprRight?.replace('□', String(problem.blankAnswer))}</span>
            }
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-cyan-500 hover:bg-cyan-600"
          />
        )}
      </div>
    </div>
  );
};
