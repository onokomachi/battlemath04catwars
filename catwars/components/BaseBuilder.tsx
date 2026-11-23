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
import { Button, Chip, FacilityImg, Icon, StatPill, TitleBar } from './ui';

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
  GRASS: 'rgba(6,10,28,0.5)',
  WATER: 'linear-gradient(180deg, #1e40af 0%, #1d4ed8 45%, #1e3a8a 100%)',
  BRIDGE: '#92400e',
  ROCK: '#475569',
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

  /** 自分の施設がかぶっている敵の基地は 出さない（今までも 自分が 先だった） */
  const placedFootprintHidden = (e: { type: BuildingType; x: number; y: number }) => placedAt(e.x, e.y) !== undefined;

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
  const enemyBaseList = (enemyBase ?? map.enemyBase).filter(e => !placedFootprintHidden(e));

  /** 施設のカード1枚（絵・名前・Lv・数・効き目）と その下の「買う」「Lv↑」 */
  const FacilityCard = ({ type }: { type: BuildingType }) => {
    const st = BUILDING_STATS[type];
    const isCore = type === BuildingType.TOWN_HALL;
    const placeable = isCore || PLACEABLE.includes(type);
    const own = isCore ? 1 : built[type] ?? 0;
    const max = isCore ? 1 : FACILITY_MAX_COUNT[type];
    const lv = base.levelOf(type);
    const sp = isCore ? 0 : spare(type);
    const sel = selected === type;
    const bCost = !isCore && own < max ? buyCost(type, own + 1) : null;
    const uCost = own > 0 && lv < MAX_FACILITY_LEVEL ? upgradeCost(type, lv) : null;
    const canBuy = bCost != null && credits >= bCost;
    const canUp = uCost != null && credits >= uCost;
    return (
      <div className="flex-shrink-0 flex flex-col gap-1.5 w-[128px]" data-facility={type}>
        <button type="button" className={`cw-card cw-press cw-tone-action flex flex-col items-center gap-0.5 px-2 py-2 w-full flex-1 ${sel ? 'cw-card-on' : ''}`}
          aria-pressed={sel} aria-disabled={!placeable || own <= 0 || undefined}
          style={{ background: sel ? 'var(--tone-bg)' : undefined, opacity: own > 0 ? 1 : 0.8 }}
          onClick={() => { if (placeable && own > 0) setSelected(sel ? null : type); }}>
          <FacilityImg type={type} size={40} style={{ filter: own > 0 ? undefined : 'grayscale(1) brightness(.8)' }} />
          <span className="text-cw-14 font-extrabold leading-tight" style={{ color: 'var(--cw-fg)' }}>{isCore ? 'コア' : st.name}</span>
          <span className="flex items-center gap-2 text-cw-12 font-bold">
            <span className="font-cw-num" style={{ color: 'var(--cw-reward)' }}>Lv{lv}</span>
            {!isCore && <span className="font-cw-num" style={{ color: 'var(--cw-growth)' }}>{own}/{max}</span>}
          </span>
          <span className="text-cw-12 font-bold" style={{ color: 'var(--cw-growth)' }}>
            {isCore ? 'いつも動く' : placeable && own > 0 ? `のこり${sp}` : '\u00A0'}
          </span>
          <span className="text-cw-12 leading-tight text-center" style={{ color: 'var(--cw-fg-2)' }}>{effectNote(type, lv, isCore ? 1 : own)}</span>
        </button>
        <div className="flex gap-1.5">
          {!isCore && (
            <Button size="sm" variant="primary" className="flex-1 !px-1 !text-cw-12 flex-col !gap-0 leading-tight" disabled={bCost == null}
              locked={bCost != null && !canBuy} onClick={() => buy(type)} aria-label={`${st.name}を買う`}>
              <span>{bCost == null ? 'MAX' : '買う'}</span>
              {bCost != null && <span className="font-cw-num">{bCost}<Icon name="credit" size={14} className="inline-block align-[-2px] ml-0.5" /></span>}
            </Button>
          )}
          <Button size="sm" variant="reward" className="flex-1 !px-1 !text-cw-12 flex-col !gap-0 leading-tight" disabled={uCost == null}
            locked={uCost != null && !canUp} onClick={() => upgrade(type)} aria-label={`${st.name}のレベルを上げる`}>
            <span>{lv >= MAX_FACILITY_LEVEL ? 'Lv MAX' : 'Lv↑'}</span>
            {uCost != null && <span className="font-cw-num">{uCost}<Icon name="credit" size={14} className="inline-block align-[-2px] ml-0.5" /></span>}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden">
      <TitleBar title="陣地づくり" onBack={onBack} subtitle={<>第{chapter.no}章「{chapter.title}」／{map.name}</>}
        right={<StatPill icon="credit" value={credits} label="クレジット" data-testid="credits" />} />

      {msg && (
        <div role="status" className="cw-panel cw-panel-strong cw-enter fixed top-[72px] left-1/2 -translate-x-1/2 z-40 text-cw-14 font-bold px-5 py-2 rounded-cw-pill max-w-[92vw] text-center"
          style={{ color: 'var(--cw-fg)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-action)' }}>
          {msg}
        </div>
      )}

      {/* ゾーン・きょうの力 */}
      <div className="px-4 py-2 flex items-center gap-x-2 gap-y-1 flex-wrap flex-shrink-0">
        <Chip tone="action">この章の陣地 {zs.w}×{zs.h}マス（{zs.w >= 9 ? 'ひろい！' : zs.w <= 5 ? 'せまい…' : 'ふつうの広さ'}）</Chip>
        <span data-testid="active-limit"><Chip tone="reward">きょう 動かせる施設：{runnable}／{ownedPlaceable}　あと {toNext}問 まちがえずに とくと +1</Chip></span>
        <span className="flex items-center gap-3 text-cw-12 font-bold" style={{ color: 'var(--cw-fg-2)' }}>
          <span className="flex items-center gap-1"><Icon name="cats" size={20} />{loadout.unlockedTroopTypes.length}系統</span>
          <span className="flex items-center gap-1"><Icon name="heal" size={20} />ヒール{loadout.healCharges}</span>
          <span className="flex items-center gap-1"><Icon name="rage" size={20} />レイジ{loadout.rageCharges}</span>
        </span>
        {inactive.length > 0 && <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>「ねむり」＝きょうは 止まっている（先に おいた順に 動く）</span>}
      </div>

      {/* 盤面 */}
      <div ref={boardRef} className="flex-1 min-h-0 overflow-auto px-2 py-1 flex items-center justify-center">
        <div className="cw-board" style={{ position: 'relative', width: GRID_W * CELL, height: GRID_H * CELL, flexShrink: 0 }}>
          {Array.from({ length: GRID_H }, (_, y) =>
            Array.from({ length: GRID_W }, (_, x) => {
              const t = terrainAt(x, y);
              const iz = inZone(x, y);
              const p = placedAt(x, y);
              const e = !p && enemyAt(x, y);
              const placeable = selected && iz && !p && canPlaceAt(selected, x, y);
              return (
                <div key={`${x}-${y}`}
                  onClick={() => { if (iz) handleCell(x, y); }}
                  style={{
                    position: 'absolute', left: x * CELL, top: y * CELL, width: CELL, height: CELL,
                    background: iz && t === 'GRASS' ? 'rgba(56,189,248,0.2)' : TERRAIN_BG[t],
                    boxShadow: placeable ? 'inset 0 0 0 2px var(--cw-action), inset 0 0 10px rgba(56,189,248,0.7)'
                      : iz ? 'inset 0 0 0 1px rgba(125,211,252,0.42)' : 'inset 0 0 0 1px rgba(148,170,255,0.13)',
                    cursor: iz ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {t === 'LAVA' && !p && !e && <span style={{ opacity: 0.75, fontSize: Math.max(12, CELL * 0.5), lineHeight: 1 }}>🔥</span>}
                </div>
              );
            })
          )}
          {/* 置いた施設・敵の基地（絵は 占めるマスぜんぶに かぶせる） */}
          {enemyBaseList.map((e, i) => {
            const s = BUILDING_STATS[e.type];
            return (
              <div key={`e${i}`} style={{ position: 'absolute', left: e.x * CELL, top: e.y * CELL, width: s.width * CELL, height: s.height * CELL, pointerEvents: 'none', opacity: 0.55 }}>
                <FacilityImg type={e.type} size={Math.min(s.width, s.height) * CELL * 0.9} style={{ margin: 'auto', position: 'absolute', inset: 0, filter: 'saturate(.6) drop-shadow(0 0 3px rgba(248,113,113,.7))' }} />
              </div>
            );
          })}
          {layout.map((d, i) => {
            const s = BUILDING_STATS[d.type];
            const off = isInactive(d);
            return (
              <div key={`p${i}`} style={{ position: 'absolute', left: d.x * CELL, top: d.y * CELL, width: s.width * CELL, height: s.height * CELL, pointerEvents: 'none' }}>
                <FacilityImg type={d.type} size={Math.min(s.width, s.height) * CELL * 0.92}
                  style={{ position: 'absolute', inset: 0, margin: 'auto', filter: off ? 'grayscale(1)' : 'drop-shadow(0 0 5px rgba(56,189,248,.85))', opacity: off ? 0.4 : 1 }} />
                {off && <span className="absolute -top-1 -right-1 rounded-cw-pill font-bold" style={{ background: 'var(--cw-surface-strong)', color: 'var(--cw-fg-2)', fontSize: 12, lineHeight: '14px', padding: '0 4px', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)' }}>ねむり</span>}
              </div>
            );
          })}
          {/* 自陣ゾーンの外枠（はっきり） */}
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            left: zone.xMin * CELL, top: zone.yMin * CELL,
            width: (zone.xMax - zone.xMin + 1) * CELL, height: (zone.yMax - zone.yMin + 1) * CELL,
            border: '3px solid var(--cw-action)', borderRadius: 6,
            boxShadow: '0 0 0 1px rgba(6,10,28,.8), 0 0 22px -4px var(--cw-action), inset 0 0 22px -8px var(--cw-action)',
          }} />
          <span className="absolute font-bold rounded-cw-sm" style={{
            left: zone.xMin * CELL + 4, top: zone.yMin * CELL + 4, fontSize: 12, lineHeight: '18px', padding: '0 8px',
            background: 'var(--cw-action)', color: 'var(--cw-on-color)', pointerEvents: 'none',
          }}>じぶんの 陣地</span>
        </div>
      </div>

      {/* 施設のカード・出撃 */}
      <div className="flex-shrink-0 px-3 pt-2 min-[900px]:flex min-[900px]:gap-3 min-[900px]:items-stretch"
        style={{ background: 'var(--cw-surface-strong)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: 'inset 0 1px 0 var(--cw-line-strong)', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
        <div className="min-w-0 flex-1">
          <div className="flex gap-2 overflow-x-auto pb-2 cw-scroll">
            <FacilityCard type={BuildingType.TOWN_HALL} />
            {[...PLACEABLE, ...SUPPORT].map(type => <FacilityCard key={type} type={type} />)}
          </div>
          <p className="text-cw-12 pb-1.5" style={{ color: 'var(--cw-fg-2)' }}>
            {selected
              ? `青いわくの中をタップして「${BUILDING_STATS[selected].name}」をおく。おいたものをタップすると はずれるよ`
              : '💠で 施設を 買って レベルを 上げよう。施設は ずっと のこるよ。きょう 動かせる数は、まちがえずに といた数で ふえる'}
          </p>
        </div>
        {onProceed && (
          <div className="min-[900px]:w-[260px] flex-shrink-0 flex flex-col justify-end">
            {proceedSlot}
            <Button variant="primary" size="xl" fullWidth className="mb-1" disabled={proceedBusy} data-testid="sortie-go"
              onClick={() => { if (proceedBusy) return; sfx.select(); onProceed(); }}>
              <Icon name="sortie" size={30} />{proceedBusy ? 'じゅんびちゅう…' : 'この陣地で 出撃！'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
