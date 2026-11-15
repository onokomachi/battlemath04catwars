// このファイルは単元アプリ syo4-gaisu の src/components/modules/RoundJudgeModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 切り上げ・切り捨てで考えよう モジュール。
 * 四捨五入との ちがいを 手を動かして確かめ、場面に合わせて 見積もり方を選び、
 * 最後は「切り上げて見積もっても 予算内か」を判断する 応用まで つなげる。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2, Check, X } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import {
  ROUNDJUDGE_LEVELS, RoundJudgeLevel, RoundJudgeValueProblem, RoundJudgeMethodProblem, RoundJudgeBudgetProblem, RoundJudgeFloorProblem,
  generateRoundJudgeValue, generateRoundJudgeMethod, generateRoundJudgeBudget, generateRoundJudgeFloor,
} from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = ROUNDJUDGE_LEVELS.map((l) => l.id);

export const RoundJudgeModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<RoundJudgeLevel>('roundjudge-value');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<RoundJudgeLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="切り上げ・切り捨てで 考えよう" subtitle="場面に あわせて 見積もり方を えらぼう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {ROUNDJUDGE_LEVELS.map((l) => (
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
    <AppShell title="切り上げ・切り捨てで 考えよう" subtitle={ROUNDJUDGE_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <RoundJudgeRound
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

export const RoundJudgeRound: React.FC<{
  level: RoundJudgeLevel;
  valueProblem?: RoundJudgeValueProblem;
  methodProblem?: RoundJudgeMethodProblem;
  budgetProblem?: RoundJudgeBudgetProblem;
  floorProblem?: RoundJudgeFloorProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, valueProblem, methodProblem, budgetProblem, floorProblem, onNext, onResult, onMiss, nextLabel }) => {
  const [valueP] = useState<RoundJudgeValueProblem | null>(() => (level === 'roundjudge-value' ? valueProblem ?? generateRoundJudgeValue() : null));
  const [methodP] = useState<RoundJudgeMethodProblem | null>(() => (level === 'roundjudge-method' ? methodProblem ?? generateRoundJudgeMethod() : null));
  const [budgetP] = useState<RoundJudgeBudgetProblem | null>(() => (level === 'roundjudge-budget' ? budgetProblem ?? generateRoundJudgeBudget() : null));
  const [floorP] = useState<RoundJudgeFloorProblem | null>(() => (level === 'roundjudge-floor' ? floorProblem ?? generateRoundJudgeFloor() : null));
  const [stage, setStage] = useState<'answer' | 'stage2' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [pickedWrongBool, setPickedWrongBool] = useState<boolean | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'roundjudge', skillId: level, record: recordResult });

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submitValue = (v: string) => {
    if (!valueP) return;
    if (Number(v) === valueP.answer) finish(`${valueP.n} → ${valueP.answer}`);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(valueP.hint); }
  };

  const chooseMethod = (i: number) => {
    if (!methodP) return;
    if (i === methodP.answerIndex) finish(methodP.choices[i]);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setPickedWrong(i); setHint(methodP.why); }
  };

  const chooseBudgetMethod = (i: number) => {
    if (!budgetP) return;
    if (i === budgetP.methodAnswerIndex) {
      playCorrect();
      setPickedWrong(null);
      setHint(null);
      setStage('stage2');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint(budgetP.explain1);
    }
  };

  const chooseBudgetBuy = (answer: boolean) => {
    if (!budgetP) return;
    if (answer === budgetP.canBuy) {
      finish(`${budgetP.budget}円で ${budgetP.canBuy ? '買える' : '買えない'}`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrongBool(answer);
      setHint(budgetP.hint2);
    }
  };

  const submitFloor = (v: string) => {
    if (!floorP) return;
    if (Number(v) === floorP.floorCount) finish(`${floorP.budget}円で ${floorP.itemName} ${floorP.floorCount}こ`);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(floorP.hint); }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        {valueP && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
            <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">{valueP.n}</div>
            <p className="text-muted font-bold mt-3">
              <span className="text-teal-600 font-black">{valueP.method === 'up' ? '切り上げ' : '切り捨て'}</span>で <span className="text-teal-600">{valueP.placeLabel}</span>までの がい数に しましょう。
            </p>
          </div>
        )}

        {methodP && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
            <p className="text-xs font-black text-faint mb-2">どの見積もり方が よい？</p>
            <p className="text-xl md:text-2xl font-black text-content leading-relaxed">{methodP.text}</p>
          </div>
        )}

        {budgetP && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {budgetP.items.map((it, i) => (
                <div key={i} className="bg-surface-2 border border-line rounded-2xl p-3 text-center">
                  <div className="text-3xl mb-1">{it.emoji}</div>
                  <div className="text-xs font-bold text-muted">{it.name}</div>
                  <div className="text-lg font-black text-content tabular-nums">{it.price}円</div>
                </div>
              ))}
            </div>
            {stage === 'answer' && (
              <>
                <p className="text-center text-content font-black text-lg tabular-nums mb-1">
                  {budgetP.items.map((x) => x.ceilPrice).join(' ＋ ')} ＝ {budgetP.ceilSum}
                </p>
                <p className="text-center text-muted font-bold">この 見積もりの しかたは どれでしょう？</p>
              </>
            )}
            {stage === 'stage2' && (
              <p className="text-center text-content font-black text-lg">{budgetP.budget}円で、この 3つを ぜんぶ 買えますか？</p>
            )}
          </div>
        )}

        {floorP && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
            <div className="text-5xl mb-2">{floorP.emoji}</div>
            <p className="text-lg md:text-xl font-black text-content leading-relaxed">
              1こ <span className="text-teal-600">{floorP.price}円</span>の {floorP.itemName}を、<span className="text-teal-600">{floorP.budget}円</span>で 買います。
            </p>
            <p className="text-muted font-bold mt-2">買いすぎないように、切り捨てで 見積もると 何こ買えるでしょう。</p>
          </div>
        )}

        {hint && <HintBox tone="wrong">{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['+', '-', '×', '÷']} decimal={false} />

        {stage === 'answer' && valueP && (
          <AnswerEntry onSubmit={submitValue} allowDecimal={false} accentText="text-teal-600" />
        )}

        {stage === 'answer' && floorP && (
          <AnswerEntry onSubmit={submitFloor} allowDecimal={false} submitLabel="◯こ" accentText="text-teal-600" />
        )}

        {stage === 'answer' && methodP && (
          <div className="grid grid-cols-1 gap-3">
            {methodP.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseMethod(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-teal-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'answer' && budgetP && (
          <div className="grid grid-cols-1 gap-3">
            {budgetP.methodChoices.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseBudgetMethod(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-teal-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'stage2' && budgetP && (
          <div className="flex justify-center gap-4">
            <button
              onClick={() => chooseBudgetBuy(true)}
              className={`flex items-center gap-2 px-8 py-5 rounded-2xl border-2 font-black text-xl active:scale-95 transition-all ${
                pickedWrongBool === true ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-emerald-200 text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              <Check size={28} /> 買える
            </button>
            <button
              onClick={() => chooseBudgetBuy(false)}
              className={`flex items-center gap-2 px-8 py-5 rounded-2xl border-2 font-black text-xl active:scale-95 transition-all ${
                pickedWrongBool === false ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-rose-200 text-rose-500 hover:bg-rose-50'
              }`}
            >
              <X size={28} /> 買えない
            </button>
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{valueP?.explain ?? methodP?.why ?? budgetP?.explain2 ?? floorP?.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-teal-500 hover:bg-teal-600"
          />
        )}
      </div>
    </div>
  );
};
