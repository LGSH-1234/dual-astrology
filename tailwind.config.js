/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        surface: 'var(--surface)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        mode: 'var(--mode)',
        'mode-soft': 'var(--mode-soft)',
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', 'Georgia', 'serif'],
        sans: ['Inter', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '4px' },
    },
  },
  plugins: [],
};
