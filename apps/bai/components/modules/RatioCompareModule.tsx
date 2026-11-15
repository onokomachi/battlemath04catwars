// このファイルは単元アプリ syo4-bainomikata の src/components/modules/RatioCompareModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 割合（倍）で くらべるモジュール（テスト大問4／いかそう算数に対応）。
 *
 * ゴムA・B型：2つの ペア（まえ → あと）から それぞれ 倍を もとめて くらべる。
 *
 * 「差ではなく 倍で」レベルでは、まず児童自身に差を計算させる。
 * 差が同じだと自分で確かめてから倍を求めることで、
 * 「差では同じに見えるのに、倍で見るとちがう」という気づきが成立する。
 * 差を最初から見せてしまうと、この考察そのものが成り立たない。
 *
 * 問い方は「大きい方」「小さい方」をランダムに入れかえる。
 * 大きい方だけで練習すると、反射で大きい方を選んで誤答するため。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { ChoiceStage } from '../shared/ChoiceStage';
import { RoundFocus } from '../shared/roundTypes';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { RATIO_COMPARE_LEVELS, RatioCompareLevel, RatioCompareProblem, generateRatioCompare, buildShikiChoices } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = RATIO_COMPARE_LEVELS.map((l) => l.id);

export const RatioCompareModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<RatioCompareLevel>('ratio-compare-basic');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<RatioCompareLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="割合で くらべる" subtitle="差ではなく 倍で くらべてみよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {RATIO_COMPARE_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-fuchsia-400"
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
    <AppShell title="割合で くらべる" subtitle={RATIO_COMPARE_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <RatioCompareRound
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

export const RatioCompareRound: React.FC<{
  level: RatioCompareLevel;
  problem?: RatioCompareProblem;
  focus?: RoundFocus;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, focus = 'full', onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<RatioCompareProblem>(() => given ?? generateRatioCompare(level));
  const stages = useMemo<RoundFocus[]>(() => {
    if (focus !== 'full') return [focus];
    // 差を扱う回は「差 → 倍 → 判断」、そうでない回は「式 → 倍 → 判断」
    return problem.showDiffTrap ? ['diff', 'answer', 'judge'] : ['shiki', 'answer', 'judge'];
  }, [focus, problem.showDiffTrap]);

  const [stageIdx, setStageIdx] = useState(0);
  const [part, setPart] = useState(0); // A→B の2回入力に使う
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<'A' | 'B' | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'ratio-compare', skillId: level, record: recordResult });

  const p = problem;
  const isDone = stageIdx >= stages.length;
  const stage = stages[stageIdx];

  const shikiA = useMemo(() => buildShikiChoices('times', p.beforeA, p.timesA, p.afterA), [p]);
  const shikiB = useMemo(() => buildShikiChoices('times', p.beforeB, p.timesB, p.afterB), [p]);

  // 差は、児童が自分で計算し終えてから（または差を扱わない回で）表示する
  const diffStageIdx = stages.indexOf('diff');
  const diffRevealed = diffStageIdx !== -1 && stageIdx > diffStageIdx;

  const miss = (h: string) => { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(h); };

  const finish = () => {
    playClear();
    confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
    rec.finish(`${p.pair.itemA} と ${p.pair.itemB}`);
    onResult?.(mistakes === 0);
    setStageIdx(stages.length);
  };

  const advance = (nextHint: string | null = null) => {
    setPart(0);
    setHint(nextHint);
    setPickedWrong(null);
    if (stageIdx + 1 >= stages.length) finish();
    else { playCorrect(); setStageIdx(stageIdx + 1); }
  };

  /** A→B の2段入力。part0 が正解したら part1 へ、part1 が正解したら次の段階へ */
  const submitPair = (
    v: string, wantA: number, wantB: number,
    hintA: string, hintB: string, doneHint: string | null = null,
  ) => {
    const want = part === 0 ? wantA : wantB;
    if (Number(v) !== want) { miss(part === 0 ? hintA : hintB); return; }
    if (part === 0) { playCorrect(); setPart(1); setHint(null); }
    else advance(doneHint);
  };

  const chooseJudge = (label: 'A' | 'B') => {
    if (label === p.answerLabel) finish();
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(label);
      setHint(`倍で くらべよう。${p.pair.itemA}は ${p.timesA}倍、${p.pair.itemB}は ${p.timesB}倍。今回 きかれているのは 変化が ${p.askSmaller ? '小さい' : '大きい'}方だよ。`);
    }
  };

  const itemOf = (l: 'A' | 'B') => (l === 'A' ? p.pair.itemA : p.pair.itemB);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{p.pair.emojiA}</span>
            <p className="text-content font-black text-lg tabular-nums">{p.pair.itemA}：{p.beforeA}{p.pair.unit} → {p.afterA}{p.pair.unit}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{p.pair.emojiB}</span>
            <p className="text-content font-black text-lg tabular-nums">{p.pair.itemB}：{p.beforeB}{p.pair.unit} → {p.afterB}{p.pair.unit}</p>
          </div>
          {p.showDiffTrap && diffRevealed && (
            <p className="text-sm text-amber-600 font-black mt-3">
              ふえた量（差）は どちらも {p.diffA}{p.pair.unit}で 同じだったね。では 倍で くらべると どうかな？
            </p>
          )}
        </div>

        {hint && <HintBox tone={pickedWrong ? 'wrong' : 'hint'}>{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['×', '÷']} decimal={false} />

        {stage === 'diff' && (
          <div>
            <p className="text-center text-content font-black text-lg mb-3">
              {part === 0 ? p.pair.itemA : p.pair.itemB} は 何{p.pair.unit} ふえましたか？
            </p>
            <AnswerEntry
              onSubmit={(v) => submitPair(
                v, p.diffA, p.diffB,
                `${p.pair.itemA}は ${p.beforeA} → ${p.afterA}。「あと − まえ」で もとめよう。`,
                `${p.pair.itemB}は ${p.beforeB} → ${p.afterB}。「あと − まえ」で もとめよう。`,
                p.hint,
              )}
              allowDecimal={false}
              accentText="text-fuchsia-600"
            />
          </div>
        )}

        {stage === 'shiki' && (
          <ChoiceStage
            key={part}
            prompt={`${part === 0 ? p.pair.itemA : p.pair.itemB} が もとの 何倍に なったかを もとめる しきは？`}
            choices={part === 0 ? shikiA.choices : shikiB.choices}
            correctIndex={part === 0 ? shikiA.correctIndex : shikiB.correctIndex}
            hint={part === 0 ? shikiA.hint : shikiB.hint}
            onCorrect={() => { if (part === 0) { playCorrect(); setPart(1); } else advance(); }}
            onMistake={() => setMistakes((m) => m + 1)}
            accentBorder="hover:border-fuchsia-400"
          />
        )}

        {stage === 'answer' && (
          <div>
            <p className="text-center text-content font-black text-lg mb-3">
              {part === 0 ? p.pair.itemA : p.pair.itemB} は もとの 何倍に なりましたか？
            </p>
            <AnswerEntry
              onSubmit={(v) => submitPair(
                v, p.timesA, p.timesB,
                `${p.pair.itemA}は ${p.afterA} ÷ ${p.beforeA} を 計算しよう。`,
                `${p.pair.itemB}は ${p.afterB} ÷ ${p.beforeB} を 計算しよう。`,
              )}
              allowDecimal={false}
              accentText="text-fuchsia-600"
            />
          </div>
        )}

        {stage === 'judge' && (
          <div>
            <p className="text-center text-content font-black text-lg mb-4">
              変化の しかたが {p.askSmaller ? '小さい' : '大きい'}と いえるのは どちらですか？
            </p>
            <div className="flex justify-center gap-4">
              {(['A', 'B'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => chooseJudge(l)}
                  className={`flex items-center gap-2 px-8 py-5 rounded-2xl border-2 font-black text-xl active:scale-95 transition-all ${
                    pickedWrong === l ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-fuchsia-400'
                  }`}
                >
                  {l === 'A' ? p.pair.emojiA : p.pair.emojiB} {itemOf(l)}
                </button>
              ))}
            </div>
          </div>
        )}

        {isDone && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{p.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-fuchsia-500 hover:bg-fuchsia-600"
          />
        )}
      </div>
    </div>
  );
};
