// このファイルは単元アプリ syo4-kawarikatasirabe の src/components/shared/AnswerViews.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 解答UIの実装群と、その1本化ディスパッチャ（AnswerArea）。
 *
 * 解答のしかたは8種類あるが、モジュールごとに Round を書くのはやめて
 * ここ1か所に集約する。図の表示・3段ヒント・誤答診断・結果パネルを
 * 1か所で保証できるので、モジュールを足しても品質が落ちない
 * （master-DB: patterns/answer-ui-dispatcher-with-pool-based-test.md）。
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, Circle } from 'lucide-react';
import { AnswerSpec } from '../../types';
import { Keypad } from './Keypad';
import { GraphCanvas } from './FigureView';

export interface AnswerProps {
  spec: AnswerSpec;
  /** まちがえたとき（ヒントを1段すすめる） */
  onMiss: (note?: string) => void;
  /** 正解にたどりついたとき */
  onComplete: () => void;
  /** テスト・ボス戦では1回の解答で確定する（足場をかけずに測る場面） */
  testMode?: boolean;
  /** 誤答診断（数値入力のときだけ使う） */
  diagnose?: (given: number) => string | null;
  /** 解答ずみ（操作不可） */
  locked: boolean;
}

const btnBase =
  'rounded-2xl font-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100';

/* ============================================================
 * えらぶ（1つ）
 * ============================================================ */

const ChoiceView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'choice' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [wrong, setWrong] = useState<number[]>([]);
  const tap = (i: number) => {
    if (locked) return;
    if (i === spec.correct) { onComplete(); return; }
    setWrong((w) => [...w, i]);
    onMiss();
    if (testMode) onComplete();
  };
  return (
    <div className="grid grid-cols-1 gap-3">
      {spec.choices.map((c, i) => (
        <button
          key={i}
          onClick={() => tap(i)}
          disabled={locked || wrong.includes(i)}
          className={`${btnBase} px-5 py-4 text-left text-lg border-2 ${
            wrong.includes(i)
              ? 'bg-surface-3 border-line text-faint line-through'
              : 'bg-surface border-line text-content hover:border-brand hover:bg-surface-2'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
};

/* ============================================================
 * えらぶ（いくつでも）
 * ============================================================ */

const MultiView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'multi' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (i: number) => {
    if (locked) return;
    setSel((s) => (s.includes(i) ? s.filter((v) => v !== i) : [...s, i]));
  };
  const submit = () => {
    const ok = sel.length === spec.correct.length && spec.correct.every((i) => sel.includes(i));
    if (ok) { onComplete(); return; }
    onMiss();
    if (testMode) onComplete(); else setSel([]);
  };
  return (
    <div className="flex flex-col gap-3">
      {spec.choices.map((c, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          disabled={locked}
          className={`${btnBase} px-5 py-4 text-left text-lg border-2 flex items-center gap-3 ${
            sel.includes(i) ? 'bg-blue-50 border-blue-400 text-content' : 'bg-surface border-line text-content'
          }`}
        >
          <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${sel.includes(i) ? 'bg-blue-500 border-blue-500 text-white' : 'border-line'}`}>
            {sel.includes(i) && <Check size={16} />}
          </span>
          {c}
        </button>
      ))}
      <button onClick={submit} disabled={locked || sel.length === 0} className={`${btnBase} py-4 bg-blue-600 text-white text-xl`}>
        こたえる
      </button>
    </div>
  );
};

/* ============================================================
 * 数を 入れる
 * ============================================================ */

const NumberView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'number' }> }> = ({
  spec, onMiss, onComplete, testMode, diagnose, locked,
}) => {
  const [input, setInput] = useState('');
  const submit = () => {
    if (input === '' || locked) return;
    const v = Number(input);
    if (v === spec.correct) { onComplete(); return; }
    onMiss(diagnose?.(v) ?? undefined);
    setInput('');
    if (testMode) onComplete();
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="h-20 rounded-2xl bg-surface-2 border-2 border-line flex items-center justify-center gap-2">
        <span className="text-5xl font-black tabular-nums text-content">
          {input || <span className="text-faint">？</span>}
        </span>
        {spec.unit && <span className="text-2xl font-black text-muted">{spec.unit}</span>}
      </div>
      <Keypad
        onInput={(d) => { if (input.length < 6) setInput(input + d); }}
        onBackspace={() => setInput(input.slice(0, -1))}
        onSubmit={submit}
        submitLabel="こたえる"
        submitEnabled={input !== '' && !locked}
        allowDecimal={!!spec.decimal}
      />
    </div>
  );
};

/* ============================================================
 * 表を うめる
 * ============================================================ */

const TableFillView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'tableFill' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const blanks = spec.given.map((g, i) => (g === null ? i : -1)).filter((i) => i >= 0);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [cur, setCur] = useState<number>(blanks[0] ?? 0);

  const setDigit = (d: string) => {
    if (locked) return;
    setVals((v) => ({ ...v, [cur]: ((v[cur] ?? '') + d).slice(0, 5) }));
  };
  const back = () => setVals((v) => ({ ...v, [cur]: (v[cur] ?? '').slice(0, -1) }));

  const allFilled = blanks.every((i) => (vals[i] ?? '') !== '');
  const submit = () => {
    if (!allFilled || locked) return;
    const ok = blanks.every((i) => Number(vals[i]) === spec.correct[i]);
    if (ok) { onComplete(); return; }
    onMiss();
    if (testMode) { onComplete(); return; }
    // まちがった ところだけ 消して、もう一度 考えられるようにする
    const next = { ...vals };
    blanks.forEach((i) => { if (Number(vals[i]) !== spec.correct[i]) next[i] = ''; });
    setVals(next);
    const firstWrong = blanks.find((i) => next[i] === '');
    if (firstWrong !== undefined) setCur(firstWrong);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full overflow-x-auto">
        <table className="mx-auto border-collapse text-center min-w-max">
          <tbody>
            <tr>
              <th className="border-2 border-line bg-surface-3 px-2 py-2 text-xs font-black text-content whitespace-nowrap">{spec.xHeader}</th>
              {spec.xs.map((x, i) => (
                <td key={i} className="border-2 border-line px-3 py-2 text-lg font-black text-content tabular-nums bg-surface">{x}</td>
              ))}
            </tr>
            <tr>
              <th className="border-2 border-line bg-surface-3 px-2 py-2 text-xs font-black text-content whitespace-nowrap">{spec.yHeader}</th>
              {spec.xs.map((_, i) => {
                const given = spec.given[i];
                if (given !== null) {
                  return <td key={i} className="border-2 border-line px-3 py-2 text-lg font-black text-content tabular-nums bg-surface">{given}</td>;
                }
                const active = cur === i;
                return (
                  <td key={i} className="border-2 border-line p-0">
                    <button
                      onClick={() => !locked && setCur(i)}
                      className={`w-full h-12 px-3 text-lg font-black tabular-nums transition-colors ${
                        active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400 ring-inset' : 'bg-amber-50 text-content'
                      }`}
                    >
                      {vals[i] || (active ? '_' : '?')}
                    </button>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-center text-xs font-bold text-faint">あいている ところを タップして、数を 入れよう</p>
      <Keypad onInput={setDigit} onBackspace={back} onSubmit={submit} submitLabel="こたえる" submitEnabled={allFilled && !locked} />
    </div>
  );
};

/* ============================================================
 * 折れ線グラフに 点を うつ
 * ============================================================ */

const GraphPlotView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'graphPlot' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [pts, setPts] = useState<{ x: number; y: number }[]>(spec.given ?? []);
  const tap = (x: number, y: number) => {
    if (locked) return;
    setPts((p) => {
      const at = p.findIndex((q) => q.x === x);
      if (at >= 0 && p[at].y === y) return p.filter((_, i) => i !== at); // 同じ点を もう一度 → 取り消し
      if (at >= 0) return p.map((q, i) => (i === at ? { x, y } : q));    // 同じ横の位置は 打ち直し
      return [...p, { x, y }];
    });
  };
  const same = () =>
    pts.length === spec.correct.length &&
    spec.correct.every((c) => pts.some((p) => p.x === c.x && p.y === c.y));
  const submit = () => {
    if (locked) return;
    if (same()) { onComplete(); return; }
    onMiss();
    if (testMode) { onComplete(); return; }
    setPts(spec.correct.filter((c) => pts.some((p) => p.x === c.x && p.y === c.y)));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface border border-line rounded-3xl p-2">
        <GraphCanvas
          xLabel={spec.xLabel} yLabel={spec.yLabel}
          xMax={spec.xMax} yMax={spec.yMax} xStep={spec.xStep} yStep={spec.yStep}
          points={[]} userPoints={pts} onCellTap={locked ? undefined : tap}
        />
      </div>
      <p className="text-center text-xs font-bold text-faint">
        マスの こうさ点を タップすると 点が うてます（もう一度 タップで 取り消し）
      </p>
      <button onClick={submit} disabled={locked || pts.length === 0} className={`${btnBase} py-4 bg-emerald-600 text-white text-xl`}>
        点を うち終わった
      </button>
    </div>
  );
};

/* ============================================================
 * カードで 式を つくる
 * ============================================================ */

const ExprBuildView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'exprBuild' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [slots, setSlots] = useState<number[]>([]); // cards のインデックス列
  const used = new Set(slots);
  const put = (i: number) => {
    if (locked || used.has(i) || slots.length >= spec.correct.length) return;
    setSlots((s) => [...s, i]);
  };
  const pop = (pos: number) => { if (!locked) setSlots((s) => s.filter((_, i) => i !== pos)); };
  const submit = () => {
    if (locked || slots.length !== spec.correct.length) return;
    const ok = slots.every((ci, i) => spec.cards[ci] === spec.correct[i]);
    if (ok) { onComplete(); return; }
    onMiss();
    if (testMode) onComplete(); else setSlots([]);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-[72px] rounded-2xl bg-surface-2 border-2 border-dashed border-line flex flex-wrap items-center justify-center gap-2 p-3">
        {slots.length === 0 && <span className="text-faint font-bold text-sm">下の カードを 左から じゅんに タップ</span>}
        {slots.map((ci, pos) => (
          <button key={pos} onClick={() => pop(pos)} disabled={locked}
            className="px-3 py-2 rounded-xl bg-blue-600 text-white font-black text-lg shadow active:scale-95">
            {spec.cards[ci]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {spec.cards.map((c, i) => (
          <button key={i} onClick={() => put(i)} disabled={locked || used.has(i)}
            className={`px-4 py-3 rounded-xl font-black text-lg border-2 transition-all active:scale-95 ${
              used.has(i) ? 'bg-surface-3 border-line text-faint' : 'bg-surface border-line text-content hover:border-brand'
            }`}>
            {c}
          </button>
        ))}
      </div>
      <button onClick={submit} disabled={locked || slots.length !== spec.correct.length}
        className={`${btnBase} py-4 bg-violet-600 text-white text-xl`}>
        こたえる
      </button>
    </div>
  );
};

/* ============================================================
 * ○ × を つける
 * ============================================================ */

const TruthView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'truth' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [ans, setAns] = useState<Record<number, boolean>>({});
  const [shown, setShown] = useState<number[]>([]);
  const all = spec.rows.every((_, i) => ans[i] !== undefined);
  const submit = () => {
    if (!all || locked) return;
    const wrongIdx = spec.rows.map((r, i) => (ans[i] === r.correct ? -1 : i)).filter((i) => i >= 0);
    if (wrongIdx.length === 0) { onComplete(); return; }
    onMiss();
    if (testMode) { onComplete(); return; }
    setShown(wrongIdx);
    const next = { ...ans };
    wrongIdx.forEach((i) => delete next[i]);
    setAns(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {spec.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 bg-surface border border-line rounded-2xl p-3">
          <span className="flex-1 font-bold text-content text-sm sm:text-base">{r.label}</span>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              onClick={() => !locked && setAns((a) => ({ ...a, [i]: v }))}
              className={`px-3 py-2 rounded-xl font-black text-sm border-2 transition-all active:scale-95 flex items-center gap-1 ${
                ans[i] === v ? 'bg-blue-600 border-blue-600 text-white' : 'bg-surface border-line text-muted'
              }`}
            >
              {v ? <Circle size={14} /> : <X size={14} />}
              {v ? spec.yesLabel : spec.noLabel}
            </button>
          ))}
        </div>
      ))}
      {shown.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
          {shown.map((i) => (
            <p key={i} className="text-sm font-bold text-amber-800">・{spec.rows[i].why}</p>
          ))}
        </div>
      )}
      <button onClick={submit} disabled={!all || locked} className={`${btnBase} py-4 bg-cyan-600 text-white text-xl`}>
        こたえる
      </button>
    </div>
  );
};

/* ============================================================
 * まちがい直し（見つける → なおす → りゆう）
 * ============================================================ */

const ErrorFixView: React.FC<AnswerProps & { spec: Extract<AnswerSpec, { kind: 'errorFix' }> }> = ({
  spec, onMiss, onComplete, testMode, locked,
}) => {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [wrongPicks, setWrongPicks] = useState<number[]>([]);

  const step = (ok: boolean, next: 1 | 2 | 'done') => {
    if (ok) {
      if (next === 'done') onComplete();
      else setStage(next);
      return;
    }
    onMiss();
    if (testMode) onComplete();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-rose-50 border-2 border-rose-200 p-5 text-center">
        <p className="text-xs font-black text-rose-500 mb-1">だれかの 考え</p>
        <p className="text-xl sm:text-2xl font-black text-content">{spec.wrongExpr}</p>
      </div>

      {stage === 0 && (
        <>
          <p className="text-center font-black text-content">{spec.findPrompt}</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => step(false, 1)} disabled={locked}
              className={`${btnBase} py-4 bg-surface border-2 border-line text-content text-lg`}>
              正しい
            </button>
            <button onClick={() => step(true, 1)} disabled={locked}
              className={`${btnBase} py-4 bg-rose-600 text-white text-lg`}>
              まちがっている
            </button>
          </div>
        </>
      )}

      {stage === 1 && (
        <>
          <p className="text-center font-black text-content">正しい ものは どれ？</p>
          <div className="flex flex-col gap-3">
            {spec.fixChoices.map((c, i) => (
              <button key={i} onClick={() => { if (i !== spec.fixCorrect) setWrongPicks((w) => [...w, i]); step(i === spec.fixCorrect, 2); }}
                disabled={locked || wrongPicks.includes(i)}
                className={`${btnBase} px-5 py-4 text-lg border-2 ${
                  wrongPicks.includes(i) ? 'bg-surface-3 border-line text-faint line-through' : 'bg-surface border-line text-content hover:border-brand'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      {stage === 2 && (
        <>
          <p className="text-center font-black text-content">どうして まちがい なのかな？</p>
          <div className="flex flex-col gap-3">
            {spec.reasonChoices.map((c, i) => (
              <button key={i} onClick={() => step(i === spec.reasonCorrect, 'done')} disabled={locked}
                className={`${btnBase} px-5 py-4 text-left text-base border-2 bg-surface border-line text-content hover:border-brand`}>
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-center gap-2">
        {[0, 1, 2].map((s) => (
          <span key={s} className={`h-2 rounded-full transition-all ${s <= stage ? 'w-8 bg-rose-500' : 'w-4 bg-surface-3'}`} />
        ))}
      </div>
    </div>
  );
};

/* ============================================================
 * ディスパッチャ
 * ============================================================ */

export const AnswerArea: React.FC<AnswerProps> = (props) => {
  const { spec } = props;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {spec.kind === 'choice' && <ChoiceView {...props} spec={spec} />}
      {spec.kind === 'multi' && <MultiView {...props} spec={spec} />}
      {spec.kind === 'number' && <NumberView {...props} spec={spec} />}
      {spec.kind === 'tableFill' && <TableFillView {...props} spec={spec} />}
      {spec.kind === 'graphPlot' && <GraphPlotView {...props} spec={spec} />}
      {spec.kind === 'exprBuild' && <ExprBuildView {...props} spec={spec} />}
      {spec.kind === 'truth' && <TruthView {...props} spec={spec} />}
      {spec.kind === 'errorFix' && <ErrorFixView {...props} spec={spec} />}
    </motion.div>
  );
};
