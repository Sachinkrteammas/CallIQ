/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F4EE',
        card: '#FFFFFF',
        navy: {
          DEFAULT: '#16213E',
          light: '#1B3157',
        },
        ink: '#1D2433',
        muted: '#6B7385',
        border: '#E7E2D8',
        brand: {
          DEFAULT: '#3457D5',
          light: '#EEF1FE',
        },
        good: { DEFAULT: '#1C9A6C', bg: '#E7F7EF' },
        warn: { DEFAULT: '#C9862B', bg: '#FCF1DF' },
        bad: { DEFAULT: '#D14343', bg: '#FBE9E9' },
        info: { DEFAULT: '#3457D5', bg: '#EEF1FE' },
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,20,30,0.04), 0 1px 12px rgba(20,20,30,0.04)',
      },
    },
  },
  plugins: [],
}
