// このファイルは単元アプリ syo4-syousu-v2 の src/components/modules/DecimalAddSubModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小数のたし算・ひき算の筆算モジュール。
 * 資料の足場かけを実装:
 *  - 小数点を太い縦線でそろえる（右そろえ誤り=Pegz 対策）
 *  - 空位の「0」をうすく補助表示（6 − 2.45 など）
 *  - 位の名前（算数語彙）＋読み上げで言語負荷を下げる
 *  - 1桁ずつ右から確認するやさしいフィードバック（タイマー無し）
 */
import React, { useMemo, useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, RotateCcw, Lightbulb, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { Keypad } from '../shared/Keypad';
import {
  ADDSUB_LEVELS, AddSubLevel, AddSubProblem, buildColumns, generateAddSub, placeName,
} from '../../lib/decimal';
import { useProgressStore } from '../../store/progressStore';
import { LevelCard } from '../ui/primitives';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { useAdaptive } from '../../lib/useAdaptive';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { Wand2 } from 'lucide-react';

const OP_W = 44;
const CELL_W = 52;
const DOT_W = 22;
const ROW_H = 64;

interface Props {
  onExit: () => void;
}

export const DecimalAddSubModule: React.FC<Props> = ({ onExit }) => {
  const [phase, setPhase] = useState<'SETUP' | 'SIM'>('SETUP');
  const [level, setLevel] = useState<AddSubLevel>('add-basic');
  const [mode, setMode] = useState<'fixed' | 'adaptive'>('fixed');
  const [build, setBuild] = useState(false);
  const [master, setMaster] = useState(false); // SETUP の「マスターモード」トグル
  const [runMaster, setRunMaster] = useState(false); // SIM がマスター自由配置か
  const [problem, setProblem] = useState<AddSubProblem | null>(null);
  const adaptive = useAdaptive(ADDSUB_LEVELS.map((l) => l.id), (l) => `addsub-${l}`);
  const effectiveLevel = mode === 'adaptive' ? adaptive.level : level;
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);

  const start = (lv: AddSubLevel) => {
    setMode('fixed');
    setBuild(false);
    setRunMaster(false);
    setLevel(lv);
    setProblem(generateAddSub(lv));
    setPhase('SIM');
  };
  const startBuild = (lv: AddSubLevel) => {
    setMode('fixed');
    setBuild(true);
    setRunMaster(false);
    setLevel(lv);
    setProblem(generateAddSub(lv));
    setPhase('SIM');
  };
  const startMaster = (lv: AddSubLevel) => {
    setMode('fixed');
    setBuild(false);
    setRunMaster(true);
    setLevel(lv);
    setProblem(generateAddSub(lv));
    setPhase('SIM');
  };
  const startAdaptive = () => {
    setMode('adaptive');
    setBuild(false);
    setRunMaster(false);
    setProblem(generateAddSub(adaptive.level));
    setPhase('SIM');
  };

  if (phase === 'SETUP') {
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button
            onClick={onExit}
            className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2"
          >
            <ChevronLeft size={24} /> 小数ランドへ
          </button>
          <h1 className="text-3xl font-black text-content text-center mb-1">小数の たし算・ひき算</h1>
          <p className="text-muted text-center font-medium mb-6">小数点を そろえて 計算しよう</p>

          <button onClick={startAdaptive} className="w-full mb-4 p-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg hover:shadow-xl text-left transition-all active:scale-[0.98] flex items-center gap-3">
            <Wand2 size={28} />
            <div>
              <div className="text-xl font-black">おまかせ（じどうレベル）</div>
              <div className="text-sm text-white/80 font-medium">きみに 合わせて むずかしさが かわるよ</div>
            </div>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ADDSUB_LEVELS.map((lv) => (
              <LevelCard
                key={lv.id}
                label={lv.label}
                desc={lv.description}
                mastery={getMasteryStreak(`addsub-${lv.id}`)}
                todayCount={getTodaySkillCount(`addsub-${lv.id}`)}
                onClick={() => start(lv.id)}
                accentBorder="hover:border-emerald-400"
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 mt-8 mb-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <Lightbulb size={20} /><span className="font-black">筆算を 組み立てる（位を そろえる）</span>
            </div>
            {/* マスターモード切替 */}
            <button
              onClick={() => setMaster((m) => !m)}
              className="flex items-center gap-2 shrink-0"
              aria-label="マスターモードの オン・オフ"
            >
              <span className={`text-sm font-black ${master ? 'text-emerald-700' : 'text-faint'}`}>マスターモード</span>
              <span className={`w-12 h-7 rounded-full transition-colors relative flex items-center px-1 ${master ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <motion.span animate={{ x: master ? 20 : 0 }} className="w-5 h-5 bg-surface rounded-full shadow-sm" />
              </span>
            </button>
          </div>
          <p className="text-muted font-medium mb-3 text-sm">
            {master
              ? '線は なし。小数点も 自分で 打って、上の数・下の数を 好きな位置で そろえよう。「式をかくにん」してから 計算するよ。'
              : '数字を 正しい 位の ますに 自分で ならべてから 計算するよ。'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ADDSUB_LEVELS.map((lv) => (
              <LevelCard
                key={lv.id}
                label={`${master ? 'マスター' : '組み立て'}・${lv.label}`}
                desc={lv.description}
                mastery={getMasteryStreak(`${master ? 'addsub-master' : 'addsub-build'}-${lv.id}`)}
                todayCount={getTodaySkillCount(`${master ? 'addsub-master' : 'addsub-build'}-${lv.id}`)}
                onClick={() => (master ? startMaster(lv.id) : startBuild(lv.id))}
                accentBorder="hover:border-emerald-400"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="小数の たし算・ひき算"
      subtitle={mode === 'adaptive' ? 'おまかせ' : `${runMaster ? 'マスター・' : build ? '組み立て・' : ''}${ADDSUB_LEVELS.find((l) => l.id === level)?.label ?? ''}`}
      onBack={() => setPhase('SETUP')}
    >
      <div className="flex flex-col h-full">
        {mode === 'adaptive' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          {problem && (runMaster ? (
            <AddSubMasterSimulator
              key={`${problem.a}-${problem.b}-${problem.op}-master`}
              problem={problem}
              level={effectiveLevel}
              onNext={() => setProblem(generateAddSub(effectiveLevel))}
            />
          ) : (
            <AddSubSimulator
              key={`${problem.a}-${problem.b}-${problem.op}-${build}`}
              problem={problem}
              level={effectiveLevel}
              buildMode={build}
              onNext={() => setProblem(generateAddSub(effectiveLevel))}
              onResult={mode === 'adaptive' ? adaptive.onResult : undefined}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
};

interface SimProps {
  problem: AddSubProblem;
  level: AddSubLevel;
  buildMode?: boolean;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
}

export const AddSubSimulator: React.FC<SimProps> = ({ problem, level, buildMode = false, onNext, onResult, onMiss }) => {
  const model = useMemo(() => buildColumns(problem), [problem]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [finished, setFinished] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [shakePlace, setShakePlace] = useState<number | null>(null);

  // 組み立てモード：A・B の桁を正しい位に置いてから計算する
  const [stage, setStage] = useState<'A' | 'B' | 'COMPUTE'>(buildMode ? 'A' : 'COMPUTE');
  const [placedA, setPlacedA] = useState<Record<number, string>>({});
  const [placedB, setPlacedB] = useState<Record<number, string>>({});

  const recordResult = useProgressStore((s) => s.recordResult);
  // まちがえた回数を数え、正解までたどりつかずに離れたときも1件残す
  const rec = useRoundRecorder({
    moduleId: 'decimal-addsub',
    skillId: buildMode ? `addsub-build-${level}` : `addsub-${level}`,
    record: recordResult,
    abandonLabel: () => `${problem.a} ${problem.op} ${problem.b}`,
  });

  // 置くべき桁（高い位→低い位）
  const digitsA = useMemo(() => model.rowA.filter((c) => c.kind === 'digit').sort((x, y) => y.place - x.place), [model]);
  const digitsB = useMemo(() => model.rowB.filter((c) => c.kind === 'digit').sort((x, y) => y.place - x.place), [model]);
  const nextDigitA = digitsA[Object.keys(placedA).length];
  const nextDigitB = digitsB[Object.keys(placedB).length];

  const intPlaces = model.places.filter((p) => p >= 0);
  const decPlaces = model.places.filter((p) => p < 0);
  const gridWidth = OP_W + intPlaces.length * CELL_W + DOT_W + decPlaces.length * CELL_W;
  const dotLeft = OP_W + intPlaces.length * CELL_W + DOT_W / 2;

  // 組み立てモードで、ある位のセルをタップして桁を置く
  const placeOperand = (place: number) => {
    if (finished) return;
    if (stage === 'A') {
      if (!nextDigitA) return;
      if (place === nextDigitA.place) {
        const next = { ...placedA, [place]: nextDigitA.digit! };
        setPlacedA(next); setHint(null);
        if (Object.keys(next).length === digitsA.length) { setStage('B'); }
        else playCorrect();
      } else {
        placeError();
      }
    } else if (stage === 'B') {
      if (!nextDigitB) return;
      if (place === nextDigitB.place) {
        const next = { ...placedB, [place]: nextDigitB.digit! };
        setPlacedB(next); setHint(null);
        if (Object.keys(next).length === digitsB.length) { setStage('COMPUTE'); }
        else playCorrect();
      } else {
        placeError();
      }
    }
  };
  const placeError = () => {
    playSoftTry();
    setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
    setShakePlace(stage === 'A' ? (nextDigitA?.place ?? null) : (nextDigitB?.place ?? null));
    setTimeout(() => setShakePlace(null), 450);
    setHint('小数点を そろえて、同じ位どうしを たてに そろえよう。一の位は 小数点の すぐ左だよ。');
  };

  // 入力対象（右端＝最も低い位から）
  const activePlace = useMemo(() => {
    for (let i = model.places.length - 1; i >= 0; i--) {
      const p = model.places[i];
      const cell = model.answer.find((a) => a.place === p);
      if (cell?.active && answers[p] === undefined) return p;
    }
    return null;
  }, [model, answers]);

  const activeCell = model.answer.find((a) => a.place === activePlace);

  const opWord = problem.op === '+' ? 'たす' : 'ひく';

  const handleInput = (d: string) => {
    if (stage !== 'COMPUTE') return;
    if (finished || activePlace === null || !activeCell || d === '.') return;
    if (d === activeCell.expected) {
      const next = { ...answers, [activePlace]: d };
      setAnswers(next);
      setHint(null);
      // 完答判定
      const allDone = model.answer.filter((a) => a.active).every((a) => next[a.place] !== undefined);
      if (allDone) finish();
      else playCorrect();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setShakePlace(activePlace);
      setTimeout(() => setShakePlace(null), 450);
      const aCell = model.rowA.find((c) => c.place === activePlace);
      const bCell = model.rowB.find((c) => c.place === activePlace);
      const ad = aCell?.digit ?? '0';
      const bd = bCell?.digit ?? '0';
      setHint(`${placeName(activePlace)}を 見てみよう。${ad} を ${opWord} ${bd} は いくつかな？くり上がり・くり下がりに 気をつけてね。`);
    }
  };

  const handleBackspace = () => {
    if (finished) return;
    // 直近に入力した（最も高い位の）答えを消す
    const filled = model.answer.filter((a) => a.active && answers[a.place] !== undefined);
    if (filled.length === 0) return;
    const target = filled.reduce((hi, c) => (c.place > hi.place ? c : hi), filled[0]);
    const next = { ...answers };
    delete next[target.place];
    setAnswers(next);
    setHint(null);
  };

  const finish = () => {
    setFinished(true);
    playClear();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    rec.finish(`${problem.a} ${problem.op} ${problem.b}`);
    onResult?.(mistakes === 0);
  };

  const reset = () => {
    setAnswers({});
    setFinished(false);
    setMistakes(0);
    setHint(null);
    setStage(buildMode ? 'A' : 'COMPUTE');
    setPlacedA({});
    setPlacedB({});
  };

  const Cell: React.FC<{ kind: string; digit?: string; isDot?: boolean; highlight?: boolean }> = ({
    kind, digit, isDot, highlight,
  }) => {
    if (isDot) {
      return (
        <div style={{ width: DOT_W, height: ROW_H }} className="flex items-end justify-center pb-2">
          <span className="text-amber-500 font-black text-4xl leading-none">.</span>
        </div>
      );
    }
    return (
      <div
        style={{ width: CELL_W, height: ROW_H }}
        className={`flex items-center justify-center text-4xl font-black ${
          highlight ? 'bg-emerald-50 ring-4 ring-emerald-400 ring-inset rounded-xl' : ''
        }`}
      >
        {kind === 'helperZero' ? (
          <span className="text-faint">{digit}</span>
        ) : kind === 'digit' ? (
          <span className="text-content">{digit}</span>
        ) : null}
      </div>
    );
  };

  const renderOperandCell = (cells: { place: number; kind: string; digit?: string }[], p: number, rowKey: 'A' | 'B') => {
    const c = cells.find((x) => x.place === p)!;
    if (!buildMode) return <Cell key={p} kind={c.kind} digit={c.digit} />;
    const placedMap = rowKey === 'A' ? placedA : placedB;
    const isTappable = !finished && stage === rowKey;
    const placedDigit = placedMap[p];
    return (
      <button
        key={p}
        onClick={() => isTappable && placeOperand(p)}
        disabled={!isTappable}
        style={{ width: CELL_W, height: ROW_H }}
        className={`flex items-center justify-center text-4xl font-black rounded-xl ${
          isTappable ? 'cursor-pointer ring-2 ring-emerald-200 ring-inset bg-emerald-50/40 hover:bg-emerald-100' : ''
        }`}
      >
        {placedDigit !== undefined ? <span className="text-content">{placedDigit}</span>
          : c.kind === 'helperZero' ? <span className="text-faint">0</span> : null}
      </button>
    );
  };

  const renderRow = (cells: { place: number; kind: string; digit?: string }[], opts: { op?: string; rowKey: 'A' | 'B' }) => (
    <div className="flex items-center" style={{ width: gridWidth, height: ROW_H }}>
      <div style={{ width: OP_W, height: ROW_H }} className="flex items-center justify-center text-3xl font-black text-muted">
        {opts.op ?? ''}
      </div>
      {intPlaces.map((p) => renderOperandCell(cells, p, opts.rowKey))}
      <Cell kind="dot" isDot />
      {decPlaces.map((p) => renderOperandCell(cells, p, opts.rowKey))}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* 計算ワークスペース */}
      <div className="flex-1 overflow-auto p-4 md:p-10 flex justify-center items-start">
        <div className="bg-surface p-8 md:p-12 rounded-[36px] shadow-2xl border border-line relative">
          {/* 問題式 */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-2xl font-black text-content tabular-nums">
              {problem.a} {problem.op} {problem.b}
            </h2>
          </div>

          <div className="relative font-mono" style={{ width: gridWidth }}>
            {/* 小数点をそろえる 太い縦ガイド線 */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-300/70 rounded-full z-0"
              style={{ left: dotLeft - 2 }}
            />
            <div className="relative z-10">
              {renderRow(model.rowA, { rowKey: 'A' })}
              {renderRow(model.rowB, { op: problem.op, rowKey: 'B' })}
              {/* 横線 */}
              <div className="border-b-4 border-slate-800 rounded-full" style={{ width: gridWidth }} />
              {/* 答えの行 */}
              <div className="flex items-center" style={{ width: gridWidth, height: ROW_H }}>
                <div style={{ width: OP_W, height: ROW_H }} />
                {intPlaces.map((p) => {
                  const a = model.answer.find((x) => x.place === p)!;
                  return (
                    <motion.div
                      key={p}
                      animate={shakePlace === p ? { x: [0, -8, 8, -8, 0] } : { x: 0 }}
                      transition={{ duration: 0.4 }}
                      style={{ width: CELL_W, height: ROW_H }}
                      className={`flex items-center justify-center text-4xl font-black ${
                        a.active && activePlace === p && !finished && stage === 'COMPUTE'
                          ? 'bg-emerald-50 ring-4 ring-emerald-400 ring-inset rounded-xl'
                          : ''
                      }`}
                    >
                      {answers[p] !== undefined ? (
                        <span className="text-emerald-600">{answers[p]}</span>
                      ) : a.active && activePlace === p && !finished && stage === 'COMPUTE' ? (
                        <span className="text-emerald-300 animate-pulse">？</span>
                      ) : null}
                    </motion.div>
                  );
                })}
                <Cell kind="dot" isDot />
                {decPlaces.map((p) => {
                  const a = model.answer.find((x) => x.place === p)!;
                  return (
                    <motion.div
                      key={p}
                      animate={shakePlace === p ? { x: [0, -8, 8, -8, 0] } : { x: 0 }}
                      transition={{ duration: 0.4 }}
                      style={{ width: CELL_W, height: ROW_H }}
                      className={`flex items-center justify-center text-4xl font-black ${
                        a.active && activePlace === p && !finished && stage === 'COMPUTE'
                          ? 'bg-emerald-50 ring-4 ring-emerald-400 ring-inset rounded-xl'
                          : ''
                      }`}
                    >
                      {answers[p] !== undefined ? (
                        <span className="text-emerald-600">{answers[p]}</span>
                      ) : a.active && activePlace === p && !finished && stage === 'COMPUTE' ? (
                        <span className="text-emerald-300 animate-pulse">？</span>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* サイドパネル */}
      <div className="w-full md:w-[400px] bg-surface border-l border-line p-6 md:p-8 flex flex-col gap-5 overflow-y-auto">
        {finished ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 bg-emerald-50 border border-emerald-100 rounded-3xl text-center">
            <span className="text-6xl mb-4">{mistakes === 0 ? '🏆' : '🎉'}</span>
            <h3 className="text-2xl font-black text-emerald-800 mb-2">
              {mistakes === 0 ? 'パーフェクト！' : 'できたね！'}
            </h3>
            <p className="text-emerald-600 font-bold mb-2">
              {problem.a} {problem.op} {problem.b} = {model.result}
            </p>
            <button
              onClick={onNext}
              className="w-full py-4 mt-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95"
            >
              つぎの もんだい
            </button>
          </div>
        ) : stage !== 'COMPUTE' ? (
          <>
            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-emerald-700 font-black text-lg flex items-center gap-2">
                  <Lightbulb size={20} /> {stage === 'A' ? '上の数を ならべよう' : '下の数を ならべよう'}
                </h3>
              </div>
              <p className="text-muted font-bold leading-relaxed">
                {hint ?? `${stage === 'A' ? problem.a : problem.b} を 位ごとに 上から じゅんに おくよ。小数点に そろえてね。`}
              </p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-muted font-bold">つぎに おく 数字</p>
              <div className="w-24 h-24 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-6xl font-black shadow-lg">
                {(stage === 'A' ? nextDigitA : nextDigitB)?.digit ?? '✓'}
              </div>
              <p className="text-faint font-bold text-sm">↑ 上の 筆算の 正しい 位の ますを タップ</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-emerald-700 font-black text-lg flex items-center gap-2">
                  <Lightbulb size={20} /> ヒント
                </h3>
              </div>
              <p className="text-muted font-bold leading-relaxed">
                {hint ??
                  (activePlace !== null
                    ? `${placeName(activePlace)}から 計算しよう。右の位から じゅんばんに もとめてね。`
                    : 'よくできました！')}
              </p>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <Keypad
                onInput={handleInput}
                onBackspace={handleBackspace}
                allowDecimal={false}
              />
            </div>
          </>
        )}

        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 text-faint hover:text-muted py-4 font-bold border-t border-line shrink-0"
        >
          <RotateCcw size={20} /> さいしょから
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
 * マスターモード：自由配置の筆算（目安線なし・小数点も自分で打つ）
 *  BUILD   … 上の数・下の数を 好きな位に置き、小数点も 自分で打つ。「式をかくにんする」で検算。
 *  COMPUTE … 式が正しければ 空白を つめた（位のそろった）筆算にして、答えを 自分で計算。
 *  DONE    … 「答え合わせ」で正解したら 完了。
 * テストモードの「立式」問題でも この仕組みで出題する。
 * ======================================================================= */
interface MasterProps {
  problem: AddSubProblem;
  level: AddSubLevel;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
}

const BUILD_CELL = 48;
const POINT_W = 18;

const eqNum = (x: number, y: number) => Math.abs(x - y) < 1e-9;

interface RowParse { ok: boolean; value: number; boundary: number }
// 自由配置の行を 数として読む。数字は すきまなく 連続・整数部が 1 桁以上 必要。
// boundary = 小数点の 位置（その列の すぐ左に 点がある という境界 index）。
function parseFreeRow(digits: Record<number, string>, point: number | null): RowParse {
  const cols = Object.keys(digits).map(Number).sort((a, b) => a - b);
  if (cols.length === 0) return { ok: false, value: NaN, boundary: 0 };
  for (let i = 1; i < cols.length; i++) if (cols[i] !== cols[i - 1] + 1) return { ok: false, value: NaN, boundary: 0 };
  const boundary = point ?? cols[cols.length - 1] + 1;
  if (boundary <= cols[0] || boundary > cols[cols.length - 1] + 1) return { ok: false, value: NaN, boundary };
  const intStr = cols.filter((c) => c < boundary).map((c) => digits[c]).join('');
  const decStr = cols.filter((c) => c >= boundary).map((c) => digits[c]).join('');
  const value = parseFloat(decStr ? `${intStr}.${decStr}` : intStr);
  if (isNaN(value)) return { ok: false, value: NaN, boundary };
  return { ok: true, value, boundary };
}

export const AddSubMasterSimulator: React.FC<MasterProps> = ({ problem, level, onNext, onResult }) => {
  const model = useMemo(() => buildColumns(problem), [problem]);
  const recordResult = useProgressStore((s) => s.recordResult);

  const [stage, setStage] = useState<'BUILD' | 'COMPUTE' | 'DONE'>('BUILD');
  const [hint, setHint] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [recorded, setRecorded] = useState(false);

  // ---- BUILD（自由配置）----
  const width = model.places.length + 4; // 必要な幅＋余白（左右に ずらせる）
  const cols = useMemo(() => Array.from({ length: width }, (_, i) => i), [width]);
  const [digitsA, setDigitsA] = useState<Record<number, string>>({});
  const [digitsB, setDigitsB] = useState<Record<number, string>>({});
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [sel, setSel] = useState<{ row: 'A' | 'B'; col: number } | null>(null);

  const digitsOf = (row: 'A' | 'B') => (row === 'A' ? digitsA : digitsB);
  const setDigitsOf = (row: 'A' | 'B') => (row === 'A' ? setDigitsA : setDigitsB);
  const setPointOf = (row: 'A' | 'B') => (row === 'A' ? setPointA : setPointB);

  const inputBuild = (d: string) => {
    if (!sel) return;
    if (d === '.') { setPointOf(sel.row)(sel.col + 1); setHint(null); return; } // 点は 選んだ ますの 右に打つ
    setDigitsOf(sel.row)((prev) => ({ ...prev, [sel.col]: d }));
    setHint(null);
    playCorrect();
  };
  const backspaceBuild = () => {
    if (!sel) return;
    setDigitsOf(sel.row)((prev) => { const n = { ...prev }; delete n[sel.col]; return n; });
  };
  const resetBuild = () => {
    setDigitsA({}); setDigitsB({}); setPointA(null); setPointB(null); setSel(null); setHint(null);
  };

  const confirmExpr = () => {
    const ra = parseFreeRow(digitsA, pointA);
    const rb = parseFreeRow(digitsB, pointB);
    if (!ra.ok || !eqNum(ra.value, problem.a)) {
      setMistakes((m) => m + 1);
      setHint(`上の数が 「${problem.a}」に なるように、数字を すきまなく ならべて、小数点を 打とう。`);
      return;
    }
    if (!rb.ok || !eqNum(rb.value, problem.b)) {
      setMistakes((m) => m + 1);
      setHint(`下の数が 「${problem.b}」に なるように ならべよう。`);
      return;
    }
    if (ra.boundary !== rb.boundary) {
      setMistakes((m) => m + 1);
      setHint('小数点（一の位）を たてに そろえよう。上と下で 点の いちが ずれているよ。');
      return;
    }
    setHint(null);
    setStage('COMPUTE'); // 正しければ 位のそろった（詰めた）筆算で 計算へ
  };

  // ---- COMPUTE（位がそろった 正準レイアウトで 答えを 自分で計算）----
  const intPlaces = model.places.filter((p) => p >= 0);
  const decPlaces = model.places.filter((p) => p < 0);
  const computeWidth = OP_W + intPlaces.length * CELL_W + DOT_W + decPlaces.length * CELL_W;
  const [ansCells, setAnsCells] = useState<Record<number, string>>({});
  const [ansSel, setAnsSel] = useState<number | null>(null);
  const activeAns = model.answer.filter((a) => a.active);

  const inputCompute = (d: string) => {
    if (ansSel === null || d === '.') return;
    setAnsCells((prev) => ({ ...prev, [ansSel]: d }));
    setHint(null);
    playCorrect();
  };
  const backspaceCompute = () => {
    if (ansSel === null) return;
    setAnsCells((prev) => { const n = { ...prev }; delete n[ansSel]; return n; });
  };

  const checkAnswer = () => {
    const ok = activeAns.every((a) => ansCells[a.place] === a.expected);
    if (!ok) {
      setMistakes((m) => m + 1);
      setHint('もう一度 計算を たしかめよう。右の位から じゅんばんに もとめてね。');
      playSoftTry();
      return;
    }
    const perfect = mistakes === 0;
    playClear();
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    if (!recorded) {
      recordResult({
        moduleId: 'decimal-addsub',
        skillId: `addsub-master-${level}`,
        label: `${problem.a} ${problem.op} ${problem.b}`,
        mistakes: mistakes, correct: perfect,
        misses: perfect ? undefined : [{ tag: 'calc-addsub' }],
      });
      onResult?.(perfect);
      setRecorded(true);
    }
    setStage('DONE');
  };

  const retry = () => {
    resetBuild();
    setAnsCells({}); setAnsSel(null);
    setStage('BUILD');
  };

  /* ---------- BUILD 画面 ---------- */
  const buildRowWidth = OP_W + width * BUILD_CELL + (width + 1) * POINT_W;
  const Gap: React.FC<{ row: 'A' | 'B'; k: number }> = ({ row, k }) => {
    const here = (row === 'A' ? pointA : pointB) === k;
    return (
      <button
        onClick={() => { setPointOf(row)(here ? null : k); setHint(null); }}
        style={{ width: POINT_W, height: ROW_H }}
        className="flex items-end justify-center pb-2 shrink-0"
        aria-label="ここに小数点"
      >
        <span className={`text-3xl font-black leading-none ${here ? 'text-amber-500' : 'text-line hover:text-amber-300'}`}>.</span>
      </button>
    );
  };
  const BuildCell: React.FC<{ row: 'A' | 'B'; col: number }> = ({ row, col }) => {
    const isSel = sel?.row === row && sel.col === col;
    const d = digitsOf(row)[col];
    return (
      <button
        onClick={() => setSel({ row, col })}
        style={{ width: BUILD_CELL, height: ROW_H }}
        className={`flex items-center justify-center text-4xl font-black rounded-xl shrink-0 transition-colors ${
          isSel ? 'bg-emerald-50 ring-4 ring-emerald-400 ring-inset' : 'ring-1 ring-line ring-inset hover:bg-surface-2'
        }`}
      >
        {d !== undefined ? <span className="text-content">{d}</span>
          : isSel ? <span className="text-emerald-300 animate-pulse">？</span> : null}
      </button>
    );
  };
  const buildRow = (row: 'A' | 'B', op?: string) => (
    <div className="flex items-center" style={{ height: ROW_H }}>
      <div style={{ width: OP_W, height: ROW_H }} className="flex items-center justify-center text-3xl font-black text-muted shrink-0">{op ?? ''}</div>
      {cols.map((c) => (
        <React.Fragment key={c}>
          <Gap row={row} k={c} />
          <BuildCell row={row} col={c} />
        </React.Fragment>
      ))}
      <Gap row={row} k={width} />
    </div>
  );

  /* ---------- COMPUTE 画面（正準・詰めた筆算） ---------- */
  const FixedCell: React.FC<{ cell: { kind: string; digit?: string } }> = ({ cell }) => (
    <div style={{ width: CELL_W, height: ROW_H }} className="flex items-center justify-center text-4xl font-black">
      {cell.kind === 'helperZero' ? <span className="text-faint">{cell.digit}</span>
        : cell.kind === 'digit' ? <span className="text-content">{cell.digit}</span> : null}
    </div>
  );
  const DotCell = () => (
    <div style={{ width: DOT_W, height: ROW_H }} className="flex items-end justify-center pb-2">
      <span className="text-amber-500 font-black text-4xl leading-none">.</span>
    </div>
  );
  const fixedRow = (cells: { place: number; kind: string; digit?: string }[], op?: string) => (
    <div className="flex items-center" style={{ width: computeWidth, height: ROW_H }}>
      <div style={{ width: OP_W, height: ROW_H }} className="flex items-center justify-center text-3xl font-black text-muted">{op ?? ''}</div>
      {intPlaces.map((p) => <FixedCell key={p} cell={cells.find((c) => c.place === p)!} />)}
      <DotCell />
      {decPlaces.map((p) => <FixedCell key={p} cell={cells.find((c) => c.place === p)!} />)}
    </div>
  );
  const AnsCell: React.FC<{ place: number }> = ({ place }) => {
    const a = model.answer.find((x) => x.place === place)!;
    const isSel = ansSel === place;
    return (
      <button
        onClick={() => a.active && setAnsSel(place)}
        disabled={!a.active}
        style={{ width: CELL_W, height: ROW_H }}
        className={`flex items-center justify-center text-4xl font-black rounded-xl transition-colors ${
          isSel ? 'bg-emerald-50 ring-4 ring-emerald-400 ring-inset' : a.active ? 'ring-1 ring-line ring-inset hover:bg-surface-2' : ''
        }`}
      >
        {ansCells[place] !== undefined ? <span className="text-emerald-600">{ansCells[place]}</span>
          : isSel ? <span className="text-emerald-300 animate-pulse">？</span> : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ワークスペース */}
      <div className="flex-1 overflow-auto p-4 md:p-10 flex justify-center items-start">
        <div className="bg-surface p-8 md:p-12 rounded-[36px] shadow-2xl border border-line">
          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-2xl font-black text-content tabular-nums">{problem.a} {problem.op} {problem.b}</h2>
          </div>

          {stage === 'BUILD' ? (
            <div className="font-mono overflow-x-auto">
              {buildRow('A')}
              {buildRow('B', problem.op)}
              <div className="border-b-4 border-slate-800 rounded-full mt-1" style={{ width: buildRowWidth }} />
            </div>
          ) : (
            <div className="font-mono">
              {fixedRow(model.rowA)}
              {fixedRow(model.rowB, problem.op)}
              <div className="border-b-4 border-slate-800 rounded-full" style={{ width: computeWidth }} />
              <div className="flex items-center" style={{ width: computeWidth, height: ROW_H }}>
                <div style={{ width: OP_W, height: ROW_H }} />
                {intPlaces.map((p) => <AnsCell key={p} place={p} />)}
                <DotCell />
                {decPlaces.map((p) => <AnsCell key={p} place={p} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* サイドパネル */}
      <div className="w-full md:w-[400px] bg-surface border-l border-line p-6 md:p-8 flex flex-col gap-5 overflow-y-auto">
        {stage === 'DONE' ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 bg-emerald-50 border border-emerald-100 rounded-3xl text-center">
            <span className="text-6xl mb-4">{mistakes === 0 ? '🏆' : '🎉'}</span>
            <h3 className="text-2xl font-black text-emerald-800 mb-2">{mistakes === 0 ? 'パーフェクト！' : 'できたね！'}</h3>
            <p className="text-emerald-600 font-bold mb-2">{problem.a} {problem.op} {problem.b} = {model.result}</p>
            <button onClick={onNext} className="w-full py-4 mt-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">
              つぎの もんだい
            </button>
            <button onClick={retry} className="w-full py-3 mt-2 text-faint hover:text-muted font-bold">もう一度 やってみる</button>
          </div>
        ) : (
          <>
            <div className={`p-6 rounded-3xl border ${hint ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}>
              <h3 className="text-emerald-700 font-black text-lg flex items-center gap-2 mb-2">
                <Lightbulb size={20} /> {stage === 'BUILD' ? '式を 組み立てよう' : '計算しよう'}
              </h3>
              <p className="text-muted font-bold leading-relaxed">
                {hint ?? (stage === 'BUILD'
                  ? 'ますを タップ → 数字キーで 上の数・下の数を ならべよう。「・」キー（か ますの すきま）で 小数点を 打って、上と下の 点を たてに そろえてね。'
                  : '位が そろったね！答えの ますを タップして、右の位から 計算しよう。')}
              </p>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              {stage === 'BUILD'
                ? <Keypad onInput={inputBuild} onBackspace={backspaceBuild} allowDecimal />
                : <Keypad onInput={inputCompute} onBackspace={backspaceCompute} allowDecimal={false} />}
            </div>

            {stage === 'BUILD' ? (
              <button onClick={confirmExpr} className="flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 shrink-0">
                <CheckCircle2 size={22} /> 式を かくにんする
              </button>
            ) : (
              <button onClick={checkAnswer} className="flex items-center justify-center gap-2 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 shrink-0">
                <CheckCircle2 size={22} /> 答え合わせを する
              </button>
            )}

            <button
              onClick={stage === 'BUILD' ? resetBuild : () => { setHint(null); setStage('BUILD'); }}
              className="flex items-center justify-center gap-2 text-faint hover:text-muted py-2 font-bold border-t border-line shrink-0"
            >
              <RotateCcw size={18} /> {stage === 'BUILD' ? 'ぜんぶ けす' : '式を なおす'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
