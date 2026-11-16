// このファイルは単元アプリ syo4-bunnsu の src/components/modules/ErrorHunterModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * エラーハンター（誤り例の発見・修正・理由の言語化）モジュール。
 * ともだちのノートに書いてある、この単元で よくある まちがい（分子と分母の取りちがえ・小数の位と分母のずれ・
 * 「.」でつなぐ・分母÷分子・もとにする量のとりちがえ・分母が大きいほど大きい、など）を
 * 「見つけて → 直して → 理由を選ぶ」3ステップで学ぶ。正しいノートも混ぜて、正しいものを正しいと見ぬく力も測る。
 * 誤答例の同定・修正は遅延テストで効果が大きい（Adams 2014; Durkin & Rittle-Johnson 2012）。
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Lightbulb, Shuffle, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useRoundRecorder } from 'learning-app-kit/react';
import { ProbScratch } from '../shared/ProbScratch';
import { AppShell } from '../shared/AppShell';
import { LevelCard, SetupScreen } from '../ui/primitives';
import { RichText } from '../shared/Frac';
import { StepInput } from './FractionRound';
import { ERROR_TYPES, generateError, type ErrProb } from '../../lib/errorHunter';
import { judge, type Inp } from '../../lib/problems';
import { pick } from '../../lib/frac';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

/** 型を選ぶか、ぜんぶ まぜるか（まぜるときは、半分を eh-judge（正しい・まちがいが 半々）にして、4回に1回くらい 正しいノートが出る） */
export const ErrorHunterModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'play'>('setup');
  const [skill, setSkill] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);

  if (mode === 'setup') {
    return (
      <SetupScreen title="エラーハンター" subtitle="ともだちの ノートの まちがいを 見つけて なおそう" onBack={onExit}>
        <button
          onClick={() => { setSkill(null); setRound((r) => r + 1); setMode('play'); }}
          className="w-full mb-4 p-5 rounded-3xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Shuffle size={22} /> ぜんぶ まぜて ちょうせん
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ERROR_TYPES.map((t) => (
            <LevelCard
              key={t.id}
              label={t.label}
              desc={t.desc}
              mastery={getMasteryStreak(t.id)}
              todayCount={getTodaySkillCount(t.id)}
              accentBorder="hover:border-rose-400"
              onClick={() => { setSkill(t.id); setRound((r) => r + 1); setMode('play'); }}
            />
          ))}
        </div>
      </SetupScreen>
    );
  }

  const chosen = skill ?? (Math.random() < 0.5 ? 'eh-judge' : pick(ERROR_TYPES.filter((t) => t.id !== 'eh-judge')).id);
  return (
    <AppShell title="エラーハンター" subtitle="まちがい さがし" onBack={() => setMode('setup')}>
      <ErrorRound key={round} skillId={chosen} onNext={() => setRound((r) => r + 1)} />
    </AppShell>
  );
};

export const ErrorRound: React.FC<{
  skillId?: string;
  example?: ErrProb;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ skillId, example, onNext, onResult, onMiss, nextLabel = 'つぎの もんだい' }) => {
  const [ex] = useState<ErrProb>(() => example ?? generateError(skillId ?? 'eh-swap'));
  const [stage, setStage] = useState<'judge' | 'fix' | 'reason' | 'done'>('judge');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [wrongChoices, setWrongChoices] = useState<ReadonlySet<number>>(new Set());
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに離れたときも1件記録する
  const rec = useRoundRecorder({ moduleId: 'error-hunter', skillId: ex.skillId, record: recordResult });

  const miss = (text: string) => {
    playSoftTry();
    setMistakes((m) => m + 1);
    rec.mistake();
    onMiss?.();
    setHint(text);
  };
  const finish = () => {
    setStage('done');
    setHint(null);
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(ex.label);
    onResult?.(mistakes === 0);
  };

  const judgeNote = (saysCorrect: boolean) => {
    setHint(null);
    if (saysCorrect === ex.isCorrect) {
      if (ex.isCorrect) finish(); // 正しいノートを「正しい」と見ぬけた
      else { playCorrect(); setStage('fix'); } // まちがいを「まちがい」と見ぬけた
    } else {
      miss(ex.isCorrect
        ? 'もう一度 よく見て。自分で 計算してみると、ノートの 答えが 合っているか わかるよ。'
        : 'もう一度 よく見て。自分で 計算して、ノートの 答えと くらべてみよう。');
    }
  };

  const submitFix = (inp: Inp) => {
    const v = judge(ex.fix.ans, inp);
    if (v === 'ok') { setHint(null); setWrongChoices(new Set()); playCorrect(); setStage('reason'); return; }
    if (v === 'wrong') {
      if (inp.i != null) setWrongChoices((s) => new Set(s).add(inp.i!));
      miss(ex.fix.diagnose?.(inp) ?? ex.fixHint);
      return;
    }
    setHint('大きさは 合っているよ。でも この問題の 形で 答えよう。');
  };

  const chooseReason = (i: number) => {
    if (i === ex.correctReason) finish();
    else miss('うーん、ちがうみたい。ノートの 式と 正しい 答えを くらべて、どこが ちがうか 考えよう。');
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10" data-testid="problem" data-skill={ex.skillId} data-answer={(import.meta.env.DEV || import.meta.env.VITE_E2E === '1') ? ex.a : undefined} data-eh={(import.meta.env.DEV || import.meta.env.VITE_E2E === '1') ? JSON.stringify({ isCorrect: ex.isCorrect, fix: ex.fix.ans, reason: ex.correctReason }) : undefined}>
          {/* 出題（ともだちのノート） */}
          <div className="bg-surface-2 rounded-3xl p-6 mb-6 border border-line">
            <span className="text-sm font-black text-faint">{ex.character}さんの ノート</span>
            <div className="flex flex-col items-center gap-3 py-3">
              {ex.work.map((line, i) => (
                <div key={i} className="text-2xl md:text-3xl font-black text-content leading-[2.2] text-center">
                  <RichText text={line} />
                </div>
              ))}
            </div>
          </div>

          {hint && (
            <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2">
              <Lightbulb className="text-amber-500 shrink-0" size={20} />
              <p className="text-muted font-bold leading-[2]"><RichText text={hint} /></p>
            </div>
          )}

          {(stage === 'judge' || stage === 'fix') && ex.scratch && (
            <div className="mb-4"><ProbScratch scratch={ex.scratch} label="けいさんらんで たしかめる" /></div>
          )}

          {stage === 'judge' && (
            <>
              <p className="text-center text-muted font-bold mb-4">この ノートは…？</p>
              <div className="flex justify-center gap-4">
                <button data-testid="judge-right" onClick={() => judgeNote(true)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-emerald-200 text-emerald-600 font-black text-xl hover:bg-emerald-50 active:scale-95 transition-all"><Check size={28} /> 正しい</button>
                <button data-testid="judge-wrong" onClick={() => judgeNote(false)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-rose-200 text-rose-500 font-black text-xl hover:bg-rose-50 active:scale-95 transition-all"><X size={28} /> まちがい</button>
              </div>
            </>
          )}

          {stage === 'fix' && (
            <>
              <p className="text-center text-muted font-black mb-4 leading-[2.2]"><RichText text={ex.fix.prompt} /></p>
              <StepInput step={ex.fix} wrongChoices={wrongChoices} onSubmit={submitFix} />
            </>
          )}

          {stage === 'reason' && (
            <>
              <p className="text-center text-muted font-black mb-4">{ex.character}さんは、なぜ まちがえたのかな？</p>
              <div className="flex flex-col gap-3">
                {ex.reasons.map((r, i) => (
                  <button key={i} data-testid={`reason-${i}`} onClick={() => chooseReason(i)} className="text-left p-4 rounded-2xl bg-surface border-2 border-line text-content font-bold hover:border-rose-400 active:scale-[0.99] transition-all">{r}</button>
                ))}
              </div>
            </>
          )}

          {stage === 'done' && (
            <div className="text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-6xl mb-3">{mistakes === 0 ? '🏆' : '🎉'}</motion.div>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl leading-[2.2]">
                {ex.isCorrect ? <span>そのとおり！ このノートは 正しいよ。</span> : <RichText text={ex.explain} />}
              </div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">{nextLabel}</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
