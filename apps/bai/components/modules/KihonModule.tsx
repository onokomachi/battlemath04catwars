// このファイルは単元アプリ syo4-bainomikata の src/components/modules/KihonModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 基礎：倍の見方 入門モジュール。
 * 「もとにする量 × 倍 ＝ くらべられる量」の関係を、小さい整数と二重数直線で身につける。
 *
 * ここでは式の選択をはさまず「図をうめる → 答える」に集中させ、
 * まず図の上で3つの数の位置関係をつかませる。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { DoubleNumberLine, DnlSlotKey } from '../shared/DoubleNumberLine';
import { DiagramFillStage, DiagramBlank } from '../shared/DiagramFillStage';
import { RoundFocus } from '../shared/roundTypes';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { KIHON_LEVELS, KihonLevel, BaiTapeProblem, generateKihon } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = KIHON_LEVELS.map((l) => l.id);

export const KihonModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<KihonLevel>('kihon-find-compare');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<KihonLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="基礎：倍の見方" subtitle="もとにする量・倍・くらべられる量の 関係を おぼえよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {KIHON_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-sky-400"
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
    <AppShell title="基礎：倍の見方" subtitle={KIHON_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <KihonRound
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

export const KihonRound: React.FC<{
  level: KihonLevel;
  problem?: BaiTapeProblem;
  focus?: RoundFocus;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, focus = 'full', onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<BaiTapeProblem>(() => given ?? generateKihon(level));
  const stages = useMemo<RoundFocus[]>(
    () => (focus === 'full' ? ['diagram', 'answer'] : [focus]),
    [focus]
  );
  const [stageIdx, setStageIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'kihon', skillId: level, record: recordResult });

  const { base, times, compare, scene, missing } = problem;
  const answer = missing === 'compare' ? compare : missing === 'times' ? times : base;
  const isDone = stageIdx >= stages.length;
  const stage = stages[stageIdx];

  /** 求めるものによって、図のどこが□でどこを児童がうめるかが変わる */
  const diagram = useMemo<{ given: Partial<Record<DnlSlotKey, React.ReactNode>>; blanks: DiagramBlank[] }>(() => {
    const baseTickBlank: DiagramBlank = {
      key: 'baseTick', value: 1, display: '1',
      prompt: `${scene.baseName}を「いくつ」と みますか？ 下の 目もりの □ に 書こう`,
      hint: 'もとにする量は いつも「1」と みるよ。',
    };
    if (missing === 'compare') {
      return {
        given: { compareValue: '□', baseTick: '1' },
        blanks: [
          {
            key: 'baseValue', value: base, display: `${base}${scene.unit}`,
            prompt: `${scene.baseName}の${scene.measure}を 図の □ に 書こう`,
            hint: `${scene.baseName}の${scene.measure}は もんだい文に 書いてあるよ。`,
          },
          {
            key: 'timesTick', value: times, display: String(times),
            prompt: `${scene.compareName}は ${scene.baseName}の 何倍ですか？ 下の 目もりの □ に 書こう`,
            hint: `もんだい文の「${times}」を 目もりに 書きうつそう。`,
          },
        ],
      };
    }
    if (missing === 'times') {
      return {
        given: { baseValue: `${base}${scene.unit}` },
        blanks: [
          {
            key: 'compareValue', value: compare, display: `${compare}${scene.unit}`,
            prompt: `${scene.compareName}の${scene.measure}を 図の 上の □ に 書こう`,
            hint: `${scene.compareName}の${scene.measure}は もんだい文に 書いてあるよ。`,
          },
          baseTickBlank,
        ],
      };
    }
    return {
      given: { baseValue: '□', timesTick: String(times) },
      blanks: [
        {
          key: 'compareValue', value: compare, display: `${compare}${scene.unit}`,
          prompt: `${scene.compareName}の${scene.measure}を 図の 上の □ に 書こう`,
          hint: `${scene.compareName}の${scene.measure}は もんだい文に 書いてあるよ。`,
        },
        baseTickBlank,
      ],
    };
  }, [missing, base, times, compare, scene]);

  const finish = () => {
    playClear();
    confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
    rec.finish(`${scene.baseName} と ${scene.compareName}`);
    onResult?.(mistakes === 0);
    setStageIdx(stages.length);
  };

  const advance = () => {
    setHint(null);
    if (stageIdx + 1 >= stages.length) finish();
    else { playCorrect(); setStageIdx(stageIdx + 1); }
  };

  const submitAnswer = (v: string) => {
    if (Number(v) === answer) advance();
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(problem.hint); }
  };

  const questionText = missing === 'compare'
    ? `${scene.baseName}の${scene.measure}は ${base}${scene.unit}。これを「1」と 見ると、${scene.compareName}は「${times}」に あたります。${scene.compareName}の${scene.measure}は 何${scene.unit}ですか？`
    : missing === 'times'
      ? `${scene.baseName}の${scene.measure}は ${base}${scene.unit}、${scene.compareName}の${scene.measure}は ${compare}${scene.unit}です。${scene.baseName}を「1」と 見ると、${scene.compareName}は いくつに あたりますか？`
      : `${scene.compareName}の${scene.measure}は ${compare}${scene.unit}で、${scene.baseName}の ${times}倍に あたります。${scene.baseName}の${scene.measure}は 何${scene.unit}ですか？`;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="text-4xl shrink-0">{scene.emoji}</span>
            <p className="text-lg md:text-xl font-black text-content leading-relaxed flex-1">{questionText}</p>
          </div>
        </div>

        {stage === 'diagram' ? (
          <DiagramFillStage
            baseLabel={scene.baseName}
            compareLabel={scene.compareName}
            times={times}
            given={diagram.given}
            blanks={diagram.blanks}
            onComplete={advance}
            onMistake={() => setMistakes((m) => m + 1)}
            accentText="text-sky-600"
          />
        ) : (
          <>
            <div className="bg-surface border border-line rounded-[28px] shadow-lg p-5 md:p-6">
              <DoubleNumberLine
                baseLabel={scene.baseName}
                compareLabel={scene.compareName}
                times={times}
                compareValue={missing === 'compare' && !isDone ? '□' : `${compare}${scene.unit}`}
                baseValue={missing === 'base' && !isDone ? '□' : `${base}${scene.unit}`}
                baseTick="1"
                timesTick={missing === 'times' && !isDone ? '□' : String(times)}
              />
            </div>

            {hint && <HintBox tone="wrong">{hint}</HintBox>}

            {stage === 'answer' && (
              <div>
                <p className="text-center text-muted font-black mb-3">
                  {missing === 'times' ? 'いくつに あたりますか？' : `答えは 何${scene.unit}？`}
                </p>
                <AnswerEntry onSubmit={submitAnswer} allowDecimal={false} accentText="text-sky-600" />
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
            accentClass="bg-sky-500 hover:bg-sky-600"
          />
        )}
      </div>
    </div>
  );
};
