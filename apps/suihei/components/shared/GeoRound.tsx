// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/components/shared/GeoRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 1問を進行させる共通コンポーネント（解答UIのディスパッチャ）。
 *
 * 図の表示 → 問題文 → 解答UI → 段階的ヒント → 誤答診断 → 正解の解説、という流れを
 * ここ1か所で保証する。モジュールごとに Round を書くと、どれかで図を出し忘れたり
 * ヒントが1段しかなかったりする事故が起きるため、あえて1本化している。
 *
 * 本番テストモードもこのコンポーネントを使うが、testMode のときは
 *  - ヒントを出さない（測る場面なので足場をかけない）
 *  - 1回答えたら 正誤にかかわらず次へ進む（一発正解を採点する）
 * という違いだけを持たせる。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { Lightbulb } from 'lucide-react';
import { GeoProblem } from '../../lib/problemTypes';
import { QUAD_LABEL, QuadKind } from '../../types';
import { GeoFigure } from './GeoFigure';
import { GridDrawBoard } from './GridDrawBoard';
import { PairPicker } from './PairPicker';
import { OrderCards } from './OrderCards';
import { AnswerEntry } from './AnswerEntry';
import { HintBox, ResultPanel } from '../ui/primitives';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { ScratchPadToggle } from 'learning-app-kit/react';

interface Props {
  problem: GeoProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
  /** 本番テスト・ボス戦モード。ヒントを出さず、1回の解答で確定する。 */
  testMode?: boolean;
  /** testMode のとき、解答が確定したら呼ばれる（採点は呼び出し側が行う） */
  onAnswered?: (correct: boolean) => void;
}

/** **太字** を <strong> に変換して表示する（問題文・解説で使う）。 */
export const RichText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span className={className}>
    {text.split('\n').map((line, li) => (
      <React.Fragment key={li}>
        {li > 0 && <br />}
        {line.split(/(\*\*[^*]+\*\*)/g).map((seg, si) =>
          seg.startsWith('**') && seg.endsWith('**') ? (
            <strong key={si} className="text-brand">
              {seg.slice(2, -2)}
            </strong>
          ) : (
            <React.Fragment key={si}>{seg}</React.Fragment>
          ),
        )}
      </React.Fragment>
    ))}
  </span>
);

const CHOICE_LABELS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ'];

export const GeoRound: React.FC<Props> = ({ problem, onNext, onResult, onMiss, nextLabel, testMode = false, onAnswered }) => {
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** testMode で確定した答えの正誤（結果のパネルに 〇× を出す） */
  const [verdict, setVerdict] = useState<'correct' | 'wrong' | undefined>(undefined);
  const recordResult = useProgressStore((s) => s.recordResult);

  /**
   * まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す。
   * 本番テスト・ボス戦（testMode）では練習の記録を作らないので、
   * 記録する関数のかわりに何もしない関数を渡しておく。
   */
  const rec = useRoundRecorder({
    moduleId: problem.moduleId,
    skillId: problem.skillId,
    record: testMode ? () => {} : recordResult,
    abandonLabel: () => problem.label,
  });

  /** まちがえた回数に応じて強くなるヒント。1回目は答えの値を見せない。 */
  const hint = useMemo(() => {
    if (testMode || mistakes === 0) return null;
    return problem.hints[Math.min(mistakes - 1, problem.hints.length - 1)];
  }, [mistakes, problem.hints, testMode]);

  const finish = () => {
    const perfect = mistakes === 0;
    if (!testMode) {
      playClear();
      confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
      rec.finish(problem.label);
      onResult?.(perfect);
    }
    setDone(true);
  };

  /** 解答を判定する。testMode では 1回で確定する。 */
  const judge = (ok: boolean, diagnosis?: string | null) => {
    if (done) return;
    if (testMode) {
      onAnswered?.(ok);
      setVerdict(ok ? 'correct' : 'wrong');
      setDone(true);
      return;
    }
    if (ok) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setFeedback(diagnosis ?? null);
    }
  };

  const a = problem.answer;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4 pb-8">
        {/* 図。図形単元なので、ここが空になる問題を作らないようにしている。
            ただし作図（gridDraw）では、タップする方眼に図を重ねて1枚にするので
            ここには出さない（2枚に分かれていると見くらべながら作図できない）。 */}
        {problem.figure && a.kind !== 'gridDraw' && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-4 md:p-5">
            <GeoFigure spec={problem.figure} height={220} />
          </div>
        )}

        {/* 問題文 */}
        <div className="bg-surface-2 border border-line rounded-3xl p-5">
          <p className="text-lg md:text-xl font-black text-content leading-relaxed">
            <RichText text={problem.prompt} />
          </p>
        </div>

        {/* 誤答診断（なぜ・次にどうするか） */}
        {feedback && !done && (
          <div className="rounded-3xl p-5 border bg-amber-50 border-amber-200 flex items-start gap-3">
            <span className="shrink-0 w-11 h-11 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <Lightbulb size={24} />
            </span>
            <p className="flex-1 text-amber-900 font-bold leading-relaxed">
              <RichText text={feedback} />
            </p>
          </div>
        )}

        {/* 段階的ヒント */}
        {hint && !done && (
          <HintBox tone="hint">
            <RichText text={hint} />
          </HintBox>
        )}

        {/*
          けいさんらんは、しきつめ（角の大きさの合計を計算する）にだけ出す。
          この単元の他の設問は、垂直・平行の見分けや作図が中心で、
          暗算では厳しい計算は出てこない。必要のない画面にボタンを並べると、
          本来の問題が下に押しやられる。
        */}
        {!done && problem.skillId.startsWith('tile-') && (
          <ScratchPadToggle ops={['+', '-', '×', '÷']} decimal={false} />
        )}

        {/* 解答UI */}
        {!done && (
          <>
            {a.kind === 'choice' && (
              <ChoiceGrid
                choices={a.choices}
                onPick={(i) => judge(i === a.correct, problem.diagnose?.(i))}
              />
            )}

            {a.kind === 'name' && (
              <NamePicker
                options={a.options}
                onPick={(i) => judge(a.options[i] === a.correct, problem.diagnose?.(i))}
              />
            )}

            {a.kind === 'multi' && (
              <MultiPicker
                choices={a.choices}
                onSubmit={(picked) => {
                  const want = [...a.correct].sort((x, y) => x - y);
                  const got = [...picked].sort((x, y) => x - y);
                  judge(
                    got.length === want.length && got.every((v, i) => v === want[i]),
                    got.length === 0
                      ? '1つも えらばれていないよ。あてはまるものを タップしてね。'
                      : got.length < want.length
                        ? 'まだ 見つかっていないものが あるよ。1つずつ たしかめよう。'
                        : 'あてはまらないものが 入っているよ。じょうけんを もう一度 見よう。',
                  );
                }}
              />
            )}

            {a.kind === 'number' && (
              <AnswerEntry
                unit={a.unit}
                onSubmit={(v) => judge(Number(v) === a.correct, problem.diagnose?.(Number(v)))}
              />
            )}

            {a.kind === 'pairs' && (
              <PairPicker
                symbols={a.symbols}
                relation={a.relation}
                onSubmit={(pairs) => {
                  const norm = (ps: [number, number][]) =>
                    ps.map(([x, y]) => (x < y ? `${x}-${y}` : `${y}-${x}`)).sort().join(',');
                  const ok = norm(pairs) === norm(a.correct);
                  judge(
                    ok,
                    pairs.length < a.correct.length
                      ? `${a.relation}な組は ぜんぶで ${a.correct.length}組 あるよ。もう一度 さがしてみよう。`
                      : pairs.length > a.correct.length
                        ? `${a.relation}では ない組が 入っているよ。1組ずつ たしかめよう。`
                        : `組の 数は 合っているけれど、中身が ちがうよ。のばして 交わり方を 見よう。`,
                  );
                }}
              />
            )}

            {a.kind === 'order' && (
              <OrderCards
                steps={a.steps}
                onSubmit={(order) => {
                  const ok = order.length === a.correct.length && order.every((v, i) => v === a.correct[i]);
                  judge(ok, ok ? null : 'じゅんばんが ちがうところが あるよ。「はじめに 何を 決めるか」から 考えなおそう。');
                }}
              />
            )}

            {a.kind === 'gridDraw' && (
              <GridDrawBoard
                spec={a}
                figure={problem.figure}
                onSubmit={(picked) => {
                  const key = (ps: { x: number; y: number }[]) =>
                    ps.map((p) => `${p.x},${p.y}`).sort().join('|');
                  const got = key(picked);
                  const ok = a.accept.some((set) => key(set) === got);
                  judge(ok, ok ? null : gridDrawMiss(a, picked));
                }}
              />
            )}

            {a.kind === 'truth' && (
              <TruthTable
                rows={a.rows}
                onSubmit={(answers) => {
                  const ok = answers.every((v, i) => v === a.rows[i].correct);
                  const wrongRow = answers.findIndex((v, i) => v !== a.rows[i].correct);
                  judge(
                    ok,
                    ok ? null : `「${a.rows[wrongRow].label}」を もう一度 図で たしかめよう。`,
                  );
                }}
              />
            )}

            {a.kind === 'matrix' && (
              <PropertyMatrix
                rowLabels={a.rowLabels}
                colLabels={a.colLabels}
                onSubmit={(answers) => {
                  const wrong: string[] = [];
                  answers.forEach((row, i) =>
                    row.forEach((v, j) => {
                      if (v !== a.correct[i][j]) wrong.push(`${a.rowLabels[i]} の「${a.colLabels[j]}」`);
                    }),
                  );
                  judge(
                    wrong.length === 0,
                    wrong.length === 0 ? null : `${wrong.slice(0, 2).join('と')} を もう一度 たしかめよう。${wrong.length > 2 ? `（ほかにも ${wrong.length - 2} か所 あるよ）` : ''}`,
                  );
                }}
              />
            )}

            {a.kind === 'sort' && (
              <SortBoard
                itemLabels={a.itemLabels}
                groups={a.groups}
                onSubmit={(assign) => {
                  const wrong = assign
                    .map((g, i) => (g !== a.correct[i] ? a.itemLabels[i] : null))
                    .filter((x): x is string => x !== null);
                  judge(
                    wrong.length === 0,
                    wrong.length === 0 ? null : `${wrong.join('・')} の 平行な辺を もう一度 数えよう。辺を のばして 考えるのを わすれずに。`,
                  );
                }}
              />
            )}

            {a.kind === 'errorFix' && (
              <ErrorFixFlow
                spec={a}
                onStep={() => playCorrect()}
                onWrong={(msg) => {
                  // テストでは1回で確定する（3段階の どこかで まちがえたら、その問題は ×）
                  if (testMode) { judge(false); return; }
                  playSoftTry();
                  setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
                  setFeedback(msg);
                }}
                onComplete={() => judge(true)}
              />
            )}
          </>
        )}

        {/* 正解後の解説 */}
        {done && (
          <ResultPanel
            perfect={mistakes === 0}
            verdict={verdict}
            detail={<RichText text={problem.explain} className="block text-left leading-relaxed" />}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-blue-600 hover:bg-blue-700"
          />
        )}
      </div>
    </div>
  );
};

/* ============================ 各解答UI ============================ */

const ChoiceGrid: React.FC<{ choices: string[]; onPick: (i: number) => void }> = ({ choices, onPick }) => {
  const [wrong, setWrong] = useState<number[]>([]);
  return (
    <div className="grid grid-cols-1 gap-3">
      {choices.map((c, i) => (
        <button
          key={i}
          onClick={() => {
            onPick(i);
            setWrong((w) => (w.includes(i) ? w : [...w, i]));
          }}
          className={`p-4 md:p-5 rounded-2xl border-2 text-left font-black text-base md:text-lg transition-all active:scale-[0.98] flex items-start gap-3 ${
            wrong.includes(i)
              ? 'bg-amber-50 border-amber-300 text-amber-600'
              : 'bg-surface border-line text-content hover:border-blue-400'
          }`}
        >
          <span className="shrink-0 w-8 h-8 rounded-full bg-surface-3 text-muted flex items-center justify-center text-sm">
            {CHOICE_LABELS[i]}
          </span>
          <span className="flex-1 leading-relaxed">
            <RichText text={c} />
          </span>
        </button>
      ))}
    </div>
  );
};

const NamePicker: React.FC<{ options: QuadKind[]; onPick: (i: number) => void }> = ({ options, onPick }) => {
  const [wrong, setWrong] = useState<number[]>([]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {options.map((o, i) => (
        <button
          key={o}
          onClick={() => {
            onPick(i);
            setWrong((w) => (w.includes(i) ? w : [...w, i]));
          }}
          className={`py-5 rounded-2xl border-2 font-black text-lg transition-all active:scale-[0.97] ${
            wrong.includes(i)
              ? 'bg-amber-50 border-amber-300 text-amber-600'
              : 'bg-surface border-line text-content hover:border-violet-400'
          }`}
        >
          {QUAD_LABEL[o]}
        </button>
      ))}
    </div>
  );
};

const MultiPicker: React.FC<{ choices: string[]; onSubmit: (picked: number[]) => void }> = ({ choices, onSubmit }) => {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {choices.map((c, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`p-4 rounded-2xl border-2 font-black text-left transition-all active:scale-[0.98] flex items-center gap-3 ${
              picked.includes(i)
                ? 'bg-violet-500 border-violet-500 text-white shadow-lg'
                : 'bg-surface border-line text-content hover:border-violet-400'
            }`}
          >
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                picked.includes(i) ? 'bg-white/25' : 'bg-surface-3 text-muted'
              }`}
            >
              {picked.includes(i) ? '✓' : CHOICE_LABELS[i]}
            </span>
            <span className="flex-1 leading-snug">{c}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onSubmit(picked)}
        className="w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all bg-violet-500 hover:bg-violet-600 text-white active:scale-95"
      >
        これで こたえる
      </button>
    </div>
  );
};

const TruthTable: React.FC<{ rows: { label: string; correct: boolean }[]; onSubmit: (answers: boolean[]) => void }> = ({ rows, onSubmit }) => {
  const [answers, setAnswers] = useState<(boolean | null)[]>(rows.map(() => null));
  const set = (i: number, v: boolean) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)));
  const ready = answers.every((a) => a !== null);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
          <span className="flex-1 font-bold text-content leading-snug">{r.label}</span>
          <div className="flex gap-2 shrink-0">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => set(i, v)}
                className={`w-14 h-14 rounded-2xl border-2 font-black text-2xl transition-all active:scale-95 ${
                  answers[i] === v
                    ? v
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-rose-500 border-rose-500 text-white'
                    : 'bg-surface border-line text-muted hover:border-blue-400'
                }`}
              >
                {v ? '○' : '×'}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => ready && onSubmit(answers as boolean[])}
        disabled={!ready}
        className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
          ready ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95' : 'bg-surface-3 text-faint'
        }`}
      >
        これで こたえる
      </button>
    </div>
  );
};

/**
 * 四角形 × 性質 の一覧表に ○× を入れるUI。
 * 市販の単元テストで定番の形式。すべてのますを埋めるまで こたえられない。
 */
const PropertyMatrix: React.FC<{
  rowLabels: string[];
  colLabels: string[];
  onSubmit: (answers: boolean[][]) => void;
}> = ({ rowLabels, colLabels, onSubmit }) => {
  const [answers, setAnswers] = useState<(boolean | null)[][]>(() => rowLabels.map(() => colLabels.map(() => null)));
  const set = (i: number, j: number, v: boolean) =>
    setAnswers((a) => a.map((row, r) => (r === i ? row.map((x, c) => (c === j ? v : x)) : row)));
  const ready = answers.every((row) => row.every((v) => v !== null));

  return (
    <div className="space-y-3">
      {/* 横に長い表はスマホで はみ出すので、行ごとのカードに分けて縦に積む */}
      {rowLabels.map((rl, i) => (
        <div key={rl} className="bg-surface border border-line rounded-2xl p-4">
          <p className="font-black text-content mb-3">{rl}</p>
          <div className="space-y-2">
            {colLabels.map((cl, j) => (
              <div key={cl} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-bold text-muted leading-snug">{cl}</span>
                <div className="flex gap-2 shrink-0">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => set(i, j, v)}
                      aria-label={`${rl} は ${cl} ${v ? 'あてはまる' : 'あてはまらない'}`}
                      className={`w-12 h-12 rounded-xl border-2 font-black text-xl transition-all active:scale-95 ${
                        answers[i][j] === v
                          ? v
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-rose-500 border-rose-500 text-white'
                          : 'bg-surface border-line text-muted hover:border-violet-400'
                      }`}
                    >
                      {v ? '○' : '×'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => ready && onSubmit(answers as boolean[][])}
        disabled={!ready}
        className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
          ready ? 'bg-violet-500 hover:bg-violet-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
        }`}
      >
        これで こたえる
      </button>
    </div>
  );
};

/**
 * 図形をグループに仲間分けするUI。
 * 授業の中心活動（かいた四角形を仲間分けする）をそのまま操作にしたもの。
 */
const SortBoard: React.FC<{
  itemLabels: string[];
  groups: string[];
  onSubmit: (assign: number[]) => void;
}> = ({ itemLabels, groups, onSubmit }) => {
  const [assign, setAssign] = useState<(number | null)[]>(() => itemLabels.map(() => null));
  const ready = assign.every((v) => v !== null);

  return (
    <div className="space-y-3">
      {itemLabels.map((label, i) => (
        <div key={label} className="bg-surface border border-line rounded-2xl p-4">
          <p className="font-black text-content mb-2">図 {label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {groups.map((g, gi) => (
              <button
                key={g}
                onClick={() => setAssign((a) => a.map((v, k) => (k === i ? gi : v)))}
                className={`py-3 px-3 rounded-xl border-2 font-black text-sm transition-all active:scale-95 ${
                  assign[i] === gi
                    ? 'bg-violet-500 border-violet-500 text-white shadow'
                    : 'bg-surface border-line text-content hover:border-violet-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => ready && onSubmit(assign as number[])}
        disabled={!ready}
        className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
          ready ? 'bg-violet-500 hover:bg-violet-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
        }`}
      >
        これで こたえる
      </button>
    </div>
  );
};

/**
 * エラーハンターの3段階（まちがい発見 → 修正 → 理由）。
 * 段階ごとに正解しないと次へ進めないので、「なぜ まちがいなのか」まで
 * 必ず言語化して終わる。
 */
const ErrorFixFlow: React.FC<{
  spec: Extract<GeoProblem['answer'], { kind: 'errorFix' }>;
  onStep: () => void;
  onWrong: (msg: string) => void;
  onComplete: () => void;
}> = ({ spec, onStep, onWrong, onComplete }) => {
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  const stages = [
    {
      title: 'まず、まちがっている 考えを 見つけよう',
      choices: spec.wrongOptions,
      correct: spec.wrongIndex,
      wrongMsg: 'それは 正しい 考えだよ。図と 見くらべて、合わないものを さがそう。',
    },
    {
      title: 'つぎに、正しくは どうなるかを えらぼう',
      choices: spec.fixChoices,
      correct: spec.fixIndex,
      wrongMsg: 'じょうけん（決め方）に もどって 考えよう。図の どこを 見れば たしかめられるかな。',
    },
    {
      title: 'さいごに、なぜ そう まちがえたのかを えらぼう',
      choices: spec.reasons,
      correct: spec.reasonIndex,
      wrongMsg: 'まちがえた 人が 「何を 手がかりに して しまったか」を 考えよう。',
    },
  ] as const;

  const s = stages[stage];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {stages.map((_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${i < stage ? 'bg-emerald-500' : i === stage ? 'bg-blue-500' : 'bg-surface-3'}`}
          />
        ))}
      </div>
      <motion.p key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-black text-content mb-3">
        {stage + 1}. {s.title}
      </motion.p>
      <ChoiceGrid
        key={`stage-${stage}`}
        choices={[...s.choices]}
        onPick={(i) => {
          if (i === s.correct) {
            if (stage === 2) {
              onComplete();
            } else {
              onStep();
              setStage((v) => (v + 1) as 0 | 1 | 2);
            }
          } else {
            onWrong(s.wrongMsg);
          }
        }}
      />
    </div>
  );
};

/**
 * 作図（方眼の点をタップ）でまちがえたときの声かけ。
 * 垂直・平行な直線をひく問題では、いまの線と直線あの角度を出して「何がちがうか」を見せる。
 * 方眼の点だけでは 87° と 90° は見分けられないので、数で見せないと答えにたどりつけない。
 */
function gridDrawMiss(a: Extract<GeoProblem['answer'], { kind: 'gridDraw' }>, picked: { x: number; y: number }[]): string {
  const p = picked[0];
  if (a.connect === 'lineFrom' && a.base && a.target && p) {
    const v = { x: p.x - a.base.x, y: p.y - a.base.y };
    const d = a.target.dir;
    const cos = Math.abs(v.x * d.x + v.y * d.y) / (Math.hypot(v.x, v.y) * Math.hypot(d.x, d.y));
    const deg = (Math.acos(Math.min(1, cos)) * 180) / Math.PI; // 0〜90°
    if (a.target.mode === 'perp') {
      // 89.6° のように 90 に丸まってしまう角だけ、小数で見せる（「90°なのに×」に見えないように）
      const shown = Math.round(deg) === 90 ? deg.toFixed(1) : String(Math.round(deg));
      return `いまの線と 直線あが 交わる 角は 約${shown}°。垂直は ちょうど 90° だよ。` +
        (deg > 80 ? '見た目は 直角に 近くても、ますを 数えると ずれているね。' : '') +
        'ヒントで ますの数を たしかめよう。';
    }
    return `いまの線は、直線あと 向きが 約${Math.round(deg) === 0 ? deg.toFixed(1) : Math.round(deg)}° ずれているよ。平行は 向きが まったく同じ（ずれが 0°）。ヒントで ますの数を たしかめよう。`;
  }
  return 'その点だと、めざす 形に ならないよ。ヒントを 見て もう一度 考えよう。';
}

