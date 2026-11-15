// このファイルは単元アプリ syo4-gaisu の src/components/modules/RoundModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 四捨五入で がい数に モジュール。
 * 単元の中核スキル：指定の位までの がい数、上から1けた・2けたの がい数、
 * そして2つの条件から もとの数を えらぶ「つまずきポイント」レベルまでを段階的に扱う。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import {
  ROUND_LEVELS, RoundLevel, RoundPlaceProblem, RoundDigitProblem, RoundChooseProblem, RoundWhichPlaceProblem,
  generateRoundPlace, generateRoundDigit, generateRoundChoose, generateRoundWhichPlace,
} from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = ROUND_LEVELS.map((l) => l.id);

export const RoundModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<RoundLevel>('round-place');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<RoundLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="四捨五入で がい数に" subtitle="見る位を まちがえずに、ていねいに 丸めよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {ROUND_LEVELS.map((l) => (
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
    <AppShell title="四捨五入で がい数に" subtitle={ROUND_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <RoundRound
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

export const RoundRound: React.FC<{
  level: RoundLevel;
  whichPlaceProblem?: RoundWhichPlaceProblem;
  placeProblem?: RoundPlaceProblem;
  digitProblem?: RoundDigitProblem;
  chooseProblem?: RoundChooseProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, whichPlaceProblem, placeProblem, digitProblem, chooseProblem, onNext, onResult, onMiss, nextLabel }) => {
  const [whichPlaceP] = useState<RoundWhichPlaceProblem | null>(() => (level === 'round-which-place' ? whichPlaceProblem ?? generateRoundWhichPlace() : null));
  const [placeP] = useState<RoundPlaceProblem | null>(() => (level === 'round-place' ? placeProblem ?? generateRoundPlace() : null));
  const [digitP] = useState<RoundDigitProblem | null>(() =>
    level === 'round-digit2' ? digitProblem ?? generateRoundDigit(2) : level === 'round-digit1' ? digitProblem ?? generateRoundDigit(1) : null
  );
  const [chooseP] = useState<RoundChooseProblem | null>(() => (level === 'round-choose' ? chooseProblem ?? generateRoundChoose() : null));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'round', skillId: level, record: recordResult });

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submitPlace = (v: string) => {
    if (!placeP) return;
    if (Number(v) === placeP.answer) finish(`${placeP.n} → ${placeP.placeLabel}まで`);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(placeP.hint); }
  };

  const submitDigit = (v: string) => {
    if (!digitP) return;
    if (Number(v) === digitP.answer) finish(`${digitP.n} → 上から${digitP.k}けた`);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setHint(digitP.hint); }
  };

  const chooseAnswer = (i: number) => {
    if (!chooseP) return;
    if (i === chooseP.answerIndex) finish(chooseP.choices[i]);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setPickedWrong(i); setHint(chooseP.hint); }
  };

  const chooseWhichPlace = (i: number) => {
    if (!whichPlaceP) return;
    if (i === whichPlaceP.answerIndex) finish(`${whichPlaceP.n} → ${whichPlaceP.choices[i]}を 四捨五入`);
    else { playSoftTry(); setMistakes((m) => m + 1); rec.mistake(); onMiss?.(); setPickedWrong(i); setHint(whichPlaceP.hint); }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {whichPlaceP && (
            <>
              <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">{whichPlaceP.n}</div>
              <p className="text-muted font-bold mt-3">四捨五入して <span className="text-blue-600">{whichPlaceP.targetLabel}</span>までの がい数に します。どの位の 数字を 四捨五入すれば よいでしょう。</p>
            </>
          )}
          {placeP && (
            <>
              <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">{placeP.n}</div>
              <p className="text-muted font-bold mt-3">四捨五入して <span className="text-blue-600">{placeP.placeLabel}</span>までの がい数に しましょう。</p>
            </>
          )}
          {digitP && (
            <>
              <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">{digitP.n}</div>
              <p className="text-muted font-bold mt-3">四捨五入して 上から<span className="text-blue-600">{digitP.k}</span>けたの がい数に しましょう。</p>
            </>
          )}
          {chooseP && (
            <p className="text-lg md:text-xl font-black text-content leading-relaxed">
              四捨五入して 上から1けたの がい数にすると <span className="text-blue-600">{chooseP.v1}</span> になり、上から2けたの がい数にすると <span className="text-blue-600">{chooseP.v2}</span> になる数は どれでしょう。
            </p>
          )}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && (placeP || digitP) && (
          <AnswerEntry onSubmit={placeP ? submitPlace : submitDigit} allowDecimal={false} accentText="text-blue-600" />
        )}

        {stage === 'answer' && chooseP && (
          <div className="grid grid-cols-1 gap-3">
            {chooseP.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseAnswer(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-blue-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'answer' && whichPlaceP && (
          <div className="grid grid-cols-1 gap-3">
            {whichPlaceP.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseWhichPlace(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-blue-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{whichPlaceP?.explain ?? placeP?.explain ?? digitP?.explain ?? chooseP?.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-blue-500 hover:bg-blue-600"
          />
        )}
      </div>
    </div>
  );
};
