// このファイルは単元アプリ syo4-bainomikata の src/components/modules/WordProblemModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * ことばの もんだい（倍の見方の文章題）モジュール。
 * ①どんな関係（何倍／比較量／基準量の どれを求めるか）かを 選択肢から選ぶ →
 * ②計算する、の2段階入力。割合で くらべる文章題（wp-ratio）だけは
 * 「Aの倍→Bの倍→どちらが大きいか」の流れになる。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Check, Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { WORD_LEVELS, WordLevel, BaiWordProblem, generateWord } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = WORD_LEVELS.map((l) => l.id);

export const WordProblemModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<WordLevel>('wp-times');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<WordLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="ことばの もんだい" subtitle="どんな関係かな？ → しき → 計算" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {WORD_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-teal-400"
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
    <AppShell title="ことばの もんだい" subtitle={WORD_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <WordRound
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

export const WordRound: React.FC<{
  level: WordLevel;
  problem?: BaiWordProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<BaiWordProblem>(() => given ?? generateWord(level));
  const isRatio = problem.kind === 'ratio';
  const [stage, setStage] = useState<'shiki' | 'calc' | 'timesA' | 'timesB' | 'judge' | 'done'>(isRatio ? 'timesA' : 'shiki');
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [pickedJudge, setPickedJudge] = useState<'A' | 'B' | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'word-problem', skillId: level, record: recordResult });

  const finish = () => {
    playClear();
    confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
    rec.finish(problem.text.slice(0, 18) + '…');
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const chooseShiki = (i: number) => {
    if (i === problem.correctIndex) {
      playCorrect();
      setPickedWrong(null);
      setHint(problem.why);
      setStage('calc');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint('ようすを 思いうかべよう。「もとにする量」と「くらべられる量」の どちらを 求めるかで、しきが 決まるよ。');
    }
  };

  const submitCalc = (v: string) => {
    if (Number(v) === problem.finalAnswer) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`しきは ${problem.choices![problem.correctIndex!]} だね。ていねいに 計算してみよう。`);
    }
  };

  const submitTimesA = (v: string) => {
    if (Number(v) === problem.timesA) {
      playCorrect();
      setHint(null);
      setStage('timesB');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`${problem.pair?.itemA}は ${problem.beforeA}${problem.pair?.unit} → ${problem.afterA}${problem.pair?.unit}。あと ÷ まえ で 倍を もとめよう。`);
    }
  };

  const submitTimesB = (v: string) => {
    if (Number(v) === problem.timesB) {
      playCorrect();
      setHint(problem.why);
      setStage('judge');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`${problem.pair?.itemB}は ${problem.beforeB}${problem.pair?.unit} → ${problem.afterB}${problem.pair?.unit}。あと ÷ まえ で 倍を もとめよう。`);
    }
  };

  const chooseJudge = (label: 'A' | 'B') => {
    if (label === (problem.answerLabel ?? problem.biggerLabel)) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedJudge(label);
      setHint(`倍の 大きさで くらべよう。${problem.pair?.itemA}は ${problem.timesA}倍、${problem.pair?.itemB}は ${problem.timesB}倍。今回 きかれているのは 変化が ${problem.askSmaller ? '小さい' : '大きい'}方だよ。`);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* おはなし */}
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="text-5xl shrink-0">{problem.emoji}</span>
            <p className="text-xl md:text-2xl font-black text-content leading-relaxed flex-1">{problem.text}</p>
          </div>
        </div>

        {hint && <HintBox tone={(pickedWrong !== null && stage === 'shiki') || pickedJudge ? 'wrong' : 'hint'}>{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['×', '÷']} decimal={false} />

        {!isRatio && stage === 'shiki' && (
          <div>
            <p className="text-center text-muted font-black mb-3">どの「しき」に なるかな？</p>
            <div className="grid grid-cols-1 gap-3">
              {problem.choices!.map((c, i) => (
                <button
                  key={i}
                  onClick={() => chooseShiki(i)}
                  className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
                    pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-brand'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isRatio && stage === 'calc' && (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <Check className="text-emerald-500" size={22} />
              <p className="text-center text-content font-black text-xl tabular-nums">しき：{problem.choices![problem.correctIndex!]}</p>
            </div>
            <p className="text-center text-muted font-bold mb-3">{problem.finalPrompt}（たんい：{problem.finalUnit}）</p>
            <AnswerEntry onSubmit={submitCalc} allowDecimal={false} accentText="text-teal-600" />
          </div>
        )}

        {isRatio && stage === 'timesA' && (
          <div>
            <p className="text-center text-muted font-black mb-3">{problem.pair?.itemA}は もとの 何倍に なりましたか？</p>
            <AnswerEntry onSubmit={submitTimesA} allowDecimal={false} accentText="text-teal-600" />
          </div>
        )}

        {isRatio && stage === 'timesB' && (
          <div>
            <p className="text-center text-muted font-black mb-3">{problem.pair?.itemB}は もとの 何倍に なりましたか？</p>
            <AnswerEntry onSubmit={submitTimesB} allowDecimal={false} accentText="text-teal-600" />
          </div>
        )}

        {isRatio && stage === 'judge' && (
          <div>
            <p className="text-center text-content font-black text-xl mb-4">変化の しかたが {problem.askSmaller ? '小さい' : '大きい'}のは どちら？</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => chooseJudge('A')} className={`flex items-center gap-2 px-8 py-5 rounded-2xl border-2 font-black text-xl active:scale-95 transition-all ${pickedJudge === 'A' ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-teal-400'}`}>
                {problem.pair?.emojiA} {problem.pair?.itemA}
              </button>
              <button onClick={() => chooseJudge('B')} className={`flex items-center gap-2 px-8 py-5 rounded-2xl border-2 font-black text-xl active:scale-95 transition-all ${pickedJudge === 'B' ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-teal-400'}`}>
                {problem.pair?.emojiB} {problem.pair?.itemB}
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.finalWhy}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-teal-500 hover:bg-teal-600"
          />
        )}
      </div>
    </div>
  );
};
