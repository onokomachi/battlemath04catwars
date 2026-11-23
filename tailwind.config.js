/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx", "./catwars/**/*.{ts,tsx}", "./apps/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // 単元アプリ（apps/ に写した解答画面）の色。.app-paper の中で明るい「紙」の色になる（index.css）
      colors: {
        bg: 'var(--c-bg)',
        surface: { DEFAULT: 'var(--c-surface)', 2: 'var(--c-surface-2)', 3: 'var(--c-surface-3)' },
        content: 'var(--c-content)',
        muted: 'var(--c-muted)',
        faint: 'var(--c-faint)',
        line: 'var(--c-line)',
        brand: { DEFAULT: 'var(--c-brand)', strong: 'var(--c-brand-strong)' },
        'on-brand': 'var(--c-on-brand)',
        // ムーンベース・ポップ（index.css の --cw-*。使い方は docs/UI_STYLE.md）
        'cw-bg-0': 'var(--cw-bg-0)', 'cw-bg-1': 'var(--cw-bg-1)', 'cw-bg-2': 'var(--cw-bg-2)',
        'cw-surface': 'var(--cw-surface)', 'cw-surface-strong': 'var(--cw-surface-strong)',
        'cw-line': 'var(--cw-line)', 'cw-line-strong': 'var(--cw-line-strong)',
        'cw-fg': 'var(--cw-fg)', 'cw-fg-2': 'var(--cw-fg-2)', 'cw-fg-3': 'var(--cw-fg-3)',
        'cw-action': 'var(--cw-action)', 'cw-reward': 'var(--cw-reward)', 'cw-growth': 'var(--cw-growth)',
        'cw-rare': 'var(--cw-rare)', 'cw-danger': 'var(--cw-danger)', 'cw-cat': 'var(--cw-cat)',
        'cw-on-color': 'var(--cw-on-color)',
      },
      // 字の大きさは 6だん（12・14・16・20・28・40）。12px 未満は 使わない
      fontSize: {
        'cw-12': ['12px', '1.5'], 'cw-14': ['14px', '1.5'], 'cw-16': ['16px', '1.45'],
        'cw-20': ['20px', '1.3'], 'cw-28': ['28px', '1.2'], 'cw-40': ['40px', '1.1'],
      },
      fontFamily: { cw: 'var(--cw-font)', 'cw-num': 'var(--cw-font-num)' },
      // 角は 4だん（8・14・22・999）
      borderRadius: { 'cw-sm': 'var(--cw-r-sm)', 'cw-md': 'var(--cw-r-md)', 'cw-lg': 'var(--cw-r-lg)', 'cw-pill': 'var(--cw-r-pill)' },
      boxShadow: {
        'cw-panel': 'var(--cw-shadow-panel)',
        'cw-lit-action': 'var(--cw-lit-action)', 'cw-lit-reward': 'var(--cw-lit-reward)', 'cw-lit-growth': 'var(--cw-lit-growth)',
        'cw-lit-rare': 'var(--cw-lit-rare)', 'cw-lit-danger': 'var(--cw-lit-danger)', 'cw-lit-cat': 'var(--cw-lit-cat)',
      },
    },
  },
  plugins: [],
}
