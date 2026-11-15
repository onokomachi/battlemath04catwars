// このファイルは単元アプリ syo4-bunnsu の src/components/modules/FractionRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 1問の進行（全モジュール共通）。問題（Prob）の手順（steps）を順番に答えさせる。
 *
 * 答え方は手順ごとに9種類（＋文章題の式を組み立てる build）: 数・分数・帯分数・帯分数でも仮分数でもよい（FracEntry）／えらぶ／数直線をタップ／
 * 図に色をぬる／カードを順にならべる（OrderInput）。
 * まちがえたときは「どこがちがうか」（誤答診断）と、段階的なヒント（3段・1回目から答えを見せない）を出す。
 *   ok         … 次の手順へ（最後なら おしまい）
 *   equiv      … 大きさは合っているが、この問題の形ではない → まちがいに数えず言いかえを促す（equivMessage）
 *   wrong      … まちがい（mistakes を数え、記録の mistake() を呼ぶ）
 * 記録は learning-app-kit の useRoundRecorder を通す（できなかった問題も残る）。
 */
import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { useRoundRecorder } from 'learning-app-kit/react';
import { ProbScratch } from '../shared/ProbScratch';
import { HintBox, ResultPanel } from '../ui/primitives';
import { FigureView } from '../shared/FigureView';
import { FracEntry } from '../shared/FracEntry';
import { ExprBuilder } from '../shared/ExprBuilder';
import { RichText } from '../shared/Frac';
import { generate, judge, equivMessage, showVal, asChoiceStep, type Ans, type Inp, type Prob, type Step } from '../../lib/problems';
import { F, M, dec } from '../../lib/frac';
import { skillToModuleId, useProgressStore } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

/** 答えを「✓ ○○」の行にするための文字（分数記法つき） */
export function ansLine(a: Ans): string {
  switch (a.kind) {
    case 'num': return dec(a.v);
    case 'frac': return F(a.n, a.d);
    case 'mixed': return M(a.w, a.n, a.d);
    case 'any': return a.n > a.d ? `${showVal(a.n, a.d)}（${F(a.n, a.d)}）` : showVal(a.n, a.d);
    case 'choice': return a.choices[a.correct]!;
    case 'order': return a.correct.map((i) => a.items[i]!).join(' → ');
    case 'build': return a.accept[0]!.join(' ');
    default: return '';
  }
}

/** 数・分数・帯分数・えらぶ の入力欄（数直線・色ぬりは図そのものが入力なので、ここでは扱わない） */
export const StepInput: React.FC<{
  step: Step;
  wrongChoices: ReadonlySet<number>;
  onSubmit: (inp: Inp) => void;
  accentText?: string;
}> = ({ step, wrongChoices, onSubmit, accentText }) => {
  const a = step.ans;
  if (a.kind === 'num' || a.kind === 'frac' || a.kind === 'mixed') {
    return <FracEntry kind={a.kind} onSubmit={onSubmit} accentText={accentText} />;
  }
  if (a.kind === 'any') {
    return <FracEntry kind="any" start={a.start} only={a.only} onSubmit={onSubmit} accentText={accentText} />;
  }
  if (a.kind === 'order') {
    return <OrderInput items={a.items} onSubmit={(seq) => onSubmit({ seq })} />;
  }
  if (a.kind === 'choice') {
    return (
      <div className={`grid gap-3 ${a.choices.length <= 3 && a.choices.every((c) => c.length <= 4) ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {a.choices.map((c, i) => (
          <button
            key={i}
            data-testid={`choice-${i}`}
            disabled={wrongChoices.has(i)}
            onClick={() => onSubmit({ i })}
            className="min-h-[4rem] px-4 py-3 rounded-2xl bg-surface border-2 border-line text-content text-xl font-black
                       hover:border-brand active:scale-[0.98] transition-all disabled:opacity-30 disabled:line-through"
          >
            <RichText text={c} />
          </button>
        ))}
      </div>
    );
  }
  return null;
};

/** カードを順にタップしてならべる（大きい順・はやい順）。ぜんぶ選んだら「こたえる」 */
export const OrderInput: React.FC<{ items: string[]; onSubmit: (seq: number[]) => void }> = ({ items, onSubmit }) => {
  const [seq, setSeq] = useState<number[]>([]);
  const full = seq.length === items.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[4.5rem] rounded-2xl bg-surface-3/40 border-2 border-line p-3 flex flex-wrap items-center justify-center gap-2" data-testid="order-line">
        {seq.length === 0 && <span className="text-faint font-bold">したの カードを じゅんに タップしてね</span>}
        {seq.map((i, k) => (
          <React.Fragment key={k}>
            {k > 0 && <span className="text-2xl font-black text-muted">→</span>}
            <span className="px-3 py-1.5 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-xl font-black"><RichText text={items[i]!} /></span>
          </React.Fragment>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((it, i) => (
          <button
            key={i}
            data-testid={`order-${i}`}
            disabled={seq.includes(i)}
            onClick={() => setSeq((s) => [...s, i])}
            className="min-h-[4rem] px-3 py-3 rounded-2xl bg-surface border-2 border-line text-content text-xl font-black
                       hover:border-brand active:scale-[0.98] transition-all disabled:opacity-30"
          >
            <RichText text={it} />
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setSeq((s) => s.slice(0, -1))}
          disabled={seq.length === 0}
          className="flex-1 py-4 rounded-2xl border-2 border-line bg-surface text-muted font-black text-lg disabled:opacity-40"
        >
          1つ もどす
        </button>
        <button
          data-testid="order-submit"
          onClick={() => { onSubmit(seq); setSeq([]); }}
          disabled={!full}
          className="flex-[2] py-4 rounded-2xl text-xl font-black shadow-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:bg-surface-3 disabled:text-faint transition-all"
        >
          こたえる
        </button>
      </div>
    </div>
  );
};

interface Props {
  /** 項目の記号。problem を渡さないときは、これで1問つくる */
  skillId?: string;
  problem?: Prob;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
  /**
   * 文章題の式（build）の出し方。
   *   practice … 組み立てる。2回まちがえたら「えらぶ」を足場として出す（その項目に習熟していれば出さない）。既定
   *   only     … 組み立てるだけ（本番テスト・実力の階段。足場なし）
   *   choice   … 「えらぶ」だけ（ボス戦。すばやく答える場面）
   */
  buildMode?: 'practice' | 'only' | 'choice';
}

/** この項目の熟達バーが これ以上なら、足場（えらぶ）を出さない（3回連続ノーミス以上） */
const SCAFFOLD_OFF_AT = 0.6;

export const FractionRound: React.FC<Props> = ({ skillId, problem, onNext, onResult, onMiss, nextLabel, buildMode = 'practice' }) => {
  const [prob] = useState<Prob>(() => problem ?? generate(skillId!));
  const [si, setSi] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  /** いまの手順でまちがえた回数（足場を出すか決める） */
  const [stepMiss, setStepMiss] = useState(0);
  const [msg, setMsg] = useState<{ tone: 'hint' | 'wrong'; text: string } | null>(null);
  const [wrongChoices, setWrongChoices] = useState<ReadonlySet<number>>(new Set());
  const [cells, setCells] = useState<ReadonlySet<number>>(new Set());
  const [tick, setTick] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  // 熟達した項目では足場を出さない（開いたときの値で決める。解いている最中に変えない）
  const [mastered] = useState(() => useProgressStore.getState().getMasteryStreak((problem ?? { skillId: skillId! }).skillId) >= SCAFFOLD_OFF_AT);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに離れたときも1件記録する
  const rec = useRoundRecorder({ moduleId: skillToModuleId(prob.skillId) ?? 'hyo', skillId: prob.skillId, record: recordResult });

  const rawStep = prob.steps[Math.min(si, prob.steps.length - 1)]!;
  const step = buildMode === 'choice' ? asChoiceStep(rawStep) : rawStep;
  const showScaffold = step.ans.kind === 'build' && buildMode === 'practice' && !mastered && stepMiss >= 2;
  const interactive = step.ans.kind === 'tick' || step.ans.kind === 'shade';
  const fig = step.fig ?? prob.fig;
  const showFig = !!fig && (interactive || !prob.figOnHint || mistakes >= 2 || done);

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(prob.label);
    onResult?.(mistakes === 0);
    setDone(true);
    setMsg(null);
  };

  const submit = (inp: Inp) => {
    const v = judge(step.ans, inp);
    if (v === 'ok') {
      setMsg(null);
      setWrongChoices(new Set());
      setCells(new Set());
      setTick(null);
      setStepMiss(0);
      const line = ansLine(step.ans);
      if (si >= prob.steps.length - 1) {
        if (line) setLines((l) => [...l, line]);
        finish();
      } else {
        playCorrect();
        if (line) setLines((l) => [...l, line]);
        setSi(si + 1);
      }
      return;
    }
    if (v === 'equiv') {
      playSoftTry();
      setMsg({ tone: 'hint', text: equivMessage(step.ans, inp) });
      return;
    }
    // まちがい
    playSoftTry();
    const n = mistakes + 1;
    setMistakes(n);
    setStepMiss((m) => m + 1);
    rec.mistake();
    onMiss?.();
    if (inp.i != null && (step.ans.kind === 'choice' || step.ans.kind === 'build')) setWrongChoices((s) => new Set(s).add(inp.i!));
    if (step.ans.kind === 'tick') setTick(null);
    const diag = step.diagnose?.(inp);
    const hint = prob.hints[Math.min(n - 1, prob.hints.length - 1)] ?? '';
    const figNote = n === 2 && prob.figOnHint && prob.fig ? '（図を 出したよ。見て 考えよう）' : '';
    setMsg({ tone: 'wrong', text: diag ? (n >= 2 ? `${diag} ${hint}${figNote}` : diag) : `${hint}${figNote}` });
  };

  const toggleCell = (i: number) =>
    setCells((s) => {
      const t = new Set(s);
      if (t.has(i)) t.delete(i); else t.add(i);
      return t;
    });

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        {/* 出題カード */}
        <div
          className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8"
          data-testid="problem"
          data-skill={prob.skillId}
          data-answer={(import.meta.env.DEV || import.meta.env.VITE_E2E === '1') ? prob.a : undefined}
          data-steps={(import.meta.env.DEV || import.meta.env.VITE_E2E === '1') ? JSON.stringify(prob.steps.map((s) => s.ans)) : undefined}
        >
          <p className="text-xl md:text-2xl font-black text-content leading-[2.2]"><RichText text={prob.text} /></p>
          {showFig && fig && (
            <div className="mt-4">
              <FigureView
                fig={fig}
                cells={step.ans.kind === 'shade' ? cells : undefined}
                onCell={step.ans.kind === 'shade' && !done ? toggleCell : undefined}
                tick={step.ans.kind === 'tick' ? tick : undefined}
                onTick={step.ans.kind === 'tick' && !done ? setTick : undefined}
              />
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {lines.map((l, i) => (
              <span key={i} className="px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-black text-lg border border-emerald-200">
                ✓ <RichText text={l} />
              </span>
            ))}
          </div>
        )}

        {msg && <HintBox tone={msg.tone}><RichText text={msg.text} /></HintBox>}

        {!done && (
          <>
            <p className="text-center text-lg md:text-xl font-black text-content leading-[2.2]"><RichText text={step.prompt} /></p>
            {prob.scratch && <ProbScratch scratch={prob.scratch} />}
            {step.ans.kind === 'tick' && (
              <button
                disabled={tick == null}
                onClick={() => submit({ i: tick! })}
                className="w-full py-5 rounded-3xl text-2xl font-black shadow-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:bg-surface-3 disabled:text-faint transition-all"
              >
                ここに する
              </button>
            )}
            {step.ans.kind === 'shade' && (
              <button
                disabled={cells.size === 0}
                onClick={() => submit({ i: cells.size })}
                className="w-full py-5 rounded-3xl text-2xl font-black shadow-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:bg-surface-3 disabled:text-faint transition-all"
              >
                これで いい
              </button>
            )}
            {step.ans.kind === 'build' && (
              <>
                <ExprBuilder key={si} cards={step.ans.cards} onSubmit={(expr) => submit({ expr })} />
                {showScaffold && (
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4 space-y-3" data-testid="scaffold">
                    <p className="text-center text-sm font-black text-amber-800">むずかしい ときは、しきを えらんでも いいよ</p>
                    <StepInput step={asChoiceStep(step)} wrongChoices={wrongChoices} onSubmit={submit} />
                  </div>
                )}
              </>
            )}
            {!interactive && step.ans.kind !== 'build' && <StepInput key={si} step={step} wrongChoices={wrongChoices} onSubmit={submit} />}
          </>
        )}

        {done && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span className="leading-[2.2]"><RichText text={prob.explain} /></span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-emerald-500 hover:bg-emerald-600"
          />
        )}
      </div>
    </div>
  );
};
