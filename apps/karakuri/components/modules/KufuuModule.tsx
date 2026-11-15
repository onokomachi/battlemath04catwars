// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/KufuuModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * くふう けいさん。分配法則・交換法則・結合法則を使って らくに計算する。
 * 「どう くふうするか」を選ぶ（transform）／「くふうした形で」計算する（compute）／
 * 「□にあてはまる数」で きまりを一般化する（blank）の3つの出題形式を持つ。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { KUFUU_LEVELS, KufuuLevel, KufuuProblem, generateKufuu } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = KUFUU_LEVELS.map((l) => l.id);

export const KufuuModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<KufuuLevel>('kufuu-distribute');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<KufuuLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="くふう けいさん" subtitle="交換・結合・分配の きまりで らくに 計算しよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {KUFUU_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-violet-400"
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
    <AppShell title="くふう けいさん" subtitle={KUFUU_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <KufuuRound
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

export const KufuuRound: React.FC<{
  level: KufuuLevel;
  problem?: KufuuProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<KufuuProblem>(() => given ?? generateKufuu(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'kufuu', skillId: level, record: recordResult });

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const choose = (i: number) => {
    if (problem.kind !== 'transform') return;
    if (i === problem.correctIndex) finish(problem.choices[problem.correctIndex]);
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint('もう一度、どちらの 数どうしを 組み合わせると らくか 考えよう。');
    }
  };

  const submitBlank = (v: string) => {
    if (problem.kind !== 'blank') return;
    if (Number(v) === problem.blankAnswer) finish(problem.exprLeft);
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint('きまりが 成り立つように、両がわの しきを くらべてみよう。');
    }
  };

  const submitCompute = (v: string) => {
    if (problem.kind !== 'compute') return;
    if (Number(v) === problem.answer) finish(problem.text);
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.explain);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {problem.kind === 'transform' && <p className="text-lg md:text-xl font-black text-content leading-relaxed">{problem.text}</p>}
          {problem.kind === 'blank' && (
            <>
              <p className="text-muted font-bold mb-2">□に あてはまる 数を 入れよう</p>
              <div className="text-3xl md:text-4xl font-black text-content tabular-nums tracking-wide">
                {problem.exprLeft} ＝ {problem.exprRight}
              </div>
            </>
          )}
          {problem.kind === 'compute' && <p className="text-lg md:text-xl font-black text-content leading-relaxed">{problem.text}</p>}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['+', '-', '×', '÷']} decimal={false} />

        {stage === 'answer' && problem.kind === 'transform' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => choose(i)}
                className={`p-5 rounded-2xl border-2 text-xl font-black tabular-nums transition-all active:scale-[0.98] text-center ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-violet-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {stage === 'answer' && problem.kind === 'blank' && (
          <AnswerEntry onSubmit={submitBlank} allowDecimal={false} accentText="text-violet-600" />
        )}
        {stage === 'answer' && problem.kind === 'compute' && (
          <AnswerEntry onSubmit={submitCompute} allowDecimal={problem.allowDecimal} accentText="text-violet-600" />
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-violet-500 hover:bg-violet-600"
          />
        )}
      </div>
    </div>
  );
};
