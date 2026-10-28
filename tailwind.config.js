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
        ink: '#0f172a',
        paper: '#eef1f5',
        line: 'rgba(15,23,42,0.08)',
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#0066cc',
          600: '#0066cc',
          700: '#0052a3',
        },
        // Redesign tokens (CRM scope; defined in src/styles/atlas-theme.css). Usable as bg-ui-surface, text-ui-muted, …
        ui: {
          bg: 'var(--ui-bg)',
          surface: 'var(--ui-surface)',
          'surface-2': 'var(--ui-surface-2)',
          border: 'var(--ui-border)',
          text: 'var(--ui-text)',
          'text-2': 'var(--ui-text-2)',
          muted: 'var(--ui-muted)',
          field: 'var(--ui-field)',
          primary: 'var(--ui-primary)',
          'primary-hover': 'var(--ui-primary-hover)',
          'primary-soft': 'var(--ui-primary-soft)',
        },
        ok: { 600: '#15803d', 100: 'rgba(21,128,34,0.09)' },
        warn: { 600: '#b45309', 100: 'rgba(180,83,9,0.09)' },
        bad: { 600: '#dc2626', 100: 'rgba(220,38,38,0.09)' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04)',
        cardlg: '0 8px 30px rgba(15,23,42,0.2)',
      },
    },
  },
  plugins: [],
};