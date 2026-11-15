// このファイルは単元アプリ wari-hissann3 の src/components/DivisionSimulator.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
import React, { useState, useEffect, useMemo } from 'react';
import { Problem, StepType } from '../types';
import { ArrowDown, Delete, ChevronLeft, RotateCcw, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { playClear, playCorrect, playSoftTry } from '../lib/sound';
import { computeRealSteps } from '../lib/hissanSteps';
import { MasterDivisionBoard } from './MasterDivisionBoard';

interface Props {
  problem: Problem;
  onBack: () => void;
  onFinish?: (results: { isPerfect: boolean; dividend: number; divisor: number }) => void;
  /** クリア後「つぎの もんだい」で同じ設定の新しい問題を出す */
  onNext?: () => void;
  isMasterMode?: boolean;
  /** 商に0が立つとき、かけ算・ひき算の行を省略する書き方を使う */
  zeroShortcut?: boolean;
}

/**
 * わり算筆算シミュレーター。マスターモードは完全に別UI（自由入力のワークシート）
 * になるため MasterDivisionBoard に委譲し、ここは通常モード（段階的ヒントつき）のみを扱う。
 */
export const DivisionSimulator: React.FC<Props> = (props) => {
  if (props.isMasterMode) {
    return (
      <MasterDivisionBoard
        problem={props.problem}
        onBack={props.onBack}
        onFinish={props.onFinish}
        onNext={props.onNext}
        zeroShortcut={props.zeroShortcut}
      />
    );
  }
  return <NormalDivisionBoard {...props} />;
};

const NormalDivisionBoard: React.FC<Props> = ({ problem, onBack, onFinish, onNext, zeroShortcut = false }) => {
  const { dividend, divisor } = problem;
  const dividendStr = dividend.toString();
  const divisorStr = divisor.toString();
  const isTwoDigitDivisor = divisor >= 10;
  // 除数のけた数に応じた左カラム幅（3けたの除数でもはみ出さない）
  const divisorColPx = Math.max(64, divisorStr.length * 34 + 12);
  // 仮商の見当づけに使う「わる数を何十（何百）とみる」値（四捨五入）
  const roundedDivisor = divisor >= 100
    ? Math.max(100, Math.round(divisor / 100) * 100)
    : Math.max(10, Math.round(divisor / 10) * 10);

  const realSteps = useMemo(() => computeRealSteps(dividend, divisor), [dividend, divisor]);

  const [stepIndex, setStepIndex] = useState(0);
  // 最初のステップは「どの位に商を立てるか」を児童自身が選ぶ
  const [subStep, setSubStep] = useState<StepType>('PLACE');
  const [userInput, setUserInput] = useState<string>('');
  // 「かける」「ひく」の答え入力: マスターモードと同じく、位を選んで1マスずつ入力する。
  // 「かける」は2桁入力すると 十の位が 繰り上がりとして 左のマスに小さく表示される。
  const [cellBuffers, setCellBuffers] = useState<string[]>([]);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [gridData, setGridData] = useState<any[]>([]); // Current rendered rows
  const [isFinished, setIsFinished] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 二桁除数の仮商フロー: 現在試している仮商（確定前）
  const [trialQuotient, setTrialQuotient] = useState<number | null>(null);
  // 「ひけない／まだひける」に気づいた後の巻き戻しダイアログ
  const [rollbackPrompt, setRollbackPrompt] = useState<{
    message: string;
    buttonLabel: string;
    action: () => void;
  } | null>(null);

  const isProcessing = React.useRef(false);

  // Initialize display grid
  useEffect(() => {
    // Row 0: Quotient (empty)
    // Row 1: Division frame (divisor + dividend)
    const initialGrid = [
      { type: 'quotient', values: Array(dividendStr.length).fill(null) },
      { type: 'frame', divisor: divisorStr, dividend: dividendStr }
    ];
    setGridData(initialGrid);
    setMistakeCount(0);
    setStepIndex(0);
    setSubStep('PLACE');
    setUserInput('');
    setCellBuffers([]);
    setSelectedCol(null);
    setIsFinished(false);
    setTrialQuotient(null);
    setRollbackPrompt(null);
    setFeedback(null);
  }, [dividend, divisor]);

  const activeStep = realSteps[stepIndex];
  const nextStep = realSteps[stepIndex + 1];

  // 「かける」「ひく」の入力欄に入るたび、必要なマス数ぶんの入力バッファを用意し、
  // いちばん右（一の位）のマスをはじめに選んでおく。
  useEffect(() => {
    if (!activeStep) return;
    const q = trialQuotient ?? activeStep.quotient;
    if (subStep === 'MULTIPLY') {
      const len = Math.max(1, String(divisor * q).length);
      setCellBuffers(Array(len).fill(''));
      setSelectedCol(len - 1);
    } else if (subStep === 'SUBTRACT') {
      const expectedRemainder = activeStep.dividendPart - divisor * q;
      const len = Math.max(1, String(expectedRemainder).length);
      setCellBuffers(Array(len).fill(''));
      setSelectedCol(len - 1);
    }
  }, [subStep, stepIndex, trialQuotient, activeStep, divisor]);

  const writeQuotient = (val: number) => {
    setGridData(prev => {
      const next = [...prev];
      if (next[0] && activeStep) {
        const newValues = [...next[0].values];
        newValues[activeStep.index] = val;
        next[0] = { ...next[0], values: newValues };
      }
      return next;
    });
  };

  // ① 最初の商をどの位に立てるか、児童自身がタップして選ぶ
  const handlePlaceTap = (colIdx: number) => {
    if (subStep !== 'PLACE' || isFinished) return;
    const correctIdx = realSteps[0]?.index ?? 0;
    const prefix = dividendStr.slice(0, correctIdx + 1);

    if (colIdx === correctIdx) {
      setSubStep('DIVIDE');
      setFeedback(`そのとおり！\n${prefix} の中に ${divisor} が入るから、この位から商を立てるよ。`);
      return;
    }

    setMistakeCount(prev => prev + 1);

    if (colIdx < correctIdx) {
      const tapped = dividendStr.slice(0, colIdx + 1);
      setFeedback(`${tapped} は ${divisor} より小さいから、ここには商を立てられないよ。\nもう1けた ふやして くらべてみよう。`);
    } else {
      setFeedback(`もっと大きい位から 立てられるよ。\n左から じゅんばんに「${divisor} が入るかな？」と くらべてみよう。`);
    }
  };

  // ④ 仮商が合わなかったとき、書いた行を消して立て直す（やり直し体験）
  const rollbackTrial = (suggestedNext: number, rowsToRemove: number) => {
    setRollbackPrompt(null);
    setGridData(prev => {
      const next = prev.slice(0, prev.length - rowsToRemove);
      if (next[0] && activeStep) {
        const newValues = [...next[0].values];
        newValues[activeStep.index] = null;
        next[0] = { ...next[0], values: newValues };
      }
      return next;
    });
    setTrialQuotient(null);
    setUserInput('');
    setCellBuffers([]);
    setSelectedCol(null);
    setSubStep('DIVIDE');
    setFeedback(`こんどは「${suggestedNext}」を ためしてみよう！`);
  };

  // かける・ひくの入力マスをタップして選ぶ
  const handleCellTap = (col: number) => {
    if (isFinished || rollbackPrompt) return;
    if (subStep !== 'MULTIPLY' && subStep !== 'SUBTRACT') return;
    setSelectedCol(col);
  };

  // Check if we can proceed to next bit
  const handleKeypad = (val: string) => {
    if (isFinished) return;
    if (subStep === 'BRING_DOWN' || subStep === 'PLACE') return; // Must click Check/Next or tap a cell
    if (rollbackPrompt) return;

    if (subStep === 'MULTIPLY' || subStep === 'SUBTRACT') {
      if (selectedCol === null) return;
      // 「かける」は繰り上がり表示のため最大2桁、「ひく」は繰り下がり表示をしないため1桁まで
      const maxLen = subStep === 'MULTIPLY' ? 2 : 1;
      setCellBuffers(prev => {
        const cur = prev[selectedCol] ?? '';
        if (cur.length >= maxLen) return prev;
        const next = [...prev];
        next[selectedCol] = cur + val;
        return next;
      });
      return;
    }
    setUserInput(prev => prev + val);
  };

  const handleBackspace = () => {
    if (isFinished) return;
    if (subStep === 'MULTIPLY' || subStep === 'SUBTRACT') {
      if (selectedCol === null) return;
      setCellBuffers(prev => {
        const next = [...prev];
        next[selectedCol] = (next[selectedCol] ?? '').slice(0, -1);
        return next;
      });
      return;
    }
    setUserInput(prev => prev.slice(0, -1));
  };

  const checkAnswer = () => {
    if (!activeStep || isProcessing.current || subStep === 'PLACE' || rollbackPrompt) return;

    if (subStep === 'DIVIDE') {
      const inputVal = parseInt(userInput);

      // ② 商に0が立つ位: 「わられる数 < わる数 → 0を立てる」を明示的に指導
      if (activeStep.type === 'ZERO') {
        if (inputVal === 0) {
          writeQuotient(0);
          setUserInput('');
          if (zeroShortcut) {
            // 省略形: かけ算・ひき算を書かず、すぐ次へ
            if (stepIndex < realSteps.length - 1) {
              setSubStep('BRING_DOWN');
            } else {
              finish();
            }
          } else {
            setSubStep('MULTIPLY');
          }
        } else {
          triggerError(`${activeStep.dividendPart} は ${divisor} より小さくて、1つも分けられないね。\n分けられないときは、商に「0」を立てるよ。`);
        }
        return;
      }

      // ④ 二桁除数: 見当をつけた仮商なら（多少ずれていても）受け入れて試させる
      if (isTwoDigitDivisor) {
        const trueQ = activeStep.quotient;
        if (inputVal >= 1 && inputVal <= 9 && Math.abs(inputVal - trueQ) <= 2) {
          setTrialQuotient(inputVal);
          writeQuotient(inputVal);
          setUserInput('');
          setSubStep('MULTIPLY');
        } else {
          triggerError(`見当をつけてみよう！\n${divisor} を ${roundedDivisor} とみると、\n${activeStep.dividendPart} ÷ ${roundedDivisor} で だいたい いくつかな？`);
        }
        return;
      }

      if (inputVal === activeStep.quotient) {
        playCorrect();
        writeQuotient(activeStep.quotient);
        setUserInput('');
        setSubStep('MULTIPLY');
      } else {
        let msg = "おしい！ もう一度考えてみよう。";
        if (inputVal < activeStep.quotient) {
          msg = "もっと大きく わけられそうだよ！\n（あまりが わる数より大きくなっちゃうよ）";
        } else if (inputVal > activeStep.quotient) {
          msg = "ちょっと 大きすぎたかも？\n（下のひき算が できなくなっちゃうよ）";
        }
        triggerError(msg);
      }
    } else if (subStep === 'MULTIPLY') {
      // 仮商を試している間は、その仮商に対するかけ算が「正しい計算」
      const q = trialQuotient ?? activeStep.quotient;
      const expectedProduct = divisor * q;
      const allFilled = cellBuffers.length > 0 && cellBuffers.every(c => c !== '');
      const combined = cellBuffers.map(c => c.slice(-1)).join('');

      if (allFilled && parseInt(combined) === expectedProduct) {
        playCorrect();
        setGridData(prev => {
          const next = [...prev];
          next.push({ type: 'multiply', value: combined, offset: activeStep.index });
          return next;
        });
        setCellBuffers([]);
        setSelectedCol(null);

        if (expectedProduct > activeStep.dividendPart) {
          // 仮商が大きすぎた: ひけないことに気づかせ、消してやり直す
          setRollbackPrompt({
            message: `${activeStep.dividendPart} から ${expectedProduct} は ひけない！\n仮の商「${q}」は 大きすぎたみたい。`,
            buttonLabel: `${q} を消して ${q - 1} でやりなおす`,
            action: () => rollbackTrial(q - 1, 1)
          });
        } else {
          setSubStep('SUBTRACT');
        }
      } else {
        triggerError("かけ算を もういちど かくにんしてみよう！");
      }
    } else if (subStep === 'SUBTRACT') {
       const q = trialQuotient ?? activeStep.quotient;
       const expectedProduct = divisor * q;
       const expectedRemainder = activeStep.dividendPart - expectedProduct;
       const allFilled = cellBuffers.length > 0 && cellBuffers.every(c => c !== '');
       const combined = cellBuffers.map(c => c.slice(-1)).join('');

       if (allFilled && parseInt(combined) === expectedRemainder) {
         playCorrect();
         setGridData(prev => {
           const next = [...prev];
           next.push({ type: 'remainder', value: combined, offset: activeStep.index });
           return next;
         });
         setCellBuffers([]);
         setSelectedCol(null);

         if (expectedRemainder >= divisor) {
           // 仮商が小さすぎた: あまり≧わる数に気づかせ、消してやり直す
           setRollbackPrompt({
             message: `あまりの ${expectedRemainder} が、わる数の ${divisor} と同じか大きいよ。\nまだ ${divisor} を ひけるね。仮の商「${q}」は 小さすぎたみたい。`,
             buttonLabel: `${q} を消して ${q + 1} でやりなおす`,
             action: () => rollbackTrial(q + 1, 2)
           });
           return;
         }

         setTrialQuotient(null); // 仮商を確定

         if (stepIndex < realSteps.length - 1) {
           setSubStep('BRING_DOWN');
         } else {
           finish();
         }
       } else {
         triggerError("ひき算を もういちど かくにんしてみよう！");
       }
    } else if (subStep === 'BRING_DOWN') {
       if (!nextStep) return;
       isProcessing.current = true;
       setGridData(prev => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          const lastRow = next[lastIdx];
          if (lastRow && lastRow.type === 'remainder') {
             // CRITICAL: use the activeStep.remainder (source of truth)
             // rather than current text value to avoid duplicating digits (e.g. 19 -> 199)
             const remainderString = activeStep.remainder.toString();
             const nextDigit = dividendStr[nextStep.digitIndex];

             // In school math, if remainder is 0, we just show the brought down digit (e.g. 0 and 5 -> 5)
             next[lastIdx] = {
               ...lastRow,
               value: (remainderString === '0' ? '' : remainderString) + nextDigit,
               offset: nextStep.digitIndex
             };
          }
          return next;
       });

       // Briefly delay the transition to allow the user to see the digit land
       setTimeout(() => {
         setStepIndex(prev => prev + 1);
         setSubStep('DIVIDE');
         setUserInput('');
         isProcessing.current = false;
       }, 300);
    }
  };

  const triggerError = (msg?: string) => {
    playSoftTry();
    setMistakeCount(prev => prev + 1);
    if (msg) setFeedback(msg);
    // Visual feedback for error
    const el = document.getElementById('input-area');
    el?.classList.add('animate-shake');
    setTimeout(() => el?.classList.remove('animate-shake'), 500);
    setUserInput('');
    setCellBuffers(prev => prev.map(() => ''));
  };

  const finish = () => {
    setIsFinished(true);
    setSubStep('DIVIDE'); // Clear active interactions
    playClear();
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
    onFinish?.({
      isPerfect: mistakeCount === 0,
      dividend,
      divisor
    });
  };

  const hasAnyInput = (subStep === 'MULTIPLY' || subStep === 'SUBTRACT')
    ? cellBuffers.some(c => c !== '')
    : userInput !== '';

  return (
    <div className="flex flex-col h-full bg-slate-50 simulator-container">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">
          <ChevronLeft size={24} />
          もどる
        </button>
        <div className="flex items-center gap-3">
           <span className="text-sm font-bold text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">わる算ラボ</span>
           <h1 className="text-2xl font-black text-slate-800">{dividend} ÷ {divisor}</h1>
        </div>
        <div className="w-24"></div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Feedback Overlay */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFeedback(null)}
              className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl text-center border-4 border-amber-400"
              >
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">💡</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-4 whitespace-pre-wrap">
                  {feedback}
                </h3>
                <button
                  onClick={() => setFeedback(null)}
                  className="w-full py-4 bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-2xl font-black text-xl shadow-lg shadow-amber-200 transition-all active:scale-95"
                >
                  わかった！
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rollback Prompt (仮商のやり直し): 必ずボタンを押して巻き戻させる */}
        <AnimatePresence>
          {rollbackPrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl text-center border-4 border-rose-300"
              >
                <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">🤔</span>
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2 whitespace-pre-wrap leading-relaxed">
                  {rollbackPrompt.message}
                </h3>
                <p className="text-slate-500 font-bold text-sm mb-6">
                  まちがいに気づけたのが すごい！けしゴムで消して、立て直そう。
                </p>
                <button
                  onClick={rollbackPrompt.action}
                  className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={22} />
                  <span>{rollbackPrompt.buttonLabel}</span>
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Workspace */}
        <div className="flex-1 relative overflow-auto p-4 md:p-12 flex justify-center items-start">
          <div className="bg-white p-8 md:p-12 rounded-[30px] md:rounded-[40px] shadow-2xl border border-blue-50/50 min-w-[500px] md:min-w-[600px] relative">

            {/* Instruction Overlay (Moved inside or adjusted for iPad) */}
            <div className="hidden lg:block absolute -left-28 top-0 mt-8 w-24 space-y-3">
               {['たてる', 'かける', 'ひく', 'おろす'].map((s, i) => {
                 const stepWords = ['DIVIDE', 'MULTIPLY', 'SUBTRACT', 'BRING_DOWN'];
                 const isActive = subStep === stepWords[i] || (subStep === 'PLACE' && i === 0);
                 return (
                   <div key={s} className={`p-2.5 rounded-xl text-center font-black text-sm transition-all ${isActive ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-white text-slate-300 border border-slate-100'}`}>
                     {s}
                   </div>
                 )
               })}
            </div>

            {/* Mobile/iPad Step Indicator */}
            <div className="lg:hidden flex gap-2 mb-6 overflow-x-auto pb-2">
               {['たてる', 'かける', 'ひく', 'おろす'].map((s, i) => {
                 const stepWords = ['DIVIDE', 'MULTIPLY', 'SUBTRACT', 'BRING_DOWN'];
                 const isActive = subStep === stepWords[i] || (subStep === 'PLACE' && i === 0);
                 return (
                   <div key={s} className={`px-4 py-2 rounded-full text-center font-black text-xs whitespace-nowrap transition-all ${isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-300 border border-slate-100'}`}>
                     {s}
                   </div>
                 )
               })}
            </div>

            <div className="font-mono text-5xl leading-none tracking-widest text-slate-700 select-none">

              {/* Row 0: Quotient */}
              <div
                id="quotient-row"
                className="grid items-center text-center"
                style={{ gridTemplateColumns: `${divisorColPx}px repeat(${dividendStr.length}, 56px)` }}
              >
                 <div className="col-start-1"></div>
                 {dividendStr.split('').map((_, i) => {
                    // ① 立てる位置の自己選択: すべての位を同じ見た目のボタンにして選ばせる
                    if (subStep === 'PLACE' && !isFinished) {
                      return (
                        <button
                          key={i}
                          onClick={() => handlePlaceTap(i)}
                          className="w-14 h-16 flex items-center justify-center border-[3px] border-dashed border-amber-400 bg-amber-50/60 rounded-xl text-amber-400 text-2xl font-black hover:bg-amber-100 active:scale-95 transition-all"
                        >
                          ？
                        </button>
                      );
                    }
                    return (
                    <div key={i} className={`w-14 h-16 flex items-center justify-center relative ${subStep === 'DIVIDE' && activeStep?.index === i ? 'bg-blue-50 ring-4 ring-blue-400 ring-inset rounded-xl z-30' : ''}`}>
                       <AnimatePresence mode="wait">
                         {(() => {
                           const userVal = gridData[0]?.values?.[i];
                           if (userVal != null) {
                             // 仮商（未確定）はオレンジの点線下線で「仮」であることを示す
                             const isTrial = trialQuotient !== null && activeStep?.index === i && !isFinished;
                             return (
                               <motion.span
                                 initial={{ scale: 0 }}
                                 animate={{ scale: 1 }}
                                 key="val"
                                 className={isTrial ? 'text-amber-500 border-b-4 border-dotted border-amber-400' : ''}
                               >
                                 {userVal}
                               </motion.span>
                             );
                           }
                           return subStep === 'DIVIDE' && activeStep?.index === i && (
                             <span className="text-blue-500 animate-pulse">{userInput || '？'}</span>
                           );
                         })()}
                       </AnimatePresence>
                    </div>
                    );
                 })}
              </div>

              {/* Row 1: The Frame (Divisor | Dividend) */}
              <div
                className="grid items-center text-center relative h-16"
                style={{ gridTemplateColumns: `${divisorColPx}px repeat(${dividendStr.length}, 56px)` }}
              >
                 {/* Divisor */}
                 <div className="col-start-1 flex justify-end pr-3 text-slate-800 font-bold border-r-4 border-slate-800 h-full items-center z-20">
                     {divisor}
                 </div>

                 <div className="absolute right-0 top-0 border-t-4 border-slate-800 z-20" style={{ left: divisorColPx - 2 }}></div>

                 {/* Dividend */}
                 {dividendStr.split('').map((d, i) => {
                   const isBeingUsed = !isFinished && subStep === 'DIVIDE' && i <= activeStep?.index && (i >= (stepIndex === 0 ? 0 : realSteps[stepIndex-1].index + 1));

                   return (
                     <div key={i} className={`w-14 h-16 flex items-center justify-center relative font-bold text-slate-800 transition-colors ${isBeingUsed ? 'bg-amber-50 text-amber-700' : ''}`}>
                        <AnimatePresence>
                          {subStep === 'BRING_DOWN' && nextStep?.digitIndex === i ? (
                            <motion.div
                              drag="y"
                              dragConstraints={{ top: 0, bottom: 250 }}
                              dragSnapToOrigin
                              onDragEnd={(_, info) => {
                                if (info.offset.y > 80) {
                                  checkAnswer();
                                }
                              }}
                              className="bg-blue-600 text-white w-10 h-10 flex items-center justify-center rounded-lg shadow-xl cursor-grab active:cursor-grabbing z-40 border-2 border-white"
                            >
                              {d}
                            </motion.div>
                          ) : (
                            <span className={subStep === 'BRING_DOWN' && nextStep?.digitIndex === i ? 'opacity-20' : ''}>{d}</span>
                          )}
                        </AnimatePresence>
                        {isBeingUsed && <div className="absolute bottom-0 left-1 right-1 h-1 bg-amber-400 rounded-full"></div>}
                     </div>
                   );
                 })}
              </div>

              {/* Steps (Multiply and Remainder) */}
              <div className="relative">
                  {gridData.slice(2).map((row, idx) => {
                    const isLastRow = idx === gridData.length - 3;
                    const isFocusRow = !isFinished && isLastRow && (subStep === 'DIVIDE' || subStep === 'BRING_DOWN');

                    return (
                      <div
                         key={idx}
                         className={`grid items-center text-center relative h-16 transition-colors duration-300 ${isFocusRow ? 'bg-blue-50/20' : ''}`}
                         style={{ gridTemplateColumns: `${divisorColPx}px repeat(${dividendStr.length}, 56px)` }}
                      >
                         {row.type === 'multiply' && (
                            <div className="absolute right-0 bottom-0 border-b-2 border-slate-300" style={{ left: divisorColPx }}></div>
                         )}

                         <div className="col-start-1 text-slate-400 font-bold text-xl flex justify-end pr-3">
                            {row.type === 'multiply' ? '×' : (idx > 0 && gridData.slice(2)[idx-1].type === 'multiply' ? '-' : '')}
                         </div>

                         {Array(dividendStr.length).fill(0).map((_, dividendIdx) => {
                            const valStr = row.value.toString();
                            const offset = row.offset;
                            const digitsNeeded = valStr.length;
                            const startIdx = offset - digitsNeeded + 1;
                            const char = (dividendIdx >= startIdx && dividendIdx <= offset) ? valStr[dividendIdx - startIdx] : '';

                            const isActiveDigitInDivision = !isFinished && subStep === 'DIVIDE' && isLastRow && row.type === 'remainder' && dividendIdx >= startIdx && dividendIdx <= offset;
                            const isBringDownEmptySpot = subStep === 'BRING_DOWN' && row.type === 'remainder' && isLastRow && nextStep?.digitIndex === dividendIdx;

                            return (
                              <div key={dividendIdx} className="w-14 h-16 flex justify-center items-center relative">
                                 {(() => {
                                   if (!char) {
                                     return isBringDownEmptySpot ? (
                                       <motion.div
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          className="absolute inset-2 border-2 border-dashed border-blue-400 rounded-lg bg-blue-100/50 flex flex-col items-center justify-center p-1"
                                       >
                                          <ArrowDown className="text-blue-500 animate-bounce" size={24} />
                                       </motion.div>
                                     ) : null;
                                   }

                                   return (
                                     <span className={`z-10 text-3xl font-medium ${isActiveDigitInDivision ? 'text-blue-600 font-extrabold' : ''}`}>
                                       {char}
                                     </span>
                                   );
                                 })()}
                                 {isActiveDigitInDivision && (
                                   <div className="absolute bottom-1 left-1 right-1 h-1 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                 )}
                              </div>
                            );
                         })}
                      </div>
                    );
                  })}

                  {/* Current Input Zone (Floating row for Multiply/Subtract result entry): マスターモードと同じく
                      位を選んでマスに入力する。「かける」は2桁入力すると十の位が繰り上がりとして左のマスに小さく出る。 */}
                  {!isFinished && (subStep === 'MULTIPLY' || subStep === 'SUBTRACT') && (
                     <div
                        className="grid items-center text-center relative h-16 bg-blue-100/20 ring-4 ring-blue-400/30 rounded-2xl mx-1 shadow-sm mt-1 mb-1"
                        style={{ gridTemplateColumns: `${divisorColPx}px repeat(${dividendStr.length}, 56px)` }}
                     >
                        <div className="col-start-1 text-blue-500 font-bold text-3xl flex justify-end pr-3">
                           {subStep === 'MULTIPLY' ? '×' : '-'}
                        </div>
                        {subStep === 'SUBTRACT' && (
                          <div className="absolute right-0 bottom-0 border-b-4 border-blue-400 rounded-full" style={{ left: divisorColPx }}></div>
                        )}

                        {Array(dividendStr.length).fill(0).map((_, dividendIdx) => {
                           const digitsNeeded = cellBuffers.length || 1;
                           const offset = activeStep.index;
                           const startIdx = offset - digitsNeeded + 1;
                           const isTarget = (dividendIdx >= startIdx && dividendIdx <= offset);
                           const col = dividendIdx - startIdx;
                           const buf = isTarget ? (cellBuffers[col] ?? '') : '';
                           const char = buf.slice(-1);
                           const isSelected = isTarget && selectedCol === col;
                           const rightBuf = isTarget && col + 1 < cellBuffers.length ? (cellBuffers[col + 1] ?? '') : '';
                           const carry = subStep === 'MULTIPLY' && rightBuf.length >= 2 ? rightBuf.slice(0, -1) : null;

                           if (!isTarget) {
                             return <div key={dividendIdx} className="w-14 h-16" />;
                           }

                           return (
                             <div key={dividendIdx} className="w-14 h-16 flex justify-center items-center relative">
                               <button
                                 onClick={() => handleCellTap(col)}
                                 className={`w-14 h-16 flex justify-center items-center rounded-xl transition-all ${isSelected ? 'bg-white shadow-lg ring-4 ring-blue-500 ring-inset z-10' : 'bg-blue-50/70 ring-2 ring-blue-200 hover:bg-blue-100/70'}`}
                               >
                                 <span className="text-blue-600 font-black text-4xl">{char}</span>
                                 {isSelected && !char && <span className="text-blue-200 animate-pulse absolute">？</span>}
                               </button>
                               {carry && (
                                 <span className="absolute -top-1 right-1.5 text-[13px] font-black text-amber-500 bg-amber-50 border border-amber-200 rounded px-1 leading-tight z-20">
                                   {carry}
                                 </span>
                               )}
                             </div>
                           );
                        })}
                     </div>
                  )}
              </div>

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
          <div className="bg-blue-50 p-6 rounded-3xl shrink-0 border border-blue-10/50">
             <h3 className="text-blue-600 font-black text-lg mb-2 flex items-center gap-2">
                 <PartyPopper size={20} /> ヒント
             </h3>
             <p className="text-slate-605 font-medium leading-relaxed whitespace-pre-line">
               {subStep === 'PLACE' && `商は どの位から 立てられるかな？\n上の てんせんのマスを タップしよう！`}
               {subStep === 'DIVIDE' && (
                 activeStep?.type === 'ZERO'
                   ? `${activeStep?.dividendPart} の中に ${divisor} は あるかな？\nないときは どうするんだったかな？`
                   : isTwoDigitDivisor
                     ? `${activeStep?.dividendPart} の中に ${divisor} はいくつあるかな？\n${divisor} を ${roundedDivisor} とみて 見当をつけよう。`
                     : `${activeStep?.dividendPart} の中に ${divisor} はいくつあるかな？`
               )}
               {subStep === 'MULTIPLY' && `${divisor} × ${trialQuotient ?? activeStep?.quotient} をけいさんしよう。`}
               {subStep === 'SUBTRACT' && `${activeStep?.dividendPart} - ${divisor * (trialQuotient ?? activeStep?.quotient ?? 0)} は？`}
               {subStep === 'BRING_DOWN' && `つぎの かずを おろそう。`}
               {isFinished && `正かい！よくできました！`}
             </p>
          </div>

          <div id="input-area" className="flex-1 flex flex-col justify-center gap-4">
             <div className="grid grid-cols-3 gap-3">
               {[1,2,3,4,5,6,7,8,9,0].map(n => (
                 <button
                   key={n}
                   onClick={() => handleKeypad(n.toString())}
                   className="h-20 bg-slate-100 hover:bg-slate-200 active:bg-blue-600 active:text-white rounded-2xl text-3xl font-black text-slate-700 transition-all flex items-center justify-center shadow-sm"
                 >
                   {n}
                 </button>
               ))}
               <button
                onClick={handleBackspace}
                className="h-20 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl flex items-center justify-center transition-all shadow-sm"
               >
                 <Delete size={32} />
               </button>
             </div>

             <button
               onClick={checkAnswer}
               disabled={!hasAnyInput && subStep !== 'BRING_DOWN'}
               className={`w-full py-6 rounded-3xl text-2xl font-black shadow-lg transition-all flex items-center justify-center gap-3 ${
                 (hasAnyInput || subStep === 'BRING_DOWN') ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95' : 'bg-slate-100 text-slate-300'
               }`}
             >
               {subStep === 'BRING_DOWN' ? 'つぎへ' : 'チェック'}
             </button>
          </div>

          <button
            onClick={() => (isFinished && onNext ? onNext() : onBack())}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 py-4 font-bold border-t border-slate-100 shrink-0"
          >
            <RotateCcw size={20} /> {isFinished ? 'もう１問ちょうせん' : 'さいしょから'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
