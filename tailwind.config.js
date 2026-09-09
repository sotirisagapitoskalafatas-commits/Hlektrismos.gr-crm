/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#17181a',
        paper: '#f4f2ef',
        line: '#e8e5e1',
        brand: {
          50: '#eef3ff',
          100: '#dbe7fd',
          500: '#2f5fd8',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        ok: { 600: '#1c6f52', 100: '#eaf6f1' },
        warn: { 600: '#8a6412', 100: '#fdf4e3' },
        bad: { 600: '#b3392e', 100: '#fbeeeb' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,24,26,.05), 0 14px 34px -24px rgba(23,24,26,.3)',
        cardlg: '0 1px 2px rgba(23,24,26,.05), 0 20px 44px -26px rgba(23,24,26,.4)',
      },
    },
  },
  plugins: [],
};