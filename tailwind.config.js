/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        steel: {
          50: '#f3f6fa',
          100: '#e6edf5',
          200: '#c9d8e8',
          300: '#9fb9d4',
          400: '#6f94bb',
          500: '#4d76a1',
          600: '#3b5d86',
          700: '#324c6d',
          800: '#2c405b',
          900: '#28374d',
          950: '#1a2433',
        },
        pass: '#16a34a',
        warn: '#d97706',
        fail: '#dc2626',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
