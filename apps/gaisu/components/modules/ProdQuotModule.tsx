// このファイルは単元アプリ syo4-gaisu の src/components/modules/ProdQuotModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * かけ算・わり算の見積もり モジュール。
 * 「上から1けたの がい数にしてから 計算する」見積もりの手順を、
 * 見積もりの式（□を順番にうめる）→ 見積もりの答え、の流れで身につける。
 * 文章題レベルでは 実さいの代金を 見積もる 力まで つなげる。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { PRODQUOT_LEVELS, ProdQuotLevel, ProdQuotProblem, generateProdQuot } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = PRODQUOT_LEVELS.map((l) => l.id);

export const ProdQuotModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<ProdQuotLevel>('prodquot-mul');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<ProdQuotLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="かけ算・わり算の 見積もり" subtitle="上から1けたの がい数にしてから 計算しよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {PRODQUOT_LEVELS.map((l) => (
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
    <AppShell title="かけ算・わり算の 見積もり" subtitle={PRODQUOT_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <ProdQuotRound
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

export const ProdQuotRound: React.FC<{
  level: ProdQuotLevel;
  problem?: ProdQuotProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<ProdQuotProblem>(() => given ?? generateProdQuot(level));
  const [filled, setFilled] = useState<number[]>([]);
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'prodquot', skillId: level, record: recordResult });

  const blanks = [problem.roundedA, problem.roundedB, problem.answer];
  const labels = [`${problem.a}のがい数`, `${problem.b}のがい数`, '見積もりの答え'];
  const current = filled.length;
  const opSymbol = problem.kind === 'div' ? '÷' : '×';

  const finish = () => {
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(`${problem.op} ≒ ${problem.answer}${problem.finalUnit ?? ''}`);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submit = (v: string) => {
    if (Number(v) === blanks[current]) {
      playCorrect();
      const next = [...filled, Number(v)];
      setFilled(next);
      setHint(null);
      if (next.length === blanks.length) finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const Slot: React.FC<{ index: number }> = ({ index }) => {
    const isFilled = index < filled.length;
    const isActive = index === current;
    return (
      <span
        className={`inline-flex items-center justify-center min-w-[4.5rem] h-14 px-2 mx-1 rounded-xl border-2 text-2xl font-black tabular-nums align-middle ${
          isFilled ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : isActive ? 'border-brand bg-surface-2 text-brand animate-pulse' : 'border-dashed border-line text-faint'
        }`}
      >
        {isFilled ? filled[index] : '□'}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {problem.text ? (
            <div className="flex items-start gap-3 text-left mb-4">
              <span className="text-4xl shrink-0">{problem.emoji}</span>
              <p className="text-lg font-black text-content leading-relaxed flex-1">{problem.text}</p>
            </div>
          ) : (
            <p className="text-sm font-black text-faint mb-2">上から1けたの がい数にして、見積もりの式を つくろう</p>
          )}
          <div className="text-3xl md:text-4xl font-black text-content tabular-nums tracking-wide mb-4">{problem.op}</div>
          <div className="bg-surface-2 border border-line rounded-2xl p-4 text-xl md:text-2xl font-black text-content tabular-nums leading-loose">
            <Slot index={0} /> {opSymbol} <Slot index={1} /> ＝ <Slot index={2} />{problem.finalUnit}
          </div>
          {stage === 'answer' && <p className="text-muted font-bold mt-3">いま うめるのは「{labels[current]}」だよ</p>}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['×', '÷', '+', '-']} decimal={false} />

        {stage === 'answer' && (
          <AnswerEntry onSubmit={submit} allowDecimal={false} submitLabel="□に 入れる" accentText="text-cyan-600" />
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-cyan-500 hover:bg-cyan-600"
          />
        )}
      </div>
    </div>
  );
};
