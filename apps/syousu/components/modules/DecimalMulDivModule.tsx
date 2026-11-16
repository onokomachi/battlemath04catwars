// このファイルは単元アプリ syo4-syousu-v2 の src/components/modules/DecimalMulDivModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小数の かけ算・わり算（筆算）モジュール。
 * - かけ算: 整数として積を立て、最後に「小数点をうつ」（積の小数点の位置決定＝核心スキル, Mugz対策）
 *   かける数が2けたなら 部分積を2行 書いてから たす。積の終わりの0は 小数点をうったあとで消す。
 * - わり算: 商の小数点を被除数の真上にそろえる・割り進み・空位0・あまり（Dugz対策）
 *   わる数が2けたでも同じ手順（たてる→かける→ひく→おろす）。ひいた答えが2けたになってもよい。
 *   あまりのあるわり算は あまりと けん算、がい数は 上から3けためを四捨五入。
 * 数はすべて整数スケール（decimalMulDiv.ts）で作る。
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import { motion } from 'motion/react';
import { ChevronLeft, RotateCcw, Lightbulb, X as XIcon, Divide, Wand2, BookOpen, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { Keypad } from '../shared/Keypad';
import { AnswerEntry } from '../shared/AnswerEntry';
import {
  MUL_LEVELS, MulLevel, MulProblem, buildMul,
  DIV_LEVELS, DivLevel, DivProblem, buildDiv,
} from '../../lib/decimalMulDiv';
import { EXTRA_LEVELS, generateMulDiv, mulDivLabel, type MulDivLevel, type MulDivQ } from '../../lib/mulDivQuestions';
import { useProgressStore } from '../../store/progressStore';
import { LevelCard } from '../ui/primitives';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { useAdaptive } from '../../lib/useAdaptive';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { MulDivRound } from './MulDivRounds';

interface Props {
  onExit: () => void;
}

type Group = 'mul' | 'div' | 'think' | 'word';

const THINK_IDS: MulDivLevel[] = ['mul-mental', 'div-mental', 'mul-method', 'mul-point', 'div-point'];
const WORD_IDS: MulDivLevel[] = ['mul-word', 'div-word', 'div-word-remainder', 'div-times'];

export const DecimalMulDivModule: React.FC<Props> = ({ onExit }) => {
  const [phase, setPhase] = useState<'SETUP' | 'SIM'>('SETUP');
  const [group, setGroup] = useState<Group>('mul');
  const [mode, setMode] = useState<'fixed' | 'adaptive'>('fixed');
  const [level, setLevel] = useState<MulDivLevel>('mul-tenths');
  const [q, setQ] = useState<MulDivQ | null>(null);
  const [round, setRound] = useState(0);
  const mulAdaptive = useAdaptive(MUL_LEVELS.map((l) => l.id));
  const divAdaptive = useAdaptive(DIV_LEVELS.map((l) => l.id));

  const adaptive = group === 'mul' ? mulAdaptive : divAdaptive;
  const effLevel: MulDivLevel = mode === 'adaptive' ? adaptive.level : level;
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);

  const start = (g: Group, lv: MulDivLevel) => {
    setGroup(g); setMode('fixed'); setLevel(lv); setQ(generateMulDiv(lv)); setRound((r) => r + 1); setPhase('SIM');
  };
  const startAdaptive = (g: 'mul' | 'div') => {
    const a = g === 'mul' ? mulAdaptive : divAdaptive;
    setGroup(g); setMode('adaptive'); setQ(generateMulDiv(a.level)); setRound((r) => r + 1); setPhase('SIM');
  };
  const next = () => { setQ(generateMulDiv(effLevel)); setRound((r) => r + 1); };

  if (phase === 'SETUP') {
    const Cards: React.FC<{ g: Group; ids: { id: MulDivLevel; label: string; description: string }[]; accent: string }> = ({ g, ids, accent }) => (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ids.map((lv) => (
          <LevelCard
            key={lv.id}
            label={lv.label}
            desc={lv.description}
            mastery={getMasteryStreak(lv.id)}
            todayCount={getTodaySkillCount(lv.id)}
            onClick={() => start(g, lv.id)}
            accentBorder={accent}
          />
        ))}
      </div>
    );
    const AdaptiveButton: React.FC<{ g: 'mul' | 'div'; color: string }> = ({ g, color }) => (
      <button onClick={() => startAdaptive(g)} className={`w-full mb-3 p-4 rounded-2xl bg-gradient-to-r ${color} text-white shadow hover:shadow-lg text-left transition-all active:scale-[0.98] flex items-center gap-3`}>
        <Wand2 size={24} /><div><div className="font-black">おまかせ（じどうレベル）</div><div className="text-sm text-white/80">むずかしさが かわるよ</div></div>
      </button>
    );
    const extras = (ids: MulDivLevel[]) => EXTRA_LEVELS.filter((l) => ids.includes(l.id));
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button
            onClick={onExit}
            className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2"
          >
            <ChevronLeft size={24} /> 小数ランドへ
          </button>
          <h1 className="text-3xl font-black text-content text-center mb-6">小数の かけ算・わり算</h1>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3 text-violet-600">
              <XIcon size={20} /><span className="font-black">かけ算の 筆算（小数 × 整数）</span>
            </div>
            <AdaptiveButton g="mul" color="from-indigo-500 to-violet-500" />
            <Cards g="mul" ids={MUL_LEVELS} accent="hover:border-violet-400" />
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3 text-blue-600">
              <Divide size={20} /><span className="font-black">わり算の 筆算（小数 ÷ 整数）</span>
            </div>
            <AdaptiveButton g="div" color="from-indigo-500 to-blue-500" />
            <Cards g="div" ids={DIV_LEVELS} accent="hover:border-blue-400" />
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3 text-amber-600">
              <Sparkles size={20} /><span className="font-black">あんざん・計算の しくみ・小数点</span>
            </div>
            <Cards g="think" ids={extras(THINK_IDS)} accent="hover:border-amber-400" />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3 text-teal-600">
              <BookOpen size={20} /><span className="font-black">文章題・小数倍</span>
            </div>
            <Cards g="word" ids={extras(WORD_IDS)} accent="hover:border-teal-400" />
          </section>
        </div>
      </div>
    );
  }

  const title = group === 'mul' ? '小数の かけ算' : group === 'div' ? '小数の わり算' : group === 'think' ? 'しくみ・小数点' : '文章題・小数倍';
  const subtitle = mode === 'adaptive' ? 'おまかせ' : mulDivLabel(level);

  return (
    <AppShell title={title} subtitle={subtitle} onBack={() => setPhase('SETUP')}>
      <div className="flex flex-col h-full">
        {mode === 'adaptive' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          {q && (
            <MulDivRound
              key={round}
              q={q}
              onNext={next}
              onResult={mode === 'adaptive' ? adaptive.onResult : undefined}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
};

/* ============================ かけ算 ============================ */

const MCELL = 50;
const MGAP = 18;

type MulStage = 'DIGITS' | 'POINT' | 'TRIM' | 'DONE';

interface SimProps<P> {
  problem: P;
  level: string;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  onMiss?: () => void;
  nextLabel?: string;
  /** 計算は済んだ形で出し、小数点をうつところだけ答える（大問6） */
  pointOnly?: boolean;
}

export const MulSimulator: React.FC<SimProps<MulProblem>> = ({ problem, level, onNext, onResult, onMiss, nextLabel = 'つぎの もんだい', pointOnly = false }) => {
  const model = useMemo(() => buildMul(problem.a, problem.b), [problem]);
  const { productIntDigits, decimals, productStr, b, aDigits, partials, trailingZeros } = model;
  const bStr = b.toString();
  const twoRow = partials.length === 2;
  const totalCols = Math.max(
    productIntDigits.length, aDigits.length, bStr.length,
    ...partials.map((p) => p.digits.length + p.shift),
  );

  const cellsOf = (str: string, shift = 0): string[] => {
    const arr = Array(totalCols).fill('');
    for (let i = 0; i < str.length; i++) arr[totalCols - shift - str.length + i] = str[i];
    return arr;
  };
  // 答えを書く行（2けたなら 部分積・部分積・和 の3行）
  const rows: string[][] = twoRow
    ? [cellsOf(partials[0]!.digits, 0), cellsOf(partials[1]!.digits, 1), cellsOf(productIntDigits)]
    : [cellsOf(productIntDigits)];
  const lastRow = rows.length - 1;
  const prodCells = rows[lastRow]!;

  const allFilled = () => {
    const out: Record<string, string> = {};
    rows.forEach((cells, r) => cells.forEach((ch, c) => { if (ch !== '') out[`${r}:${c}`] = ch; }));
    return out;
  };

  const [stage, setStage] = useState<MulStage>(pointOnly ? 'POINT' : 'DIGITS');
  const [row, setRow] = useState(pointOnly ? lastRow : 0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => (pointOnly ? allFilled() : {}));
  const [buffer, setBuffer] = useState(''); // アクティブセルの入力中（最大2桁）
  const [carries, setCarries] = useState<Record<string, string>>({}); // くり上がりメモ（採点なし）
  const [erased, setErased] = useState(0); // 終わりから消した0の数
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [shakeCol, setShakeCol] = useState<number | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'decimal-muldiv',
    skillId: level,
    record: recordResult,
    abandonLabel: () => `${problem.a} × ${problem.b}`,
  });

  const dotGap = totalCols - 1 - decimals; // この cell の右のすきまに小数点

  const activeCol = useMemo(() => {
    if (stage !== 'DIGITS') return null;
    const cells = rows[row]!;
    for (let c = totalCols - 1; c >= 0; c--) {
      if (cells[c] !== '' && answers[`${row}:${c}`] === undefined) return c;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, row, stage, totalCols, model]);

  const miss = (msg: string) => {
    playSoftTry();
    setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
    setHint(msg);
  };

  const finish = () => {
    setStage('DONE');
    playClear();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    rec.finish(`${problem.a} × ${problem.b}`);
    onResult?.(mistakes === 0);
  };

  const rowHint = (r: number): string => {
    if (!twoRow) {
      if (b >= 10 && b % 10 === 0) return `${b} は ${b / 10} × 10。一の位に 0を 書いてから、${aDigits} × ${b / 10} を その左に 書こう。`;
      return 'まず 小数点を 考えずに、整数の かけ算として 一の位から 計算しよう。';
    }
    if (r === 0) return `まず 小数点を 考えずに、${aDigits} × ${b % 10}（かける数の 一の位）を 計算しよう。`;
    if (r === 1) return `つぎは ${aDigits} × ${Math.floor(b / 10)}（かける数の 十の位）。答えは 一けた 左に ずらして 書くよ。`;
    return '2つの 答えを たそう。一の位から じゅんに。';
  };

  const handleInput = (d: string) => {
    if (stage !== 'DIGITS' || activeCol === null || d === '.') return;
    const cells = rows[row]!;
    // 2桁まで入力可能。最後に入れた桁＝答え（採点）、その前の桁＝くり上がりメモ（採点なし）
    const buf = (buffer + d).slice(-2);
    const ones = buf[buf.length - 1];
    const tens = buf.length === 2 ? buf[0] : null;

    if (ones === cells[activeCol]) {
      const next = { ...answers, [`${row}:${activeCol}`]: ones! };
      setAnswers(next);
      setBuffer('');
      if (tens && activeCol - 1 >= 0) setCarries((c) => ({ ...c, [`${row}:${activeCol - 1}`]: tens }));
      setHint(null);
      const rowDone = cells.every((ch, i) => ch === '' || next[`${row}:${i}`] !== undefined);
      if (rowDone && row < lastRow) {
        setRow(row + 1);
        setHint(rowHint(row + 1));
        playCorrect();
      } else if (rowDone) {
        setStage('POINT');
        setHint(`小数点より下の数字は ${decimals}こ。だから 右から ${decimals}こ 数えて 小数点をうとう。`);
      } else playCorrect();
    } else if (buf.length === 1) {
      // まだ1桁。十の位（くり上がり）の入力中かもしれないので、誤りにはせず保持。
      setBuffer(buf);
    } else {
      setBuffer('');
      setShakeCol(activeCol); setTimeout(() => setShakeCol(null), 450);
      miss('その位の 数字を 入れてね。くり上がりが あるときは 2けた 入れると、十の位が 左の上に 小さく出るよ。');
    }
  };
  const handleBackspace = () => {
    if (stage !== 'DIGITS') return;
    if (buffer) { setBuffer(''); return; }
    const filled = Object.keys(answers).filter((k) => k.startsWith(`${row}:`)).map((k) => Number(k.split(':')[1]));
    if (filled.length === 0) return;
    const target = Math.min(...filled); // いちばん最後に書いた（いちばん左の）けた
    const next = { ...answers }; delete next[`${row}:${target}`];
    setAnswers(next);
    setCarries((c) => { const n = { ...c }; delete n[`${row}:${target - 1}`]; return n; });
  };
  const placePoint = (gap: number) => {
    if (stage !== 'POINT') return;
    if (gap === dotGap) {
      if (pointOnly) { finish(); return; }
      setStage('TRIM');
      setHint(null);
      playCorrect();
    } else {
      miss(`かけられる数の 小数点より 下の けたは ${decimals}こ。積も 右から ${decimals}こ 数えて うとう。`);
    }
  };
  // 終わりの0を消す（小数点より右の、いちばん終わりの0から）
  const eraseAt = (c: number) => {
    if (stage !== 'TRIM') return;
    const expect = totalCols - 1 - erased;
    if (erased < trailingZeros && c === expect) {
      setErased(erased + 1);
      setHint(null);
      playCorrect();
    } else {
      miss('消せるのは、小数点より 右に ある、いちばん 終わりの 0 だけ だよ。');
    }
  };
  const doneTrim = () => {
    if (stage !== 'TRIM') return;
    if (erased === trailingZeros) finish();
    else miss('小数点より 右の 終わりに 0 が のこっているよ。その 0 を タップして 消そう。');
  };
  const reset = () => {
    setAnswers(pointOnly ? allFilled() : {}); setBuffer(''); setCarries({}); setErased(0);
    setRow(pointOnly ? lastRow : 0); setStage(pointOnly ? 'POINT' : 'DIGITS'); setMistakes(0); setHint(null);
  };

  const isErased = (c: number) => c > totalCols - 1 - erased;

  // 行の描画（cell と gap を交互に）
  const renderRow = (
    cells: string[],
    opts: { r?: number; showDotAtGap?: number; dotStruck?: boolean; interactive?: boolean } = {},
  ) => {
    const r = opts.r;
    const isAnswer = r !== undefined;
    const isProduct = r === lastRow;
    return (
      <div className="flex items-center justify-end">
        {cells.map((ch, c) => {
          const key = `${r}:${c}`;
          const active = isAnswer && r === row && activeCol === c && stage === 'DIGITS';
          const filled = isAnswer ? answers[key] : undefined;
          const canErase = isProduct && stage === 'TRIM' && filled !== undefined && c > dotGap && !isErased(c);
          return (
            <React.Fragment key={c}>
              {c > 0 && (
                <div style={{ width: MGAP, height: 60 }} className="flex items-end justify-center pb-2 relative">
                  {opts.showDotAtGap === c - 1 && (
                    <span className={`font-black text-3xl leading-none ${opts.dotStruck ? 'text-faint line-through' : 'text-amber-500'}`}>.</span>
                  )}
                  {opts.interactive && (
                    <button
                      onClick={() => placePoint(c - 1)}
                      className="absolute inset-x-[-6px] bottom-0 h-10 rounded-md bg-amber-100 hover:bg-amber-300 border border-amber-300 text-amber-600 text-xl font-black"
                      aria-label="ここに小数点"
                    >∙</button>
                  )}
                </div>
              )}
              <motion.div
                animate={shakeCol === c && r === row ? { x: [0, -6, 6, -6, 0] } : { x: 0 }}
                style={{ width: MCELL, height: 60 }}
                onClick={canErase ? () => eraseAt(c) : undefined}
                className={`relative flex items-center justify-center text-4xl font-black ${
                  active ? 'bg-violet-50 ring-4 ring-violet-400 ring-inset rounded-xl' : ''
                } ${canErase ? 'cursor-pointer rounded-xl ring-2 ring-rose-200 ring-inset hover:bg-rose-50' : ''}`}
              >
                {isAnswer && carries[key] && (
                  <span className="absolute -top-1 right-[-10px] text-base font-black text-rose-400 leading-none">{carries[key]}</span>
                )}
                {isAnswer ? (
                  filled !== undefined ? (
                    <span className={`relative ${isProduct ? 'text-violet-600' : 'text-violet-500'}`}>
                      {filled}
                      {isProduct && isErased(c) && (
                        <span className="absolute left-[-6px] right-[-6px] top-1/2 h-1 bg-rose-500 rotate-[-55deg] rounded-full" aria-label="消した" />
                      )}
                    </span>
                  ) : active
                    ? (buffer ? <span className="text-violet-400">{buffer}</span> : <span className="text-violet-300 animate-pulse">？</span>)
                    : null
                ) : (
                  ch !== '' ? <span className="text-content">{ch}</span> : null
                )}
              </motion.div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const lineW = totalCols * MCELL + (totalCols - 1) * MGAP;
  const visibleRows = rows.map((cells, r) => ({ cells, r })).filter(({ r }) => r <= row || stage !== 'DIGITS');
  const Line = () => <div className="border-b-4 border-slate-800 rounded-full my-1 ml-auto" style={{ width: lineW }} />;

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="flex-1 overflow-auto p-4 md:p-10 flex justify-center items-start">
        <div className="bg-surface p-8 md:p-12 rounded-[36px] shadow-2xl border border-line">
          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-2xl font-black text-content tabular-nums">{problem.a} × {problem.b}</h2>
          </div>
          <div className="font-mono pl-10">
            {renderRow(cellsOf(aDigits), { showDotAtGap: totalCols - 1 - decimals })}
            <div className="flex items-center justify-end relative">
              <span className="absolute left-[-40px] text-3xl font-black text-muted">×</span>
              {renderRow(cellsOf(bStr))}
            </div>
            <Line />
            {visibleRows.map(({ cells, r }) => (
              <React.Fragment key={r}>
                {twoRow && r === lastRow && <Line />}
                {renderRow(cells, {
                  r,
                  interactive: r === lastRow && stage === 'POINT',
                  showDotAtGap: r === lastRow && (stage === 'TRIM' || stage === 'DONE') ? dotGap : undefined,
                  dotStruck: erased > 0 && erased >= decimals,
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full md:w-[400px] bg-surface border-l border-line p-6 md:p-8 flex flex-col gap-5 overflow-y-auto">
        {stage === 'DONE' ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 bg-violet-50 border border-violet-100 rounded-3xl text-center">
            <span className="text-6xl mb-4">{mistakes === 0 ? '🏆' : '🎉'}</span>
            <h3 className="text-2xl font-black text-violet-800 mb-2">{mistakes === 0 ? 'パーフェクト！' : 'できたね！'}</h3>
            <p className="text-violet-600 font-bold mb-2 tabular-nums">{problem.a} × {problem.b} = {productStr}</p>
            <button onClick={onNext} className="w-full py-4 mt-4 bg-violet-500 hover:bg-violet-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">{nextLabel}</button>
          </div>
        ) : (
          <>
            <div className="bg-violet-50 p-6 rounded-3xl border border-violet-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-violet-700 font-black text-lg flex items-center gap-2"><Lightbulb size={20} /> ヒント</h3>
              </div>
              <p className="text-muted font-bold leading-relaxed">
                {hint ?? (stage === 'DIGITS'
                  ? rowHint(row)
                  : stage === 'POINT'
                    ? (pointOnly
                      ? `計算は できているよ。積の 小数点は どこかな？ すきまの ボタンを おそう。`
                      : `小数点より下の数字は ${decimals}こ。右から ${decimals}こ 数えて、すきまの ボタンを おそう。`)
                    : '小数点より 右の 終わりに 0 が あったら、タップして 消そう。消すものが なければ「できあがり」。')}
              </p>
            </div>
            {stage === 'DIGITS' && (
              <div className="flex-1 flex flex-col justify-center">
                <Keypad onInput={handleInput} onBackspace={handleBackspace} />
              </div>
            )}
            {stage === 'TRIM' && (
              <div className="flex-1 flex flex-col justify-center">
                <button onClick={doneTrim} className="w-full py-6 bg-violet-500 hover:bg-violet-600 text-white rounded-2xl font-black text-2xl shadow-lg transition-all active:scale-95">
                  できあがり
                </button>
              </div>
            )}
          </>
        )}
        <button onClick={reset} className="flex items-center justify-center gap-2 text-faint hover:text-muted py-4 font-bold border-t border-line shrink-0">
          <RotateCcw size={20} /> さいしょから
        </button>
      </div>
    </div>
  );
};

/* ============================ わり算 ============================ */

const DCELL = 50;
const DH = 56;

type DivStage = 'PLACE' | 'QUOTIENT' | 'MUL' | 'SUB' | 'BRING' | 'REM' | 'CHECK' | 'ROUND' | 'POINT';

export const DivSimulator: React.FC<SimProps<DivProblem>> = ({ problem, level, onNext, onResult, onMiss, nextLabel = 'つぎの もんだい', pointOnly = false }) => {
  const model = useMemo(() => buildDiv(problem), [problem]);
  const { divisor, steps, intLen, baseLen, quotientStartIndex, quotientPointIndex, quotientStr, remainderStr, roundedStr, mode } = model;
  const check = mode === 'remainder' && !!problem.check;
  const divisorStr = divisor.toString();
  const DLEAD = 26 + 26 * divisorStr.length;

  const displayDigits = mode === 'remainder' ? model.digits + model.fracStr : model.digits;
  const n = displayDigits.length;

  // 先頭の桁（商の先頭0で「書かない」桁）は手続きから除外する。
  const activeSteps = useMemo(
    () => steps.filter((s) => s.index >= quotientStartIndex),
    [steps, quotientStartIndex]
  );

  /** すべて計算し終えた形（小数点だけを答える問題・仕上げの表示に使う） */
  const completed = () => {
    const q: Record<number, number> = {};
    const mul: Record<number, Record<number, string>> = {};
    const sub: Record<number, Record<number, string>> = {};
    activeSteps.forEach((s, k) => {
      q[s.index] = s.quotient;
      const ms = s.multiply.toString();
      mul[k] = Object.fromEntries([...ms].map((ch, i) => [s.index - ms.length + 1 + i, ch]));
      const rs = s.remainder.toString();
      sub[k] = Object.fromEntries([...rs].map((ch, i) => [s.index - rs.length + 1 + i, ch]));
      const nxt = activeSteps[k + 1];
      if (nxt) sub[k]![nxt.index] = displayDigits[nxt.index]!;
    });
    return { q, mul, sub };
  };
  const init = pointOnly ? completed() : null;

  const [stepIdx, setStepIdx] = useState(pointOnly ? activeSteps.length - 1 : 0);
  const [stage, setStage] = useState<DivStage>(pointOnly ? 'POINT' : 'PLACE');
  const [enteredQ, setEnteredQ] = useState<Record<number, number>>(init?.q ?? {});
  // step ごとの「かける」「ひく/おろす」行に入力した数字（col -> 文字）
  const [mulByStep, setMulByStep] = useState<Record<number, Record<number, string>>>(init?.mul ?? {});
  const [subByStep, setSubByStep] = useState<Record<number, Record<number, string>>>(init?.sub ?? {});
  const [checkIdx, setCheckIdx] = useState(0); // けん算の □ のうち いくつ うめたか
  const [finished, setFinished] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  const label = `${problem.dividend} ÷ ${problem.divisor}`;
  const rec = useRoundRecorder({ moduleId: 'decimal-muldiv', skillId: level, record: recordResult, abandonLabel: () => label });

  const current = activeSteps[stepIdx];
  const isLast = stepIdx >= activeSteps.length - 1;

  // 現ステップの「かける」値（=商×除数）と列範囲
  const mulStr = current ? current.multiply.toString() : '';
  const mulStart = current ? current.index - mulStr.length + 1 : 0;
  const mulCols = current ? Array.from({ length: mulStr.length }, (_, i) => mulStart + i) : [];
  // 現ステップの「ひく」結果（=あまり。わる数が2けたなら 2けたにもなる）。右はしは current.index
  const subStr = current ? current.remainder.toString() : '';
  const subStart = current ? current.index - subStr.length + 1 : 0;
  const subCols = current ? Array.from({ length: subStr.length }, (_, i) => subStart + i) : [];

  const curMul = (current && mulByStep[stepIdx]) || {};
  const curSub = (current && subByStep[stepIdx]) || {};
  const activeMulCol = mulCols.find((c) => curMul[c] === undefined) ?? null;
  const activeSubCol = subCols.find((c) => curSub[c] === undefined) ?? null;

  const wrong = (msg: string) => {
    playSoftTry();
    setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
    setShake(true); setTimeout(() => setShake(false), 450);
    setHint(msg);
  };

  const finish = () => {
    setFinished(true);
    playClear();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
  };

  /** 最後のひき算が終わったあと */
  const afterLast = () => {
    if (mode === 'remainder') {
      // わられる数の 小数部を そのまま おろして、あまりを 読む
      if (model.fracStr) {
        setSubByStep((p) => {
          const row = { ...(p[stepIdx] ?? {}) };
          [...model.fracStr].forEach((ch, i) => { row[intLen + i] = ch; });
          return { ...p, [stepIdx]: row };
        });
      }
      setStage('REM');
      setHint('商は 一の位まで できたね。あまりは いくつかな？ あまりの 小数点は、わられる数の 小数点に そろえるよ。');
      playCorrect();
      return;
    }
    if (mode === 'round') {
      setStage('ROUND');
      setHint(`商は 上から 3けためまで 出たよ（${quotientStr}）。上から 3けための 数字を 四捨五入して、上から 2けたの がい数に しよう。`);
      playCorrect();
      return;
    }
    finish();
  };

  // たてる：商を書く位（列）をタップ
  const placeAt = (c: number) => {
    if (finished || stage !== 'PLACE' || !current) return;
    if (c === current.index) { setHint(null); setStage('QUOTIENT'); playCorrect(); }
    else wrong('商は わられる数の 計算した位の 真上に 書くよ。正しい ますを えらぼう。');
  };

  const handleInput = (d: string) => {
    if (finished || !current || d === '.') return;
    const num = Number(d);

    if (stage === 'QUOTIENT') {
      if (num === current.quotient) {
        setEnteredQ((p) => ({ ...p, [current.index]: current.quotient }));
        setHint(null); setStage('MUL'); playCorrect();
      } else {
        wrong(`${current.dividendPart} の中に ${divisor} は いくつ 入るかな？大きすぎても 小さすぎても だめだよ。${divisor >= 10 ? `${divisor} を 何十と 見て 見当を つけよう。` : ''}`);
      }
      return;
    }

    if (stage === 'MUL') {
      if (activeMulCol === null) return;
      const expected = mulStr[activeMulCol - mulStart];
      if (d === expected) {
        const nextMul = { ...curMul, [activeMulCol]: d };
        setMulByStep((p) => ({ ...p, [stepIdx]: nextMul }));
        setHint(null);
        if (mulCols.every((c) => nextMul[c] !== undefined)) { setStage('SUB'); }
        else playCorrect();
      } else {
        wrong(`「かける」だよ。商 ${current.quotient} × ${divisor} の 答えを 上の けたから 書こう。`);
      }
      return;
    }

    if (stage === 'SUB') {
      if (activeSubCol === null) return;
      const expected = subStr[activeSubCol - subStart];
      if (d === expected) {
        const nextSub = { ...curSub, [activeSubCol]: d };
        setSubByStep((p) => ({ ...p, [stepIdx]: nextSub }));
        setHint(null);
        if (subCols.every((c) => nextSub[c] !== undefined)) {
          if (isLast) afterLast();
          else { setStage('BRING'); playCorrect(); }
        } else playCorrect();
      } else {
        wrong(`「ひく」だよ。${current.dividendPart} − ${current.multiply} は いくつかな？ 上の けたから 書こう。`);
      }
      return;
    }
  };

  // おろす：次の位の数字を下ろして 次のステップへ
  const bringDown = () => {
    if (finished || stage !== 'BRING' || isLast) return;
    const nxt = activeSteps[stepIdx + 1]!;
    const broughtDigit = displayDigits[nxt.index]!;
    setSubByStep((p) => ({ ...p, [stepIdx]: { ...(p[stepIdx] ?? {}), [nxt.index]: broughtDigit } }));
    setStepIdx(stepIdx + 1);
    setStage('PLACE');
    playCorrect();
    if (nxt.index === quotientPointIndex) {
      setHint('ここからは 小数点より下だね。商の小数点は わられる数の 小数点の 真上に うつよ。');
    } else if (nxt.appended) {
      setHint('わられる数の 終わりに 0が あると 考えて、0を おろして わり進もう。');
    } else {
      setHint(null);
    }
  };

  const handleBackspace = () => {
    if (finished || !current) return;
    if (stage === 'MUL' || stage === 'SUB') {
      const cols = stage === 'MUL' ? mulCols : subCols;
      const cur = stage === 'MUL' ? curMul : curSub;
      const filled = cols.filter((c) => cur[c] !== undefined);
      if (filled.length === 0) return;
      const last = filled[filled.length - 1]!;
      const next = { ...cur }; delete next[last];
      (stage === 'MUL' ? setMulByStep : setSubByStep)((p) => ({ ...p, [stepIdx]: next }));
    }
  };

  // あまり
  const submitRem = (v: string) => {
    if (Number(v) === Number(remainderStr)) {
      setHint(null);
      if (check) { setStage('CHECK'); setCheckIdx(0); playCorrect(); }
      else finish();
    } else {
      wrong(v.replace('.', '') === remainderStr.replace('.', '')
        ? 'あまりの 小数点を わすれていないかな？ わられる数の 小数点の 真下に うつよ。'
        : `わられる数 − ${divisor} × ${quotientStr} が あまりだよ。あまりの 小数点は わられる数に そろえよう。`);
    }
  };
  // けん算：わる数 × 商 ＋ あまり ＝ わられる数
  const checkAnswers = [quotientStr, remainderStr, String(problem.dividend)];
  const submitCheck = (v: string) => {
    if (Number(v) === Number(checkAnswers[checkIdx])) {
      if (checkIdx >= 2) finish();
      else { setCheckIdx(checkIdx + 1); setHint(null); playCorrect(); }
    } else {
      wrong('けん算は「わる数 × 商 ＋ あまり ＝ わられる数」。筆算の 答えを 見ながら うめよう。');
    }
  };
  // がい数
  const submitRound = (v: string) => {
    if (Number(v) === Number(roundedStr)) finish();
    else wrong(Number(v) === Number(quotientStr)
      ? 'それは 上から 3けたまでの 商だね。上から 3けための 数字を 四捨五入しよう。'
      : `${quotientStr} の 上から 3けための 数字が 5より 小さければ 切りすて、5以上なら 切り上げるよ。`);
  };
  // 商の小数点（小数点だけを答える問題）
  const placeQuotientPoint = (c: number) => {
    if (finished || stage !== 'POINT') return;
    if (c === quotientPointIndex - 1) finish();
    else wrong('商の 小数点は、わられる数の 小数点の 真上に うつよ。');
  };

  const reset = () => {
    const i2 = pointOnly ? completed() : null;
    setStepIdx(pointOnly ? activeSteps.length - 1 : 0); setStage(pointOnly ? 'POINT' : 'PLACE');
    setEnteredQ(i2?.q ?? {}); setMulByStep(i2?.mul ?? {}); setSubByStep(i2?.sub ?? {});
    setCheckIdx(0); setFinished(false); setMistakes(0); setHint(null);
  };

  const gridStyle = { gridTemplateColumns: `${DLEAD}px repeat(${n}, ${DCELL}px)` } as React.CSSProperties;

  // 小数点ドット（数字セルの右端）
  const Dot = () => (
    <span className="absolute right-[-3px] bottom-2 text-amber-500 font-black text-3xl leading-none z-20">.</span>
  );

  // 各ステップの作業行（かける・ひく/おろす）を、入力済みのものだけ描画
  const workRows: { kind: 'mul' | 'sub'; cells: Record<number, string> }[] = [];
  activeSteps.forEach((_, idx) => {
    const mul = mulByStep[idx];
    const sub = subByStep[idx];
    if (mul && Object.keys(mul).length) workRows.push({ kind: 'mul', cells: mul });
    if (sub && Object.keys(sub).length) workRows.push({ kind: 'sub', cells: sub });
  });

  const stageTitle: Record<DivStage, string> = {
    PLACE: 'たてる（位をえらぶ）', QUOTIENT: 'たてる', MUL: 'かける', SUB: 'ひく', BRING: 'おろす',
    REM: 'あまり', CHECK: 'けん算', ROUND: 'がい数にする', POINT: '商の 小数点',
  };
  const stageHint = (): string => {
    if (stage === 'POINT') return '計算は できているよ。商の 小数点は どこに うつかな？ 商の 数字の 右下の ボタンを おそう。';
    if (stage === 'REM') return 'あまりは いくつかな？ あまりの 小数点は、わられる数の 小数点に そろえるよ。';
    if (stage === 'CHECK') return 'けん算の 式を うめよう。わる数 × 商 ＋ あまり ＝ わられる数';
    if (stage === 'ROUND') return `${quotientStr} を 上から 2けたの がい数に しよう。`;
    if (!current) return '';
    if (stage === 'PLACE') return '商を 書く ますを タップして えらぼう。';
    if (stage === 'QUOTIENT') return `${current.dividendPart} の中に ${divisor} は いくつ 入るかな？ 商を 1けた たてよう。`;
    if (stage === 'MUL') return `かけ算だよ。商 ${current.quotient} × ${divisor} の 答えを 上の けたから 書こう。`;
    if (stage === 'SUB') return `ひき算だよ。${current.dividendPart} − ${current.multiply} は いくつかな？ 上の けたから 書こう。`;
    return 'つぎの 数字を おろそう。';
  };

  const doneText = mode === 'remainder'
    ? `${label} = ${quotientStr} あまり ${remainderStr}`
    : mode === 'round'
      ? `${label} = ${quotientStr}… → 約 ${roundedStr}`
      : `${label} = ${quotientStr}`;

  const lastQuotientCol = activeSteps.length ? activeSteps[activeSteps.length - 1]!.index : -1;

  return (
    <div className="flex flex-col md:flex-row h-full">
      <div className="flex-1 overflow-auto p-4 md:p-10 flex justify-center items-start">
        <div className="bg-surface p-8 md:p-12 rounded-[36px] shadow-2xl border border-line">
          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-2xl font-black text-content tabular-nums">{label}</h2>
          </div>

          <div className="font-mono text-content">
            {/* 商の行 */}
            <div className="grid items-center text-center" style={gridStyle}>
              <div />
              {Array.from({ length: n }, (_, c) => {
                const showPoint = stage !== 'POINT' && quotientPointIndex > 0 && c === quotientPointIndex - 1;
                const q = c >= quotientStartIndex ? enteredQ[c] : undefined;
                const isActive = !finished && current?.index === c && (stage === 'PLACE' || stage === 'QUOTIENT');
                const tappable = !finished && stage === 'PLACE' && c >= quotientStartIndex && enteredQ[c] === undefined;
                const pointBtn = !finished && stage === 'POINT' && c >= quotientStartIndex && c < lastQuotientCol;
                return (
                  <div
                    key={c}
                    role={tappable ? 'button' : undefined}
                    onClick={() => tappable && placeAt(c)}
                    className={`relative flex items-center justify-center text-4xl font-black ${isActive ? 'bg-blue-50 ring-4 ring-blue-400 ring-inset rounded-xl' : ''} ${tappable ? 'cursor-pointer bg-blue-50/40 ring-2 ring-blue-200 ring-inset rounded-xl hover:bg-blue-100' : ''}`}
                    style={{ height: DH }}
                  >
                    {q !== undefined ? <span className="text-blue-600">{q}</span>
                      : isActive && stage === 'QUOTIENT' ? <span className="text-blue-300 animate-pulse">？</span> : null}
                    {showPoint && (enteredQ[c] !== undefined || (current && current.index > c) || finished) && <Dot />}
                    {stage === 'POINT' && finished && c === quotientPointIndex - 1 && <Dot />}
                    {pointBtn && (
                      <span
                        role="button"
                        aria-label="ここに小数点"
                        onClick={(e) => { e.stopPropagation(); placeQuotientPoint(c); }}
                        className="absolute right-[-14px] bottom-0 w-7 h-9 rounded-md bg-amber-100 hover:bg-amber-300 border border-amber-300 text-amber-600 text-xl font-black flex items-end justify-center z-30 cursor-pointer"
                      >∙</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* わくの行（divisor ) dividend） */}
            <div className="grid items-center text-center relative" style={{ ...gridStyle, height: DH }}>
              <div className="flex items-center justify-end pr-2 text-4xl font-black border-r-4 border-slate-800 h-full z-20">{divisorStr}</div>
              <div className="absolute right-0 top-0 border-t-4 border-slate-800 z-10" style={{ left: DLEAD }} />
              {Array.from({ length: n }, (_, c) => {
                const appended = c >= baseLen && mode !== 'remainder';
                const isFrac = c >= intLen;
                const showPoint = c === intLen - 1 && n > intLen;
                return (
                  <div key={c} className="relative flex items-center justify-center text-4xl font-black" style={{ height: DH }}>
                    <span className={appended ? 'text-faint' : isFrac && mode === 'remainder' ? 'text-faint' : ''}>{displayDigits[c]}</span>
                    {showPoint && <Dot />}
                  </div>
                );
              })}
            </div>

            {/* 作業行（かける・ひく/おろす）：入力した分だけ表示 */}
            {workRows.map((row, i) => (
              <div key={i} className="grid items-center text-center relative" style={{ ...gridStyle, height: DH }}>
                <div className="flex items-center justify-end pr-2 text-faint font-bold text-2xl">
                  {row.kind === 'mul' ? '×' : '−'}
                </div>
                {row.kind === 'mul' && (
                  <div className="absolute right-0 bottom-0 border-b-2 border-slate-300" style={{ left: DLEAD }} />
                )}
                {Array.from({ length: n }, (_, c) => (
                  <div key={c} className={`flex items-center justify-center text-3xl font-medium ${row.kind === 'mul' ? 'text-rose-500' : 'text-blue-500'}`} style={{ height: DH }}>
                    {row.cells[c] ?? ''}
                  </div>
                ))}
              </div>
            ))}

            {/* けん算の式 */}
            {(stage === 'CHECK' || (finished && check)) && (
              <div className="mt-6 flex items-center justify-center gap-2 text-2xl font-black tabular-nums flex-wrap">
                <span>{divisorStr} ×</span>
                {checkAnswers.map((a, k) => (
                  <React.Fragment key={k}>
                    <span className={`min-w-[3.5rem] px-2 py-1 rounded-xl border-2 text-center ${k < checkIdx || finished ? 'border-emerald-300 text-emerald-700' : k === checkIdx ? 'border-blue-400 bg-blue-50 text-blue-300 animate-pulse' : 'border-line text-faint'}`}>
                      {k < checkIdx || finished ? a : '？'}
                    </span>
                    {k === 0 && <span>＋</span>}
                    {k === 1 && <span>＝</span>}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full md:w-[400px] bg-surface border-l border-line p-6 md:p-8 flex flex-col gap-5 overflow-y-auto">
        {finished ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 bg-blue-50 border border-blue-100 rounded-3xl text-center">
            <span className="text-6xl mb-4">{mistakes === 0 ? '🏆' : '🎉'}</span>
            <h3 className="text-2xl font-black text-blue-800 mb-2">{mistakes === 0 ? 'パーフェクト！' : 'できたね！'}</h3>
            <p className="text-blue-600 font-bold mb-2 tabular-nums">{doneText}</p>
            {check && <p className="text-blue-600 font-bold mb-2 tabular-nums">けん算 {divisorStr} × {quotientStr} ＋ {remainderStr} ＝ {problem.dividend}</p>}
            <button onClick={onNext} className="w-full py-4 mt-4 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">{nextLabel}</button>
          </div>
        ) : (
          <>
            <motion.div animate={shake ? { x: [0, -6, 6, -6, 0] } : { x: 0 }} className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-blue-700 font-black text-lg flex items-center gap-2"><Lightbulb size={20} /> {stageTitle[stage]}</h3>
              </div>
              <p className="text-muted font-bold leading-relaxed">{hint ?? stageHint()}</p>
            </motion.div>
            <div className="flex-1 flex flex-col justify-center">
              {stage === 'PLACE' ? (
                <div className="text-center text-muted font-bold p-6 bg-surface-2 rounded-2xl border border-line">
                  ↑ 上の 商の ますを タップしてね
                </div>
              ) : stage === 'POINT' ? (
                <div className="text-center text-muted font-bold p-6 bg-surface-2 rounded-2xl border border-line">
                  ↑ 商の 数字の 右下の ボタンを タップしてね
                </div>
              ) : stage === 'BRING' ? (
                <button onClick={bringDown} className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black text-2xl shadow-lg transition-all active:scale-95">
                  つぎの 数字を おろす ⬇
                </button>
              ) : stage === 'REM' ? (
                <AnswerEntry key="rem" onSubmit={submitRem} allowDecimal accentText="text-blue-600" />
              ) : stage === 'CHECK' ? (
                <AnswerEntry key={`check-${checkIdx}`} onSubmit={submitCheck} allowDecimal accentText="text-blue-600" />
              ) : stage === 'ROUND' ? (
                <AnswerEntry key="round" onSubmit={submitRound} allowDecimal accentText="text-blue-600" />
              ) : (
                <Keypad onInput={handleInput} onBackspace={handleBackspace} />
              )}
            </div>
          </>
        )}
        <button onClick={reset} className="flex items-center justify-center gap-2 text-faint hover:text-muted py-4 font-bold border-t border-line shrink-0">
          <RotateCcw size={20} /> さいしょから
        </button>
      </div>
    </div>
  );
};

export type { MulLevel, DivLevel };
