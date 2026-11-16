// このファイルは単元アプリ wari-hissann3 の src/components/MasterDivisionBoard.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * マスターモード（自由入力版）。
 * 「たてる・かける・ひく・おろす」の手順の区切りをなくし、筆算のマス目を
 * 最初から白紙のワークシートとして全部表示する。児童は好きなマスを好きな順に
 * タップして数字を入れていき（立て忘れ・手順とばしのミスも起こりうる）、
 * 最後に「答え合わせ」でまとめて採点する——紙に書くのに近い自由さを再現する。
 *
 * 「かける」「ひく」はどちらも わる数のけた数によらず 1けたずつのマスに分けて入力する。
 * 「かける」は2けたを入力すると 十の位が くり上がりとして 左のマスに小さく表示される
 * （繰り上がりは連鎖して自動で伝わる）。「ひく」は繰り下がり表示のない単純な1けた入力。
 */
import React, { useMemo, useState } from 'react';
import { Problem } from '../types';
import { ChevronLeft, Delete, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { computeRealSteps, computeExpectedRows, HissanRow } from '../lib/hissanSteps';
import { playClear } from '../lib/sound';

interface Props {
  problem: Problem;
  onBack: () => void;
  onFinish?: (results: { isPerfect: boolean; dividend: number; divisor: number }) => void;
  onNext?: () => void;
  zeroShortcut?: boolean;
}

type Selection =
  | { kind: 'quotient'; index: number }
  | { kind: 'combined-row'; rowIdx: number }
  | { kind: 'column-cell'; rowIdx: number; col: number }
  | null;

type RowState =
  | { kind: 'combined'; value: string }
  | { kind: 'columns'; cols: string[] };

export const MasterDivisionBoard: React.FC<Props> = ({ problem, onBack, onFinish, onNext, zeroShortcut = false }) => {
  const { dividend, divisor } = problem;
  const dividendStr = dividend.toString();
  const divisorStr = divisor.toString();
  const divisorColPx = Math.max(64, divisorStr.length * 34 + 12);

  const realSteps = useMemo(() => computeRealSteps(dividend, divisor), [dividend, divisor]);
  const rows = useMemo(() => computeExpectedRows(realSteps, dividendStr, zeroShortcut), [realSteps, dividendStr, zeroShortcut]);

  // 「かける」「ひく」はどちらも わる数のけた数によらず、いつも1けたずつのマスに分けて入力する
  // （「かける」だけ繰り上がり表示つき。「ひく」は繰り下がり表示なし）。
  const makeInitialRowStates = (): RowState[] =>
    rows.map((r) => ({ kind: 'columns', cols: Array(r.value.length).fill('') }));

  const [quotientValues, setQuotientValues] = useState<(number | null)[]>(() => Array(dividendStr.length).fill(null));
  const [rowStates, setRowStates] = useState<RowState[]>(makeInitialRowStates);
  const [selection, setSelection] = useState<Selection>(null);
  const [graded, setGraded] = useState(false);
  const [hasMistakes, setHasMistakes] = useState<boolean | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const gridStyle: React.CSSProperties = { gridTemplateColumns: `${divisorColPx}px repeat(${dividendStr.length}, 56px)` };

  const selectQuotient = (i: number) => !graded && setSelection({ kind: 'quotient', index: i });
  const selectCombinedRow = (rowIdx: number) => !graded && setSelection({ kind: 'combined-row', rowIdx });
  const selectColumnCell = (rowIdx: number, col: number) => !graded && setSelection({ kind: 'column-cell', rowIdx, col });

  const handleDigit = (d: string) => {
    if (!selection || graded) return;
    if (selection.kind === 'quotient') {
      setQuotientValues((prev) => {
        const next = [...prev];
        next[selection.index] = Number(d);
        return next;
      });
      return;
    }
    if (selection.kind === 'combined-row') {
      setRowStates((prev) => {
        const next = [...prev];
        const state = next[selection.rowIdx];
        if (state.kind === 'combined') {
          const maxLen = Math.max(rows[selection.rowIdx].value.length, 1);
          if (state.value.length < maxLen) next[selection.rowIdx] = { ...state, value: state.value + d };
        }
        return next;
      });
      return;
    }
    // column-cell: 「かける」は繰り上がり表示のため最大2桁、「ひく」は繰り下がり表示をしないため1桁まで
    setRowStates((prev) => {
      const next = [...prev];
      const state = next[selection.rowIdx];
      if (state.kind === 'columns') {
        const maxLen = rows[selection.rowIdx].type === 'multiply' ? 2 : 1;
        const cur = state.cols[selection.col];
        if (cur.length < maxLen) {
          const cols = [...state.cols];
          cols[selection.col] = cur + d;
          next[selection.rowIdx] = { ...state, cols };
        }
      }
      return next;
    });
  };

  const handleBackspace = () => {
    if (!selection || graded) return;
    if (selection.kind === 'quotient') {
      setQuotientValues((prev) => {
        const next = [...prev];
        next[selection.index] = null;
        return next;
      });
      return;
    }
    if (selection.kind === 'combined-row') {
      setRowStates((prev) => {
        const next = [...prev];
        const state = next[selection.rowIdx];
        if (state.kind === 'combined') next[selection.rowIdx] = { ...state, value: state.value.slice(0, -1) };
        return next;
      });
      return;
    }
    setRowStates((prev) => {
      const next = [...prev];
      const state = next[selection.rowIdx];
      if (state.kind === 'columns') {
        const cols = [...state.cols];
        cols[selection.col] = cols[selection.col].slice(0, -1);
        next[selection.rowIdx] = { ...state, cols };
      }
      return next;
    });
  };

  const quotientExpected = (i: number): number | null => realSteps.find((s) => s.index === i)?.quotient ?? null;

  const doGrade = () => {
    let errorsFound = false;

    for (let i = 0; i < dividendStr.length; i++) {
      if (quotientValues[i] !== quotientExpected(i)) errorsFound = true;
    }

    rows.forEach((row, idx) => {
      const state = rowStates[idx];
      if (state.kind === 'combined') {
        if (state.value !== row.value) errorsFound = true;
      } else {
        for (let c = 0; c < row.value.length; c++) {
          if (state.cols[c].slice(-1) !== row.value[c]) errorsFound = true;
        }
      }
    });

    setGraded(true);
    setHasMistakes(errorsFound);
    setSelection(null);

    if (!errorsFound) {
      setIsFinished(true);
      playClear();
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      onFinish?.({ isPerfect: true, dividend, divisor });
    } else {
      onFinish?.({ isPerfect: false, dividend, divisor });
    }
  };

  const resetAll = () => {
    setQuotientValues(Array(dividendStr.length).fill(null));
    setRowStates(makeInitialRowStates());
    setSelection(null);
    setGraded(false);
    setHasMistakes(null);
  };

  const cellBase = 'w-14 h-16 flex items-center justify-center relative text-3xl font-black transition-all';
  const cellSelected = 'bg-blue-50 ring-4 ring-blue-400 ring-inset rounded-xl z-30';

  return (
    <div className="flex flex-col h-full bg-slate-50 simulator-container">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">
          <ChevronLeft size={24} />
          もどる
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-widest">👑 マスターモード</span>
          <h1 className="text-2xl font-black text-slate-800">{dividend} ÷ {divisor}</h1>
        </div>
        <div className="w-24" />
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Main Workspace */}
        <div className="flex-1 relative overflow-auto p-4 md:p-12 flex justify-center items-start">
          <div className="bg-white p-8 md:p-12 rounded-[30px] md:rounded-[40px] shadow-2xl border border-blue-50/50 min-w-[500px] md:min-w-[600px] relative">
            <div className="font-mono text-5xl leading-none tracking-widest text-slate-700 select-none">

              {/* 商の行：どの位からでも自由にタップして入力できる */}
              <div className="grid items-center text-center" style={gridStyle}>
                <div />
                {dividendStr.split('').map((_, i) => {
                  const val = quotientValues[i];
                  const isSelected = selection?.kind === 'quotient' && selection.index === i;
                  let content: React.ReactNode = null;
                  if (graded) {
                    const expected = quotientExpected(i);
                    if (val != null) {
                      const correct = val === expected;
                      content = (
                        <span className={correct ? 'text-emerald-600 font-extrabold' : 'text-rose-500 font-extrabold animate-pulse bg-rose-50 ring-1 ring-rose-300 rounded px-1.5'}>{val}</span>
                      );
                    } else if (expected != null) {
                      content = <span className="text-rose-500 font-extrabold animate-pulse bg-rose-50 border border-rose-200 rounded px-1">?</span>;
                    }
                  } else if (val != null) {
                    content = <span>{val}</span>;
                  } else {
                    content = <span className="text-slate-300 text-2xl">？</span>;
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => selectQuotient(i)}
                      className={`${cellBase} rounded-xl ${isSelected ? cellSelected : 'hover:bg-slate-50'}`}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>

              {/* わく（わる数｜わられる数） */}
              <div className="grid items-center text-center relative h-16" style={gridStyle}>
                <div className="col-start-1 flex justify-end pr-3 text-slate-800 font-bold border-r-4 border-slate-800 h-full items-center z-20">
                  {divisor}
                </div>
                <div className="absolute right-0 top-0 border-t-4 border-slate-800 z-20" style={{ left: divisorColPx - 2 }} />
                {dividendStr.split('').map((d, i) => (
                  <div key={i} className="w-14 h-16 flex items-center justify-center font-bold text-slate-800">{d}</div>
                ))}
              </div>

              {/* かける・ひく の各段（白紙のワークシートとして最初から全部表示） */}
              {rows.map((row, rowIdx) => {
                const state = rowStates[rowIdx];
                const width = row.value.length;
                const startCol = row.offset - width + 1;
                const isMultiplyRow = row.type === 'multiply';

                return (
                  <div key={rowIdx} className="grid items-center text-center relative h-16" style={gridStyle}>
                    {isMultiplyRow && <div className="absolute right-0 bottom-0 border-b-2 border-slate-300" style={{ left: divisorColPx }} />}
                    <div className="col-start-1 text-slate-400 font-bold text-xl flex justify-end pr-3">
                      {isMultiplyRow ? '×' : '−'}
                    </div>

                    {Array.from({ length: dividendStr.length }, (_, col) => {
                      const within = col >= startCol && col <= row.offset;
                      if (!within) return <div key={col} className="w-14 h-16" />;
                      const localIdx = col - startCol; // 0=いちばん左（大きい位）

                      if (state.kind === 'combined') {
                        const buf = state.value;
                        const bufStart = width - buf.length;
                        const ch = localIdx >= bufStart ? buf[localIdx - bufStart] : '';
                        const isSelected = selection?.kind === 'combined-row' && selection.rowIdx === rowIdx;
                        let display: React.ReactNode = ch;
                        if (ch && graded) {
                          const correct = ch === row.value[localIdx];
                          display = <span className={correct ? 'text-emerald-600' : 'text-rose-500 animate-pulse bg-rose-50 ring-1 ring-rose-300 rounded px-1'}>{ch}</span>;
                        }
                        return (
                          <button key={col} onClick={() => selectCombinedRow(rowIdx)} className={`${cellBase} rounded-xl ${isSelected ? cellSelected : 'hover:bg-slate-50'}`}>
                            {display || (!graded && <span className="text-slate-300 text-xl">・</span>)}
                          </button>
                        );
                      }

                      // 1けたずつのマス：「かける」は繰り上がりが連鎖表示される。「ひく」は繰り下がり表示なしの単純な1けた入力
                      const cellBuf = state.cols[localIdx] ?? '';
                      const mainChar = cellBuf.slice(-1);
                      const isSelected = selection?.kind === 'column-cell' && selection.rowIdx === rowIdx && selection.col === localIdx;
                      const rightBuf = state.cols[localIdx + 1] ?? '';
                      const carry = isMultiplyRow && rightBuf.length >= 2 ? rightBuf.slice(0, -1) : null;
                      let display: React.ReactNode = mainChar;
                      if (mainChar && graded) {
                        const correct = mainChar === row.value[localIdx];
                        display = <span className={correct ? 'text-emerald-600' : 'text-rose-500 animate-pulse bg-rose-50 ring-1 ring-rose-300 rounded px-1'}>{mainChar}</span>;
                      }
                      return (
                        <button key={col} onClick={() => selectColumnCell(rowIdx, localIdx)} className={`${cellBase} rounded-xl ${isSelected ? cellSelected : 'hover:bg-slate-50'}`}>
                          {carry && (
                            <span className="absolute -top-1 right-1.5 text-[13px] font-black text-amber-500 bg-amber-50 border border-amber-200 rounded px-1 leading-tight z-10">
                              {carry}
                            </span>
                          )}
                          {display || (!graded && <span className="text-slate-300 text-xl">・</span>)}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {isFinished && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -right-48 bottom-0 bg-blue-600 text-white p-6 rounded-3xl shadow-xl z-20 text-center"
                >
                  <div className="text-sm font-bold uppercase tracking-widest mb-1 opacity-85">けいさん おわり！</div>
                  <div className="text-3xl font-black">あまり：{problem.remainder}</div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Side Controls / Keypad */}
        <div className="w-full md:w-[400px] bg-white border-l border-slate-100 p-6 md:p-8 flex flex-col gap-6 shadow-[-10px_0_30px_rgba(0,0,0,0.02)] overflow-y-auto">
          {graded && !hasMistakes && (
            <div className="flex-1 flex flex-col justify-center items-center p-6 bg-emerald-50 border border-emerald-150 rounded-3xl text-center">
              <span className="text-6xl mb-4">🏆</span>
              <h3 className="text-2xl font-black text-emerald-800 mb-2">パーフェクト！</h3>
              <p className="text-emerald-600 font-bold mb-6">全問せいかいです！すばらしい！</p>
              <button
                onClick={onNext ?? onBack}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xl shadow-lg shadow-emerald-250 transition-all active:scale-95"
              >
                {onNext ? 'つぎの もんだい' : 'もどる'}
              </button>
            </div>
          )}

          {graded && hasMistakes && (
            <div className="flex-1 flex flex-col justify-center items-center p-6 bg-rose-50 border border-rose-150 rounded-3xl text-center">
              <span className="text-6xl mb-4">💡</span>
              <h3 className="text-2xl font-black text-rose-800 mb-2">おしい！</h3>
              <p className="text-rose-600 text-sm font-bold leading-relaxed mb-6">
                赤マスのまちがっているすう字を、もういちど見なおしてみてね。
              </p>
              <button
                onClick={() => setGraded(false)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-750 text-white rounded-2xl font-black text-lg shadow-md transition-all active:scale-95 mb-3"
              >
                まちがいをなおす
              </button>
              <button
                onClick={resetAll}
                className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl font-bold transition-all"
              >
                はじめからやりなおす
              </button>
              {onNext && (
                <button onClick={onNext} className="w-full py-3 mt-3 text-slate-400 hover:text-slate-600 font-bold transition-all">
                  つぎの もんだいへ すすむ
                </button>
              )}
            </div>
          )}

          {!graded && (
            <>
              <div className="bg-gradient-to-br from-indigo-50 to-amber-50 p-6 rounded-3xl shrink-0 border border-slate-100">
                <h3 className="text-indigo-650 font-black text-lg mb-2 flex items-center gap-2">👑 マスターモード</h3>
                <p className="text-slate-600 font-black text-sm leading-relaxed">
                  ヒントは なしだよ！すきな マスを すきな じゅんばんで タップして うめてね。
                  「ひく」は 1けたずつ マスに 入力するよ。
                  「かける」も 1けたずつ 入力すると、くり上がりが 左のマスに 小さく でるよ。
                  さいごに「答え合わせ」ボタンを おそう！
                </p>
              </div>

              <div className="flex-1 flex flex-col justify-center gap-4">
                <button
                  onClick={resetAll}
                  className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-3xl text-sm font-black transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                >
                  <RotateCcw size={16} />
                  <span>ぜんぶ けす</span>
                </button>

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
                    <button
                      key={n}
                      onClick={() => handleDigit(n.toString())}
                      disabled={!selection}
                      className="h-20 bg-slate-100 hover:bg-slate-200 active:bg-blue-600 active:text-white disabled:opacity-40 rounded-2xl text-3xl font-black text-slate-700 transition-all flex items-center justify-center shadow-sm"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={handleBackspace}
                    disabled={!selection}
                    className="h-20 bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-40 rounded-2xl flex items-center justify-center transition-all shadow-sm"
                  >
                    <Delete size={32} />
                  </button>
                </div>

                <button
                  onClick={doGrade}
                  className="w-full py-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-3xl font-black text-2xl shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <span>答え合わせをする</span>
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => (isFinished && onNext ? onNext() : onBack())}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 py-4 font-bold border-t border-slate-100 shrink-0"
          >
            <RotateCcw size={20} /> {isFinished ? 'もう１問ちょうせん' : 'さいしょから'}
          </button>
        </div>
      </div>
    </div>
  );
};
