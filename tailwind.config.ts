import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        elev: 'var(--elev)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        accentink: 'var(--accent-ink)',
        marigold: 'var(--marigold)',
        good: 'var(--good)',
        bad: 'var(--bad)',
        warn: 'var(--warn)',
        hover: 'var(--hover)',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgb(255 255 255 / 0.45) inset, 0 12px 40px -24px rgb(28 25 21 / 0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
