// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/ExpressModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * しきに あらわそう。2だんかいの場面を、( )を使って1つの式に表す。
 * カードを並べて式を自分で組み立て、そのあと答えも入れる（紙のテストと同じ「式と答え」）。
 */
import React, { useState } from 'react';
import { ScratchPadToggle, useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { EXPRESS_LEVELS, ExpressLevel, ExpressProblem, generateExpress, joinExpr, evalExpr } from '../../lib/problems';
import { ExprBuilder, type BuiltToken } from '../shared/ExprBuilder';
import { AnswerEntry } from '../shared/AnswerEntry';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = EXPRESS_LEVELS.map((l) => l.id);

export const ExpressModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<ExpressLevel>('express-money');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<ExpressLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="しきに あらわそう" subtitle="2つの場面を、( )を使って 1つの しきに" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {EXPRESS_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-amber-400"
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
    <AppShell title="しきに あらわそう" subtitle={EXPRESS_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <ExpressRound
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

export const ExpressRound: React.FC<{
  level: ExpressLevel;
  problem?: ExpressProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
  /**
   * 'build'（ふだん）: カードで式を組み立ててから、答えも入れる（紙のテストと同じ「式と答え」）。
   * 'choose'（ボス戦）: 時間制限があるので、式を4択で選ぶ。
   */
  mode?: 'build' | 'choose';
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel, mode = 'build' }) => {
  const [problem] = useState<ExpressProblem>(() => given ?? generateExpress(level));
  const [stage, setStage] = useState<'expr' | 'answer' | 'done'>('expr');
  const [mistakes, setMistakes] = useState(0);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [tokens, setTokens] = useState<BuiltToken[]>([]);
  const [hint, setHint] = useState<{ text: string; tone: 'hint' | 'wrong' } | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'express', skillId: level, record: recordResult });
  const correctExpr = problem.choices[problem.correctIndex];

  const miss = (text: string) => {
    playSoftTry();
    setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
    setHint({ text, tone: 'wrong' });
  };

  const finish = (answerText: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(answerText);
    onResult?.(mistakes === 0);
    setHint(null);
    setStage('done');
  };

  // 4択（ボス戦）
  const choose = (i: number) => {
    if (i === problem.correctIndex) finish(correctExpr);
    else { setPickedWrong(i); miss('もう一度、場面を よく 読んで、どこを ( )で まとめるか 考えよう。'); }
  };

  // 組み立てた式を判定する
  const submitExpr = () => {
    const ts = tokens.map((t) => t.text);
    if (problem.accept.includes(joinExpr(ts))) {
      playClear();
      setHint({ text: 'しきは せいかい！ こんどは その しきを 計算して、答えを 入れよう。', tone: 'hint' });
      setStage('answer');
      return;
    }
    const usedCards = tokens.filter((t) => t.card !== null).length;
    const value = evalExpr(ts);
    if (value === null) return miss('しきに なっていないよ。数と 記号が じゅんばんに ならんでいるか、( )が 2つで 1組に なっているか 見よう。');
    if (usedCards < problem.cards.length) return miss('使っていない 数が あるよ。場面に 出てくる 数を ぜんぶ 使って 1つの しきに しよう。');
    if (value === problem.answerValue) {
      return miss(level === 'express-mixed'
        ? '答えは 合っているね。でも「1ふくろの 数 × ふくろの 数」の じゅんに 書こう。'
        : '答えは 合っているね。でも ( )を つかって、先に まとめる ところを 1つの まとまりに しよう。');
    }
    miss('もう一度、場面を よく 読んで、どこを ( )で まとめるか 考えよう。');
  };

  const submitAnswer = (v: string) => {
    if (Number(v) === problem.answerValue) finish(`${correctExpr} ＝ ${problem.answerValue}${problem.unit}`);
    else miss('しきの とおりに、( )の中 → ×÷ → ＋－ の じゅんで 計算しよう。');
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <p className="text-lg md:text-xl font-black text-content leading-relaxed">{problem.text}</p>
          {mode === 'build' && stage === 'answer' && (
            <p className="mt-4 text-2xl font-black tabular-nums text-amber-600 text-center">{correctExpr} ＝ □{problem.unit}</p>
          )}
        </div>

        {hint && <HintBox tone={hint.tone}>{hint.text}</HintBox>}

        {stage === 'expr' && mode === 'choose' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => choose(i)}
                className={`p-5 rounded-2xl border-2 text-xl font-black tabular-nums transition-all active:scale-[0.98] text-center ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-amber-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'expr' && mode === 'build' && (
          <ExprBuilder cards={problem.cards} tokens={tokens} onChange={setTokens} onSubmit={submitExpr} />
        )}

        {stage === 'answer' && (
          <div className="space-y-2">
            <p className="text-center font-bold text-muted">答え（{problem.unit}）</p>
            <AnswerEntry onSubmit={submitAnswer} allowDecimal={false} accentText="text-amber-600" />
            {/* 組み立てた式には 170×6 や 110×4＋210×6 のような 暗算では むずかしい計算が出るので、
                ほかの問題と同じ「けいさんらん」（筆算）を置く。数は子どもが自分で入れる */}
            <ScratchPadToggle ops={['×', '+', '-', '÷']} decimal={false} />
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-amber-500 hover:bg-amber-600"
          />
        )}
      </div>
    </div>
  );
};
