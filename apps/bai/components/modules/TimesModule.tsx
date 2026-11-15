// このファイルは単元アプリ syo4-bainomikata の src/components/modules/TimesModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 何倍かを もとめるモジュール（テスト大問1に対応）。
 * くらべられる量 ÷ もとにする量 ＝ 倍。
 *
 * 単元テストの大問と同じ順序で、図 → 式 → 答え → 「1とみると」の段階に分けて解く。
 * 図と式はそれぞれ独立に採点される技能なので、答えの数値だけを判定しない。
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
import { TIMES_LEVELS, TimesLevel, BaseTimesProblem, generateTimes, buildShikiChoices } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = TIMES_LEVELS.map((l) => l.id);

export const TimesModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<TimesLevel>('times-basic');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<TimesLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="何倍かを もとめる" subtitle="くらべられる量 ÷ もとにする量 ＝ 倍" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {TIMES_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-blue-400"
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
    <AppShell title="何倍かを もとめる" subtitle={TIMES_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <TimesRound
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

export const TimesRound: React.FC<{
  level: TimesLevel;
  problem?: BaseTimesProblem;
  focus?: RoundFocus;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, focus = 'full', onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<BaseTimesProblem>(() => given ?? generateTimes(level));
  const stages = useMemo<RoundFocus[]>(
    () => (focus === 'full' ? ['diagram', 'shiki', 'answer'] : [focus]),
    [focus]
  );
  const [stageIdx, setStageIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'times', skillId: level, record: recordResult });

  const { base, times, compare, scene } = problem;
  const shiki = useMemo(() => buildShikiChoices('times', base, times, compare), [base, times, compare]);
  const isDone = stageIdx >= stages.length;
  const stage = stages[stageIdx];

  const miss = (h: string) => { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(h); };

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(`${compare} ÷ ${base}`);
    onResult?.(mistakes === 0);
    setStageIdx(stages.length);
  };

  const advance = () => {
    setHint(null);
    if (stageIdx + 1 >= stages.length) finish();
    else { playCorrect(); setStageIdx(stageIdx + 1); }
  };

  const submitAnswer = (v: string) => {
    if (Number(v) === times) advance();
    else miss(problem.hint);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="text-4xl shrink-0">{scene.emoji}</span>
            <p className="text-lg md:text-xl font-black text-content leading-relaxed flex-1">
              {scene.baseName}の{scene.measure}は {base}{scene.unit}、{scene.compareName}の{scene.measure}は {compare}{scene.unit}です。
              {stage === 'asview'
                ? `${base}${scene.unit}を「1」と みると、${compare}${scene.unit}は いくつに あたりますか？`
                : `${scene.compareName}は ${scene.baseName}の 何倍ですか？`}
            </p>
          </div>
        </div>

        {stage === 'diagram' ? (
          <DiagramFillStage
            baseLabel={scene.baseName}
            compareLabel={scene.compareName}
            times={times}
            given={{ baseValue: `${base}${scene.unit}` }}
            blanks={[
              {
                key: 'compareValue', value: compare, display: `${compare}${scene.unit}`,
                prompt: `${scene.compareName}の${scene.measure}を 図の 上の □ に 書こう`,
                hint: `${scene.compareName}の${scene.measure}は もんだい文に 書いてあるよ。`,
              },
              {
                key: 'baseTick', value: 1, display: '1',
                prompt: `${scene.baseName}を「いくつ」と みますか？ 下の 目もりの □ に 書こう`,
                hint: 'もとにする量は いつも「1」と みるよ。ここが 倍の 見方の 出発点だね。',
              },
            ]}
            onComplete={advance}
            onMistake={() => setMistakes((m) => m + 1)}
            accentText="text-blue-600"
          />
        ) : (
          <>
            <div className="bg-surface border border-line rounded-[28px] shadow-lg p-5 md:p-6">
              <DoubleNumberLine
                baseLabel={scene.baseName}
                compareLabel={scene.compareName}
                times={times}
                compareValue={`${compare}${scene.unit}`}
                baseValue={`${base}${scene.unit}`}
                baseTick="1"
                timesTick={isDone ? String(times) : '□'}
              />
            </div>

            {hint && <HintBox tone="wrong">{hint}</HintBox>}


            {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

            <ScratchPadToggle ops={['×', '÷']} decimal={false} />

            {stage === 'shiki' && (
              <ChoiceStage
                prompt="どんな しきに なりますか？"
                choices={shiki.choices}
                correctIndex={shiki.correctIndex}
                hint={shiki.hint}
                onCorrect={advance}
                onMistake={() => setMistakes((m) => m + 1)}
                accentBorder="hover:border-blue-400"
              />
            )}

            {(stage === 'answer' || stage === 'asview') && (
              <div>
                <p className="text-center text-muted font-black mb-3">
                  {stage === 'asview' ? 'いくつに あたりますか？' : `しき ${compare} ÷ ${base} の 答えは？`}
                </p>
                <AnswerEntry onSubmit={submitAnswer} allowDecimal={false} accentText="text-blue-600" />
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
            accentClass="bg-blue-500 hover:bg-blue-600"
          />
        )}
      </div>
    </div>
  );
};
