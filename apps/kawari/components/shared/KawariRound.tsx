// このファイルは単元アプリ syo4-kawarikatasirabe の src/components/shared/KawariRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 1問ぶんの進行。れんしゅう・本番テスト・ボス戦で同じコンポーネントを使う。
 * ちがいは testMode の2点だけ:
 *   - ヒントを出さない（測る場面なので足場をかけない）
 *   - 1回の解答で確定する（一発正解を採点）
 * これ以外は完全に同じコードが走るので「れんしゅうで解ける問題は必ずテストでも解ける」。
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { KawariProblem } from '../../types';
import { FigureView } from './FigureView';
import { AnswerArea } from './AnswerViews';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { ScratchPadToggle } from 'learning-app-kit/react';
import { praiseClear, encourage } from '../../lib/praise';

/**
 * けいさんらん（筆算を書く場所）を出す問題。
 * 「自分で数を計算して出す」問題だけに出す。
 *   app-*        … □に大きい数（100番目 など）を入れて計算する、面積をくらべる
 *   rule-const   … 2つの数の差や商をもとめる
 *   rule-hidden  … かくれたきまりを見つけるために、たてよこを計算する
 *   exp-totable  … 式にあてはめて 表をうめる
 * 出さない問題とその理由:
 *   gra-*  … グラフから読みとるだけで、筆算がいる計算にはならない
 *   find-* … 「どちらが変わる量か」を見つける問題で、計算しない
 *   tbl-* / rule-kind / exp-scene / exp-toscene / exp-equiv / exp-build … 選ぶ・組み立てる問題
 *   eh-*   … まちがい探し。数が小さく、答えは選択でえらぶ
 */
function needsScratch(skillId: string): boolean {
  return skillId.startsWith('app-')
    || skillId === 'rule-const'
    || skillId === 'rule-hidden'
    || skillId === 'exp-totable';
}

interface Props {
  problem: KawariProblem;
  testMode?: boolean;
  /** 一発正解できたか（1問につき1回だけ呼ばれる） */
  /** perfect だけでなく、まちがえた回数も渡す（できなかった問題を数えるため） */
  onAnswered: (perfect: boolean, misses: number) => void;
  onNext: () => void;
  nextLabel?: string;
  /** ボス戦など、結果パネルを出さずに すぐ次へ行きたいとき */
  autoAdvance?: boolean;
  /**
   * 正解までたどりつかずに、別の問題へ移った・画面を離れたときに呼ばれる。
   * これが無いと「できなかった問題」ほど記録から消える
   * （master-DB: patterns/record-on-success-only-loses-failure-data.md）。
   */
  onAbandon?: (problem: KawariProblem, misses: number) => void;
  /** まちがえるたびに呼ばれる。テストモードで「2回で×」を数えるのに使う */
  onMissed?: () => void;
}

export const KawariRound: React.FC<Props> = ({
  problem, testMode, onAnswered, onNext, nextLabel = 'つぎの もんだい', autoAdvance, onAbandon, onMissed,
}) => {
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const reported = useRef(false);

  // 後片付けの時点では state は古い値を返すので、最新を ref でも持っておく
  const missesRef = useRef(0);
  const latest = useRef({ problem, onAbandon });
  latest.current = { problem, onAbandon };

  /**
   * 正解しないまま次の問題へ移った・画面を離れたときに1件残す。
   * この後片付けは「problem が変わったとき」と「消えるとき」の両方で走るので、
   * 1問ずつ確実に拾える。
   */
  useEffect(() => () => {
    if (reported.current) return;
    if (missesRef.current === 0) return;   // 1回も答えずに通りすぎただけなら数えない
    const { problem: p, onAbandon: cb } = latest.current;
    cb?.(p, missesRef.current);
  }, [problem]);

  // 別の問題に切りかわったら 状態を すべてリセットする
  // （インデックスで表示対象を切りかえる画面は state を全部リセットしないと前問の状態が残る。
  //   master-DB: bugs/index-switch-state-reset.md）
  useEffect(() => {
    setMisses(0);
    missesRef.current = 0;
    setNote(null);
    setDone(false);
    reported.current = false;
  }, [problem]);

  const handleMiss = (n?: string) => {
    setMisses((m) => m + 1);
    missesRef.current += 1;
    setNote(n ?? null);
    playSoftTry();
    onMissed?.();
  };

  const handleComplete = () => {
    if (reported.current) return;
    reported.current = true;
    // misses（state）は、同じ操作の中で handleMiss が呼ばれていても まだ前の値のまま。
    // テストでは「まちがえた → すぐ確定」が1回の操作で起きるので、ref で数える
    // （state を読むと、まちがえた答えが パーフェクト＝正解 として採点されていた）
    const n = missesRef.current;
    const perfect = n === 0;
    onAnswered(perfect, n);
    if (perfect) playClear(); else playCorrect();
    if (autoAdvance) { onNext(); return; }
    setDone(true);
  };

  const hintLevel = Math.min(misses, 3);

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      {problem.story && (
        <p className="text-sm sm:text-base font-bold text-muted bg-surface-2 border border-line rounded-2xl px-4 py-3 mb-3 leading-relaxed">
          {problem.story}
        </p>
      )}
      <h2 className="text-lg sm:text-xl font-black text-content mb-3 leading-relaxed">{problem.prompt}</h2>

      <FigureView figure={problem.figure} />

      {!done && needsScratch(problem.skillId) && (
        <ScratchPadToggle ops={['×', '+', '-', '÷']} decimal={false} />
      )}

      {!done && (
        <AnswerArea
          spec={problem.answer}
          onMiss={handleMiss}
          onComplete={handleComplete}
          testMode={testMode}
          diagnose={problem.diagnose}
          locked={done}
        />
      )}

      {/* 段階的ヒント（1回目から答えを見せない）。テストでは出さない。 */}
      <AnimatePresence>
        {!testMode && !done && hintLevel > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-4 rounded-3xl p-4 bg-amber-50 border border-amber-200 flex items-start gap-3"
          >
            <span className="shrink-0 w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <Lightbulb size={22} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-600 mb-1">
                {note ? 'ここを 見なおそう' : `ヒント ${hintLevel}`}
              </p>
              <p className="text-content font-bold leading-relaxed">
                {note ?? problem.hints[hintLevel - 1]}
              </p>
              {misses === 1 && !note && <p className="text-xs text-amber-700 font-bold mt-2">{encourage()}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {done && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center p-6 bg-surface-2 border border-line rounded-3xl"
        >
          <motion.div
            initial={{ scale: 0.7, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="w-20 h-20 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center"
          >
            <Sparkles size={44} />
          </motion.div>
          {/* テストでは 1回で確定する。まちがえて確定したときに「できたね！」と出さない */}
          <h3 className="text-xl font-black text-content mt-2 mb-1">
            {misses === 0 ? 'せいかい！ パーフェクト！' : testMode ? 'ざんねん…' : 'できたね！'}
          </h3>
          <p className="text-muted font-bold mb-3">{testMode && misses > 0 ? 'やり方を 見て、つぎに いかそう。' : praiseClear(misses === 0)}</p>
          <p className="text-content font-bold bg-surface border border-line rounded-2xl px-4 py-3 leading-relaxed">
            {problem.explain}
          </p>
          <button
            onClick={onNext}
            className="w-full py-4 mt-4 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 bg-emerald-500 hover:bg-emerald-600"
          >
            {nextLabel}
          </button>
        </motion.div>
      )}
    </div>
  );
};
