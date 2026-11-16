// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/OrderModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * じゅんばんマスター。( )→×÷→＋－ の計算じゅんじょを練習する。
 *   1. 「つぎに計算するところ」の しるし（＋－×÷）を、式の中からタップして えらぶ（順序判断そのもの。先は教えない）
 *   2. そこの答えを入れる → 紙に書くように「＝」で、結果に置きかえた式が1行ふえる
 * を、答えが出るまでくりかえす。まちがえたら、ルールのヒントが出る。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { ORDER_LEVELS, OrderLevel, OrderProblem, generateOrder } from '../../lib/problems';
import {
  Seg, tokenize, isOp, opCount, checkPick, pickValue, pickSpan, reduceAt, toSegs,
} from '../../lib/orderSteps';
import { FirstPickRound } from './FirstPickRound';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = ORDER_LEVELS.map((l) => l.id);

export const OrderModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<OrderLevel>('order-2step');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<OrderLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="じゅんばん マスター" subtitle="( )や ×÷ を 見つけて、正しい じゅんばんで 計算しよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {ORDER_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-blue-400"
              onClick={() => { setLevel(l.id); setRound((r) => r + 1); setMode('level'); }}
            />
          ))}
        </div>
        <button
          onClick={() => { setRound((r) => r + 1); setMode('auto'); }}
          className="w-full p-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Wand2 size={22} /> おまかせモード（じどうで レベルアップ）
        </button>
      </SetupScreen>
    );
  }

  const activeLevel = mode === 'auto' ? adaptive.level : level;

  return (
    <AppShell title="じゅんばん マスター" subtitle={ORDER_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          {activeLevel === 'order-first' ? (
            <FirstPickRound
              key={`${activeLevel}-${round}`}
              onNext={() => setRound((r) => r + 1)}
              onResult={mode === 'auto' ? adaptive.onResult : undefined}
            />
          ) : (
            <OrderRound
              key={`${activeLevel}-${round}`}
              level={activeLevel}
              onNext={() => setRound((r) => r + 1)}
              onResult={mode === 'auto' ? adaptive.onResult : undefined}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
};

const OP_NAME: Record<string, string> = { '＋': 'たし算', '－': 'ひき算', '×': 'かけ算', '÷': 'わり算' };
const LINE_CLS = 'text-[clamp(1.5rem,6.4vw,2.5rem)] font-black tabular-nums tracking-wider leading-tight';

interface Row {
  tokens: string[];
  /** 結果の数の位置（直前の計算の答え。色をつける） */
  mark?: number;
  /** 計算した部分の範囲（下線をひく） */
  under?: [number, number];
}

/** 「＝」の列と、式の1行ぶん。 */
const LineFrame: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => (
  <div className={`flex items-baseline gap-2 py-2 ${LINE_CLS} text-content`} style={{ borderBottom: '1px dashed var(--c-line)' }}>
    <span className={`w-[1.4em] shrink-0 text-right ${first ? 'invisible' : 'text-muted'}`} aria-hidden>＝</span>
    <span className="whitespace-nowrap">{children}</span>
  </div>
);

/** 下線＝いま計算した部分、色つき＝計算した結果。 */
const SegText: React.FC<{ segs: Seg[]; final?: boolean }> = ({ segs, final }) => (
  <>
    {segs.map((g, i) => {
      if (typeof g === 'string') return <span key={i}>{g}</span>;
      if ('u' in g) return <span key={i} className="underline decoration-brand decoration-[3px] underline-offset-[10px]">{g.u}</span>;
      return <span key={i} className={`text-brand rounded-lg px-1 -mx-0.5 bg-brand/15 ${final ? 'ring-2 ring-brand/60' : ''}`}>{g.r}</span>;
    })}
  </>
);

/**
 * いま計算している行。えらぶ段階では ＋－×÷ がボタンになり、タップして「ここから計算する」を決める。
 * 答えを入れる段階では、えらんだ部分に下線がつく。
 */
const ActiveLine: React.FC<{
  row: Row;
  picked: number | null;
  choosing: boolean;
  onPick: (i: number) => void;
}> = ({ row, picked, choosing, onPick }) => {
  const under = picked !== null ? pickSpan(row.tokens, picked) : undefined;
  const nodes: React.ReactNode[] = [];
  let k = 0;
  while (k < row.tokens.length) {
    const t = row.tokens[k];
    if (under && k === under[0]) {
      nodes.push(<span key={k} className="underline decoration-brand decoration-[3px] underline-offset-[10px]">{row.tokens.slice(under[0], under[1] + 1).join('')}</span>);
      k = under[1] + 1;
      continue;
    }
    if (choosing && isOp(t)) {
      const at = k;
      nodes.push(
        <button
          key={k}
          type="button"
          onClick={() => onPick(at)}
          aria-label={`${OP_NAME[t]}（${t}）を 先に 計算する`}
          className="inline-flex items-center justify-center min-w-[1.4em] h-[1.4em] mx-0.5 rounded-xl border-2 border-dashed border-brand/70 bg-brand/10 text-content hover:bg-brand/25 active:scale-90 transition"
        >
          {t}
        </button>,
      );
    } else if (row.mark === k) {
      nodes.push(<span key={k} className="text-brand rounded-lg px-1 -mx-0.5 bg-brand/15">{t}</span>);
    } else {
      nodes.push(<span key={k}>{t}</span>);
    }
    k++;
  }
  return <>{nodes}</>;
};

/**
 * 紙に書くように、答えた計算を「＝」で書きすすめる。
 * 最初の式から、ひとつ答えるたびに「計算した部分に下線 → 結果に置きかえた式」が下に足されていく。
 * （どこから計算するかは教えない。タップで えらんだあと、正解すると、どこを計算したかが見える。）
 */
const WorkSheet: React.FC<{
  rows: Row[];
  active: boolean;
  picked: number | null;
  onPick: (i: number) => void;
}> = ({ rows, active, picked, onPick }) => (
  <div aria-live="polite" aria-label="けいさんの とちゅうの しき">
    {rows.map((row, i) => {
      const isActive = active && i === rows.length - 1;
      return (
        <motion.div
          key={i}
          initial={i === 0 ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <LineFrame first={i === 0}>
            {isActive
              ? <ActiveLine row={row} picked={picked} choosing={picked === null && opCount(row.tokens) > 1} onPick={onPick} />
              : <SegText segs={toSegs(row.tokens, row.under, row.mark)} final={!active && i === rows.length - 1 && i > 0} />}
          </LineFrame>
        </motion.div>
      );
    })}
    {active && (
      <div className={`flex items-center gap-2 py-3 ${LINE_CLS} text-faint`} aria-hidden>
        <span className="w-[1.4em] shrink-0 text-right">＝</span>
        <span className="inline-block h-[1.2em] w-[2.2em] rounded-xl border-2 border-dashed border-faint/70" />
      </div>
    )}
  </div>
);

export const OrderRound: React.FC<{
  level: OrderLevel;
  problem?: OrderProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<OrderProblem>(() => given ?? generateOrder(level));
  // 紙に書いた途中式。さいしょは問題の式だけ
  const [rows, setRows] = useState<Row[]>(() => [{ tokens: tokenize(problem.expr) }]);
  // えらんだ演算子の位置（まだえらんでいなければ null）
  const [picked, setPicked] = useState<number | null>(null);
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'order', skillId: level, record: recordResult });

  const cur = rows[rows.length - 1];
  const total = problem.checkpoints.length;
  // 計算が1つしか残っていないときは、えらぶ必要がない（自動でそこを計算する）
  const target = picked ?? (opCount(cur.tokens) === 1 ? cur.tokens.findIndex(isOp) : null);
  const choosing = stage === 'answer' && target === null;
  const miss = (msg: string) => {
    playSoftTry();
    setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
    setHint(msg);
  };

  const onPick = (i: number) => {
    if (stage !== 'answer') return;
    const res = checkPick(cur.tokens, i);
    if ('hint' in res) miss(res.hint); else { setPicked(i); setHint(null); }
  };

  const submit = (v: string) => {
    if (target === null) return;
    const [from, to] = pickSpan(cur.tokens, target);
    const expected = pickValue(cur.tokens, target);
    if (Number(v) !== expected) {
      const part = cur.tokens.slice(target - 1, target + 2).join('');
      miss(`${part} を もういちど 計算しよう。`);
      return;
    }
    setHint(null);
    // 計算した部分に下線を引き、結果に置きかえた式を1行ふやす（紙に「＝」で書きすすめるように）
    const next = reduceAt(cur.tokens, target);
    setRows((rs) => [...rs.slice(0, -1), { ...cur, under: [from, to] }, { tokens: next.tokens, mark: next.resultAt }]);
    setPicked(null);
    if (opCount(next.tokens) === 0) {
      playClear();
      confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
      rec.finish(problem.expr);
      onResult?.(mistakes === 0);
      setStage('done');
    }
  };

  /** えらびなおす（えらんだあと）／ひとつ もどる（1行まえの式へ）。まちがえた回数は減らない。 */
  const back = () => {
    setHint(null);
    if (picked !== null) { setPicked(null); return; }
    setRows((rs) => (rs.length > 1 ? [...rs.slice(0, -2), { ...rs[rs.length - 2], under: undefined }] : rs));
  };
  const canBack = stage === 'answer' && (picked !== null || rows.length > 1);

  const targetPart = target !== null ? cur.tokens.slice(target - 1, target + 2).join('') : '';
  const finalValue = problem.checkpoints[total - 1].value;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        {/* 途中式のカードは画面の上にとめておく（テンキーまでスクロールしても、書いた式が見える） */}
        <div className="sticky top-0 z-10 bg-surface border border-line rounded-[28px] shadow-xl p-5 md:p-8 text-center">
          <span className="inline-block mb-3 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-black">
            ステップ {Math.min(rows.length, total)} / {total}
          </span>
          <div className="text-left max-w-md mx-auto">
            <WorkSheet rows={rows} active={stage === 'answer'} picked={target} onPick={onPick} />
          </div>
          {choosing && (
            <p className="text-muted font-bold mt-4">
              {rows.length === 1 ? 'さいしょに' : 'つぎに'} 計算する ところの <span className="text-brand font-black whitespace-nowrap">しるし（＋－×÷）</span>を タップしよう
            </p>
          )}
          {stage === 'answer' && target !== null && (
            <p className="text-muted font-bold mt-4">
              <span className="text-brand font-black text-xl tabular-nums">{targetPart}</span> の 答えは？
            </p>
          )}
          {stage === 'done' && <p className="text-muted font-bold mt-4">こたえは <span className="text-brand font-black">{finalValue}</span> だね！</p>}
          {canBack && (
            <button
              type="button"
              onClick={back}
              className="mt-3 px-4 py-1.5 rounded-full border border-line text-muted text-sm font-black hover:border-faint active:scale-95 transition"
            >
              {picked !== null ? '← えらびなおす' : '← ひとつ もどる'}
            </button>
          )}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['+', '-', '×', '÷']} decimal={false} />

        {stage === 'answer' && target !== null && <AnswerEntry onSubmit={submit} allowDecimal={false} accentText="text-blue-600" />}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span className="tabular-nums">{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-blue-500 hover:bg-blue-600"
          />
        )}
      </div>
    </div>
  );
};
