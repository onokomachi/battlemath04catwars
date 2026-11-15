// このファイルは単元アプリ syo4-bainomikata の src/components/modules/BaseModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * もとにする量を もとめるモジュール（テスト大問3に対応）。
 * くらべられる量 ÷ 倍 ＝ もとにする量。
 *
 * 図 →「□を使ったかけ算の関係式に表す」→ 式 → 答え の4段階。
 * 関係式（□×5＝750）を経由させるのが要で、ここを飛ばすと「もとにする量は÷でよい」という
 * 手つづきの暗記だけが残り、5年「割合」でつまずきやすくなる。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { DoubleNumberLine } from '../shared/DoubleNumberLine';
import { DiagramFillStage } from '../shared/DiagramFillStage';
import { ChoiceStage } from '../shared/ChoiceStage';
import { RoundFocus } from '../shared/roundTypes';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { BASE_LEVELS, BaseLevel, BaseBaseProblem, generateBase, buildShikiChoices } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = BASE_LEVELS.map((l) => l.id);

export const BaseModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<BaseLevel>('base-basic');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<BaseLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="もとにする量を もとめる" subtitle="くらべられる量 ÷ 倍 ＝ もとにする量" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {BASE_LEVELS.map((l) => (
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
    <AppShell title="もとにする量を もとめる" subtitle={BASE_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <BaseRound
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

export const BaseRound: React.FC<{
  level: BaseLevel;
  problem?: BaseBaseProblem;
  focus?: RoundFocus;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, focus = 'full', onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<BaseBaseProblem>(() => given ?? generateBase(level));
  const stages = useMemo<RoundFocus[]>(
    () => (focus === 'full' ? ['diagram', 'relation', 'shiki', 'answer'] : [focus]),
    [focus]
  );
  const [stageIdx, setStageIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'base', skillId: level, record: recordResult });

  const { base, times, compare, scene } = problem;
  const relation = useMemo(() => buildShikiChoices('relation', base, times, compare), [base, times, compare]);
  const shiki = useMemo(() => buildShikiChoices('base', base, times, compare), [base, times, compare]);
  const isDone = stageIdx >= stages.length;
  const stage = stages[stageIdx];

  const miss = (h: string) => { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(h); };

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(`${compare} ÷ ${times}`);
    onResult?.(mistakes === 0);
    setStageIdx(stages.length);
  };

  const advance = () => {
    setHint(null);
    if (stageIdx + 1 >= stages.length) finish();
    else { playCorrect(); setStageIdx(stageIdx + 1); }
  };

  const submitAnswer = (v: string) => {
    if (Number(v) === base) advance();
    else miss(problem.hint);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="text-4xl shrink-0">{scene.emoji}</span>
            <p className="text-lg md:text-xl font-black text-content leading-relaxed flex-1">
              {scene.compareName}の{scene.measure}は {compare}{scene.unit}で、{scene.baseName}の {times}倍に あたります。{scene.baseName}の{scene.measure}は 何{scene.unit}ですか？
            </p>
          </div>
        </div>

        {stage === 'diagram' ? (
          <DiagramFillStage
            baseLabel={scene.baseName}
            compareLabel={scene.compareName}
            times={times}
            given={{ baseValue: '□', timesTick: String(times) }}
            blanks={[
              {
                key: 'compareValue', value: compare, display: `${compare}${scene.unit}`,
                prompt: `${scene.compareName}の${scene.measure}を 図の 上の □ に 書こう`,
                hint: `${scene.compareName}の${scene.measure}は もんだい文に 書いてあるよ。`,
              },
              {
                key: 'baseTick', value: 1, display: '1',
                prompt: `${scene.baseName}を「いくつ」と みますか？ 下の 目もりの □ に 書こう`,
                hint: 'もとにする量は いつも「1」と みるよ。',
              },
            ]}
            onComplete={advance}
            onMistake={() => setMistakes((m) => m + 1)}
            accentText="text-violet-600"
          />
        ) : (
          <>
            <div className="bg-surface border border-line rounded-[28px] shadow-lg p-5 md:p-6">
              <DoubleNumberLine
                baseLabel={scene.baseName}
                compareLabel={scene.compareName}
                times={times}
                compareValue={`${compare}${scene.unit}`}
                baseValue={isDone ? `${base}${scene.unit}` : '□'}
                baseTick="1"
                timesTick={String(times)}
              />
            </div>

            {hint && <HintBox tone="wrong">{hint}</HintBox>}


            {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

            <ScratchPadToggle ops={['×', '÷']} decimal={false} />

            {stage === 'relation' && (
              <ChoiceStage
                prompt={`${scene.baseName}の${scene.measure}を □${scene.unit} として、かけ算の しきに 表しましょう`}
                choices={relation.choices}
                correctIndex={relation.correctIndex}
                hint={relation.hint}
                onCorrect={advance}
                onMistake={() => setMistakes((m) => m + 1)}
                accentBorder="hover:border-violet-400"
              />
            )}

            {stage === 'shiki' && (
              <ChoiceStage
                prompt={`□ × ${times} ＝ ${compare} です。□ を もとめる しきは？`}
                choices={shiki.choices}
                correctIndex={shiki.correctIndex}
                hint={shiki.hint}
                onCorrect={advance}
                onMistake={() => setMistakes((m) => m + 1)}
                accentBorder="hover:border-violet-400"
              />
            )}

            {stage === 'answer' && (
              <div>
                <p className="text-center text-muted font-black mb-3">しき □ ＝ {compare} ÷ {times} の 答えは？</p>
                <AnswerEntry onSubmit={submitAnswer} allowDecimal={false} accentText="text-violet-600" />
              </div>
            )}
          </>
        )}

        {isDone && (
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
