import React, { useMemo, useState } from 'react';
import { BuildingType, DeployedBuilding, GRID_W, GRID_H, BattleMap } from '../types';
import { BUILDING_STATS } from '../constants';
import { useBaseStore } from '../store/useBaseStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useStudyStore } from '../store/useStudyStore';
import { computeBattleLoadout, splitActiveLayout } from '../utils/battleLoadout';
import {
  FACILITY_MAX_COUNT, MAX_FACILITY_LEVEL, PERFECT_PER_ACTIVE, PLACEABLE_FACILITIES, SUPPORT_FACILITIES,
  activeFacilityLimit, buyCost, facilityMult, powerPlantBonus, upgradeCost,
} from '../data/facilities';
import { BATTLE_MAP_BY_ID, zoneSize } from '../data/battleMaps';
import { CampaignChapter } from '../data/campaign';
import { sfx } from '../utils/audioEngine';
import { StatPill, TitleBar } from './ui';

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

// 陣地に置ける施設（コアは必須・いつも1つ）／戦場には出ないが、持っていると はたらく施設
const PLACEABLE: BuildingType[] = PLACEABLE_FACILITIES;
const SUPPORT: BuildingType[] = SUPPORT_FACILITIES;

/** 施設の効き目（レベルの説明。小4が読める短い文） */
function effectNote(type: BuildingType, level: number, count: number): string {
  if (type === BuildingType.GOLD_MINE) return `勝ったときの💠 +${Math.round(powerPlantBonus(Math.max(1, count), level) * 100)}%`;
  if (type === BuildingType.BARRACKS) return '数で ネコの系統が ひらく';
  if (type === BuildingType.ARMY_CAMP) return 'まほう +1（おいた数）';
  return `HP・こうげき ×${facilityMult(type, level).toFixed(1)}`;
}

const TERRAIN_BG: Record<string, string> = {
  GRASS: 'rgba(255,255,255,0.03)',
  WATER: 'linear-gradient(180deg, #1e40af 0%, #1d4ed8 45%, #1e3a8a 100%)',
  BRIDGE: '#92400e',
  ROCK: '#374151',
  SWAMP: 'rgba(20,83,45,0.85)',
  LAVA: '#7f1d1d',
};

interface Props {
  chapter: CampaignChapter;
  onBack: () => void;
  /** 出撃フローから来たときだけ渡される（ハブから来た場合は無し） */
  onProceed?: () => void;
  /** 出撃ボタンの上に出すもの（スタミナ・ことわられたわけ。CW-5a） */
  proceedSlot?: React.ReactNode;
  /** 出撃の関門に聞いているあいだ（ボタンを止める） */
  proceedBusy?: boolean;
  /** 敵の基地の 見せかた（うっすら出る 敵の施設）。なかまの基地を 攻めるとき（CW-6b）は その配置を 出す。無ければ 戦場の 敵の基地 */
  enemyBase?: BattleMap['enemyBase'];
  /** 配置を かえたとき（なかまに 見せる基地の 送りだしに 使う。CW-6b） */
  onLayoutEdited?: (chapterId: string) => void;
}

/**
 * ステージごとの陣地づくり（2026-11-15 CW-4a：施設は持ちつづける）。
 *
 * ・施設は 💠クレジット で買い、レベルを上げる。ずっと持っている（日付で消えない）
 * ・その日に戦闘で動かせるのは「2 + きょう まちがえずに解いた数 ÷ 5」個まで（コアは いつも）。先に置いた順
 * ・置ける範囲（自陣ゾーン）はステージごとに違う
 */
export const BaseBuilder: React.FC<Props> = ({ chapter, onBack, onProceed, proceedSlot, proceedBusy, enemyBase, onLayoutEdited }) => {
  const map: BattleMap = BATTLE_MAP_BY_ID[chapter.mapId];
  const base = useBaseStore();
  const credits = Math.floor(usePlayerStore(s => s.resources.gold));
  const spendResources = usePlayerStore(s => s.spendResources);
  const todayPerfect = useStudyStore(s => (s.todayDate === new Date().toISOString().slice(0, 10) ? s.todayPerfect : 0));
  const limit = activeFacilityLimit(todayPerfect);

  const [layout, setLayoutLocal] = useState<DeployedBuilding[]>(() => {
    const saved = base.getLayout(chapter.id);
    // コアが無ければ自陣の奥に自動配置（毎回置かせるのは手間なので）
    if (saved.some(d => d.type === BuildingType.TOWN_HALL)) return saved;
    const z = map.playerDeployZone;
    const cx = z.xMin;
    const cy = Math.max(z.yMin, Math.min(z.yMax - 1, Math.floor((z.yMin + z.yMax) / 2)));
    return [...saved, { type: BuildingType.TOWN_HALL, x: cx, y: cy }];
  });
  const [selected, setSelected] = useState<BuildingType | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const built = base.owned;
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 1900); };

  // 自動配置したコアは、まだストアに入っていないので初回に保存しておく。
  // （これを忘れると、何も編集せずに出撃したときコアが戦場に出ない）
  React.useEffect(() => {
    const saved = base.getLayout(chapter.id);
    if (!saved.some(d => d.type === BuildingType.TOWN_HALL)) {
      base.setLayout(chapter.id, layout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  const save = (next: DeployedBuilding[]) => {
    setLayoutLocal(next);
    base.setLayout(chapter.id, next);
    onLayoutEdited?.(chapter.id);
  };

  const used = useMemo(() => {
    const u: Partial<Record<BuildingType, number>> = {};
    for (const d of layout) u[d.type] = (u[d.type] ?? 0) + 1;
    return u;
  }, [layout]);

  /** その施設をあと何個 置けるか（持っている数 − 配置ずみ） */
  const spare = (t: BuildingType) => (built[t] ?? 0) - (used[t] ?? 0);

  // きょう動かせるもの（先に置いた順）と、止まっているもの
  const { active, inactive } = useMemo(() => splitActiveLayout(layout, limit), [layout, limit]);
  const isInactive = (d: DeployedBuilding) => inactive.includes(d);
  const ownedPlaceable = PLACEABLE.reduce((a, t) => a + (built[t] ?? 0), 0);
  const runnable = Math.min(limit, ownedPlaceable);
  const toNext = PERFECT_PER_ACTIVE - (todayPerfect % PERFECT_PER_ACTIVE);

  const loadout = useMemo(() => computeBattleLoadout(built, active), [built, active]);
  const zone = map.playerDeployZone;
  const zs = zoneSize(map);

  const terrainAt = (x: number, y: number) =>
    map.terrain.find(t => t.x === x && t.y === y)?.type ?? 'GRASS';

  const inZone = (x: number, y: number) =>
    x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;

  const placedAt = (x: number, y: number): DeployedBuilding | undefined =>
    layout.find(d => {
      const s = BUILDING_STATS[d.type];
      return x >= d.x && x < d.x + s.width && y >= d.y && y < d.y + s.height;
    });

  const enemyAt = (x: number, y: number) =>
    (enemyBase ?? map.enemyBase).find(e => {
      const s = BUILDING_STATS[e.type];
      return x >= e.x && x < e.x + s.width && y >= e.y && y < e.y + s.height;
    });

  const canPlaceAt = (type: BuildingType, x: number, y: number): boolean => {
    const s = BUILDING_STATS[type];
    for (let dy = 0; dy < s.height; dy++) {
      for (let dx = 0; dx < s.width; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= GRID_W || py >= GRID_H) return false;
        if (!inZone(px, py)) return false;
        const t = terrainAt(px, py);
        if (t === 'WATER' || t === 'ROCK' || t === 'LAVA') return false;
        if (placedAt(px, py)) return false;
      }
    }
    return true;
  };

  const handleCell = (x: number, y: number) => {
    const existing = placedAt(x, y);
    // 置いてあるものをタップ → もちものにもどす（コアは動かせない扱いにせず、選び直しで移動できる）
    if (existing) {
      if (existing.type === BuildingType.TOWN_HALL) {
        flash('🏰 コアは、おきたいマスをえらんで動かせるよ');
        setSelected(BuildingType.TOWN_HALL);
        return;
      }
      save(layout.filter(d => !(d.x === existing.x && d.y === existing.y)));
      sfx.tap();
      return;
    }
    if (!selected) return;
    if (!canPlaceAt(selected, x, y)) { flash('⛔ ここにはおけないよ'); return; }

    if (selected === BuildingType.TOWN_HALL) {
      save([...layout.filter(d => d.type !== BuildingType.TOWN_HALL), { type: selected, x, y }]);
      sfx.tap();
      return;
    }

    if (spare(selected) <= 0) { flash('🏪 もう おけるものが ないよ。下の「買う」で ふやそう'); return; }
    save([...layout, { type: selected, x, y }]);
    sfx.tap();
  };

  /** 1つ買う（💠） */
  const buy = (t: BuildingType) => {
    const have = built[t] ?? 0;
    if (have >= FACILITY_MAX_COUNT[t]) { flash('これ以上は もてないよ'); return; }
    const cost = buyCost(t, have + 1);
    if (credits < cost) { flash(`💠 クレジットが ${cost - credits} たりない！問題をといて ためよう`); return; }
    if (base.buy(t, (n) => spendResources(n))) { sfx.correct(); flash(`🏗️ ${BUILDING_STATS[t].name}を 買った！（-${cost}💠）`); }
  };

  /** レベルを上げる（💠） */
  const upgrade = (t: BuildingType) => {
    const lv = base.levelOf(t);
    if (lv >= MAX_FACILITY_LEVEL) return;
    const cost = upgradeCost(t, lv);
    if (credits < cost) { flash(`💠 クレジットが ${cost - credits} たりない！`); return; }
    if (base.upgrade(t, (n) => spendResources(n))) { sfx.correct(); flash(`⬆️ ${BUILDING_STATS[t].name} Lv${lv + 1}！（-${cost}💠）`); }
  };

  // 盤面は 28×16 と横長なので、表示領域に合わせてマス目の大きさを決める。
  // 固定サイズだと iPad 横向きで盤面が小さく、まわりが余ってしまう。
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState(22);
  React.useLayoutEffect(() => {
    const fit = () => {
      const el = boardRef.current;
      if (!el) return;
      const w = el.clientWidth - 8;
      const h = el.clientHeight - 8;
      if (w <= 0 || h <= 0) return;
      setCell(Math.max(14, Math.min(44, Math.floor(Math.min(w / GRID_W, h / GRID_H)))));
    };
    fit();
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const CELL = cell;

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" style={font}>
      {/* Header */}
      <TitleBar title="陣地づくり" onBack={onBack} subtitle={<>第{chapter.no}章「{chapter.title}」／{map.name}</>}
        right={<StatPill icon="credit" value={credits} label="クレジット" data-testid="credits" />} />

      {msg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-[#38bdf8]/50 text-white text-xs font-bold px-5 py-2 rounded-full shadow-2xl">
          {msg}
        </div>
      )}

      {/* ゾーン情報 */}
      <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap text-[11px] flex-shrink-0">
        <span className="px-2 py-0.5 rounded-full border text-[#a3e635]"
          style={{ background: 'rgba(163,230,53,0.1)', borderColor: 'rgba(163,230,53,0.35)' }}>
          この章の陣地 {zs.w}×{zs.h}マス
        </span>
        <span className="text-white/45">
          {zs.w >= 9 ? 'ひろい！' : zs.w <= 5 ? 'せまい…' : 'ふつうの広さ'}
        </span>
        <span className="px-2 py-0.5 rounded-full border text-[#facc15] font-bold" data-testid="active-limit"
          style={{ background: 'rgba(250,204,21,0.1)', borderColor: 'rgba(250,204,21,0.4)' }}>
          きょう 動かせる施設：{runnable}／{ownedPlaceable}　あと {toNext}問 まちがえずに とくと +1
        </span>
        {inactive.length > 0 && <span className="text-white/45">💤＝きょうは 止まっている（先に おいた順に 動く）</span>}
      </div>

      {/* Battlefield */}
      <div ref={boardRef} className="flex-1 overflow-auto px-2 py-1 flex items-center justify-center">
        <div style={{ position: 'relative', width: GRID_W * CELL, height: GRID_H * CELL, flexShrink: 0 }}>
          {Array.from({ length: GRID_H }, (_, y) =>
            Array.from({ length: GRID_W }, (_, x) => {
              const t = terrainAt(x, y);
              const iz = inZone(x, y);
              const p = placedAt(x, y);
              const e = !p && enemyAt(x, y);
              const isTopLeft = p && p.x === x && p.y === y;
              const isEnemyTopLeft = e && e.x === x && e.y === y;
              const placeable = selected && iz && !p && canPlaceAt(selected, x, y);
              return (
                <div key={`${x}-${y}`}
                  onClick={() => { if (iz) handleCell(x, y); }}
                  style={{
                    position: 'absolute', left: x * CELL, top: y * CELL, width: CELL, height: CELL,
                    background: iz && t === 'GRASS' ? 'rgba(56,189,248,0.09)' : TERRAIN_BG[t],
                    border: `1px solid ${placeable ? 'rgba(56,189,248,0.7)' : iz ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.05)'}`,
                    boxShadow: placeable ? 'inset 0 0 6px rgba(56,189,248,0.45)' : undefined,
                    cursor: iz ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: CELL * 0.55, lineHeight: 1,
                  }}>
                  {isTopLeft && (
                    <span style={{
                      filter: isInactive(p!) ? 'grayscale(1)' : 'drop-shadow(0 0 4px #22d3ee)',
                      opacity: isInactive(p!) ? 0.35 : 1, fontSize: CELL * 0.68, position: 'relative',
                    }}>
                      {BUILDING_STATS[p!.type].icon || '🧱'}
                      {isInactive(p!) && <span style={{ position: 'absolute', right: -CELL * 0.3, top: -CELL * 0.3, fontSize: CELL * 0.4 }}>💤</span>}
                    </span>
                  )}
                  {isEnemyTopLeft && <span style={{ opacity: 0.5 }}>{BUILDING_STATS[e!.type].icon || '🧱'}</span>}
                  {t === 'LAVA' && !p && !e && <span style={{ opacity: 0.7, fontSize: CELL * 0.5 }}>🔥</span>}
                </div>
              );
            })
          )}
          {/* 自陣ゾーンの外枠 */}
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            left: zone.xMin * CELL, top: zone.yMin * CELL,
            width: (zone.xMax - zone.xMin + 1) * CELL, height: (zone.yMax - zone.yMin + 1) * CELL,
            border: '2px dashed rgba(56,189,248,0.55)', borderRadius: 4,
          }} />
        </div>
      </div>

      {/* Loadout summary */}
      <div className="px-4 py-1 text-[10px] text-white/55 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-white/10 flex-shrink-0">
        <span className="text-white/40">きょう つかえる力 →</span>
        <span className="text-[#a3e635]">🐱 {loadout.unlockedTroopTypes.length}系統</span>
        <span>💊 ヒール{loadout.healCharges}</span>
        <span>😤 レイジ{loadout.rageCharges}</span>
      </div>

      {/* Facility picker */}
      <div className="border-t border-white/10 px-3 pt-2 flex-shrink-0"
        style={{ background: 'rgba(6,10,24,0.95)', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {/* コア（いつも1つ・いつも動く。レベルだけ上げられる） */}
          <div className="flex-shrink-0 flex flex-col items-stretch gap-1 min-w-[92px]" data-facility="TOWN_HALL">
          <button onClick={() => setSelected(selected === BuildingType.TOWN_HALL ? null : BuildingType.TOWN_HALL)}
            className="flex flex-col items-center p-1.5 rounded-xl border-2 transition-all active:scale-95"
            style={{
              borderColor: selected === BuildingType.TOWN_HALL ? '#38bdf8' : 'rgba(255,255,255,0.15)',
              background: selected === BuildingType.TOWN_HALL ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
            }}>
            <span className="text-xl leading-none">🏰</span>
            <span className="text-[10px] text-white/80 mt-1 leading-none">コア <b style={{ color: '#facc15' }}>Lv{base.levelOf(BuildingType.TOWN_HALL)}</b></span>
            <span className="text-[9px] font-bold text-[#a3e635] mt-0.5" style={fontMono}>いつも動く</span>
            <span className="text-[8px] mt-0.5 text-white/50">{effectNote(BuildingType.TOWN_HALL, base.levelOf(BuildingType.TOWN_HALL), 1)}</span>
          </button>
          <button onClick={() => upgrade(BuildingType.TOWN_HALL)} disabled={base.levelOf(BuildingType.TOWN_HALL) >= MAX_FACILITY_LEVEL}
            className="text-[9px] font-bold rounded-md border px-1 py-0.5 disabled:opacity-30"
            style={{ borderColor: 'rgba(250,204,21,0.5)', color: '#fde68a' }}>
            {base.levelOf(BuildingType.TOWN_HALL) >= MAX_FACILITY_LEVEL ? 'Lv MAX' : `Lv↑ ${upgradeCost(BuildingType.TOWN_HALL, base.levelOf(BuildingType.TOWN_HALL))}💠`}
          </button>
          </div>

          {[...PLACEABLE, ...SUPPORT].map(type => {
            const st = BUILDING_STATS[type];
            const placeable = PLACEABLE.includes(type);
            const own = built[type] ?? 0;
            const max = FACILITY_MAX_COUNT[type];
            const lv = base.levelOf(type);
            const sp = spare(type);
            const sel = selected === type;
            const bCost = own < max ? buyCost(type, own + 1) : null;
            const uCost = own > 0 && lv < MAX_FACILITY_LEVEL ? upgradeCost(type, lv) : null;
            return (
              <div key={type} className="flex-shrink-0 flex flex-col items-stretch gap-1 min-w-[92px]" data-facility={type}>
                <button onClick={() => { if (placeable && own > 0) setSelected(sel ? null : type); }}
                  className="flex flex-col items-center p-1.5 rounded-xl border-2 transition-all active:scale-95"
                  style={{
                    borderColor: sel ? '#38bdf8' : own > 0 ? 'rgba(163,230,53,0.45)' : 'rgba(255,255,255,0.15)',
                    background: sel ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                    opacity: own > 0 ? 1 : 0.6,
                  }}>
                  <span className="text-xl leading-none">{st.icon || '🧱'}</span>
                  <span className="text-[10px] text-white/85 mt-1 leading-none">{st.name} <b style={{ color: '#facc15' }}>Lv{lv}</b></span>
                  <span className="text-[9px] mt-0.5 text-[#a3e635]" style={fontMono}>
                    {own}/{max}{placeable && own > 0 ? `・のこり${sp}` : ''}
                  </span>
                  <span className="text-[8px] mt-0.5 text-white/50 leading-tight text-center">{effectNote(type, lv, own)}</span>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => buy(type)} disabled={bCost == null}
                    className="flex-1 text-[9px] font-bold rounded-md border px-1 py-0.5 disabled:opacity-30"
                    style={{ borderColor: 'rgba(56,189,248,0.5)', color: '#7dd3fc', opacity: bCost != null && credits < bCost ? 0.5 : 1 }}>
                    {bCost == null ? 'MAX' : `買う ${bCost}💠`}
                  </button>
                  <button onClick={() => upgrade(type)} disabled={uCost == null}
                    className="flex-1 text-[9px] font-bold rounded-md border px-1 py-0.5 disabled:opacity-30"
                    style={{ borderColor: 'rgba(250,204,21,0.5)', color: '#fde68a', opacity: uCost != null && credits < uCost ? 0.5 : 1 }}>
                    {lv >= MAX_FACILITY_LEVEL ? 'Lv MAX' : own === 0 ? 'Lv↑' : `Lv↑ ${uCost}💠`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-white/40 text-[10px] pb-1.5">
          {selected
            ? `👆 青いわくの中をタップして「${BUILDING_STATS[selected].name}」をおく ・ おいたものをタップではずす`
            : '💠で 施設を 買って レベルを 上げよう。施設は ずっと のこるよ。きょう 動かせる数は、まちがえずに といた数で ふえる'}
        </p>

        {onProceed && proceedSlot}
        {onProceed && (
          <button onClick={() => { if (proceedBusy) return; sfx.select(); onProceed(); }}
            disabled={proceedBusy} data-testid="sortie-go"
            className="w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 mb-1 disabled:opacity-50"
            style={{
              ...fontMono,
              background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444', color: '#f87171',
              boxShadow: '0 0 14px rgba(239,68,68,0.45)',
            }}>
            {proceedBusy ? '⏳ じゅんびちゅう…' : '⚔️ この陣地で 出撃！'}
          </button>
        )}
      </div>
    </div>
  );
};
