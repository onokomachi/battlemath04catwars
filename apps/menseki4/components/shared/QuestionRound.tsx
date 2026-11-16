// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/components/shared/QuestionRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 1問を解く画面。練習・本番テスト・実力の階段・ボス戦のすべてで、これを使う。
 * （同じ問題は、どこで出ても同じ画面で解く）
 *
 * 答え方は問題の steps に並んでいる（式 → 答え、のように）。
 * 1ステップずつ答えさせて、できた数は画面にのこす。紙に途中の数を書いておく代わり。
 * 「かける」「わる」が要る段には、けいさんらんを添える（アプリの外で計算させない）。
 *
 *  - 数の欄 / 選ぶ欄 / □に入れる欄（式・表）/ 方眼に形をつくる / 折れ線グラフに点をうつ
 *  - けいさんらん: kit の ScratchPad（かけ算・わり算）
 *  - まちがえたら、よくある まちがいに合わせた ひとことを出す。ヒントは 3段で、1回目から答えは見せない
 *  - 選ぶ問題は、正解のあとで「なぜそうなるか」を読ませる（練習のときだけ。テストでは出さない）
 *  - 記録は kit の useRoundRecorder。できなかった問題（まちがえた回数・とちゅうでやめた）も残る
 */
import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Lightbulb, Check, X } from 'lucide-react';
import { ScratchPad, useRoundRecorder } from 'learning-app-kit/react';
import { Keypad } from './Keypad';
import { FigureView } from './Figure';
import { FillView, CellsView, PlotView, BuildView } from './StepViews';
import { HintBox, ResultPanel } from '../ui/primitives';
import type { Question, Step, NumStep, ChoiceStep, PadSpec } from '../../lib/question';
import { fmt, same, toNum } from '../../lib/question';
import { skillToModuleId, useProgressStore } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { encourage } from '../../lib/praise';

interface Props {
  question: Question;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
  /** 測る場面（本番テスト・実力の階段・ボス戦）。ヒントと理由の言語化を出さない */
  testMode?: boolean;
  accentClass?: string;
  /** ボス戦: 組み立てる問題も「選ぶ」形（足場）で出す */
  chooseMode?: boolean;
}

/** 入力欄に入れられる文字数（問題の答えは検査で 7文字以内にしてある） */
const MAX_CHARS = 7;

/** 画面に出す「できた数」の札 */
interface Done { label: string; text: string }

const CalcPad: React.FC<{ pad: Extract<PadSpec, { kind: 'calc' }> }> = ({ pad }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="px-5 py-2.5 rounded-full bg-sky-100 text-sky-700 font-black text-sm active:scale-95 transition">
        📝 {open ? 'けいさんらんを とじる' : '筆算で けいさんする'}
      </button>
      {open && <ScratchPad ops={pad.ops} decimal initial={pad.initial} />}
    </div>
  );
};

export const QuestionRound: React.FC<Props> = ({ question, onNext, onResult, onMiss, nextLabel, testMode = false, accentClass = 'bg-emerald-500 hover:bg-emerald-600', chooseMode = false }) => {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Done[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [stepMiss, setStepMiss] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [wrongSet, setWrongSet] = useState<number[]>([]);
  const [shownHints, setShownHints] = useState(0);
  const [finished, setFinished] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  const moduleId = skillToModuleId(question.skillId) ?? 'grid';
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに離れたときも1件記録する
  const rec = useRoundRecorder({ moduleId, skillId: question.skillId, record: recordResult });
  const endRef = useRef<HTMLDivElement>(null);

  const mastered = useProgressStore((s) => s.getMasteryStreak(question.skillId)) >= 1;
  const rawStep: Step | undefined = question.steps[idx];
  /**
   * 足場: 組み立てる・数を入れる問題に「選ぶ」形を持たせてある。
   *  - 練習: 2回まちがえたら出す（習熟度が満タンの項目では出さない）
   *  - 本番テスト・実力の階段（testMode）: 出さない（組み立てだけ）
   *  - ボス戦（chooseMode）: 最初から「選ぶ」形
   */
  const scaffold = rawStep && 'scaffold' in rawStep ? rawStep.scaffold : undefined;
  const scaffoldOn = !!scaffold && (chooseMode || (!testMode && stepMiss >= 2 && !mastered));
  const step: Step | undefined = scaffoldOn && scaffold ? { ...scaffold, label: rawStep!.label } : rawStep;
  const last = idx === question.steps.length - 1;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [idx, finished]);

  // 自動テスト用: いま出している問題を window に出す（VITE_E2E=1 で build したときだけ。本番には入らない）
  useEffect(() => {
    if ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_E2E) {
      (window as unknown as { __menseki4Q?: Question }).__menseki4Q = question;
    }
  }, [question]);

  const miss = (note: string | null) => {
    playSoftTry();
    setMistakes((m) => m + 1);
    setStepMiss((m) => m + 1);
    rec.mistake();
    onMiss?.();
    setMsg(note ?? encourage());
  };

  const finish = () => {
    setFinished(true);
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(question.label);
    onResult?.(mistakes === 0);
  };

  const advance = (d?: Done) => {
    if (d) setDone((x) => [...x, d]);
    setMsg(null);
    setInput('');
    setPicked(null);
    setWrongSet([]);
    setStepMiss(0);
    setShownHints(0);
    if (last) finish();
    else setIdx((i) => i + 1);
  };

  /* ---- 数の欄 ---- */
  const submitNum = (s: NumStep) => {
    const v = toNum(input);
    if (v === null) return;
    if (same(v, s.answer)) {
      playCorrect();
      advance({ label: s.label, text: `${fmt(s.answer)}${s.unit ?? ''}` });
    } else {
      miss(s.diagnose?.(v) ?? null);
    }
  };

  const onKey = (d: string, s: NumStep) => {
    if (d === '.') {
      if (!s.decimal || input.includes('.') || input === '') return;
    }
    if (input.length >= MAX_CHARS) return;
    setInput(input + d);
  };

  /* ---- 選ぶ欄 ---- */
  const pickChoice = (s: ChoiceStep, i: number) => {
    if (picked === s.correct || wrongSet.includes(i)) return;
    if (i === s.correct) {
      playCorrect();
      setPicked(i);
      setMsg(null);
      // テストでは理由を読ませずにすぐ進む（測る場面）。練習では理由を読んでから進む
      if (testMode) advance({ label: s.label, text: s.choices[i] as string });
    } else {
      setWrongSet((w) => [...w, i]);
      miss(s.wrong?.[i] ?? null);
    }
  };

  const hintList = step ? step.hints : [];
  // まちがえた回数に応じて、強いヒントを順に出す（1回目から答えは見せない）
  const autoHints = testMode ? 0 : Math.min(stepMiss, 3);
  const showHints = Math.max(autoHints, shownHints);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8" data-testid="question-round" data-skill={question.skillId}>
      <div className="max-w-xl mx-auto space-y-4">
        {/* 問題文と図 */}
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-5 md:p-7">
          <div className="text-4xl text-center mb-2">{question.emoji}</div>
          <p className="text-lg md:text-xl font-black text-content leading-relaxed whitespace-pre-line">{question.text}</p>
          {question.figure && (
            <div className="mt-4">
              <FigureView key={question.text} figure={question.figure} />
            </div>
          )}
        </div>

        {/* できた数（紙に書きとめる かわり） */}
        {done.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center" data-testid="done-chips">
            {done.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-black text-sm">
                <Check size={14} /> {d.label}： <span className="tabular-nums">{d.text}</span>
              </span>
            ))}
          </div>
        )}

        {!finished && step && (
          <div className="bg-surface border-2 border-line rounded-[28px] p-5" data-testid="current-step">
            {question.steps.length > 1 && (
              <div className="text-xs font-black text-faint mb-1">ステップ {idx + 1} / {question.steps.length}　{step.label}</div>
            )}
            <p className="text-base md:text-lg font-black text-content leading-relaxed mb-2 whitespace-pre-line">{step.prompt}</p>

            {step.kind === 'num' && (
              <>
                {step.pad && <div className="text-center my-2"><CalcPad pad={step.pad} /></div>}
                <div className="h-20 rounded-2xl bg-surface-2 border-2 border-line flex items-center justify-center gap-2 mb-3">
                  <span className="text-5xl font-black tabular-nums text-content" data-testid="num-input">{input || <span className="text-faint">？</span>}</span>
                  {step.unit && <span className="text-xl font-black text-muted">{step.unit}</span>}
                </div>
                <Keypad
                  onInput={(d) => onKey(d, step)}
                  onBackspace={() => setInput(input.slice(0, -1))}
                  onSubmit={() => submitNum(step)}
                  submitLabel="こたえる"
                  submitEnabled={toNum(input) !== null}
                  allowDecimal={!!step.decimal}
                />
              </>
            )}

            {step.kind === 'choice' && (
              <>
                {step.pad && <div className="text-center my-2"><CalcPad pad={step.pad} /></div>}
                <div className={`grid gap-3 mt-2 ${step.choices.some((c) => c.length > 14) ? 'grid-cols-1' : 'grid-cols-2'}`} data-testid="choices">
                  {step.choices.map((c, i) => {
                    const ok = picked === i;
                    const bad = wrongSet.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => pickChoice(step, i)}
                        disabled={bad || picked !== null}
                        className={`px-4 py-4 rounded-2xl border-2 text-left font-black text-lg leading-snug transition active:scale-[0.98] ${
                          ok ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                            : bad ? 'bg-surface-2 border-line text-faint line-through'
                              : 'bg-surface border-line text-content hover:border-brand'
                        }`}
                      >
                        <span className="flex items-center gap-2">{ok && <Check size={20} />}{bad && <X size={18} />}<span>{c}</span></span>
                      </button>
                    );
                  })}
                </div>
                {picked === step.correct && !testMode && (
                  <div className="mt-4">
                    <HintBox>{step.why}</HintBox>
                    <button onClick={() => advance({ label: step.label, text: step.choices[step.correct] as string })} className={`w-full mt-3 py-4 text-white rounded-2xl font-black text-xl shadow-lg transition active:scale-95 ${accentClass}`}>
                      なるほど！ つぎへ
                    </button>
                  </div>
                )}
              </>
            )}

            {step.kind === 'fill' && (
              <>
                {step.pad && <div className="text-center my-2"><CalcPad pad={step.pad} /></div>}
                <FillView key={idx} step={step} onCorrect={(t) => { playCorrect(); advance({ label: step.label, text: t }); }} onWrong={miss} />
              </>
            )}
            {step.kind === 'build' && (
              <BuildView key={idx} step={step} onCorrect={(t) => { playCorrect(); advance({ label: step.label, text: t }); }} onWrong={miss} />
            )}
            {scaffoldOn && !chooseMode && (
              <p className="mt-2 text-xs font-black text-amber-700" data-testid="scaffold-note">▼ 3つから えらんで みよう（つぎは じぶんで くみたてよう）</p>
            )}
            {step.kind === 'cells' && (
              <CellsView key={idx} step={step} onCorrect={(t) => { playCorrect(); advance({ label: step.label, text: t }); }} onWrong={miss} />
            )}
            {step.kind === 'plot' && (
              <PlotView key={idx} step={step} onCorrect={(t) => { playCorrect(); advance({ label: step.label, text: t }); }} onWrong={miss} />
            )}

            {/* まちがいへの ひとこと */}
            {msg && (
              <div className="mt-4" data-testid="miss-message">
                <HintBox tone="wrong">{msg}</HintBox>
              </div>
            )}

            {/* ヒント（まちがえるたびに 1段ずつ。「ヒント」ボタンでも 1段ずつ見られる） */}
            {!testMode && showHints > 0 && (
              <div className="mt-3 space-y-2" data-testid="hints">
                {hintList.slice(0, showHints).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm font-bold text-muted"><Lightbulb size={16} className="text-amber-500 shrink-0 mt-0.5" /><span>{h}</span></div>
                ))}
              </div>
            )}
            {!testMode && showHints < hintList.length && (
              <button onClick={() => setShownHints(showHints + 1)} className="mt-3 text-sm font-black text-brand underline underline-offset-4">
                ヒントを 見る
              </button>
            )}
          </div>
        )}

        {finished && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={testMode ? undefined : <span className="text-sm leading-relaxed">{question.summary}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass={accentClass}
          />
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};
