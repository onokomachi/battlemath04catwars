// このファイルは単元アプリ syo4-syousu-v2 の src/components/modules/MulDivRounds.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「小数の かけ算・わり算」の1問を出す画面。練習・本番テスト・実力の階段で共通に使う。
 * 筆算は MulSimulator / DivSimulator（DecimalMulDivModule.tsx）、
 * そのほか（暗算・計算のしかた・あまりの文章題・小数倍）はこのファイル。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel } from '../ui/primitives';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { buildMul } from '../../lib/decimalMulDiv';
import type { MulDivQ, MentalProblem, MethodProblem, RemWordProblem, TimesProblem } from '../../lib/mulDivQuestions';
import { MulSimulator, DivSimulator } from './DecimalMulDivModule';
import { Round as WordRound } from './WordProblemModule';

interface Common {
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  onMiss?: () => void;
  nextLabel?: string;
}

/** 問題の形に合わせて、解く画面をえらぶ */
export const MulDivRound: React.FC<Common & { q: MulDivQ }> = ({ q, ...common }) => {
  switch (q.ui) {
    case 'mul': return <MulSimulator {...common} problem={q.p} level={q.level} />;
    case 'mulPoint': return <MulSimulator {...common} problem={q.p} level={q.level} pointOnly />;
    case 'div': return <DivSimulator {...common} problem={q.p} level={q.level} />;
    case 'divPoint': return <DivSimulator {...common} problem={q.p} level={q.level} pointOnly />;
    case 'mental': return <MentalRound {...common} p={q.p} level={q.level} />;
    case 'method': return <MethodRound {...common} p={q.p} />;
    case 'word': return <WordRound {...common} problem={q.p} skillId={q.level} moduleId="decimal-muldiv" />;
    case 'remWord': return <RemWordRound {...common} p={q.p} />;
    case 'times': return <TimesRound {...common} p={q.p} />;
  }
};

/** 1問ぶんの記録と、まちがい・できたの共通処理 */
function useRound(level: string, label: string, onResult?: (perfect: boolean) => void, onMiss?: () => void) {
  const recordResult = useProgressStore((s) => s.recordResult);
  const rec = useRoundRecorder({ moduleId: 'decimal-muldiv', skillId: level, record: recordResult, abandonLabel: () => label });
  const [mistakes, setMistakes] = useState(0);
  const [done, setDone] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [wrongTone, setWrongTone] = useState(false);
  return {
    mistakes, done, hint, wrongTone,
    say: (h: string | null) => { setHint(h); setWrongTone(false); },
    miss: (h: string) => {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.(); rec.mistake();
      setHint(h); setWrongTone(true);
    },
    ok: () => playCorrect(),
    finish: () => {
      playClear();
      confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
      rec.finish(label);
      onResult?.(mistakes === 0);
      setDone(true);
    },
  };
}

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="h-full overflow-y-auto p-4 md:p-8">
    <div className="max-w-2xl mx-auto space-y-5">{children}</div>
  </div>
);

const Story: React.FC<{ emoji?: string; children: React.ReactNode }> = ({ emoji, children }) => (
  <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
    <div className="flex items-start gap-3">
      {emoji && <span className="text-5xl shrink-0">{emoji}</span>}
      <div className="text-xl md:text-2xl font-black text-content leading-relaxed flex-1">{children}</div>
    </div>
  </div>
);

const ChoiceList: React.FC<{ choices: string[]; wrong: number | null; onPick: (i: number) => void }> = ({ choices, wrong, onPick }) => (
  <div>
    <p className="text-center text-muted font-black mb-3">どの「しき」に なるかな？</p>
    <div className="grid grid-cols-1 gap-3">
      {choices.map((c, i) => (
        <button key={i} onClick={() => onPick(i)}
          className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
            wrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-brand'
          }`}>
          {c}
        </button>
      ))}
    </div>
  </div>
);

const Shiki: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center justify-center gap-2 mb-3">
    <Check className="text-emerald-500" size={22} />
    <p className="text-center text-content font-black text-xl tabular-nums">しき：{text}</p>
  </div>
);

/* ---------------- 暗算（0.8 × 3・2.6 ÷ 2） ---------------- */

export const MentalRound: React.FC<Common & { p: MentalProblem; level: string }> = ({ p, level, onNext, onResult, onMiss, nextLabel }) => {
  const expr = `${p.a} ${p.op} ${p.b}`;
  const r = useRound(level, expr, onResult, onMiss);
  const submit = (v: string) => {
    if (Number(v) === Number(p.answer)) r.finish();
    else {
      const tenth = Math.round(p.a * 10);
      r.miss(p.op === '×'
        ? `${p.a} は 0.1 が ${tenth}こ。${tenth} × ${p.b} ＝ ${tenth * p.b} だから、0.1 が ${tenth * p.b}こ。`
        : `${p.a} は 0.1 が ${tenth}こ。${tenth} ÷ ${p.b} ＝ ${tenth / p.b} だから、0.1 が ${tenth / p.b}こ。`);
    }
  };
  return (
    <Frame>
      <Story>
        <p className="text-center">あんざんで 計算しよう</p>
        <p className="text-center text-5xl tabular-nums mt-4">{expr} ＝ ？</p>
      </Story>
      {r.hint && <HintBox tone={r.wrongTone ? 'wrong' : 'hint'}>{r.hint}</HintBox>}
      {r.done
        ? <ResultPanel perfect={r.mistakes === 0} detail={<span className="tabular-nums">{expr} ＝ {p.answer}</span>} onNext={onNext} nextLabel={nextLabel} accentClass="bg-violet-500 hover:bg-violet-600" />
        : <AnswerEntry onSubmit={submit} allowDecimal accentText="text-violet-600" />}
    </Frame>
  );
};

/* ---------------- 計算のしかた（2.7 × 5 → 27 × 5 の 1/10） ---------------- */

export const MethodRound: React.FC<Common & { p: MethodProblem }> = ({ p, onNext, onResult, onMiss, nextLabel }) => {
  const model = buildMul(p.a, p.b);
  const a10 = Math.round(p.a * 10);
  const int = a10 * p.b;
  const product = model.productStr;
  const label = `${p.a} × ${p.b} の しくみ`;
  const r = useRound('mul-method', label, onResult, onMiss);
  // うめる □ の順番。ratio = 1/□ の分母、product = □（答え）
  const order: ('ratio' | 'product')[] = p.ask === 'both' ? ['ratio', 'product'] : [p.ask];
  const [k, setK] = useState(0);
  const asking = r.done ? null : order[k];
  const filled = (box: 'ratio' | 'product') => !order.includes(box) || order.indexOf(box) < k || r.done;

  const submit = (v: string) => {
    if (!asking) return;
    const correct = asking === 'ratio' ? '10' : product;
    if (Number(v) === Number(correct)) {
      if (k >= order.length - 1) r.finish();
      else { setK(k + 1); r.say(null); r.ok(); }
    } else {
      r.miss(asking === 'ratio'
        ? `${p.a} を 10倍して 計算したから、答えは 10で わる（1/10に する）よ。`
        : `${int} を 1/10 に すると、小数点が 左へ 1けた うつるよ。`);
    }
  };

  const Box: React.FC<{ box: 'ratio' | 'product'; children: React.ReactNode }> = ({ box, children }) => (
    <span className={`inline-flex items-center justify-center min-w-[3.5rem] px-2 py-1 rounded-xl border-2 tabular-nums ${
      filled(box) ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : asking === box ? 'border-violet-400 bg-violet-50 text-violet-300 animate-pulse' : 'border-line text-faint'
    }`}>{filled(box) ? children : '？'}</span>
  );

  return (
    <Frame>
      <Story>
        <p className="text-lg md:text-xl">{p.a} × {p.b} の 計算の しかたに ついて、□に あてはまる 数を 書きましょう。</p>
      </Story>
      <div className="bg-surface border border-line rounded-[28px] shadow p-6 md:p-8">
        <div className="grid grid-cols-[auto_auto_auto] items-center justify-center gap-x-4 gap-y-3 text-3xl font-black tabular-nums text-content">
          <span>{p.a} × {p.b} ＝</span>
          <Box box="product">{product}</Box>
          <span />
          <span className="text-base text-blue-600 font-black text-center">↓ 10倍</span>
          <span className="text-base text-rose-500 font-black text-center">↑ 10倍の 答え を</span>
          <span className="text-2xl flex items-center gap-1">
            <span className="flex flex-col items-center leading-none">
              <span className="text-xl">1</span>
              <span className="w-full border-t-2 border-content my-0.5" />
              <Box box="ratio">10</Box>
            </span>
            <span className="text-base">に する</span>
          </span>
          <span>{a10} × {p.b} ＝</span>
          <span>{int}</span>
          <span />
        </div>
      </div>
      {r.hint && <HintBox tone={r.wrongTone ? 'wrong' : 'hint'}>{r.hint}</HintBox>}
      {r.done
        ? <ResultPanel perfect={r.mistakes === 0} detail={<span className="tabular-nums">{p.a} × {p.b} ＝ {product}（{a10} × {p.b} ＝ {int} の 1/10）</span>} onNext={onNext} nextLabel={nextLabel} accentClass="bg-violet-500 hover:bg-violet-600" />
        : (
          <>
            <p className="text-center text-muted font-black">{asking === 'ratio' ? '1/□ の □ に 入る 数は？' : `${p.a} × ${p.b} の 答えは？`}</p>
            <AnswerEntry key={k} onSubmit={submit} allowDecimal accentText="text-violet-600" />
          </>
        )}
    </Frame>
  );
};

/* ---------------- あまりのある文章題（13.4dL を 3dLずつ） ---------------- */

export const RemWordRound: React.FC<Common & { p: RemWordProblem }> = ({ p, onNext, onResult, onMiss, nextLabel }) => {
  const r = useRound('div-word-remainder', p.text.slice(0, 18) + '…', onResult, onMiss);
  const [stage, setStage] = useState<'shiki' | 'count' | 'rest'>('shiki');
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const pickShiki = (i: number) => {
    if (i === p.correctIndex) { setWrongPick(null); setStage('count'); r.say(`ぜんぶの 量 ÷ 1つ分 で、いくつ分 できるかを 求めるよ。${p.counter}数は 整数だから、商は 一の位まで。`); r.ok(); }
    else { setWrongPick(i); r.miss('「○ずつ 分けると いくつ分」は、ぜんぶ ÷ 1つ分 の わり算だよ。'); }
  };
  const submitCount = (v: string) => {
    if (Number(v) === p.count) { setStage('rest'); r.say('つぎは あまり。あまりの 小数点は、わられる数の 小数点に そろえるよ。'); r.ok(); }
    else r.miss(`${p.total} の 中に ${p.each} は いくつ 入るかな？ 商は 一の位まで（整数）で 止めよう。`);
  };
  const submitRest = (v: string) => {
    if (Number(v) === Number(p.rest)) r.finish();
    else r.miss(`${p.total} − ${p.each} × ${p.count} が あまりだよ。あまりは ${p.each} より 小さく なるよ。`);
  };
  return (
    <Frame>
      <Story emoji={p.emoji}><p>{p.text}</p></Story>
      {r.hint && <HintBox tone={r.wrongTone ? 'wrong' : 'hint'}>{r.hint}</HintBox>}
      <ScratchPadToggle ops={['÷']} />
      {r.done ? (
        <ResultPanel perfect={r.mistakes === 0}
          detail={<span className="tabular-nums">{p.total} ÷ {p.each} ＝ {p.count} あまり {p.rest} → {p.count}{p.counter} できて {p.rest}{p.unit} あまる</span>}
          onNext={onNext} nextLabel={nextLabel} accentClass="bg-teal-500 hover:bg-teal-600" />
      ) : stage === 'shiki' ? (
        <ChoiceList choices={p.choices} wrong={wrongPick} onPick={pickShiki} />
      ) : (
        <div>
          <Shiki text={`${p.total} ÷ ${p.each}`} />
          <div className="flex items-center justify-center gap-2 text-xl font-black text-content mb-3 flex-wrap">
            <span className={`px-3 py-1 rounded-xl border-2 ${stage === 'count' ? 'border-teal-400 bg-teal-50' : 'border-emerald-300 text-emerald-700'}`}>{stage === 'count' ? '？' : p.count}{p.counter}</span>
            <span>できて、</span>
            <span className={`px-3 py-1 rounded-xl border-2 ${stage === 'rest' ? 'border-teal-400 bg-teal-50' : 'border-line text-faint'}`}>？{p.unit}</span>
            <span>あまる。</span>
          </div>
          <p className="text-center text-muted font-bold mb-3">{stage === 'count' ? `何${p.counter} できる？（整数）` : `何${p.unit} あまる？`}</p>
          <AnswerEntry key={stage} onSubmit={stage === 'count' ? submitCount : submitRest} allowDecimal={stage === 'rest'} accentText="text-teal-600" />
        </div>
      )}
    </Frame>
  );
};

/* ---------------- 小数倍（テープの表と図・ドレッシング） ---------------- */

const TapeChart: React.FC<{ p: TimesProblem }> = ({ p }) => {
  const max = Math.max(...p.items.map((i) => i.value));
  const scaleMax = Math.ceil((max / p.base) + 0.2); // 何倍まで目もりを書くか
  const W = 300; // 1倍あたりの幅の基準
  const unitW = W / scaleMax;
  return (
    <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
      <table className="text-xl font-black tabular-nums border-2 border-line rounded-xl overflow-hidden">
        <caption className="text-sm text-muted font-bold mb-1">テープの 長さ（{p.unit}）</caption>
        <tbody>
          {p.items.map((it) => (
            <tr key={it.name} className="border-b border-line last:border-0">
              <th className="px-4 py-2" style={{ background: `${it.color}55` }}>{it.name}</th>
              <td className="px-5 py-2 text-right">{it.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W + 120} ${p.items.length * 34 + 40}`} className="w-full max-w-md" role="img" aria-label="テープ図">
          {[...p.items].sort((a, b) => (a.name === '赤' ? 1 : b.name === '赤' ? -1 : 0)).map((it, i) => (
            <g key={it.name}>
              <text x={0} y={i * 34 + 22} fontSize="14" fontWeight="900" fill="currentColor">{it.name}</text>
              <rect x={28} y={i * 34 + 6} width={(it.value / p.base) * unitW} height={22} fill={it.color} stroke="#334155" />
              <text x={34 + (it.value / p.base) * unitW} y={i * 34 + 22} fontSize="13" fontWeight="800" fill="currentColor">{it.value}{p.unit}</text>
            </g>
          ))}
          <line x1={28} x2={28 + scaleMax * unitW} y1={p.items.length * 34 + 10} y2={p.items.length * 34 + 10} stroke="currentColor" strokeWidth={2} />
          {Array.from({ length: scaleMax * 10 + 1 }, (_, t) => (
            <line key={t} x1={28 + (t / 10) * unitW} x2={28 + (t / 10) * unitW} y1={p.items.length * 34 + (t % 10 === 0 ? 2 : 6)} y2={p.items.length * 34 + 10} stroke="currentColor" strokeWidth={t % 10 === 0 ? 2 : 1} />
          ))}
          {Array.from({ length: scaleMax + 1 }, (_, t) => (
            <text key={t} x={28 + t * unitW} y={p.items.length * 34 + 30} fontSize="13" fontWeight="900" textAnchor="middle" fill="currentColor">{t}</text>
          ))}
          <text x={34 + scaleMax * unitW} y={p.items.length * 34 + 30} fontSize="12" fontWeight="900" fill="currentColor">倍</text>
        </svg>
      </div>
    </div>
  );
};

export const TimesRound: React.FC<Common & { p: TimesProblem }> = ({ p, onNext, onResult, onMiss, nextLabel }) => {
  const r = useRound('div-times', `${p.target} は ${p.base} の 何倍`, onResult, onMiss);
  const [stage, setStage] = useState<'shiki' | 'calc'>('shiki');
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const pickShiki = (i: number) => {
    if (i === p.correctIndex) { setWrongPick(null); setStage('calc'); r.say(`何倍かは「くらべる量 ÷ もとにする量」。もとにする量は ${p.baseName}（${p.base}${p.unit}）だよ。`); r.ok(); }
    else { setWrongPick(i); r.miss(`「${p.baseName}の 何倍」の ${p.baseName}が もとにする量。くらべる量 ÷ もとにする量 だよ。`); }
  };
  const submit = (v: string) => {
    if (Number(v) === Number(p.answer)) r.finish();
    else r.miss(`${p.target} ÷ ${p.base} を、わりきれるまで 計算しよう。${p.target < p.base ? '1より 小さい 倍も あるよ。' : ''}`);
  };
  return (
    <Frame>
      <Story emoji={p.style === 'text' ? '🥗' : undefined}>
        {p.style === 'table' && <p className="text-lg mb-4">右の表は、赤・青・黄の テープの 長さを 表したものです。</p>}
        {p.style === 'table' && <TapeChart p={p} />}
        <p className={p.style === 'table' ? 'mt-4' : ''}>{p.text}</p>
      </Story>
      {r.hint && <HintBox tone={r.wrongTone ? 'wrong' : 'hint'}>{r.hint}</HintBox>}
      <ScratchPadToggle ops={['÷']} />
      {r.done ? (
        <ResultPanel perfect={r.mistakes === 0} detail={<span className="tabular-nums">{p.target} ÷ {p.base} ＝ {p.answer}（{p.answer}倍）</span>}
          onNext={onNext} nextLabel={nextLabel} accentClass="bg-teal-500 hover:bg-teal-600" />
      ) : stage === 'shiki' ? (
        <ChoiceList choices={p.choices} wrong={wrongPick} onPick={pickShiki} />
      ) : (
        <div>
          <Shiki text={`${p.target} ÷ ${p.base}`} />
          <p className="text-center text-muted font-bold mb-3">何倍かな？（数だけ 入れよう）</p>
          <AnswerEntry onSubmit={submit} allowDecimal accentText="text-teal-600" />
        </div>
      )}
    </Frame>
  );
};
