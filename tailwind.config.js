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
      },
    },
  },
  plugins: [],
}
