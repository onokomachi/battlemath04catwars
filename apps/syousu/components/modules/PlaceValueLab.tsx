// このファイルは単元アプリ syo4-syousu-v2 の src/components/modules/PlaceValueLab.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 位取りラボ（CRA）。
 * - 数をつくる: 色分けディスクをマットに置いて数を構成（3.245 = 1を3こ, 0.1を2こ…）
 * - あつめる: 「0.235 は 0.001 を 何こ」など 単位の個数で数をとらえる
 * - 10倍・1/10: 位が動くことを体感
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, RotateCcw, Plus, Minus, Lightbulb, LayoutGrid, Boxes, ArrowLeftRight, Ruler, Hash } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { AnswerEntry } from '../shared/AnswerEntry';
import { Keypad } from '../shared/Keypad';
import {
  PLACE_UNITS, COMPOSE_LEVELS, ComposeLevel, ComposeProblem, generateCompose, fromMilli,
  COLLECT_LEVELS, CollectLevel, CollectProblem, generateCollect,
  SCALE_LEVELS, ScaleLevel, ScaleProblem, generateScale, scaleOpLabel,
  UNIT_LEVELS, UnitLevel, UnitProblem, generateUnit,
  PLACEID_LEVELS, PlaceIdLevel, PlaceIdProblem, generatePlaceId,
  DecomposeProblem,
} from '../../lib/placeValue';
import { useProgressStore } from '../../store/progressStore';
import { LevelCard } from '../ui/primitives';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }
type Activity = 'compose' | 'collect' | 'scale' | 'unit' | 'placeid';

export const PlaceValueLab: React.FC<Props> = ({ onExit }) => {
  const [phase, setPhase] = useState<'SETUP' | 'SIM'>('SETUP');
  const [activity, setActivity] = useState<Activity>('compose');
  const [composeLevel, setComposeLevel] = useState<ComposeLevel>('compose-2');
  const [collectLevel, setCollectLevel] = useState<CollectLevel>('collect-basic');
  const [scaleLevel, setScaleLevel] = useState<ScaleLevel>('scale-10');
  const [unitLevel, setUnitLevel] = useState<UnitLevel>('unit-length');
  const [placeidLevel, setPlaceidLevel] = useState<PlaceIdLevel>('placeid-2');
  const [compose, setCompose] = useState<ComposeProblem | null>(null);
  const [collect, setCollect] = useState<CollectProblem | null>(null);
  const [scale, setScale] = useState<ScaleProblem | null>(null);
  const [unit, setUnit] = useState<UnitProblem | null>(null);
  const [placeid, setPlaceid] = useState<PlaceIdProblem | null>(null);

  const startCompose = (lv: ComposeLevel) => { setActivity('compose'); setComposeLevel(lv); setCompose(generateCompose(lv)); setPhase('SIM'); };
  const startCollect = (lv: CollectLevel) => { setActivity('collect'); setCollectLevel(lv); setCollect(generateCollect(lv)); setPhase('SIM'); };
  const startScale = (lv: ScaleLevel) => { setActivity('scale'); setScaleLevel(lv); setScale(generateScale(lv)); setPhase('SIM'); };
  const startUnit = (lv: UnitLevel) => { setActivity('unit'); setUnitLevel(lv); setUnit(generateUnit(lv)); setPhase('SIM'); };
  const startPlaceid = (lv: PlaceIdLevel) => { setActivity('placeid'); setPlaceidLevel(lv); setPlaceid(generatePlaceId(lv)); setPhase('SIM'); };

  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);

  if (phase === 'SETUP') {
    const Group: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-rose-600">{icon}<span className="font-black">{title}</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{children}</div>
      </div>
    );
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button onClick={onExit} className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2">
            <ChevronLeft size={24} /> 小数ランドへ
          </button>
          <h1 className="text-3xl font-black text-content text-center mb-6">位取りラボ</h1>
          <Group icon={<LayoutGrid size={20} />} title="数をつくる">
            {COMPOSE_LEVELS.map((lv) => (
              <LevelCard key={lv.id} label={lv.label} desc={lv.description} mastery={getMasteryStreak(lv.id)} todayCount={getTodaySkillCount(lv.id)} onClick={() => startCompose(lv.id)} accentBorder="hover:border-rose-400" />
            ))}
          </Group>
          <Group icon={<Boxes size={20} />} title="あつめた数">
            {COLLECT_LEVELS.map((lv) => (
              <LevelCard key={lv.id} label={lv.label} desc={lv.description} mastery={getMasteryStreak(lv.id)} todayCount={getTodaySkillCount(lv.id)} onClick={() => startCollect(lv.id)} accentBorder="hover:border-rose-400" />
            ))}
          </Group>
          <Group icon={<Hash size={20} />} title="○の位の数字">
            {PLACEID_LEVELS.map((lv) => (
              <LevelCard key={lv.id} label={lv.label} desc={lv.description} mastery={getMasteryStreak(lv.id)} todayCount={getTodaySkillCount(lv.id)} onClick={() => startPlaceid(lv.id)} accentBorder="hover:border-rose-400" />
            ))}
          </Group>
          <Group icon={<ArrowLeftRight size={20} />} title="10倍・10分の1・100倍・1/100">
            {SCALE_LEVELS.map((lv) => (
              <LevelCard key={lv.id} label={lv.label} desc={lv.description} mastery={getMasteryStreak(lv.id)} todayCount={getTodaySkillCount(lv.id)} onClick={() => startScale(lv.id)} accentBorder="hover:border-rose-400" />
            ))}
          </Group>
          <Group icon={<Ruler size={20} />} title="たんいと小数（長さ・重さ）">
            {UNIT_LEVELS.map((lv) => (
              <LevelCard key={lv.id} label={lv.label} desc={lv.description} mastery={getMasteryStreak(lv.id)} todayCount={getTodaySkillCount(lv.id)} onClick={() => startUnit(lv.id)} accentBorder="hover:border-rose-400" />
            ))}
          </Group>
        </div>
      </div>
    );
  }

  const subtitle = activity === 'compose' ? COMPOSE_LEVELS.find((l) => l.id === composeLevel)?.label
    : activity === 'collect' ? COLLECT_LEVELS.find((l) => l.id === collectLevel)?.label
    : activity === 'scale' ? SCALE_LEVELS.find((l) => l.id === scaleLevel)?.label
    : activity === 'unit' ? UNIT_LEVELS.find((l) => l.id === unitLevel)?.label
    : PLACEID_LEVELS.find((l) => l.id === placeidLevel)?.label;

  return (
    <AppShell title="位取りラボ" subtitle={subtitle} onBack={() => setPhase('SETUP')}>
      {activity === 'compose' && compose && <ComposeActivity key={compose.target} problem={compose} level={composeLevel} onNext={() => setCompose(generateCompose(composeLevel))} />}
      {activity === 'collect' && collect && <CollectActivity key={collect.value + collect.direction + collect.unitLabel} problem={collect} level={collectLevel} onNext={() => setCollect(generateCollect(collectLevel))} />}
      {activity === 'scale' && scale && <ScaleActivity key={scale.value + scale.op} problem={scale} level={scaleLevel} onNext={() => setScale(generateScale(scaleLevel))} />}
      {activity === 'unit' && unit && <UnitActivity key={unit.promptStr} problem={unit} level={unitLevel} onNext={() => setUnit(generateUnit(unitLevel))} />}
      {activity === 'placeid' && placeid && <PlaceIdActivity key={placeid.valueStr + placeid.place} problem={placeid} level={placeidLevel} onNext={() => setPlaceid(generatePlaceId(placeidLevel))} />}
    </AppShell>
  );
};

/* ---------------- 数をつくる ---------------- */
export const ComposeActivity: React.FC<{ problem: ComposeProblem; level: ComposeLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const units = PLACE_UNITS.slice(0, problem.decimals + 1);
  const [counts, setCounts] = useState<number[]>(units.map(() => 0));
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const milli = (units[0] ? counts[0] * 1000 : 0) + (units[1] ? counts[1] * 100 : 0) + (units[2] ? counts[2] * 10 : 0) + (units[3] ? counts[3] : 0);
  const current = fromMilli(milli);

  const set = (i: number, d: number) => {
    if (solved) return;
    setWrong(false);
    setCounts((c) => c.map((v, idx) => (idx === i ? Math.max(0, Math.min(9, v + d)) : v)));
  };

  const check = () => {
    if (Math.abs(current - problem.target) < 1e-9) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: level, label: `${problem.target} をつくる`, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else { playSoftTry(); setWrong(true); setMistakes((m) => m + 1); onMiss?.(); }
  };

  const decompo = units.map((u, i) => `${u.label}を${problem.digits[i]}こ`).join('、');

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2 className="text-xl font-black text-muted">この数を つくろう：</h2>
            <span className="text-5xl font-black text-rose-500 tabular-nums">{problem.target}</span>
          </div>
          <p className="text-center text-muted font-bold mb-6">いま：<span className="text-content text-xl tabular-nums">{current}</span></p>

          {/* マット */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${units.length}, 1fr)` }}>
            {units.map((u, i) => (
              <div key={u.label} className="rounded-2xl border-2 border-line p-3 flex flex-col items-center">
                <div className="px-3 py-1 rounded-full text-white font-black mb-3" style={{ backgroundColor: u.color }}>{u.label}</div>
                <div className="flex-1 flex flex-wrap-reverse gap-1.5 justify-center items-end content-start min-h-[140px] mb-3">
                  {Array.from({ length: counts[i] }, (_, k) => (
                    <motion.div key={k} initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-8 h-8 rounded-full shadow" style={{ backgroundColor: u.color }} />
                  ))}
                </div>
                <div className="text-2xl font-black text-content mb-2 tabular-nums">{counts[i]}</div>
                <div className="flex gap-2">
                  <button onClick={() => set(i, -1)} className="w-10 h-10 rounded-xl bg-surface-3 hover:bg-surface-3 flex items-center justify-center text-muted"><Minus size={20} /></button>
                  <button onClick={() => set(i, +1)} className="w-10 h-10 rounded-xl text-white flex items-center justify-center" style={{ backgroundColor: u.color }}><Plus size={20} /></button>
                </div>
              </div>
            ))}
          </div>

          {solved ? (
            <div className="text-center mt-8">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl text-left">
                {problem.target} は {decompo} あわせた数だね！
              </div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <div className="text-center mt-8">
              {wrong && <p className="text-amber-600 font-bold mb-3">おしい！ 「いま」の数を 見て、たりない位を ふやそう。</p>}
              <button onClick={check} className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">これで できた！</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- あつめた数 ---------------- */
export const CollectActivity: React.FC<{ problem: CollectProblem; level: CollectLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const question = problem.direction === 'count'
    ? `${problem.value} は ${problem.unitLabel} を 何こ あつめた数？`
    : `${problem.unitLabel} を ${problem.count}こ あつめた数は？`;

  const submit = (v: string) => {
    if (Number(v) === Number(problem.answer)) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: level, label: question, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.();
      setHint(problem.direction === 'count'
        ? `${problem.unitLabel} が 10こ あつまると 1つ上の位に なるよ。`
        : `${problem.unitLabel} の ${problem.count}こ分。10こで くり上がるよ。`);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-2 mb-6 text-center">
            <h2 className="text-2xl font-black text-content">{question}</h2>
          </div>
          {solved ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">こたえ：{problem.answer}　せいかい！</div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <>
              {hint && <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2"><Lightbulb className="text-amber-500 shrink-0" size={20} /><p className="text-muted font-bold">{hint}</p></div>}
              <AnswerEntry onSubmit={submit} allowDecimal={problem.direction === 'value'} accentText="text-rose-600" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- 10倍・1/10 ---------------- */
export const ScaleActivity: React.FC<{ problem: ScaleProblem; level: ScaleLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const question = `${problem.value} を ${scaleOpLabel(problem.op)}は？`;
  const isMul = problem.op === '×10' || problem.op === '×100';

  const submit = (v: string) => {
    if (Number(v) === Number(problem.answer)) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: level, label: question, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.();
      setHint(isMul ? '倍にすると 各位が 左へ（小数点は 右へ）うごくよ。10倍は1つ、100倍は2つ。' : '小さくすると 各位が 右へ（小数点は 左へ）うごくよ。1/10は1つ、1/100は2つ。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-2 mb-6">
            <h2 className="text-3xl font-black text-content tabular-nums">{question}</h2>
          </div>
          {solved ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">{problem.value} {problem.op} = {problem.answer}</div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <>
              {hint && <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2"><Lightbulb className="text-amber-500 shrink-0" size={20} /><p className="text-muted font-bold">{hint}</p></div>}
              <AnswerEntry onSubmit={submit} allowDecimal accentText="text-rose-600" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- たんいと小数（長さ・重さ） ---------------- */
export const UnitActivity: React.FC<{ problem: UnitProblem; level: UnitLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const question = `${problem.promptStr} は 何 ${problem.answerUnit}？`;

  const submit = (v: string) => {
    if (Number(v) === Number(problem.answer)) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: level, label: question, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.();
      setHint(problem.answerUnit === 'm'
        ? '1m = 100cm。100cm で 1m（小数点の左）、のこりの cm は 小数で 表すよ。'
        : '1kg = 1000g。1000g で 1kg（小数点の左）、のこりの g は 小数で 表すよ。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-2 mb-6">
            <h2 className="text-3xl font-black text-content tabular-nums">{question}</h2>
          </div>
          {solved ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">{problem.promptStr} = {problem.answer} {problem.answerUnit}　せいかい！</div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <>
              {hint && <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2"><Lightbulb className="text-amber-500 shrink-0" size={20} /><p className="text-muted font-bold">{hint}</p></div>}
              <AnswerEntry onSubmit={submit} allowDecimal accentText="text-rose-600" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- ○の位の数字は？ ---------------- */
export const PlaceIdActivity: React.FC<{ problem: PlaceIdProblem; level: PlaceIdLevel; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, level, onNext, onResult, onMiss }) => {
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const question = `${problem.valueStr} の ${problem.placeLabel} の 数字は？`;

  const handle = (d: string) => {
    if (solved || d === '.') return;
    if (d === problem.answer) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: level, label: question, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); onMiss?.();
      setShake(true); setTimeout(() => setShake(false), 450);
      setHint('一の位から 右へ、小数第一位・第二位…と かぞえて、その位の 数字を 見つけよう。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h2 className="text-2xl font-black text-content">{question}</h2>
          </div>
          <motion.div animate={shake ? { x: [0, -8, 8, -8, 0] } : { x: 0 }} className="text-center text-6xl font-black text-rose-500 tabular-nums mb-6">
            {problem.valueStr}
          </motion.div>
          {solved ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">こたえ：{problem.answer}　せいかい！</div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <>
              {hint && <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2"><Lightbulb className="text-amber-500 shrink-0" size={20} /><p className="text-muted font-bold">{hint}</p></div>}
              <Keypad onInput={handle} onBackspace={() => {}} allowDecimal={false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- 数の分解（1.695 = 1を何こ…） ---------------- */
export const DecomposeActivity: React.FC<{ problem: DecomposeProblem; onNext: () => void; onResult?: (perfect: boolean) => void; onMiss?: () => void }> = ({ problem, onNext, onResult, onMiss }) => {
  const units = PLACE_UNITS; // 1 / 0.1 / 0.01 / 0.001
  const targets = [problem.counts.ones, problem.counts.tenths, problem.counts.hundredths, problem.counts.thousandths];
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0]);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const recordResult = useProgressStore((s) => s.recordResult);

  const set = (i: number, d: number) => {
    if (solved) return;
    setWrong(false);
    setCounts((c) => c.map((v, idx) => (idx === i ? Math.max(0, Math.min(9, v + d)) : v)));
  };

  const check = () => {
    if (counts.every((v, i) => v === targets[i])) {
      setSolved(true);
      playClear();
      confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
      recordResult({ moduleId: 'place-value', skillId: 'decompose-3', label: `${problem.valueStr} を分解`, correct: true, mistakes, misses: mistakes > 0 ? [{ tag: 'placevalue' }] : undefined });
      onResult?.(mistakes === 0);
    } else { playSoftTry(); setWrong(true); setMistakes((m) => m + 1); onMiss?.(); }
  };

  const decompo = units.map((u, i) => `${u.label}を${targets[i]}こ`).join('、');

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2 className="text-xl font-black text-muted">この数は それぞれ 何こ あつめた数？</h2>
          </div>
          <div className="text-center text-5xl font-black text-rose-500 tabular-nums mb-6">{problem.valueStr}</div>

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${units.length}, 1fr)` }}>
            {units.map((u, i) => (
              <div key={u.label} className="rounded-2xl border-2 border-line p-3 flex flex-col items-center">
                <div className="px-3 py-1 rounded-full text-white font-black mb-3" style={{ backgroundColor: u.color }}>{u.label}</div>
                <div className="text-3xl font-black text-content mb-3 tabular-nums">{counts[i]}<span className="text-base text-muted"> こ</span></div>
                <div className="flex gap-2">
                  <button onClick={() => set(i, -1)} className="w-10 h-10 rounded-xl bg-surface-3 hover:bg-surface-3 flex items-center justify-center text-muted"><Minus size={20} /></button>
                  <button onClick={() => set(i, +1)} className="w-10 h-10 rounded-xl text-white flex items-center justify-center" style={{ backgroundColor: u.color }}><Plus size={20} /></button>
                </div>
              </div>
            ))}
          </div>

          {solved ? (
            <div className="text-center mt-8">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl text-left">
                {problem.valueStr} は {decompo} あわせた数だね！
              </div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">つぎの もんだい</button></div>
            </div>
          ) : (
            <div className="text-center mt-8">
              {wrong && <p className="text-amber-600 font-bold mb-3">おしい！ それぞれの 位が 何こ分か もう一度 かぞえてみよう。</p>}
              <button onClick={check} className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">これで できた！</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
