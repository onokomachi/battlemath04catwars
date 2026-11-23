import React from 'react';

/**
 * 画面の アイコン一式（手で描いた SVG。docs/ART_STYLE.md の シール・バッジと 同じ絵柄）。
 * 32×32 の中に、こい紺のりんかく（太さ 2・まるいかど）・ベタぬり・右下に影・左上に ハイライト。
 * 24〜32px で出して 何の絵か 分かる形にする。文字・filter・外の画像は 使わない。
 *
 *   <Icon name="sortie" size={32} />
 *
 * UI の中の 絵文字は ここの アイコン（か ネコ・施設の 絵）に おきかえる。文の中の小さな絵文字は のこしてよい。
 */

const O = '#1e1b4b';   // りんかく（紺）
const HI = '#ffffff';  // ハイライト

/** 5つの とがった 星の点 */
const starPoints = (cx: number, cy: number, ro: number, ri: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? ro : ri;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
};

/** 肉球（大きな 足の うらと ゆび3つ） */
const Paw: React.FC<{ x: number; y: number; s?: number; fill: string; shade: string }> = ({ x, y, s = 1, fill, shade }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="3.4" rx="5" ry="4.2" fill={fill} />
    <path d="M-1 6.8 Q3.6 7.4 5 3.4 Q5.2 1 3.2 -.4 Q4 5 -1 6.8Z" fill={shade} stroke="none" />
    <circle cx="-5.2" cy="-1.6" r="2.3" fill={fill} />
    <circle cx="0" cy="-4.4" r="2.5" fill={fill} />
    <circle cx="5.2" cy="-1.6" r="2.3" fill={fill} />
  </g>
);

const Sparkle: React.FC<{ x: number; y: number; r: number; fill?: string }> = ({ x, y, r, fill = '#fde047' }) => (
  <path d={`M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r}Z`}
    fill={fill} strokeWidth="1.5" />
);

const ART = {
  /** 出撃：剣と肉球 */
  sortie: (
    <>
      <g transform="rotate(45 16 16)">
        <path d="M12.8 6.4 L16 .8 L19.2 6.4 V19 H12.8Z" fill="#e2e8f0" />
        <path d="M16 .8 L19.2 6.4 V19 H16Z" fill="#94a3b8" stroke="none" />
        <rect x="9.5" y="19" width="13" height="3.2" rx="1.6" fill="#fde047" />
        <rect x="14.2" y="22.2" width="3.6" height="5" rx="1" fill="#fb923c" />
        <circle cx="16" cy="28.4" r="1.9" fill="#fde047" />
        <ellipse cx="14.4" cy="10" rx=".9" ry="3.4" fill={HI} stroke="none" opacity=".75" />
      </g>
      <Paw x={23.6} y={24.2} s={0.78} fill="#f9a8d4" shade="#ec4899" />
    </>
  ),
  /** ネコ部隊：ネコの顔 */
  cats: (
    <>
      <path d="M5.5 15 L6.5 4.5 L13 9 Q16 8.4 19 9 L25.5 4.5 L26.5 15 Q27 27 16 27 Q5 27 5.5 15Z" fill="#fb923c" />
      <path d="M26.5 15 Q27 27 16 27 Q22 25 24 19 Q26 17 26.5 15Z" fill="#ea580c" stroke="none" />
      <path d="M8 7.6 L11 9.7 L8.2 11.5Z M24 7.6 L21 9.7 L23.8 11.5Z" fill="#f9a8d4" strokeWidth="1" />
      <ellipse cx="11.6" cy="16.4" rx="2.4" ry="2.8" fill={O} />
      <ellipse cx="20.4" cy="16.4" rx="2.4" ry="2.8" fill={O} />
      <circle cx="12.4" cy="15.4" r=".9" fill={HI} stroke="none" />
      <circle cx="21.2" cy="15.4" r=".9" fill={HI} stroke="none" />
      <ellipse cx="8.8" cy="20.4" rx="2.2" ry="1.5" fill="#f9a8d4" stroke="none" />
      <ellipse cx="23.2" cy="20.4" rx="2.2" ry="1.5" fill="#f9a8d4" stroke="none" />
      <path d="M14.2 21 Q16 23 17.8 21" fill="none" strokeWidth="1.6" />
      <path d="M15 19.4 H17 L16 20.6Z" fill="#f9a8d4" strokeWidth="1" />
    </>
  ),
  /** あつめる：シールの本 */
  collect: (
    <>
      <rect x="5" y="3.5" width="22" height="25" rx="3.5" fill="#60a5fa" />
      <path d="M27 7 V25 Q27 28.5 23.5 28.5 H9 Q16 28 18 24 Q25 22 27 7Z" fill="#2563eb" stroke="none" />
      <rect x="5" y="3.5" width="5" height="25" rx="2.5" fill="#93c5fd" />
      <polygon points={starPoints(18.4, 15.4, 6.6, 2.9)} fill="#fde047" />
      <ellipse cx="7.4" cy="9" rx="1" ry="2.4" fill={HI} stroke="none" opacity=".75" />
    </>
  ),
  /** 出撃バフ：上向きの矢と きらきら */
  buff: (
    <>
      <path d="M15 4 L25 15 H19.6 V27 H10.4 V15 H5Z" fill="#4ade80" />
      <path d="M25 15 H19.6 V27 H15 V15Z" fill="#16a34a" stroke="none" opacity=".8" />
      <ellipse cx="11" cy="14" rx="1" ry="3" fill={HI} stroke="none" opacity=".7" transform="rotate(35 11 14)" />
      <Sparkle x={26} y={6.5} r={4.2} />
      <Sparkle x={5.5} y={24.5} r={3.2} />
    </>
  ),
  /** 遠征：ロケット */
  expedition: (
    <g transform="rotate(28 16 16)">
      <path d="M16 2.5 Q22.4 7.5 22.4 17 V22 H9.6 V17 Q9.6 7.5 16 2.5Z" fill="#e2e8f0" />
      <path d="M16 2.5 Q22.4 7.5 22.4 17 V22 H16Z" fill="#94a3b8" stroke="none" opacity=".7" />
      <circle cx="16" cy="12.4" r="3.2" fill="#60a5fa" />
      <circle cx="15" cy="11.4" r=".9" fill={HI} stroke="none" />
      <path d="M9.6 16.5 L4.6 23 V26 L9.6 23Z" fill="#f87171" />
      <path d="M22.4 16.5 L27.4 23 V26 L22.4 23Z" fill="#dc2626" />
      <path d="M12.6 22 Q16 31.4 19.4 22Z" fill="#fde047" />
      <path d="M14.4 22 Q16 27.4 17.6 22Z" fill="#fb923c" strokeWidth="1" />
    </g>
  ),
  /** なかまの基地：家と肉球 */
  friend: (
    <>
      <rect x="6" y="14" width="20" height="13.5" rx="2.5" fill="#fde68a" />
      <path d="M26 14 V25 Q26 27.5 23.5 27.5 H15 Q22 26.5 24 20 Q25.5 17 26 14Z" fill="#eab308" stroke="none" opacity=".7" />
      <path d="M2.8 15.4 L16 3.6 L29.2 15.4Z" fill="#fb923c" />
      <path d="M16 3.6 L29.2 15.4 H20 Q18 8 16 3.6Z" fill="#ea580c" stroke="none" opacity=".7" />
      <Paw x={16} y={19.6} s={0.62} fill="#f9a8d4" shade="#ec4899" />
    </>
  ),
  /** 対戦：向かいあう 2つの肉球と ひらめき */
  versus: (
    <>
      <Paw x={8.2} y={17.6} s={0.7} fill="#60a5fa" shade="#2563eb" />
      <Paw x={23.8} y={17.6} s={0.7} fill="#fb923c" shade="#ea580c" />
      <Sparkle x={16} y={8.6} r={5.6} />
      <Sparkle x={16} y={25.4} r={3.4} fill="#fff" />
    </>
  ),
  /** 💠 クレジット */
  credit: (
    <>
      <polygon points="16,3 27,14 16,29 5,14" fill="#67e8f9" />
      <polygon points="16,3 27,14 16,14" fill="#a5f3fc" strokeWidth="1.6" />
      <polygon points="27,14 16,29 16,14" fill="#22d3ee" strokeWidth="1.6" />
      <path d="M5 14 H27 M11 14 L16 3 L21 14 L16 29" fill="none" strokeWidth="1.4" />
      <ellipse cx="11.6" cy="11" rx=".9" ry="1.8" fill={HI} stroke="none" opacity=".85" transform="rotate(-25 11.6 11)" />
    </>
  ),
  /** ⚡ エナジー */
  energy: (
    <>
      <path d="M18.4 2.4 L6.6 18 H14 L12 29.6 L25.4 12.6 H18Z" fill="#fde047" />
      <path d="M25.4 12.6 H18 L18.4 2.4 L16.6 12.6 H18 L12 29.6Z" fill="#eab308" stroke="none" opacity=".75" />
      <ellipse cx="13.6" cy="11.6" rx=".9" ry="2.4" fill={HI} stroke="none" opacity=".75" transform="rotate(35 13.6 11.6)" />
    </>
  ),
  /** 🪙 シールコイン */
  coin: (
    <>
      <circle cx="16" cy="16" r="12.5" fill="#fde047" />
      <path d="M16 28.5 A12.5 12.5 0 0 0 28.5 16 Q25 25 16 28.5Z" fill="#eab308" stroke="none" />
      <circle cx="16" cy="16" r="8.4" fill="none" stroke="#eab308" strokeWidth="2" />
      <polygon points={starPoints(16, 16.4, 5, 2.2)} fill="#fb923c" strokeWidth="1.4" />
      <ellipse cx="9.6" cy="10.4" rx="1.2" ry="2.6" fill={HI} stroke="none" opacity=".75" transform="rotate(40 9.6 10.4)" />
    </>
  ),
  /** 🔥 れんぞく */
  streak: (
    <>
      <path d="M16 2.6 C17 9 24.6 11.4 24.6 19.4 C24.6 25.4 20.8 29.4 16 29.4 C11.2 29.4 7.4 25.4 7.4 19.4 C7.4 15.4 10.6 13.4 11.6 9 C13.8 10.6 14.4 12.6 15 13 C15.4 9.4 14.8 6 16 2.6Z" fill="#fb923c" />
      <path d="M16 15.8 C18.6 19 20.6 20.2 20.6 23.4 C20.6 26 18.6 27.4 16 27.4 C13.4 27.4 11.4 26 11.4 23.4 C11.4 20.2 14.6 19 16 15.8Z" fill="#fde047" strokeWidth="1.5" />
    </>
  ),
  /** ★ 星 */
  star: (
    <>
      <polygon points={starPoints(16, 17, 13.4, 5.8)} fill="#fde047" />
      <path d="M16 17 L29.4 17 L21.4 22.6 L24.4 29 L16 23.6Z" fill="#eab308" stroke="none" opacity=".45" />
      <ellipse cx="12.4" cy="12" rx="1" ry="2.4" fill={HI} stroke="none" opacity=".8" transform="rotate(40 12.4 12)" />
    </>
  ),
  /** 鍵 */
  lock: (
    <>
      <path d="M10.6 14 V10.4 A5.4 5.4 0 0 1 21.4 10.4 V14" fill="none" stroke={O} strokeWidth="6" />
      <path d="M10.6 14 V10.4 A5.4 5.4 0 0 1 21.4 10.4 V14" fill="none" stroke="#cbd5e1" strokeWidth="2.4" />
      <rect x="6" y="13.4" width="20" height="15" rx="3.4" fill="#fde047" />
      <path d="M26 17 V25 Q26 28.4 22.6 28.4 H11 Q22 27.6 24.4 20Z" fill="#eab308" stroke="none" opacity=".8" />
      <circle cx="16" cy="20" r="2.2" fill={O} />
      <rect x="15.1" y="20" width="1.8" height="4.2" rx=".9" fill={O} />
    </>
  ),
  /** もどる */
  back: (
    <>
      <path d="M20.4 5.6 L10 16 L20.4 26.4" fill="none" stroke={O} strokeWidth="7" />
      <path d="M20.4 5.6 L10 16 L20.4 26.4" fill="none" stroke="#e0e7ff" strokeWidth="3" />
    </>
  ),
  /** かいふく */
  heal: (
    <>
      <path d="M16 28 C6 21 3.4 15.4 3.4 10.8 A6.6 6.6 0 0 1 16 8 A6.6 6.6 0 0 1 28.6 10.8 C28.6 15.4 26 21 16 28Z" fill="#f9a8d4" />
      <path d="M28.6 10.8 C28.6 15.4 26 21 16 28 C21 23 22 18 21 14 Q26 14 28.6 10.8Z" fill="#ec4899" stroke="none" opacity=".6" />
      <path d="M16 12.4 V21 M11.8 16.7 H20.2" stroke={HI} strokeWidth="3" fill="none" />
    </>
  ),
  /** げきおこ（おこりマーク） */
  rage: (
    <>
      <path d="M3.4 3.4 Q14.4 4 15 15 Q4 14.4 3.4 3.4Z" fill="#f87171" />
      <path d="M28.6 3.4 Q17.6 4 17 15 Q28 14.4 28.6 3.4Z" fill="#f87171" />
      <path d="M3.4 28.6 Q14.4 28 15 17 Q4 17.6 3.4 28.6Z" fill="#f87171" />
      <path d="M28.6 28.6 Q17.6 28 17 17 Q28 17.6 28.6 28.6Z" fill="#f87171" />
      <path d="M6.4 6 Q10.4 7 12 11" fill="none" stroke={HI} strokeWidth="1.4" opacity=".8" />
    </>
  ),
  /** 設定 */
  settings: (
    <>
      {Array.from({ length: 8 }, (_, k) => (
        <rect key={k} x="13.6" y="2.6" width="4.8" height="7" rx="1.4" fill="#cbd5e1" transform={`rotate(${k * 45} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="9.6" fill="#cbd5e1" />
      <path d="M16 25.6 A9.6 9.6 0 0 0 25.6 16 Q23 23.6 16 25.6Z" fill="#94a3b8" stroke="none" />
      <circle cx="16" cy="16" r="3.8" fill={O} />
    </>
  ),
  /** ✔ */
  check: (
    <>
      <circle cx="16" cy="16" r="12.6" fill="#4ade80" />
      <path d="M16 28.6 A12.6 12.6 0 0 0 28.6 16 Q25 25 16 28.6Z" fill="#16a34a" stroke="none" />
      <path d="M9.6 16.6 L14 21 L22.6 11.6" fill="none" stroke={HI} strokeWidth="3.4" />
    </>
  ),
  /** ちゅうい */
  warn: (
    <>
      <path d="M16 3.6 L29.6 27.4 H2.4Z" fill="#fde047" />
      <path d="M29.6 27.4 H2.4 L16 27.4 Q24 25 22 17 Q26 20 29.6 27.4Z" fill="#eab308" stroke="none" opacity=".7" />
      <path d="M16 11.6 V19" stroke={O} strokeWidth="3" fill="none" />
      <circle cx="16" cy="23" r="1.7" fill={O} stroke="none" />
    </>
  ),
  /** ヒント */
  bulb: (
    <>
      <path d="M16 3.4 A8.8 8.8 0 0 1 21.6 19 Q20.4 20.4 20.4 22.4 H11.6 Q11.6 20.4 10.4 19 A8.8 8.8 0 0 1 16 3.4Z" fill="#fde047" />
      <path d="M21.6 19 Q20.4 20.4 20.4 22.4 H16 Q22 18 21 10 Q24.4 14 21.6 19Z" fill="#eab308" stroke="none" opacity=".7" />
      <rect x="11.6" y="22.4" width="8.8" height="5.4" rx="2" fill="#cbd5e1" />
      <ellipse cx="12.6" cy="10.6" rx="1" ry="2.6" fill={HI} stroke="none" opacity=".8" transform="rotate(25 12.6 10.6)" />
    </>
  ),
  /** ボス・おうかん */
  crown: (
    <>
      <path d="M3.6 24.6 L5.6 9.4 L12 16.4 L16 6.2 L20 16.4 L26.4 9.4 L28.4 24.6Z" fill="#fde047" />
      <path d="M28.4 24.6 L26.4 9.4 L20 16.4 L18.4 24.6Z" fill="#eab308" stroke="none" opacity=".7" />
      <rect x="3.6" y="24.6" width="24.8" height="3.6" rx="1.8" fill="#fb923c" />
      <circle cx="16" cy="19.6" r="1.8" fill="#f87171" strokeWidth="1.2" />
    </>
  ),
  /** ひらく（下むきの やじるし） */
  chevron: (
    <>
      <path d="M7 11.6 L16 21 L25 11.6" fill="none" stroke={O} strokeWidth="6.4" />
      <path d="M7 11.6 L16 21 L25 11.6" fill="none" stroke="#e0e7ff" strokeWidth="2.8" />
    </>
  ),
  /** ずかん：ネコの足あとの本 */
  dex: (
    <>
      <path d="M3.6 6 Q10 4.4 16 7.6 Q22 4.4 28.4 6 V25.4 Q22 24 16 27.2 Q10 24 3.6 25.4Z" fill="#a3e635" />
      <path d="M28.4 6 V25.4 Q22 24 16 27.2 Q22.4 22 22 12 Q26.4 9.4 28.4 6Z" fill="#65a30d" stroke="none" opacity=".6" />
      <path d="M16 7.6 V27.2" fill="none" strokeWidth="1.6" />
      <Paw x={22.2} y={14.4} s={0.6} fill="#fff" shade="#cbd5e1" />
      <path d="M6.4 11 H12.4 M6.4 15 H12.4 M6.4 19 H11" fill="none" stroke={HI} strokeWidth="1.6" opacity=".85" />
    </>
  ),
  /** バッジ：メダル */
  medal: (
    <>
      <path d="M9.4 2.6 H15 L17.4 11 H12 Z" fill="#f87171" />
      <path d="M22.6 2.6 H17 L14.6 11 H20 Z" fill="#60a5fa" />
      <circle cx="16" cy="19.6" r="9.2" fill="#fde047" />
      <path d="M16 28.8 A9.2 9.2 0 0 0 25.2 19.6 Q22.4 26.8 16 28.8Z" fill="#eab308" stroke="none" />
      <polygon points={starPoints(16, 19.8, 5, 2.2)} fill="#fb923c" strokeWidth="1.3" />
    </>
  ),
  /** カプセル（ガチャ） */
  capsule: (
    <>
      <circle cx="16" cy="16" r="12.4" fill="#e0f2fe" />
      <path d="M3.6 16 A12.4 12.4 0 0 1 28.4 16Z" fill="#f472b6" />
      <path d="M28.4 16 A12.4 12.4 0 0 0 16 28.4 Q26 26 28.4 16Z" fill="#94a3b8" stroke="none" opacity=".6" />
      <path d="M3.6 16 H28.4" fill="none" />
      <ellipse cx="10.4" cy="10.4" rx="1.4" ry="3" fill={HI} stroke="none" opacity=".85" transform="rotate(40 10.4 10.4)" />
      <Sparkle x={19.6} y={21.6} r={3} fill="#fde047" />
    </>
  ),
  /** アルバム（シールを はる本） */
  album: (
    <>
      <rect x="6.4" y="3.4" width="19.6" height="25.2" rx="3" fill="#c4b5fd" />
      <path d="M26 7 V25.6 Q26 28.6 23 28.6 H9 Q16 28 18 24 Q24 22 26 7Z" fill="#7c3aed" stroke="none" opacity=".6" />
      <rect x="3.6" y="6" width="5" height="3" rx="1.5" fill="#fde047" strokeWidth="1.5" />
      <rect x="3.6" y="14.5" width="5" height="3" rx="1.5" fill="#fde047" strokeWidth="1.5" />
      <rect x="3.6" y="23" width="5" height="3" rx="1.5" fill="#fde047" strokeWidth="1.5" />
      <rect x="12" y="8.6" width="10" height="7" rx="2" fill="#fff" strokeWidth="1.6" />
      <rect x="12" y="18.4" width="10" height="5.6" rx="2" fill="#fde68a" strokeWidth="1.6" />
    </>
  ),
  /** しょうごう：リボン */
  ribbon: (
    <>
      <path d="M10 18 L6 29 L12 26 L16 30 L16 18Z" fill="#f87171" />
      <path d="M22 18 L26 29 L20 26 L16 30 L16 18Z" fill="#dc2626" />
      <circle cx="16" cy="12" r="9.2" fill="#fde047" />
      <path d="M16 21.2 A9.2 9.2 0 0 0 25.2 12 Q22.4 19.2 16 21.2Z" fill="#eab308" stroke="none" />
      <polygon points={starPoints(16, 12.2, 5, 2.2)} fill="#fb923c" strokeWidth="1.3" />
    </>
  ),
  /** シールのかけら */
  shard: (
    <>
      <path d="M4 14 L11 5 L17 9 L14 17 L20 19 L12 28 L7 22Z" fill="#c4b5fd" />
      <path d="M17 9 L14 17 L20 19 L12 28 L16 20 L12 16Z" fill="#7c3aed" stroke="none" opacity=".55" />
      <path d="M20 8 L28 12 L26 22 L20 19 L14 17 L17 9Z" fill="#a78bfa" />
      <ellipse cx="8" cy="12.4" rx=".9" ry="2" fill={HI} stroke="none" opacity=".8" transform="rotate(30 8 12.4)" />
    </>
  ),
  /** 敵（おこった顔） */
  enemy: (
    <>
      <circle cx="16" cy="16.4" r="12" fill="#c084fc" />
      <path d="M16 28.4 A12 12 0 0 0 28 16.4 Q24.6 25.6 16 28.4Z" fill="#7e22ce" stroke="none" opacity=".6" />
      <path d="M7 6 L12 10 M25 6 L20 10" fill="none" strokeWidth="2.6" />
      <path d="M9.6 14 L14 15.6 M22.4 14 L18 15.6" fill="none" strokeWidth="2" />
      <circle cx="12" cy="17.6" r="2" fill={O} stroke="none" />
      <circle cx="20" cy="17.6" r="2" fill={O} stroke="none" />
      <path d="M11.6 23.6 Q16 21 20.4 23.6" fill="none" strokeWidth="1.8" />
    </>
  ),
  /** きょうの 目標（まと） */
  target: (
    <>
      <circle cx="16" cy="16" r="12.6" fill="#f87171" />
      <circle cx="16" cy="16" r="8.4" fill="#fff" />
      <circle cx="16" cy="16" r="4.2" fill="#f87171" />
    </>
  ),
  /** はね（空をとぶ） */
  wings: (
    <>
      <path d="M16 24 C12 24 5 21 2.6 8 C8 9 12 11.4 16 16.4Z" fill="#7dd3fc" />
      <path d="M16 24 C20 24 27 21 29.4 8 C24 9 20 11.4 16 16.4Z" fill="#38bdf8" />
      <path d="M16 24 C20 24 27 21 29.4 8 C27 14 22 18 16 19.6Z" fill="#0284c7" stroke="none" opacity=".45" />
      <path d="M6 12.6 Q10 14 13 18 M26 12.6 Q22 14 19 18" fill="none" strokeWidth="1.4" />
      <ellipse cx="9.4" cy="12" rx=".9" ry="2.4" fill={HI} stroke="none" opacity=".8" transform="rotate(-50 9.4 12)" />
    </>
  ),
  /** くも・きり */
  cloud: (
    <>
      <path d="M8.4 25 A6.2 6.2 0 0 1 8.6 12.8 A7.6 7.6 0 0 1 22.8 11.4 A6.8 6.8 0 0 1 24 25Z" fill="#e0e7ff" />
      <path d="M24 25 A6.8 6.8 0 0 0 27 15.6 Q27 22 20 22.4 Q14 23 12 25Z" fill="#a5b4fc" stroke="none" opacity=".7" />
      <ellipse cx="12.6" cy="14.6" rx="1" ry="2.2" fill={HI} stroke="none" opacity=".85" transform="rotate(30 12.6 14.6)" />
    </>
  ),
  /** てきが いっぱい（ちいさな 3つ） */
  swarm: (
    <>
      <circle cx="10" cy="20.6" r="6.2" fill="#c084fc" />
      <circle cx="22.4" cy="20.6" r="6.2" fill="#a855f7" />
      <circle cx="16.2" cy="10.4" r="6.2" fill="#d8b4fe" />
      <circle cx="14" cy="9.4" r="1.2" fill={O} stroke="none" /><circle cx="18.6" cy="9.4" r="1.2" fill={O} stroke="none" />
      <circle cx="7.8" cy="19.6" r="1.2" fill={O} stroke="none" /><circle cx="12.4" cy="19.6" r="1.2" fill={O} stroke="none" />
      <circle cx="20.2" cy="19.6" r="1.2" fill={O} stroke="none" /><circle cx="24.8" cy="19.6" r="1.2" fill={O} stroke="none" />
    </>
  ),
  /** かべ（レンガ） */
  wall: (
    <>
      <rect x="3.4" y="6" width="25.2" height="20" rx="2.6" fill="#fb923c" />
      <path d="M28.6 9 V23.4 Q28.6 26 26 26 H8 Q20 25 24 17 Q27 14 28.6 9Z" fill="#c2410c" stroke="none" opacity=".5" />
      <path d="M3.4 12.6 H28.6 M3.4 19.2 H28.6 M11 6 V12.6 M21 6 V12.6 M16 12.6 V19.2 M8 19.2 V26 M24 19.2 V26" fill="none" strokeWidth="1.6" />
    </>
  ),
  /** たて */
  shield: (
    <>
      <path d="M16 3 L27 6.6 V15 Q27 24.4 16 29.4 Q5 24.4 5 15 V6.6Z" fill="#60a5fa" />
      <path d="M16 3 L27 6.6 V15 Q27 24.4 16 29.4Z" fill="#2563eb" stroke="none" opacity=".55" />
      <path d="M16 9.4 L18 14 L23 14.4 L19.2 17.6 L20.4 22.4 L16 19.8 L11.6 22.4 L12.8 17.6 L9 14.4 L14 14Z" fill="#fde047" strokeWidth="1.3" />
    </>
  ),
  /** とう（ほうだい） */
  tower: (
    <>
      <path d="M9 28.6 L11 12 H21 L23 28.6Z" fill="#cbd5e1" />
      <path d="M23 28.6 L21 12 H16 L17.4 28.6Z" fill="#94a3b8" stroke="none" opacity=".7" />
      <path d="M7.4 12 V6 H11 V8.4 H14.4 V6 H17.6 V8.4 H21 V6 H24.6 V12Z" fill="#e2e8f0" />
      <rect x="13.4" y="17" width="5.2" height="11.6" rx="2.6" fill="#475569" />
    </>
  ),
  /** ゆみ */
  bow: (
    <>
      <path d="M8 3.6 Q30 16 8 28.4" fill="none" stroke={O} strokeWidth="6" />
      <path d="M8 3.6 Q30 16 8 28.4" fill="none" stroke="#fb923c" strokeWidth="2.6" />
      <path d="M8 3.6 V28.4" fill="none" strokeWidth="1.2" />
      <path d="M3.4 16 H24" fill="none" strokeWidth="2.2" />
      <path d="M24 16 L19.6 12.4 V19.6Z" fill="#e2e8f0" strokeWidth="1.4" />
      <path d="M3.4 16 L6.4 13 M3.4 16 L6.4 19" fill="none" strokeWidth="1.6" />
    </>
  ),
  /** パワー（にぎりこぶし） */
  power: (
    <>
      <path d="M7 14 Q7 6 15 6 H21 Q26.4 6 26.4 12 V21 Q26.4 28 19 28 H13 Q7 28 7 21Z" fill="#fbbf24" />
      <path d="M26.4 12 V21 Q26.4 28 19 28 H13 Q22 26 22 17 Q26 15 26.4 12Z" fill="#d97706" stroke="none" opacity=".55" />
      <path d="M7 14 H21 M12 6.2 V14 M16.6 6 V14 M21.4 6.2 V14" fill="none" strokeWidth="1.6" />
      <path d="M9 21 Q13 24 18 21" fill="none" strokeWidth="1.6" />
    </>
  ),
  /** ヘルメット */
  helmet: (
    <>
      <path d="M4.6 22 Q4.6 6 16 6 Q27.4 6 27.4 22Z" fill="#4ade80" />
      <path d="M27.4 22 Q27.4 6 16 6 Q22 10 21 22Z" fill="#16a34a" stroke="none" opacity=".55" />
      <rect x="3" y="21.6" width="26" height="5" rx="2.5" fill="#cbd5e1" />
      <path d="M16 6 V15.6" fill="none" strokeWidth="2.4" />
      <ellipse cx="10.4" cy="12.4" rx=".9" ry="2.6" fill={HI} stroke="none" opacity=".8" transform="rotate(30 10.4 12.4)" />
    </>
  ),
  /** くつ（はやあし） */
  boot: (
    <>
      <path d="M9 4.4 H18 V16 Q18 18 21 19 Q28 21 28 25 V27.4 H5.4 V4.4Z" fill="#60a5fa" />
      <path d="M28 25 V27.4 H5.4 H18 Q24 26 24 21 Q28 22 28 25Z" fill="#2563eb" stroke="none" opacity=".5" />
      <rect x="4.4" y="25" width="24.6" height="4" rx="2" fill="#f1f5f9" />
      <path d="M5.4 9 H18" fill="none" strokeWidth="1.8" />
      <path d="M1.6 12 H5 M1.2 17 H5 M2.4 22 H5" fill="none" strokeWidth="1.6" />
    </>
  ),
  /** まほうの たま */
  orb: (
    <>
      <circle cx="16" cy="17" r="11.4" fill="#c4b5fd" />
      <path d="M16 28.4 A11.4 11.4 0 0 0 27.4 17 Q24 26 16 28.4Z" fill="#6d28d9" stroke="none" opacity=".55" />
      <ellipse cx="11.6" cy="11.8" rx="1.6" ry="3.6" fill={HI} stroke="none" opacity=".85" transform="rotate(40 11.6 11.8)" />
      <Sparkle x={21} y={20} r={4.2} fill="#fde047" />
      <Sparkle x={26} y={5.6} r={2.6} fill="#fff" />
    </>
  ),
  /** ドラゴンの たまご */
  dragon: (
    <>
      <path d="M16 3.4 C23.6 3.4 27.4 12 27.4 19 C27.4 25.2 22.4 29 16 29 C9.6 29 4.6 25.2 4.6 19 C4.6 12 8.4 3.4 16 3.4Z" fill="#86efac" />
      <path d="M27.4 19 C27.4 25.2 22.4 29 16 29 C22 26 22.6 20 21.6 14 Q26 12 27.4 19Z" fill="#16a34a" stroke="none" opacity=".5" />
      <path d="M8 17 L11.6 13.4 L15 17 L18.6 13.4 L22.2 17 L25.6 13.4" fill="none" strokeWidth="1.8" />
      <circle cx="12" cy="23" r="1.8" fill="#fde047" strokeWidth="1.2" /><circle cx="20" cy="22" r="1.4" fill="#fde047" strokeWidth="1.2" />
      <ellipse cx="10.4" cy="10.4" rx="1" ry="2.4" fill={HI} stroke="none" opacity=".8" transform="rotate(25 10.4 10.4)" />
    </>
  ),
  /** すいせい（アルマゲドン） */
  comet: (
    <>
      <path d="M21 11 L3 5 L12 15 L4 22 L16 20Z" fill="#fb923c" />
      <path d="M18 14 L6 7 L13 15 L8 20 L16 18Z" fill="#fde047" stroke="none" />
      <circle cx="21" cy="19" r="8.4" fill="#fcd34d" />
      <path d="M21 27.4 A8.4 8.4 0 0 0 29.4 19 Q27 25.6 21 27.4Z" fill="#d97706" stroke="none" opacity=".6" />
      <ellipse cx="17.6" cy="15.8" rx="1.1" ry="2.4" fill={HI} stroke="none" opacity=".85" transform="rotate(40 17.6 15.8)" />
    </>
  ),
  /** ばくだん */
  bomb: (
    <>
      <circle cx="14" cy="19" r="10" fill="#64748b" />
      <path d="M14 29 A10 10 0 0 0 24 19 Q21 27 14 29Z" fill="#1e293b" stroke="none" opacity=".6" />
      <rect x="11" y="6.4" width="6" height="4.2" rx="1.4" fill="#cbd5e1" />
      <path d="M17 7 Q22 4 24.6 7.6" fill="none" strokeWidth="2" />
      <Sparkle x={26} y={6} r={3.6} fill="#fde047" />
      <ellipse cx="10.4" cy="14.6" rx="1.2" ry="3" fill={HI} stroke="none" opacity=".75" transform="rotate(35 10.4 14.6)" />
    </>
  ),
  /** のびる（グラフ） */
  chartup: (
    <>
      <rect x="3.6" y="19" width="6" height="9.4" rx="1.4" fill="#93c5fd" />
      <rect x="12.6" y="13" width="6" height="15.4" rx="1.4" fill="#60a5fa" />
      <rect x="21.6" y="6.4" width="6" height="22" rx="1.4" fill="#3b82f6" />
      <path d="M4 14 L13 8.4 L18 11 L27 3.6" fill="none" stroke="#4ade80" strokeWidth="2.6" />
      <path d="M27.6 2.8 L22.6 3.4 L26.6 8Z" fill="#4ade80" strokeWidth="1.2" />
    </>
  ),
  /** 基地の かんばん（家） */
  home: (
    <>
      <path d="M3.4 15.4 L16 4.4 L28.6 15.4 V27.6 H3.4Z" fill="#fde68a" />
      <path d="M28.6 15.4 V27.6 H3.4 H16 Q24 26 24 17Z" fill="#f59e0b" stroke="none" opacity=".5" />
      <path d="M2 16.6 L16 4 L30 16.6" fill="none" stroke="#f87171" strokeWidth="4" />
      <rect x="12.6" y="17.6" width="6.8" height="10" rx="1.6" fill="#92400e" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof ART;
export const ICON_NAMES = Object.keys(ART) as IconName[];

export const Icon: React.FC<{ name: IconName; size?: number; className?: string; style?: React.CSSProperties; title?: string }> = ({ name, size = 28, className, style, title }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} className={className} style={{ flexShrink: 0, ...style }}
    stroke={O} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
    role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    {ART[name]}
  </svg>
);
