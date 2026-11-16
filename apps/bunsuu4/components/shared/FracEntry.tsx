// このファイルは単元アプリ syo4-bunnsu の src/components/shared/FracEntry.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数・分数・帯分数の答えを入れる欄（表示＋テンキー）。
 *   num   … 数（小数も入れられる）
 *   frac  … 分子 → 分母 の順（箱をタップして、どちらからでも入れられる）
 *   mixed … 整数 → 分子 → 分母
 *   any   … 「分数」「帯分数」「整数」のボタンで形を選んで入れる（答えが帯分数でも仮分数でもよい問題）。
 *           only='mixed' のときは「帯分数」「整数」だけ（帯分数か整数に なおす問題）
 * 「つぎへ」で次の箱に進み、最後の箱で「こたえる」になる。
 */
import React, { useState } from 'react';
import { Keypad } from './Keypad';
import type { Inp } from '../../lib/problems';

type Kind = 'num' | 'frac' | 'mixed' | 'any';
type Form = 'num' | 'frac' | 'mixed' | 'whole';
type Field = 'v' | 'w' | 'n' | 'd';

const FIELDS: Record<Form, Field[]> = { num: ['v'], whole: ['v'], frac: ['n', 'd'], mixed: ['w', 'n', 'd'] };
const NAME: Record<Field, string> = { v: '答え', w: '整数', n: '分子（上）', d: '分母（下）' };
const FORM_LABEL: Record<'frac' | 'mixed' | 'whole', string> = { frac: '分数', mixed: '帯分数', whole: '整数' };

interface Props {
  kind: Kind;
  onSubmit: (inp: Inp) => void;
  accentText?: string;
  /** any: はじめの形 */
  start?: 'frac' | 'mixed';
  /** any: 帯分数か整数だけ */
  only?: 'mixed';
}

const EMPTY: Record<Field, string> = { v: '', w: '', n: '', d: '' };

export const FracEntry: React.FC<Props> = ({ kind, onSubmit, accentText = 'text-content', start, only }) => {
  const [form, setForm] = useState<Form>(kind === 'any' ? (only === 'mixed' ? 'mixed' : start ?? 'frac') : kind);
  const fields = FIELDS[form];
  const [vals, setVals] = useState<Record<Field, string>>(EMPTY);
  const [active, setActive] = useState<Field>(fields[0]!);

  const changeForm = (f: Form) => {
    setForm(f);
    setVals(EMPTY);
    setActive(FIELDS[f][0]!);
  };
  const setVal = (f: Field, s: string) => setVals((p) => ({ ...p, [f]: s }));

  const handleInput = (c: string) => {
    const cur = vals[active];
    if (c === '.') {
      if (form !== 'num' || cur.includes('.') || cur === '') return;
    }
    if (cur.length >= (active === 'v' ? 7 : active === 'w' ? 3 : 4)) return;
    setVal(active, form !== 'num' && cur === '0' ? c : cur + c);
  };
  const handleBack = () => {
    if (vals[active] !== '') return setVal(active, vals[active].slice(0, -1));
    const i = fields.indexOf(active);
    if (i > 0) setActive(fields[i - 1]!);
  };

  const nextEmpty = fields.find((f) => f !== active && vals[f] === '');
  const allFilled = fields.every((f) => vals[f] !== '');
  const canSubmit = vals[active] !== '';
  const submit = () => {
    if (!canSubmit) return;
    if (!allFilled) {
      if (nextEmpty) setActive(nextEmpty);
      return;
    }
    const inp: Inp = {};
    if (form === 'num' || form === 'whole') inp.v = Number(vals.v);
    else {
      inp.n = Number(vals.n);
      inp.d = Number(vals.d);
      if (form === 'mixed') inp.w = Number(vals.w);
    }
    onSubmit(inp);
    setVals(EMPTY);
    setActive(fields[0]!);
  };

  const Box: React.FC<{ f: Field; wide?: boolean }> = ({ f, wide }) => (
    <button
      type="button"
      onClick={() => setActive(f)}
      aria-label={NAME[f]}
      data-testid={`box-${f}`}
      className={`h-14 ${wide ? 'min-w-[12rem]' : 'min-w-[4.5rem]'} px-3 rounded-xl border-2 text-3xl font-black tabular-nums transition-all ${
        active === f ? 'border-brand bg-surface-2 ring-2 ring-brand/30' : 'border-line bg-surface-2'
      } ${accentText}`}
    >
      {vals[f] || <span className="text-faint text-2xl">{form === 'num' || form === 'whole' ? '？' : '□'}</span>}
    </button>
  );

  const forms: ('frac' | 'mixed' | 'whole')[] = only === 'mixed' ? ['mixed', 'whole'] : ['frac', 'mixed', 'whole'];

  return (
    <div className="flex flex-col gap-4">
      {kind === 'any' && (
        <div className="flex items-center justify-center gap-2" role="group" aria-label="答えの形">
          <span className="text-xs font-bold text-faint mr-1">答えの 形:</span>
          {forms.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`form-${f}`}
              onClick={() => changeForm(f)}
              className={`px-4 py-2 rounded-xl border-2 font-black text-base transition-all ${
                form === f ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-muted hover:border-faint'
              }`}
            >
              {FORM_LABEL[f]}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-surface-3/40 border-2 border-line py-4 flex items-center justify-center gap-3">
        {(form === 'num' || form === 'whole') && <Box f="v" wide={form === 'num'} />}
        {(form === 'frac' || form === 'mixed') && (
          <>
            {form === 'mixed' && <Box f="w" />}
            <span className="inline-flex flex-col items-center gap-1">
              <Box f="n" />
              <span className="block w-24 border-t-4 border-content/80 rounded" />
              <Box f="d" />
            </span>
          </>
        )}
      </div>
      <p className="text-center text-xs font-bold text-faint -mt-2">
        いま 入れているのは「{NAME[active]}」。{fields.length > 1 ? '箱を タップすると 入れる場所を かえられるよ' : ''}
      </p>
      <Keypad
        onInput={handleInput}
        onBackspace={handleBack}
        onSubmit={submit}
        submitLabel={allFilled ? 'こたえる' : 'つぎの 箱へ ▶'}
        submitEnabled={canSubmit}
        allowDecimal={form === 'num'}
      />
    </div>
  );
};
