// このファイルは単元アプリ syo4-tyokuhoutaitorippoutai の src/components/shared/QuestionRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 1問を解く画面。練習・本番テスト・実力の階段・ボス戦のすべてで、これを使う。
 * （同じ問題は、どこで出ても同じ画面で解く）
 *
 * 答え方は問題の steps に並んでいる（面の数 → 辺の数 → 頂点の数、のように）。
 * 1ステップずつ答えさせて、できた答えは画面に札でのこす。
 * 作図（展開図・見取図・点）は、方眼をタップして答える（SolidInputs）。
 *
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
import { MultiPicker, NetPaint, SketchBoard, DashBoard, PointPicker, EdgeBuilder } from './SolidInputs';
import { HintBox, ResultPanel } from '../ui/primitives';
import type { Question, Step, NumStep, ChoiceStep, MultiStep, PadSpec } from '../../lib/question';
import { toNum } from '../../lib/question';
import { gradeMulti, gradeEdges, gradePaint, gradeSketch, gradeDash, gradePoint, type Graded } from '../../lib/grade';
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
}

/** 入力欄に入れられる文字数 */
const MAX_CHARS = 5;

/** 画面に出す「できた答え」の札 */
interface Done { label: string; text: string }

const CalcPad: React.FC<{ pad: PadSpec }> = ({ pad }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-center my-2" data-testid="calc-pad-toggle">
      <button onClick={() => setOpen((v) => !v)} className="px-5 py-2.5 rounded-full bg-sky-100 text-sky-700 font-black text-sm active:scale-95 transition">
        📝 {open ? 'けいさんらんを とじる' : '筆算で けいさんする'}
      </button>
      {open && <ScratchPad ops={pad.ops} />}
    </div>
  );
};

export const QuestionRound: React.FC<Props> = ({ question, onNext, onResult, onMiss, nextLabel, testMode = false, accentClass = 'bg-emerald-500 hover:bg-emerald-600' }) => {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Done[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [stepMiss, setStepMiss] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [wrongSet, setWrongSet] = useState<number[]>([]);
  const [multiOk, setMultiOk] = useState(false);
  const [scaffoldWrong, setScaffoldWrong] = useState<number[]>([]);
  const [shownHints, setShownHints] = useState(0);
  const [finished, setFinished] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  const moduleId = skillToModuleId(question.skillId) ?? 'kousei';
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに離れたときも1件記録する
  // 辺を組み立てる問いの足場（えらぶ形）。練習で2回まちがえたら出す。できるようになった項目（連続ノーミス3回以上）では出さない
  const streak = useProgressStore((s) => s.getMasteryStreak(question.skillId));
  const rec = useRoundRecorder({ moduleId, skillId: question.skillId, record: recordResult });
  const endRef = useRef<HTMLDivElement>(null);

  const step: Step | undefined = question.steps[idx];
  const last = idx === question.steps.length - 1;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [idx, finished]);

  // 自動テスト用: いま出している問題を window に出す（VITE_E2E=1 で build したときだけ。本番には入らない）
  useEffect(() => {
    if ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_E2E) {
      (window as unknown as { __rippoutaiQ?: Question }).__rippoutaiQ = question;
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
    setMultiOk(false);
    setScaffoldWrong([]);
    setStepMiss(0);
    setShownHints(0);
    if (last) finish();
    else setIdx((i) => i + 1);
  };

  /** 作図・全部えらぶ の採点結果を受ける */
  const judged = (g: Graded, d: Done) => {
    if (g.ok) { playCorrect(); advance(d); } else miss(g.note);
  };

  /* ---- 数の欄 ---- */
  const submitNum = (s: NumStep) => {
    const v = toNum(input);
    if (v === null) return;
    if (v === s.answer) {
      playCorrect();
      advance({ label: s.label, text: `${s.before ?? ''}${s.answer}${s.unit ?? ''}` });
    } else {
      miss(s.diagnose?.(v) ?? null);
      setInput('');
    }
  };

  const onKey = (d: string) => {
    if (d === '.') return;
    if (input.length >= MAX_CHARS) return;
    setInput(input === '0' ? d : input + d);
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
          {question.emoji && <div className="text-4xl text-center mb-2">{question.emoji}</div>}
          <p className="text-lg md:text-xl font-black text-content leading-relaxed whitespace-pre-line">{question.text}</p>
          {question.figure && (
            <div className="mt-4">
              <FigureView figure={question.figure} />
            </div>
          )}
        </div>

        {/* できた答え */}
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
          <div className="bg-surface border-2 border-line rounded-[28px] p-5" data-testid="current-step" data-kind={step.kind}>
            {question.steps.length > 1 && (
              <div className="text-xs font-black text-faint mb-1">ステップ {idx + 1} / {question.steps.length}　{step.label}</div>
            )}
            <p className="text-base md:text-lg font-black text-content leading-relaxed mb-3 whitespace-pre-line">{step.prompt}</p>

            {step.kind === 'num' && (
              <>
                {step.pad && <CalcPad pad={step.pad} />}
                <div className="h-20 rounded-2xl bg-surface-2 border-2 border-line flex items-center justify-center gap-2 mb-3">
                  {step.before && <span className="text-xl font-black text-muted">{step.before}</span>}
                  <span className="text-5xl font-black tabular-nums text-content" data-testid="num-input">{input || <span className="text-faint">？</span>}</span>
                  {step.unit && <span className="text-xl font-black text-muted">{step.unit}</span>}
                </div>
                <Keypad
                  onInput={onKey}
                  onBackspace={() => setInput(input.slice(0, -1))}
                  onSubmit={() => submitNum(step)}
                  submitLabel="こたえる"
                  submitEnabled={toNum(input) !== null}
                />
              </>
            )}

            {step.kind === 'choice' && (
              <>
                <div className={`grid gap-3 mt-2 ${step.choices.some((c) => c.length > 10) ? 'grid-cols-1' : 'grid-cols-2'}`} data-testid="choices">
                  {step.choices.map((c, i) => {
                    const ok = picked === i;
                    const bad = wrongSet.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() => pickChoice(step, i)}
                        disabled={bad || picked !== null}
                        data-testid={`choice-${i}`}
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

            {step.kind === 'multi' && (
              <>
                <MultiPicker key={idx} step={step} locked={multiOk} onSubmit={(p) => {
                  const g = gradeMulti(step, p);
                  const text = step.correct.map((i) => step.options[i]).join('・');
                  if (!g.ok) { miss(g.note); return; }
                  playCorrect();
                  setMsg(null);
                  if (testMode) advance({ label: step.label, text });
                  else setMultiOk(true);
                }} />
                {multiOk && !testMode && (
                  <div className="mt-4">
                    <HintBox>{step.why}</HintBox>
                    <button onClick={() => advance({ label: step.label, text: step.correct.map((i) => step.options[i]).join('・') })} className={`w-full mt-3 py-4 text-white rounded-2xl font-black text-xl shadow-lg transition active:scale-95 ${accentClass}`}>
                      なるほど！ つぎへ
                    </button>
                  </div>
                )}
              </>
            )}

            {step.kind === 'edges' && (
              <>
                <EdgeBuilder key={idx} step={step} onSubmit={(p) => judged(gradeEdges(step, p), { label: step.label, text: step.correct.map((c) => `辺${c}`).join('・') })} />
                {!testMode && stepMiss >= 2 && streak < 0.6 && (
                  <div className="mt-4 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 p-3" data-testid="scaffold">
                    <div className="text-sm font-black text-sky-800 mb-2">こまったら、ここから えらんでも いいよ</div>
                    {step.scaffold.kind === 'multi' ? (
                      <MultiPicker key={`s${idx}`} step={step.scaffold as MultiStep} locked={false} onSubmit={(p) => {
                        const sc = step.scaffold as MultiStep;
                        const g = gradeMulti(sc, p);
                        if (!g.ok) { miss(g.note); return; }
                        playCorrect();
                        advance({ label: step.label, text: sc.correct.map((i) => sc.options[i]).join('・') });
                      }} />
                    ) : (
                      <div className="grid grid-cols-1 gap-2" data-testid="scaffold-choices">
                        {(step.scaffold as ChoiceStep).choices.map((c, i) => {
                          const sc = step.scaffold as ChoiceStep;
                          const bad = scaffoldWrong.includes(i);
                          return (
                            <button key={i} disabled={bad} data-testid={`scaffold-choice-${i}`}
                              onClick={() => {
                                if (i === sc.correct) { playCorrect(); advance({ label: step.label, text: c }); }
                                else { setScaffoldWrong((w) => [...w, i]); miss(sc.wrong?.[i] ?? null); }
                              }}
                              className={`px-4 py-3 rounded-2xl border-2 text-left font-black text-lg transition active:scale-[0.98] ${bad ? 'bg-surface-2 border-line text-faint line-through' : 'bg-surface border-line text-content hover:border-brand'}`}>
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {step.kind === 'paint' && (
              <NetPaint key={idx} step={step} onSubmit={(cells) => judged(gradePaint(step, cells), { label: step.label, text: 'かけた！' })} />
            )}
            {step.kind === 'sketch' && (
              <SketchBoard key={idx} step={step} onSubmit={(segs) => judged(gradeSketch(step, segs), { label: step.label, text: 'かけた！' })} />
            )}
            {step.kind === 'dash' && (
              <DashBoard key={idx} step={step} onSubmit={(edges) => judged(gradeDash(step, edges), { label: step.label, text: step.answer.map((e) => `辺${e}`).join('・') })} />
            )}
            {step.kind === 'point' && (
              <PointPicker key={idx} step={step} onSubmit={(p) => judged(gradePoint(step, p), { label: step.label, text: `点${step.answerLabel}を かいた` })} />
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
